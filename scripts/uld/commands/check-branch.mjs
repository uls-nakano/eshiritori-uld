import { spawnSync } from "node:child_process";
import process from "node:process";
import { loadConfig } from "../lib/config.mjs";

const { branches, directories } = loadConfig();

/** protectedBranches は直接コミットを禁止するブランチの一覧です（uld.config.json の branches.protected。rules/branch のブランチ構成と 1 対 1 で対応させます）。 */
const protectedBranches = branches.protected;

/**
 * runGit は git command を実行し、成功時は標準出力を trim して返します。失敗時は null を返します。
 * 例外ではなく null を返すのは、git が無い環境や git 管理外の directory でも
 * `npm run check` を止めたくないためです（このチェックは早期警告であり最終防壁ではない）。
 * 子の stderr を明示的に pipe するのは、git 自身のエラー出力を親へ素通しさせないためです。
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

/**
 * currentBranchName は現在のブランチ名を返します。detached HEAD では null を返します。
 * `rev-parse --abbrev-ref HEAD` を使わないのは、detached HEAD でも文字列 "HEAD" を返し、
 * ブランチ名と区別が付かないためです。
 */
function currentBranchName() {
  return runGit(["symbolic-ref", "--quiet", "--short", "HEAD"]);
}

/**
 * hasUncommittedChanges は追跡中ファイルに未コミットの変更があるかを返します。
 * untracked file を数えないのは、生成物や作業メモで偽陽性になるためです。
 * 新規ファイルも `git add` した時点で index に載るため、コミット直前の状態は取りこぼしません。
 * git 自体が失敗した場合を「変更なし」に倒すのは、判定できないことを違反として扱うと
 * クリーンな作業ツリーで走る CI を偽陽性で止めてしまうためです。
 */
function hasUncommittedChanges() {
  const status = runGit(["status", "--porcelain", "--untracked-files=no"]);

  return status !== null && status !== "";
}

/** integrationBranch は chore/ ブランチの差分を比較する基点（マージ先）です（uld.config.json の branches.integration）。 */
const integrationBranch = branches.integration;

/** choreBranchPrefix は採番を持たない作業のブランチ接頭辞です。 */
const choreBranchPrefix = "chore/";

/** usecasesDirectory は受け入れ基準 ID を定義する生き資料の置き場です。check-trace と同じ場所を見ます。 */
const usecasesDirectory = directories.usecases;

/** requirementDefinitionLinePattern は diff の追加行・削除行に現れる受け入れ基準 ID の定義（太字）を判定します。 */
const requirementDefinitionLinePattern = /^[+-].*\*\*UC-\d{2} 要件 \d+\*\*/u;

/**
 * mergeBaseWithIntegration は現在のブランチと統合ブランチの分岐点を返します。
 * 統合ブランチが無い環境（浅い clone など）では null を返し、このチェックを見送ります。
 * ローカルの develop より origin/develop を優先するのは、ローカルが古いと develop 側で
 * 増えた受け入れ基準を自分の追加と誤認するためです。
 */
function mergeBaseWithIntegration() {
  return (
    runGit(["merge-base", "HEAD", `origin/${integrationBranch}`]) ??
    runGit(["merge-base", "HEAD", integrationBranch])
  );
}

/**
 * listAddedRequirementIds は分岐点から作業ツリーまでの差分で、ユースケース記述に新しく定義された
 * 受け入れ基準 ID を返します。作業ツリーまで見るのは、コミット前の `npm run check` でも
 * 止めるためです。未追跡の新規ユースケース記述は diff に出ないので、別に数えます。
 * 追加行の ID が削除行にもあれば、それは既存の定義行の変更（実装フェーズが状態マーク「（未実装）」を
 * 外す変更が典型。rules/acceptance-testing の「仕様トレーサビリティ」）であって新設ではないので数えません。
 * 追加行だけを見ると、マークを外す正当な変更を設計フェーズの成果物と誤認して実装のブランチを止めてしまいます。
 */
