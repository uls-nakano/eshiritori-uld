import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { loadConfig } from "../lib/config.mjs";

const { directories } = loadConfig();

/** usecasesDirectory は受け入れ基準 ID を定義するユースケース記述の置き場です。 */
const usecasesDirectory = directories.usecases;

/** journeysDirectory はジャーニーのケース ID を定義するジャーニー記述の置き場です。 */
const journeysDirectory = directories.journeys;

/** testRootDirectories はテストコードを探索する起点です（uld.config.json の directories.testRoots）。無いフォルダは読み飛ばします。 */
const testRootDirectories = directories.testRoots.filter((directory) => existsSync(directory));

/** skippedDirectoryNames は探索しないディレクトリです。生成物と依存物にはトレース対象がありません。 */
const skippedDirectoryNames = new Set(["node_modules", "dist", ".next", "coverage", "generated"]);

/** testFilePattern はトレース対象のテスト・story ファイルを判定します。 */
const testFilePattern = /\.(test\.tsx?|stories\.tsx?)$/u;

/** sourceFilePattern は、ログ資料の要件番号の混入を検査する実装・テストのファイルです。 */
const sourceFilePattern = /\.(ts|tsx)$/u;

/**
 * logDocRequirementPattern は `.designs/` のユースケース定義（ログ資料）の要件番号（例: 要件 2-4）です。
 * コード・テスト・story のコメントで参照してよい受け入れ基準は `docs/usecases/` の ID（UC-02 要件 17）だけで、
 * ログ資料の番号を書くと読み手が生き資料から辿れません（rules/acceptance-testing の「仕様トレーサビリティ」）。
 */
const logDocRequirementPattern = /要件 \d+-\d+/gu;

/**
 * scenarioIdPattern は `.designs/` の合格シナリオ集（ログ資料）のシナリオ ID（例: S-01-05）です。
 * シナリオとテストの対応は scenarios.md の「結合テストへの対応」表が持ち、テスト・コードの側には書きません
 * （rules/acceptance-testing の「仕様トレーサビリティ」）。語の途中（英数字やハイフンの直後）に現れる並びは拾いません。
 */
const scenarioIdPattern = /(?<![A-Za-z0-9-])S-\d{2}-\d{2}(?!\d)/gu;

/**
 * e2eTestFilePattern は E2E テストファイルを判定します。E2E はジャーニーのケース ID でトレースし、
 * 受け入れ基準 ID を置きません（rules/acceptance-testing の「仕様トレーサビリティ」）。
 */
const e2eTestFilePattern = /\.e2e\.test\.ts$/u;

/**
 * 受け入れ基準 ID とジャーニーのケース ID の 2 種類を同じ手順で突き合わせます。ジャーニーは
 * 1 つのジャーニー（ファイル、E2E-01）が 1 本以上のケース（E2E-01-01）を持ち、テストと結ぶのはケース ID です。
 * 定義は本文の説明や例に登場する ID を誤って数えないよう、太字の定義形式だけを拾います。
 * 使用側は、その ID を置いてよいテストファイル（受け入れ基準は E2E 以外、ジャーニーは E2E だけ）
 * に限って集めます。
 *
 * 定義の直後の状態マークで、テストの有無に求めることが変わります（rules/acceptance-testing の
 * 「仕様トレーサビリティ」）。マーク無しと「（廃止予定）」はテストが要る（現に効いている基準）。
 * 「（未実装）」と「（廃止）」はテストがあってはならない（設計で先に書いた基準、退役した基準）。
 * 生き資料の状態と実装の実態が食い違ったまま残らないよう、両方向を機械で止めます。
 */
