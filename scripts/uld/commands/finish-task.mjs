import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { loadConfig } from "../lib/config.mjs";

const { branches, directories } = loadConfig();

/**
 * finish-task.mjs は収束した子タスクをコミットして push し、子タスク PR をスタックに積みます。
 *
 * Record 工程の「コミット → push → PR 作成 → 底 PR のレビューガイド更新 → tasks.md のチェック」は
 * 判断の要らない決定的な手順です。エージェントに任せると、状況を読んで amend や force push を
 * 選んだり、同じタスクを二重に記録したりするため、手順を機械に寄せて AI には入力（PR 本文の材料）
 * だけを作らせます。
 *
 * 使い方:
 *   node scripts/uld/uld.mjs finish-task --input <json path> [--dry-run]
 *
 * 入力 JSON:
 *   {
 *     "branch": "task/REQ-003-UC-01/1.2.1-<slug>",   // 期待する現在ブランチ。違えば何もせず止まる
 *     "baseBranch": "task/REQ-003-UC-01/1.1.1-<slug>", // PR の base（スタックの 1 段下。底なら develop）
 *     "taskId": "1.2.1",                              // 採番のない作業では null
 *     "unitDirectory": ".designs/REQ-xxx/UC-yy",      // tasks.md のあるフォルダ（記録の置き場配下）。採番のない作業では null
 *     "files": ["path", ...],                         // コミットに含めるファイル（明示。git add . は使わない）
 *     "commitSubject": "[1.2.1] ...",
 *     "commitBody": "Why を書く本文",
 *     "prTitle": "[1.2.1] ...",
 *     "prBody": "PR 本文（.github/PULL_REQUEST_TEMPLATE.md の骨格）"
 *   }
 *
 * 冪等ガード: 現在ブランチが違う・main / develop 上にいる・同じタスク ID のコミットが既にあって
 * 作業ツリーが汚れている・head ブランチの PR が既に開いている、のいずれかなら何もせず終了コード 1 で
 * 止まります。amend と force push は行いません。
 */

/** integrationBranch はスタックの底が向く統合ブランチです（uld.config.json の branches.integration）。 */
const integrationBranch = branches.integration;

/** protectedBranches は直接コミットを禁止するブランチです（uld.config.json の branches.protected）。 */
const protectedBranches = branches.protected;

/** coAuthorTrailer はコミット本文の末尾に付ける共同作者の表記です。 */
const coAuthorTrailer = "Co-Authored-By: Claude <noreply@anthropic.com>";

/** prFooter は PR 本文の末尾に付ける表記です。既に含まれていれば付け足しません。 */
const prFooter = "🤖 Generated with [Claude Code](https://claude.com/claude-code)";

/** reviewGuideHeading はスタックの底 PR に置くレビューガイドの見出しです（rules/pull-request）。 */
const reviewGuideHeading = "## レビューガイド";

/** fail はメッセージを stderr に出して終了コードを立てます。 */
function fail(message) {
  process.stderr.write(`finish-task violation:\n- ${message}\n`);
  process.exitCode = 1;
}

/**
 * run は外部コマンドを実行して stdout を返します。失敗は例外にします。
 * git と gh の失敗をここで握りつぶさないのは、途中で止まった状態（push だけ済んで PR が無い、など）を
 * 呼び出し側に見せるためです。
 */