function listAddedRequirementIds(mergeBase) {
  const diff = runGit(["diff", mergeBase, "--", usecasesDirectory]) ?? "";
  const addedIds = new Set();
  const removedIds = new Set();

  for (const line of diff.split("\n")) {
    if (!requirementDefinitionLinePattern.test(line)) {
      continue;
    }

    const ids = line.startsWith("+") ? addedIds : removedIds;

    for (const match of line.matchAll(/\*\*(UC-\d{2} 要件 \d+)\*\*/gu)) {
      ids.add(match[1]);
    }
  }

  const newlyDefinedIds = new Set([...addedIds].filter((id) => !removedIds.has(id)));
  const untracked = runGit(["ls-files", "--others", "--exclude-standard", "--", usecasesDirectory]);

  for (const filePath of (untracked ?? "").split("\n").filter((path) => path.endsWith(".md"))) {
    newlyDefinedIds.add(`${filePath}（新規のユースケース記述）`);
  }

  return [...newlyDefinedIds].sort();
}

const branchName = currentBranchName();

if (branchName !== null && protectedBranches.includes(branchName) && hasUncommittedChanges()) {
  process.stderr.write("branch violation:\n");
  process.stderr.write(
    `- ${branchName}: 保護ブランチに未コミットの変更があります。${protectedBranches.join(" / ")} へ直接コミットしないでください。\n`
  );
  process.stderr.write(
    "作業ブランチを切り直してください: git switch -c <scenario/... | design/... | task/... | chore/...>\n" +
      "ブランチの命名規約は rules/branch にあります。\n"
  );
  process.exitCode = 1;
}

// chore/ は採番を持たない作業のためのブランチで、受け入れ基準を増やす変更（利用者から見える
// 振る舞いの追加・変更）を載せてはいけない。それは既存ユースケースの拡張であり、要求として
// ヒアリングを経て REQ を起こす対象になる（rules/branch の「採番を持たない作業」）。
// 受け入れ基準 ID の新設は docs/usecases への太字定義の追加として決定的に検出できるので、
// 判断を AI の推論に任せず、ここで機械的に止める。
if (branchName !== null && branchName.startsWith(choreBranchPrefix)) {
  const mergeBase = mergeBaseWithIntegration();
  const addedRequirementIds = mergeBase === null ? [] : listAddedRequirementIds(mergeBase);

  if (addedRequirementIds.length > 0) {
    process.stderr.write("branch violation:\n");
    process.stderr.write(
      `- ${branchName}: chore/ ブランチで受け入れ基準が追加されています: ${addedRequirementIds.join(", ")}\n`
    );
    process.stderr.write(
      "利用者から見える振る舞いの追加・変更は採番のない作業ではありません。新しい REQ を起こし、" +
        "ヒアリングで範囲を決めてから task/ ブランチで実装してください（rules/branch の「採番を持たない作業」）。\n"
    );
    process.exitCode = 1;
  }
}

/** designBranchPattern は設計フェーズのブランチ名（design/REQ-xxx-UC-yy-<slug>）から採番を読みます。 */
const designBranchPattern = /^design\/(REQ-\d{3})-(UC-\d{2})-/u;

/** taskBranchPattern は実装フェーズのブランチ名（task/REQ-xxx-UC-yy/<taskId>-<slug>）から採番を読みます。 */
const taskBranchPattern = /^task\/(REQ-\d{3})-(UC-\d{2})\//u;

/** designsDirectory は開発フローの記録（ログ資料）の置き場です。 */
const designsDirectory = directories.designs;

/**
 * listIntegrationBranchFiles は統合ブランチに着地しているファイルの一覧を返します。origin/develop を
 * 優先するのはローカルの develop が古いと未着地の成果物を着地済みと誤認するためで、どちらも無い環境では
 * null を返してこのチェックを見送ります。
 */
function listIntegrationBranchFiles(directory) {
  const listing =
    runGit(["ls-tree", "-r", "--name-only", `origin/${integrationBranch}`, "--", directory]) ??
    runGit(["ls-tree", "-r", "--name-only", integrationBranch, "--", directory]);

  return listing === null ? null : listing.split("\n").filter((path) => path !== "");
}

