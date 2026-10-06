import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { loadConfig } from "../lib/config.mjs";

/**
 * record-loop-event.mjs は実装ループのイベントを loop-events.jsonl へ追記します。
 *
 * イベントの採番(seq)・記録時刻(recordedAt)・runId・branch の付与と、必須フィールドの検証を
 * 機械化するためのスクリプトです。追記を AI の手作業に任せると、フィールドの欠落や
 * 既存行の書き換えが起きうるため、「機械にできることは機械に」の原則でここに寄せています。
 *
 * 使い方:
 *   node scripts/uld/uld.mjs record-loop-event --file <path> [--run-id <id>] [--task-id <id>] \
 *     [--runner <name>] --event '<json>' [--event '<json>' ...]
 *
 * --run-id を省略すると新しい runId を採番します。結果(runId・追記件数)は JSON で
 * 標準出力に返すので、呼び出し側は 1 回目の出力から runId を拾って以降の呼び出しに渡します。
 */

/** allowedEventTypes は記録できるイベント型の一覧です。実装ループのフェーズと 1 対 1 で対応します。 */
const allowedEventTypes = [
  "task_started",
  "design_completed",
  "implementation_completed",
  "review_completed",
  "test_completed",
  "fix_completed",
  "loop_converged",
  "escalated"
];

/**
 * timedEventTypes は startedAt / completedAt を必須とするイベント型です。
 * フェーズの所要時間はこの 2 つから導出するため、欠けた行は KPI の分母を濁します。
 * task_started / loop_converged を含めないのは、これらが担当工程を持たない節目の出来事で
 * あり、期間を持たないためです(記録の置き場の events/README.md のスキーマと対応)。
 */
const timedEventTypes = [
  "design_completed",
  "implementation_completed",
  "review_completed",
  "test_completed",
  "fix_completed",
  "escalated"
];

/**
 * reservedKeys はスクリプトが付与するフィールドです。イベント JSON に含まれていたら
 * エラーにします。上書きで黙って捨てると、呼び出し側が「渡した値が記録された」と
 * 誤解したまま計測が濁るためです。
 */
const reservedKeys = ["recordedAt", "seq", "runId", "branch", "runner", "taskId"];

/**
 * maxAffectedFileCountWithoutApproval は、人の承認なしに 1 子タスクとして実装へ進める
 * 影響ファイル数の上限です(rules/branch の「子タスクの規模」。uld.config.json の limits.maxAffectedFiles)。これを超える設計は
 * 分割を提案するか、人が分割せずに進めることを承認した記録(oversizeDecision)を伴わないと
 * design_completed を記録できません。規模の判断を AI の推論に任せると、影響 30 件超でも
 * そのまま実装へ進んでしまうため、記録の入口で機械的に止めます。
 */
const maxAffectedFileCountWithoutApproval = loadConfig().limits.maxAffectedFiles;

/** allowedOversizeDecisions は上限超えの設計に付ける、人の判断の記録として認める値です。 */
const allowedOversizeDecisions = ["approved_by_user"];

/** utcSecondPattern は startedAt / completedAt に要求する時刻形式(UTC 秒精度)です。 */
const utcSecondPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

/** fail はエラーメッセージを stderr に出して終了コードを立て、以降の処理を打ち切ります。 */
function fail(message) {
  process.stderr.write(`loop-event violation:\n- ${message}\n`);
  process.exitCode = 1;
}

/**
 * runGit は git command を実行し、成功時は標準出力を trim して返します。失敗時は null を返します。
 * 例外ではなく null を返すのは、detached HEAD などでも記録自体は続行したいためです
 * (branch が取れないことはイベントを失う理由にならない)。
 */
function runGit(gitArguments) {
  const result = spawnSync("git", gitArguments, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (result.error !== undefined || result.status !== 0) {
    return null;
  }

  return result.stdout.trim();
}

/** parseArguments は argv を { file, runId, taskId, runner, events } に解釈します。 */
function parseArguments(argv) {
  const parsed = { file: null, runId: null, taskId: null, runner: null, events: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];

    if (!["--file", "--run-id", "--task-id", "--runner", "--event"].includes(key)) {
      return { error: `不明な引数です: ${key}` };
    }
    if (value === undefined) {
      return { error: `${key} に値がありません` };
    }

    if (key === "--file") parsed.file = value;
    if (key === "--run-id") parsed.runId = value;
    if (key === "--task-id") parsed.taskId = value;
    if (key === "--runner") parsed.runner = value;
    if (key === "--event") parsed.events.push(value);
    index += 1;
  }

  return parsed;
}

/**
 * validateEvent はイベント 1 件を検証し、問題があればエラーメッセージを返します。
 * 検証を追記前に全件済ませるのは、途中で失敗したとき一部だけ書かれた中途半端な
 * ログを残さないためです(ログ資料は追記のみで直せないので、書く前に守る)。
 */
