import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { loadConfig } from "../lib/config.mjs";

/**
 * loop-stats.mjs は実装ループのイベントログから工程ごとの所要時間を集計して表にします。
 *
 * 所要時間は各イベントの startedAt / completedAt（担当エージェントの実測）から導出します
 * （記録の置き場の events/README.md）。ワークフローや工程スキルを変えたときに、変更の前後で
 * どの工程が縮んだかを同じ物差しで比べるためのスクリプトです。
 *
 * 使い方:
 *   uld loop-stats [<loop-events.jsonl> ...]
 *   引数を省くと .designs 配下のすべての loop-events.jsonl を読みます。
 */

/** designsDirectory はイベントログを探す起点です。 */
const designsDirectory = loadConfig().directories.designs;

/** stageOrder は表に出す工程の並びです。イベント種別と 1 対 1 で対応します。 */
const stageOrder = [
  ["design_completed", "設計"],
  ["implementation_completed", "実装"],
  ["review_completed", "レビュー"],
  ["test_completed:fast", "check:fast"],
  ["test_completed:full", "check"],
  ["fix_completed", "修正"],
  ["escalated", "診断"]
];

/** findEventLogs は .designs 配下の loop-events.jsonl を再帰的に集めます。 */
function findEventLogs(directory) {
  if (!existsSync(directory)) {
    return [];
  }

  const found = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      found.push(...findEventLogs(path));
    } else if (entry === "loop-events.jsonl") {
      found.push(path);
    }
  }

  return found;
}

/** minutesBetween は 2 つの実測時刻の差を分で返します。どちらかが無ければ null です。 */
function minutesBetween(startedAt, completedAt) {
  if (typeof startedAt !== "string" || typeof completedAt !== "string") {
    return null;
  }

  const minutes = (Date.parse(completedAt) - Date.parse(startedAt)) / 60000;

  return Number.isFinite(minutes) ? minutes : null;
}

/**
 * isRecordedAfterCompletion は、イベントの完了時刻が記録時刻より後になっていないかを返します。
 *
 * 記録（uld record-loop-event）はイベントが終わってから走るので、completedAt が
 * recordedAt より後になることは原理的にありません。後になっている行は、担当が date を実測せず
 * 推測で書いた合図です。形式が正しくても値が信用できないため、所要時間の合計から外します。
 * recordedAt を持たない行（手で書いた古い記録）は判定できないので信用する側に倒します。
 */
function isRecordedAfterCompletion(event) {
  if (typeof event.recordedAt !== "string" || typeof event.completedAt !== "string") {
    return true;
  }

  return event.completedAt <= event.recordedAt;
}

/** stageKeyOf はイベントを表の工程キーに写します。test_completed は scope で分けます。 */
function stageKeyOf(event) {
  if (event.type === "test_completed") {
    return `test_completed:${event.scope === "fast" ? "fast" : "full"}`;
  }

  return event.type;
}

/** collectRuns はイベント行を runId ごとにまとめ、工程別の所要時間を足し上げます。 */
function collectRuns(paths) {
  const runs = new Map();

  for (const path of paths) {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      if (line.trim() === "") continue;

      let event;
      try {
        event = JSON.parse(line);
      } catch {
        process.stderr.write(`warning: 解釈できない行を無視しました: ${line.slice(0, 80)}\n`);
        continue;
      }

      const run = runs.get(event.runId) ?? {
        runId: event.runId,
        taskId: event.taskId ?? "-",
        branch: event.branch ?? "-",
        runner: event.runner ?? "-",
        minutes: new Map(),
        untrusted: [],
        rounds: 0,
        converged: false,
        escalated: false
      };

      const minutes = minutesBetween(event.startedAt, event.completedAt);
      if (minutes !== null && isRecordedAfterCompletion(event)) {
        const key = stageKeyOf(event);
        run.minutes.set(key, (run.minutes.get(key) ?? 0) + minutes);
      } else if (minutes !== null) {
        // 実測されていない時刻を合計に混ぜない。混ぜると表が黙って嘘をつく（実測で 1 件、
        // 完了時刻が 9 時間ずれた行が工程を 552 分と見せ、その run の合計を 20 倍にした）。
        run.untrusted.push({
          type: event.type,
          startedAt: event.startedAt,
          completedAt: event.completedAt,
          recordedAt: event.recordedAt,
          minutes
        });
      }
      if (event.type === "loop_converged") {
        run.converged = true;
        run.rounds = typeof event.rounds === "number" ? event.rounds : run.rounds;
      }
      if (event.type === "escalated") {
        run.escalated = true;
      }

      runs.set(event.runId, run);
    }
  }

  return [...runs.values()];
}

/** formatMinutes は分を小数 1 桁で整形します。無ければ空欄です。 */
function formatMinutes(minutes) {
  return minutes === undefined ? "" : minutes.toFixed(1);
}

const paths = process.argv.length > 2 ? process.argv.slice(2) : findEventLogs(designsDirectory);
const runs = collectRuns(paths);

if (runs.length === 0) {
  process.stdout.write("イベントログが見つかりません。\n");
} else {
  const header = [
    "タスク",
    "runner",
    ...stageOrder.map(([, label]) => label),
    "合計",
    "修正",
    "結果",
    "runId"
  ];
  const rows = runs.map((run) => {
    const total = [...run.minutes.values()].reduce((sum, minutes) => sum + minutes, 0);

    return [
      run.taskId,
      run.runner,
      ...stageOrder.map(([key]) => formatMinutes(run.minutes.get(key))),
      run.untrusted.length === 0 ? total.toFixed(1) : `${total.toFixed(1)} (欠)`,
      String(run.rounds),
      run.converged ? "収束" : run.escalated ? "上限" : "途中",
      run.runId
    ];
  });

  process.stdout.write(`| ${header.join(" | ")} |\n`);
  process.stdout.write(`| ${header.map(() => "---").join(" | ")} |\n`);
  for (const row of rows) {
    process.stdout.write(`| ${row.join(" | ")} |\n`);
  }
  process.stdout.write(
    `\n単位は分。所要時間は startedAt / completedAt の実測値から導出（${String(paths.length)} ファイル）。\n`
  );

  // 外した行を黙って消さない。合計に「(欠)」が付いた run について、何をどれだけ外したかを示す。
  const untrustedRuns = runs.filter((run) => run.untrusted.length > 0);

  if (untrustedRuns.length > 0) {
    process.stdout.write(
      `\n合計の「(欠)」は、完了時刻が記録時刻より後で信用できない行を外したことを表します` +
        `（実測ではなく推測で書かれた時刻）。外した行:\n`
    );

    for (const run of untrustedRuns) {
      for (const entry of run.untrusted) {
        process.stdout.write(
          `- ${run.taskId} / ${entry.type}: ${entry.startedAt} → ${entry.completedAt}` +
            `（${entry.minutes.toFixed(1)} 分）だが記録は ${String(entry.recordedAt)}\n`
        );
      }
    }
  }
}