const traceKinds = [
  {
    label: "受け入れ基準",
    definitionDirectory: usecasesDirectory,
    definedIdPattern: /\*\*(UC-\d{2} 要件 \d+)\*\*/gu,
    statusPattern: /\*\*(UC-\d{2} 要件 \d+)\*\*（(未実装|廃止予定|廃止)）/gu,
    usedIdPattern: /UC-\d{2} 要件 \d+/gu,
    isAllowedTestFile: (filePath) => !e2eTestFilePattern.test(filePath),
    misplacedReason: "受け入れ基準 ID は E2E テストに置けません(検証責務は結合テストと Storybook)"
  },
  {
    label: "ジャーニーのケース",
    definitionDirectory: journeysDirectory,
    definedIdPattern: /\*\*(E2E-\d{2}-\d{2})\*\*/gu,
    statusPattern: /\*\*(E2E-\d{2}-\d{2})\*\*（(未実装|廃止予定|廃止)）/gu,
    usedIdPattern: /E2E-\d{2}-\d{2}/gu,
    isAllowedTestFile: (filePath) => e2eTestFilePattern.test(filePath),
    misplacedReason: "ジャーニーのケース ID は E2E テスト(*.e2e.test.ts)にだけ置けます"
  }
];

/** listDefinitionFiles は置き場配下の定義文書(README を除く)を返します。置き場が無ければ空です。 */
function listDefinitionFiles(definitionDirectory) {
  if (!existsSync(definitionDirectory)) {
    return [];
  }

  return readdirSync(definitionDirectory)
    .filter((entryName) => entryName.endsWith(".md") && entryName !== "README.md")
    .map((entryName) => join(definitionDirectory, entryName))
    .sort();
}

/** collectDefinedIds は置き場の生き資料に定義されたすべての ID を返します。 */
function collectDefinedIds(definitionDirectory, definedIdPattern) {
  const definedIds = new Set();

  for (const filePath of listDefinitionFiles(definitionDirectory)) {
    for (const match of readFileSync(filePath, "utf8").matchAll(definedIdPattern)) {
      definedIds.add(match[1]);
    }
  }

  return definedIds;
}

/** collectIdStatuses は置き場の生き資料で状態マーク付きに定義された ID を、ID → 状態の対応で返します。 */
function collectIdStatuses(definitionDirectory, statusPattern) {
  const statuses = new Map();

  for (const filePath of listDefinitionFiles(definitionDirectory)) {
    for (const match of readFileSync(filePath, "utf8").matchAll(statusPattern)) {
      statuses.set(match[1], match[2]);
    }
  }

  return statuses;
}

/** requiresTest は、その状態の ID にテストが要るかを返します。マーク無しと廃止予定は現に効いている基準です。 */
function requiresTest(status) {
  return status === undefined || status === "廃止予定";
}

/** listFiles は起点配下で pattern に合うファイルを再帰的に集めます。 */
function listFiles(directoryPath, pattern) {
  const files = [];

  for (const entryName of readdirSync(directoryPath)) {
    const entryPath = join(directoryPath, entryName);

    if (statSync(entryPath).isDirectory()) {
      if (!skippedDirectoryNames.has(entryName)) {
        files.push(...listFiles(entryPath, pattern));
      }
    } else if (pattern.test(entryName)) {
      files.push(entryPath);
    }
  }

  return files;
}

/** allTestFiles は全起点のテスト・story ファイルです。 */
const allTestFiles = testRootDirectories.flatMap((rootDirectory) =>
  listFiles(rootDirectory, testFilePattern)
);

/** allSourceFiles は全起点の実装・テストのファイルです。 */
const allSourceFiles = testRootDirectories.flatMap((rootDirectory) =>
  listFiles(rootDirectory, sourceFilePattern)
);

/** collectUsedIds は指定ファイル群に現れる ID を、出現ファイルの一覧付きで返します。 */
function collectUsedIds(usedIdPattern, filePaths) {
  const usedIds = new Map();

  for (const filePath of filePaths) {
    for (const match of readFileSync(filePath, "utf8").matchAll(usedIdPattern)) {
      const usedFilePaths = usedIds.get(match[0]) ?? new Set();
      usedFilePaths.add(filePath);
      usedIds.set(match[0], usedFilePaths);
    }
  }

  return usedIds;
}

/** formatFilePaths は違反メッセージ用に出現ファイルを並べます。 */
function formatFilePaths(filePaths) {
  return [...filePaths].join(", ");
}

/** violations は検出した違反メッセージです。空なら OK です。 */
const violations = [];

/** summaries は OK 時に出す種類ごとの件数です。 */
const summaries = [];