function validateEvent(rawJson, position) {
  let event;
  try {
    event = JSON.parse(rawJson);
  } catch {
    return { error: `${position} 件目: JSON として解釈できません` };
  }

  if (typeof event !== "object" || event === null || Array.isArray(event)) {
    return { error: `${position} 件目: イベントは JSON オブジェクトで渡してください` };
  }
  if (!allowedEventTypes.includes(event.type)) {
    return {
      error: `${position} 件目: type が不正です(${event.type})。許可: ${allowedEventTypes.join(", ")}`
    };
  }

  const usedReserved = reservedKeys.filter((key) => key in event);
  if (usedReserved.length > 0) {
    return {
      error: `${position} 件目: ${usedReserved.join(", ")} はスクリプトが付与するため指定できません`
    };
  }

  if (event.type === "task_started" && typeof event.task !== "string") {
    return { error: `${position} 件目: task_started には task(文字列)が必要です` };
  }

  if (event.type === "design_completed") {
    if (typeof event.affectedFileCount !== "number") {
      return { error: `${position} 件目: design_completed には affectedFileCount(数値)が必要です` };
    }
    if (
      event.affectedFileCount > maxAffectedFileCountWithoutApproval &&
      !allowedOversizeDecisions.includes(event.oversizeDecision)
    ) {
      return {
        error:
          `${position} 件目: affectedFileCount が ${String(event.affectedFileCount)} で上限 ` +
          `${String(maxAffectedFileCountWithoutApproval)} を超えています。タスクの分割案を人に提示し、` +
          `分割せずに進める承認を得た場合だけ oversizeDecision: "approved_by_user" を付けて記録してください` +
          `(rules/branch の「子タスクの規模」)`
      };
    }
  }

  if (timedEventTypes.includes(event.type)) {
    for (const field of ["startedAt", "completedAt"]) {
      if (typeof event[field] !== "string" || !utcSecondPattern.test(event[field])) {
        return {
          error: `${position} 件目: ${event.type} には ${field}(date -u +%Y-%m-%dT%H:%M:%SZ の実測値)が必要です`
        };
      }
    }

    // 形式が合っていても前後が逆なら所要時間が負になり、集計を黙って壊します。実測で 1 件、
    // 完了時刻を 9 時間ずらした行が通り、loop:stats がその工程を 552 分と表示しました。
    // 文字列比較で足りるのは、utcSecondPattern が桁数固定の UTC 表記だけを通すためです。
    if (event.startedAt > event.completedAt) {
      return {
        error:
          `${position} 件目: ${event.type} の completedAt(${event.completedAt}) が ` +
          `startedAt(${event.startedAt}) より前です。date -u の実測値をそのまま入れてください`
      };
    }
  }

  return { event };
}

/**
 * nextSequence は同一 runId の既存行から次の seq を求めます。
 * 解釈できない行は数えず警告に留めます。壊れた 1 行のために記録全体を
 * 止めると、以降のイベントがすべて失われる方が損失が大きいためです。
 */
function nextSequence(filePath, runId) {
  if (!existsSync(filePath)) {
    return 1;
  }

  let maxSequence = 0;
  const lines = readFileSync(filePath, "utf8").split("\n");
  for (const line of lines) {
    if (line.trim() === "") continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed.runId === runId && typeof parsed.seq === "number" && parsed.seq > maxSequence) {
        maxSequence = parsed.seq;
      }
    } catch {
      process.stderr.write(`warning: 解釈できない行を無視しました: ${line.slice(0, 80)}\n`);
    }
  }

  return maxSequence + 1;
}

const options = parseArguments(process.argv.slice(2));

if (options.error !== undefined) {
  fail(options.error);
} else if (options.file === null) {
  fail("--file でイベントログのパスを指定してください");
} else if (!options.file.endsWith("loop-events.jsonl")) {
  fail(`イベントログのファイル名は loop-events.jsonl にしてください: ${options.file}`);
} else if (options.events.length === 0) {
  fail("--event でイベントを 1 件以上渡してください");
} else {
  const validated = [];
  let hasError = false;
  for (const [index, rawJson] of options.events.entries()) {
    const result = validateEvent(rawJson, index + 1);
    if (result.error !== undefined) {
      fail(result.error);
      hasError = true;
      break;
    }
    validated.push(result.event);
  }

  if (!hasError) {
    const recordedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    const runId =
      options.runId ?? `run-${recordedAt.replaceAll(":", "")}-${options.taskId ?? "notask"}`;
    const branch = runGit(["symbolic-ref", "--quiet", "--short", "HEAD"]);
    let sequence = nextSequence(options.file, runId);

    const lines = validated.map((event) => {
      const { type, ...payload } = event;
      const record = {
        recordedAt,
        runId,
        seq: sequence,
        type,
        taskId: options.taskId,
        branch,
        ...(options.runner === null ? {} : { runner: options.runner }),
        ...payload
      };
      sequence += 1;
      return `${JSON.stringify(record)}\n`;
    });

    mkdirSync(dirname(options.file), { recursive: true });
    appendFileSync(options.file, lines.join(""));
    process.stdout.write(
      `${JSON.stringify({ runId, appended: lines.length, file: options.file })}\n`
    );
  }
}
