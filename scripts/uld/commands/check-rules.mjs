import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { loadConfig } from "../lib/config.mjs";

/** rulesDirectory は規約の single source of truth です（uld.config.json の directories.rules）。 */
const rulesDirectory = loadConfig().directories.rules;


/** indexFileName はトピック一覧と読み込み規約を持つ索引です。 */
const indexFileName = "README.md";

/** projectFileName は各トピックのプロジェクトルールです。 */
const projectFileName = "project.md";

/** standardFileName は配布される標準ルールです。uld-kit が配り、内容の食い違いは check-kit が検出します。 */
const standardFileName = "standard.md";

/**
 * inheritanceDeclarationPattern は project.md が継承する標準の版を宣言しているかを判定します。
 * standard.md が置かれたトピックでは、どの版を継承しているかの宣言が必須です。
 */
const inheritanceDeclarationPattern = /standard\.md`?\s*(の)?\s*v?\d+\.\d+/u;

/** readingConventionPattern は project.md 冒頭の読み込み規約ヘッダを判定します。 */
const readingConventionPattern = /standard\.md/u;

/** listTopicDirectories は rules/ 直下のトピックフォルダ名を返します。 */
function listTopicDirectories() {
  return readdirSync(rulesDirectory)
    .filter((entryName) => statSync(join(rulesDirectory, entryName)).isDirectory())
    .sort();
}

/** listStrayFiles は rules/ 直下に置かれた索引以外の file を返します。規約本文はトピックフォルダの中だけに置きます。 */
function listStrayFiles() {
  return readdirSync(rulesDirectory).filter(
    (entryName) => entryName !== indexFileName && statSync(join(rulesDirectory, entryName)).isFile()
  );
}

/** listIndexedTopics は README のトピック表に載っているトピック名を返します。 */
function listIndexedTopics(indexContent) {
  const linkPattern = /\[([a-z-]+)\]\(([a-z-]+)\/project\.md\)/gu;
  const topics = new Set();

  for (const match of indexContent.matchAll(linkPattern)) {
    topics.add(match[2]);
  }

  return [...topics].sort();
}

const violations = [];

if (!existsSync(join(rulesDirectory, indexFileName))) {
  violations.push(`${rulesDirectory}/${indexFileName}: トピック一覧の索引がありません。`);
}

for (const strayFileName of listStrayFiles()) {
  violations.push(
    `${rulesDirectory}/${strayFileName}: 規約本文はトピックフォルダの中に置いてください。rules/ 直下に置けるのは ${indexFileName} だけです。`
  );
}

const topicDirectories = listTopicDirectories();

for (const topicName of topicDirectories) {
  const projectPath = join(rulesDirectory, topicName, projectFileName);

  if (!existsSync(projectPath)) {
    violations.push(`${projectPath}: トピックフォルダに ${projectFileName} がありません。`);
    continue;
  }

  const projectContent = readFileSync(projectPath, "utf8");

  if (!readingConventionPattern.test(projectContent)) {
    violations.push(
      `${projectPath}: 読み込み規約のヘッダがありません。「standard.md があれば先に読む」旨を冒頭に書いてください。`
    );
  }

  const standardPath = join(rulesDirectory, topicName, standardFileName);

  if (existsSync(standardPath) && !inheritanceDeclarationPattern.test(projectContent)) {
    violations.push(
      `${projectPath}: 継承している ${standardFileName} の版が宣言されていません。「standard.md v0.1 を継承する」のように冒頭で宣言してください。`
    );
  }

}

if (existsSync(join(rulesDirectory, indexFileName))) {
  const indexedTopics = listIndexedTopics(
    readFileSync(join(rulesDirectory, indexFileName), "utf8")
  );

  for (const topicName of topicDirectories.filter((name) => !indexedTopics.includes(name))) {
    violations.push(
      `${rulesDirectory}/${topicName}: ${indexFileName} のトピック一覧に載っていません。読むタイミングを添えて追加してください。`
    );
  }

  for (const topicName of indexedTopics.filter((name) => !topicDirectories.includes(name))) {
    violations.push(
      `${rulesDirectory}/${indexFileName}: 存在しないトピック ${topicName} を参照しています。`
    );
  }
}

if (violations.length > 0) {
  process.stderr.write("rules structure violation:\n");
  for (const violation of violations) {
    process.stderr.write(`- ${violation}\n`);
  }
  process.exitCode = 1;
}