for (const kind of traceKinds) {
  const definedIds = collectDefinedIds(kind.definitionDirectory, kind.definedIdPattern);
  const idStatuses = collectIdStatuses(kind.definitionDirectory, kind.statusPattern);
  const usedIds = collectUsedIds(kind.usedIdPattern, allTestFiles.filter(kind.isAllowedTestFile));
  const misplacedIds = collectUsedIds(
    kind.usedIdPattern,
    allTestFiles.filter((filePath) => !kind.isAllowedTestFile(filePath))
  );

  // 現に効いている基準（マーク無し・廃止予定）がどのテストにも現れないのは、テストの抜けを表す。
  for (const definedId of [...definedIds]
    .filter((id) => requiresTest(idStatuses.get(id)) && !usedIds.has(id))
    .sort()) {
    violations.push(
      `- テスト未対応: ${definedId} を検証するテストが見つかりません(${kind.definitionDirectory}/ に定義あり)`
    );
  }

  // 未実装・廃止の ID にテストが現れるのは、生き資料の状態が実装の実態より古いことを表す。
  for (const [markedId, status] of [...idStatuses.entries()].sort()) {
    if (requiresTest(status) || !usedIds.has(markedId)) {
      continue;
    }

    const instruction =
      status === "未実装"
        ? "実装が済んだので「（未実装）」を外してください"
        : "廃止した基準のテストは消してください(残すなら「（廃止予定）」に戻す)";
    violations.push(
      `- 状態マーク不一致: ${markedId}（${status}）にはテストが存在します。${instruction}(出現: ${formatFilePaths(usedIds.get(markedId))})`
    );
  }

  // テスト側にあるのに定義が無い ID は、書き間違いか廃止済みの参照を表す。
  for (const unknownId of [...usedIds.keys()].filter((id) => !definedIds.has(id)).sort()) {
    violations.push(
      `- 定義なし: ${unknownId} は ${kind.definitionDirectory}/ に定義がありません(出現: ${formatFilePaths(usedIds.get(unknownId))})`
    );
  }

  // 置いてよい種類のテストファイル以外に現れた ID は、トレースの責務の混同を表す。
  for (const misplacedId of [...misplacedIds.keys()].sort()) {
    violations.push(
      `- 配置違反: ${misplacedId} — ${kind.misplacedReason}(出現: ${formatFilePaths(misplacedIds.get(misplacedId))})`
    );
  }

  const statusCounts = ["未実装", "廃止予定", "廃止"]
    .map((status) => [status, [...idStatuses.values()].filter((value) => value === status).length])
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${status} ${String(count)} 件`);
  summaries.push(
    statusCounts.length === 0
      ? `${kind.label} ${String(definedIds.size)} 件`
      : `${kind.label} ${String(definedIds.size)} 件(うち ${statusCounts.join("・")})`
  );
}

// ログ資料（.designs の usecase.md）の要件番号がコードに混ざると、生き資料の ID から辿れない参照になる。
// 太字の定義ではなくコメントの文中に現れるため、定義パターンとは別に実装ファイルまで含めて探す。
const logDocReferences = collectUsedIds(logDocRequirementPattern, allSourceFiles);

for (const [reference, filePaths] of [...logDocReferences.entries()].sort()) {
  violations.push(
    `- ログ資料の要件番号: 「${reference}」はユースケース定義（.designs）の番号です。コード・テストのコメントでは docs/usecases/ の ID（UC-xx 要件 n）で書いてください(出現: ${formatFilePaths(filePaths)})`
  );
}

const scenarioIdReferences = collectUsedIds(scenarioIdPattern, allSourceFiles);

for (const [reference, filePaths] of [...scenarioIdReferences.entries()].sort()) {
  violations.push(
    `- ログ資料のシナリオ ID: 「${reference}」は合格シナリオ集（.designs）の ID です。コード・テストのコメントでは docs/usecases/ の ID（UC-xx 要件 n）かジャーニーのケース ID で書いてください(出現: ${formatFilePaths(filePaths)})`
  );
}

if (violations.length > 0) {
  process.stderr.write("trace violation:\n");
  for (const violation of violations) {
    process.stderr.write(`${violation}\n`);
  }
  process.exit(1);
}

process.stdout.write(
  `check:trace OK — ${summaries.join("・")}。効いている基準のすべてにテストが存在します(テスト側の未定義 ID・配置違反・状態マーク不一致・ログ資料の要件番号とシナリオ ID なし)\n`
);