/**
 * listMissingScenarioArtifacts は、シナリオフェーズの成果物（REQ の request / hearing / plan と、
 * 移行単位の usecase / scenarios）のうち統合ブランチに無いものを返します。フォルダ名の <slug> は
 * 言い換わるため採番だけで照合します（rules/branch の「命名」）。
 */
function listMissingScenarioArtifacts(requirementNumber, unitNumber, integrationFiles) {
  const requirementDirectory = `${designsDirectory}/${requirementNumber}-[^/]+/`;
  const unitDirectory = `${requirementDirectory}${unitNumber}-[^/]+/`;
  const requiredArtifacts = [
    ["request.md", new RegExp(`^${requirementDirectory}request\\.md$`, "u")],
    ["hearing.md", new RegExp(`^${requirementDirectory}hearing\\.md$`, "u")],
    ["plan.md", new RegExp(`^${requirementDirectory}plan\\.md$`, "u")],
    [`${unitNumber}/usecase.md`, new RegExp(`^${unitDirectory}usecase\\.md$`, "u")],
    [`${unitNumber}/scenarios.md`, new RegExp(`^${unitDirectory}scenarios\\.md$`, "u")]
  ];

  return requiredArtifacts
    .filter(([, pattern]) => !integrationFiles.some((path) => pattern.test(path)))
    .map(([label]) => label);
}

// 設計・実装フェーズは、前のフェーズの出口の PR が人に承認され develop に着地していることを前提にする
// （rules/branch の「フェーズごとの PR と承認」）。着地前に次のフェーズのブランチを切ると、
// シナリオ → 設計 → 実装が 1 本のスタックに積まれ、人がヒアリングに答える前に実装が終わってしまう。
// 「成果物が develop に存在するか」は決定的に判定できるので、AI の自制に任せずここで止める。
const phaseBranch =
  designBranchPattern.exec(branchName ?? "") ?? taskBranchPattern.exec(branchName ?? "");

if (branchName !== null && phaseBranch !== null) {
  const [, requirementNumber, unitNumber] = phaseBranch;
  const integrationFiles = listIntegrationBranchFiles(designsDirectory);
  const missingArtifacts =
    integrationFiles === null
      ? []
      : listMissingScenarioArtifacts(requirementNumber, unitNumber, integrationFiles);

  if (missingArtifacts.length > 0) {
    process.stderr.write("branch violation:\n");
    process.stderr.write(
      `- ${branchName}: シナリオフェーズの成果物が ${integrationBranch} に着地していません: ${missingArtifacts.join(", ")}\n`
    );
    process.stderr.write(
      "シナリオ PR（scenario/REQ-…）が承認・マージされ、ヒアリングの回答が人によって埋まるまで、設計・実装のブランチを切らないでください" +
        "（rules/branch の「フェーズごとの PR と承認」）。\n"
    );
    process.exitCode = 1;
  }

  // 実装フェーズはさらに設計フェーズの着地を前提にする。設計フェーズが置く受け入れ基準 ID の定義が
  // task/ ブランチの差分に現れるなら、設計 PR がまだマージされていない。
  if (branchName.startsWith("task/")) {
    const mergeBase = mergeBaseWithIntegration();
    const addedRequirementIds = mergeBase === null ? [] : listAddedRequirementIds(mergeBase);

    if (addedRequirementIds.length > 0) {
      process.stderr.write("branch violation:\n");
      process.stderr.write(
        `- ${branchName}: 設計フェーズの成果物（受け入れ基準の定義）が task/ ブランチの差分に含まれています: ${addedRequirementIds.join(", ")}\n`
      );
      process.stderr.write(
        "設計 PR（design/REQ-…-UC-…）が承認・マージされて受け入れ基準が develop に着地するまで、実装のブランチを切らないでください" +
          "（rules/branch の「フェーズごとの PR と承認」）。\n"
      );
      process.exitCode = 1;
    }
  }
}