function run(command, commandArguments, { allowFailure = false } = {}) {
  const result = spawnSync(command, commandArguments, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (result.error !== undefined) {
    throw new Error(`${command} を起動できません: ${result.error.message}`);
  }
  if (result.status !== 0 && !allowFailure) {
    throw new Error(
      `${command} ${commandArguments.join(" ")} が失敗しました:\n${result.stderr.trim()}`
    );
  }

  return { status: result.status, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

/** parseArguments は argv を { input, dryRun } に解釈します。 */
function parseArguments(argv) {
  const parsed = { input: null, dryRun: false };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];

    if (key === "--dry-run") {
      parsed.dryRun = true;
    } else if (key === "--input") {
      parsed.input = argv[index + 1] ?? null;
      index += 1;
    } else {
      return { error: `不明な引数です: ${key}` };
    }
  }

  return parsed;
}

/**
 * summaryRowLabels は PR 本文の「一目で」表に必ず並ぶ行ラベルです（rules/pull-request の
 * 「一目で分かる形にする」）。並び順は問わず、5 行がそろっていることだけを見ます。
 */
const summaryRowLabels = ["やったこと", "課題", "解決", "触った層", "要確認"];

/**
 * pullRequestBodyError は PR 本文が「一目で」表の骨格を満たしているかを検べ、満たさなければ
 * 理由を返します。満たしていれば null です。
 *
 * ここで止めるのは、本文の書式が後続の機械処理の入力になっているからです。底 PR の
 * レビューガイドは各段の本文から要確認の件数を読んで組み立てるので、表が無い本文が 1 本
 * 混ざるとその段が「不明」になり、人は自分が読む順と重みを決められません。実測で 1 本、
 * 独自の書式の本文が素通りしてガードが「不明」になりました。
 *
 * 中身の妥当性（書かれている内容が正しいか）は人が読む領分なので、ここでは見ません。
 */
function pullRequestBodyError(prBody) {
  const missing = summaryRowLabels.filter(
    (label) => !new RegExp(`\\|\\s*\\*\\*${label}\\*\\*\\s*\\|`, "u").test(prBody)
  );

  if (missing.length > 0) {
    return (
      `PR 本文の「一目で」表に ${missing.map((label) => `**${label}**`).join("・")} の行がありません。` +
      ".github/PULL_REQUEST_TEMPLATE.md の骨格（先頭は表 1 つ）に従ってください" +
      "（rules/pull-request の「一目で分かる形にする」）"
    );
  }

  if (reviewPointsOf(prBody) === "不明") {
    return (
      "PR 本文の「一目で」表から要確認の件数を読み取れません。" +
      "`| **要確認** | 仕様 n・設計 n・予定外 n・名前 n |` の形で、0 件の分類も 0 と書いてください" +
      "（rules/pull-request の「要確認の 4 分類」）"
    );
  }

  return null;
}

/** readInput は入力 JSON を読み、必須フィールドを検証します。 */
function readInput(path) {
  if (path === null || !existsSync(path)) {
    return {
      error: `--input で入力 JSON のパスを指定してください（見つかりません: ${String(path)}）`
    };
  }

  let input;
  try {
    input = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    return {
      error: `入力 JSON を解釈できません: ${error instanceof Error ? error.message : String(error)}`
    };
  }

  for (const field of [
    "branch",
    "baseBranch",
    "commitSubject",
    "commitBody",
    "prTitle",
    "prBody"
  ]) {
    if (typeof input[field] !== "string" || input[field].trim() === "") {
      return { error: `入力の ${field}（文字列）が必要です` };
    }
  }
  if (!Array.isArray(input.files) || input.files.some((file) => typeof file !== "string")) {
    return { error: "入力の files（文字列の配列）が必要です" };
  }

  const bodyError = pullRequestBodyError(input.prBody);
  if (bodyError !== null) {
    return { error: bodyError };
  }

  return {
    input: {
      ...input,
      taskId: typeof input.taskId === "string" ? input.taskId : null,
      unitDirectory: typeof input.unitDirectory === "string" ? input.unitDirectory : null
    }
  };
}

/** currentBranch は現在のブランチ名を返します。detached HEAD では null です。 */
function currentBranch() {
  const result = run("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], { allowFailure: true });

  return result.status === 0 ? result.stdout : null;
}

/**
 * hasTaskCommit は「この Record が既に走ったか」を、現在のスタックに同じタスク ID のコミットが
 * あるかで返します。
 *
 * 探す範囲を統合ブランチから先（`develop..HEAD`）に限るのは、タスク ID が移行単位ごとの採番
 * （`{slice}.{phase}.{連番}`）で、別の移行単位と同じ番号になるのが正常だからです。履歴を件数で
 * 切って探すと、マージ済みの別の移行単位の同じ番号のコミットを「二重記録」と誤検出し、
 * Record が止まります。このガードが防ぎたいのは同じタスクの二重記録だけで、その重複は必ず
 * まだマージされていないこのスタックの中に現れます。
 */
function hasTaskCommit(taskId) {
  if (taskId === null) {
    return false;
  }

  const subjects = run("git", ["log", "--format=%s", `${integrationBranch}..HEAD`]).stdout.split(
    "\n"
  );

  return subjects.some((subject) => subject.startsWith(`[${taskId}]`));
}

/** isWorkingTreeDirty は追跡ファイルの未コミット変更があるかを返します。 */
function isWorkingTreeDirty() {
  return run("git", ["status", "--porcelain", "--untracked-files=no"]).stdout !== "";
}

/** openPullRequestFor は head ブランチに開いている PR を返します。無ければ null です。 */
function openPullRequestFor(headBranch) {
  const result = run("gh", [
    "pr",
    "list",
    "--head",
    headBranch,
    "--state",
    "open",
    "--json",
    "number,url,title,body,baseRefName,headRefName"
  ]);
  const pullRequests = JSON.parse(result.stdout);

  return pullRequests.length === 0 ? null : pullRequests[0];
}

/**
 * eventLogPathFor は移行単位のループイベントログのパスを返します。
 * 置き場の規則は実装ループのワークフロー（.claude/workflows/uld-impl.js の eventLogPath）と同じです。
 */
function eventLogPathFor(unitDirectory) {
  return unitDirectory === null
    ? `${directories.designs}/events/loop-events.jsonl`
    : `${unitDirectory}/events/loop-events.jsonl`;
}

/**
 * hasRecordedEventsFor は、このブランチのループイベントがイベントログに記録済みかを返します。
 *
 * 記録担当は「追記した」と自己申告しますが、その申告は誰も検証していませんでした。実測で 1 回、
 * node scripts/uld/uld.mjs record-loop-event を呼ばないまま eventsAppended を返し、13 件のイベントが
 * リポジトリのどこにも残らないまま PR が積まれています。工程別の所要時間と修正ループの回数は
 * このログだけが持つので、抜けると前後比較が黙って壊れます。申告ではなくファイルを見て確かめます。
 *
 * ブランチで突き合わせるのは、record-loop-event.mjs が追記時に branch を付与するためです
 * （タスク ID は移行単位ごとの採番なので、それだけでは前の単位の行と区別できません）。
 */
function hasRecordedEventsFor(eventLogPath, branch) {
  if (!existsSync(eventLogPath)) {
    return false;
  }

  return readFileSync(eventLogPath, "utf8")
    .split("\n")
    .some((line) => {
      if (line.trim() === "") {
        return false;
      }

      try {
        return JSON.parse(line).branch === branch;
      } catch {
        // 壊れた 1 行で記録全体を無かったことにしない（record-loop-event.mjs の nextSequence と同じ方針）。
        return false;
      }
    });
}

/**
 * tickTask は tasks.md の該当タスクのチェックボックスを [x] にし、変更したらそのパスを返します。
 * 進捗の状態を人手で更新させると忘れられるため、コミットする側で機械的に更新します。
 */
function tickTask(unitDirectory, taskId) {
  if (unitDirectory === null || taskId === null) {
    return null;
  }

  const tasksPath = `${unitDirectory}/tasks.md`;
  if (!existsSync(tasksPath)) {
    return null;
  }

  const escapedTaskId = taskId.replaceAll(".", "\\.");
  const pattern = new RegExp(`^(\\s*- )\\[ \\](\\s+${escapedTaskId}\\s)`, "mu");
  const before = readFileSync(tasksPath, "utf8");
  const after = before.replace(pattern, "$1[x]$2");

  if (after === before) {
    return null;
  }

  writeFileSync(tasksPath, after);

  return tasksPath;
}

/** writeTempFile は本文を一時ファイルに書き、そのパスを返します（コミット・PR 本文の受け渡し用）。 */
function writeTempFile(name, content) {
  const directory = mkdtempSync(join(tmpdir(), "finish-task-"));
  const path = join(directory, name);

  writeFileSync(path, content);

  return path;
}

/**
 * stackChain は base をたどり、新しい PR の 1 段下から底までの PR を並べて返します（近い順）。
 * base が統合ブランチなら空配列で、この PR 自身が底です。
 */
function stackChain(baseBranch) {
  const chain = [];
  let base = baseBranch;

  while (base !== integrationBranch) {
    const pullRequest = openPullRequestFor(base);

    if (pullRequest === null) {
      throw new Error(
        `base ブランチ ${base} に開いている PR が見つからないため、スタックの底を特定できません`
      );
    }

    chain.push(pullRequest);
    base = pullRequest.baseRefName;
  }

  return chain;
}

/** reviewPointsOf は PR 本文の「一目で」表から要確認の件数を読み、0 件の分類を省いた文にします。 */
function reviewPointsOf(body) {
  const match = /\|\s*\*\*要確認\*\*\s*\|\s*([^|\n]+)\|/u.exec(body);

  if (match === null) {
    return "不明";
  }

  const nonZero = match[1]
    .split(/[・、,]/u)
    .map((part) => part.trim())
    .filter((part) => part !== "" && !/\s0$/u.test(part) && !/^[^\d]*0$/u.test(part));

  return nonZero.length === 0 ? "なし" : nonZero.join("・");
}

/** taskLabelOf は PR の title からタスク ID の接頭辞を除いた要約を返します。 */
function taskLabelOf(title) {
  const match = /^\[([^\]]+)\]\s*(.+)$/u.exec(title);

  return match === null ? title : `${match[1]} ${match[2]}`;
}

/**
 * renderReviewGuide はスタック全段のレビューガイドを組み立てます。
 * 既存のガイドに 1 行足すのではなく毎回全段から作り直すのは、段の抜けや重複を手順の途中状態に
 * 依存させないためです。
 */
function renderReviewGuide(stackFromBottom) {
  const rows = stackFromBottom.map(
    (pullRequest, index) =>
      `| ${String(index + 1)} | #${String(pullRequest.number)} | ${taskLabelOf(pullRequest.title)} | ${reviewPointsOf(pullRequest.body)} |`
  );
  const withPoints = stackFromBottom.filter(
    (pullRequest) => reviewPointsOf(pullRequest.body) !== "なし"
  ).length;

  return [
    reviewGuideHeading,
    "",
    `下から順に読みます。要確認ありは ${String(stackFromBottom.length)} 段中 ${String(withPoints)} 段です。`,
    "",
    "| 順 | PR | タスク | 要確認 |",
    "| --- | --- | --- | --- |",
    ...rows
  ].join("\n");
}

/** replaceReviewGuide は底 PR の本文のレビューガイド節を差し替え（無ければフッターの前に新設）ます。 */
function replaceReviewGuide(body, guide) {
  const headingIndex = body.indexOf(reviewGuideHeading);

  if (headingIndex !== -1) {
    const rest = body.slice(headingIndex + reviewGuideHeading.length);
    const nextSectionOffset = rest.search(/\n(?:## |🤖 )/u);
    const tail = nextSectionOffset === -1 ? "" : rest.slice(nextSectionOffset);

    return `${body.slice(0, headingIndex)}${guide}${tail}`;
  }

  const footerIndex = body.indexOf(prFooter);

  if (footerIndex !== -1) {
    return `${body.slice(0, footerIndex).trimEnd()}\n\n${guide}\n\n${body.slice(footerIndex)}`;
  }

  return `${body.trimEnd()}\n\n${guide}\n`;
}

/** main は入力を検証し、コミット → push → PR → レビューガイドの順に進めます。 */
function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.error !== undefined) {
    fail(options.error);
    return;
  }

  const read = readInput(options.input);
  if (read.error !== undefined) {
    fail(read.error);
    return;
  }
  const { input } = read;

  const branch = currentBranch();
  if (branch !== input.branch) {
    fail(
      `現在のブランチ（${String(branch)}）が入力の branch（${input.branch}）と違います。` +
        "別のセッションがブランチを切り替えた可能性があります。何もせず止まります"
    );
    return;
  }
  if (protectedBranches.includes(branch)) {
    fail(`${branch} には直接コミットしません（rules/branch のブランチ構成）`);
    return;
  }

  const existingPullRequest = openPullRequestFor(branch);
  if (existingPullRequest !== null) {
    fail(
      `head ブランチ ${branch} の PR #${String(existingPullRequest.number)} が既に開いています。` +
        "同じタスクの Record が二重に走っています。何もせず止まります"
    );
    return;
  }

  const alreadyCommitted = hasTaskCommit(input.taskId);
  const dirty = isWorkingTreeDirty();
  if (alreadyCommitted && dirty) {
    fail(
      `[${String(input.taskId)}] のコミットが既にあり、作業ツリーにも未コミットの変更があります。` +
        "どちらが正か判断できないため止まります（amend は行いません）"
    );
    return;
  }

  // 採番のあるタスクは必ず実装ループを回っているので、イベントが無いのは記録工程を飛ばした合図です。
  // ここで止めないと、コミットと PR だけが進んで計測だけが欠けた状態が黙って残ります。
  // 採番のない作業（chore）はループを回さず手で仕上げることがあるため、要求しません。
  const eventLogPath = eventLogPathFor(input.unitDirectory);
  if (input.taskId !== null && !hasRecordedEventsFor(eventLogPath, branch)) {
    fail(
      `ループイベントが ${eventLogPath} に記録されていません（ブランチ ${branch} の行が 1 件もありません）。` +
        "先に node scripts/uld/uld.mjs record-loop-event でイベントを追記してから、もう一度この script を実行してください"
    );
    return;
  }

  const plan = {
    branch,
    baseBranch: input.baseBranch,
    commit: alreadyCommitted ? "skip（既にコミット済み）" : input.commitSubject,
    files: input.files,
    push: `origin ${branch}`,
    pullRequest: input.prTitle
  };

  if (options.dryRun) {
    process.stdout.write(`${JSON.stringify({ dryRun: true, plan }, null, 2)}\n`);
    return;
  }

  let commitHash = null;
  if (!alreadyCommitted) {
    const tickedPath = tickTask(input.unitDirectory, input.taskId);
    // tasks.md とイベントログは、記録担当が files に挙げ忘れてもコミットに含める。
    // どちらも「この段が完了した」ことの記録そのもので、挙げ忘れを人が気づける場所が無いため。
    const generated = [tickedPath, existsSync(eventLogPath) ? eventLogPath : null].filter(
      (path) => path !== null && !input.files.includes(path)
    );
    const files = [...input.files, ...generated];

    run("git", ["add", "--", ...files]);

    if (run("git", ["diff", "--cached", "--name-only"]).stdout === "") {
      fail("コミットする変更がありません（files に挙げたファイルに差分が無い）");
      return;
    }

    const messagePath = writeTempFile(
      "commit-message.txt",
      `${input.commitSubject}\n\n${input.commitBody.trim()}\n\n${coAuthorTrailer}\n`
    );
    run("git", ["commit", "--quiet", "-F", messagePath]);
    commitHash = run("git", ["rev-parse", "--short", "HEAD"]).stdout;
  }

  run("git", ["push", "--quiet", "-u", "origin", branch]);

  const body = input.prBody.includes(prFooter)
    ? input.prBody
    : `${input.prBody.trimEnd()}\n\n${prFooter}\n`;
  const bodyPath = writeTempFile("pr-body.md", body);
  const prUrl = run("gh", [
    "pr",
    "create",
    "--base",
    input.baseBranch,
    "--head",
    branch,
    "--title",
    input.prTitle,
    "--body-file",
    bodyPath
  ]).stdout;

  // スタックが 2 段以上になったときだけ底 PR にレビューガイドを置く（rules/pull-request）。
  let bottomPullRequest = null;
  const chain = stackChain(input.baseBranch);
  if (chain.length > 0) {
    const created = openPullRequestFor(branch);
    const stackFromBottom = [...chain].reverse().concat(created === null ? [] : [created]);
    bottomPullRequest = stackFromBottom[0];
    const guidePath = writeTempFile(
      "bottom-pr-body.md",
      replaceReviewGuide(bottomPullRequest.body, renderReviewGuide(stackFromBottom))
    );
    run("gh", ["pr", "edit", String(bottomPullRequest.number), "--body-file", guidePath]);
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        committed: !alreadyCommitted,
        commit: commitHash,
        branch,
        baseBranch: input.baseBranch,
        pullRequestUrl: prUrl,
        reviewGuideUpdatedOn: bottomPullRequest === null ? null : bottomPullRequest.number
      },
      null,
      2
    )}\n`
  );
}

try {
  main();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
