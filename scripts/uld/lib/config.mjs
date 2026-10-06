import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

/**
 * config.mjs は対象リポジトリの `uld.config.json` を読み、既定値と合成して返します。
 *
 * 機械チェックとループの script はリポジトリの構成（統合ブランチ名・規約や記録の置き場・
 * ドメイン層の場所）に依存します。配布物の中に直書きすると利用側で書き換えざるを得ず、
 * 版を上げるたびに衝突するため、構成はリポジトリ直下の 1 ファイルに寄せ、script は
 * ここを通してだけ読みます。既定値は最初の適用案件（dev-metrics）の構成です。
 */

/** configFileName はリポジトリ直下に置く設定ファイルの名前です。 */
export const configFileName = "uld.config.json";

/** defaultConfig は設定ファイルが無い、または項目が省かれたときに使う既定値です。 */
export const defaultConfig = Object.freeze({
  branches: {
    /** integration はスタックの底が向く統合ブランチです（rules/branch のブランチ構成）。 */
    integration: "develop",
    /** protected は直接コミットを禁止するブランチです。 */
    protected: ["main", "develop"]
  },
  directories: {
    /** rules は規約の single source of truth の置き場です。 */
    rules: "rules",
    /** designs は開発フローの記録（ログ資料）の置き場です。 */
    designs: ".designs",
    /** usecases は受け入れ基準 ID を定義するユースケース記述の置き場です。 */
    usecases: "docs/usecases",
    /** journeys はジャーニーのケース ID を定義するジャーニー記述の置き場です。 */
    journeys: "docs/journeys",
    /** domainDocs はドメインモデル図の置き場です。直下のフォルダ名が package 名に対応します。 */
    domainDocs: "docs/domain",
    /** testRoots はテスト・story・実装ファイルを探索する起点です。 */
    testRoots: ["packages", "apps", "tests"]
  },
  /**
   * indexFiles は同一内容に保つ AI 向け索引ファイルです。ツールごとに読むファイル名が違う
   * （Claude Code は CLAUDE.md、Devin / Codex は AGENTS.md）ため複数持たざるを得ません。
   */
  indexFiles: ["CLAUDE.md", "AGENTS.md"],
  domainSources: {
    /** packagesDirectory は domainDocs のフォルダ名と対応する package の親フォルダです。 */
    packagesDirectory: "packages",
    /** domainSubdirectory は package 内の domain 層のフォルダです。 */
    domainSubdirectory: "src/domain"
  },
  limits: {
    /**
     * maxAffectedFiles は人の承認なしに 1 子タスクとして実装へ進める影響ファイル数の上限です
     * （rules/branch の「子タスクの規模」）。ワークフロー script 側の MAX_AFFECTED_FILES と同じ値にします。
     */
    maxAffectedFiles: 15
  }
});

/** isPlainObject は再帰的に合成してよい値（配列でないオブジェクト）かを返します。 */
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** merge は既定値の上に設定ファイルの値を重ねます。配列は置き換え、オブジェクトは再帰的に合成します。 */
function merge(base, override) {
  const merged = { ...base };

  for (const [key, value] of Object.entries(override)) {
    merged[key] = isPlainObject(value) && isPlainObject(base[key]) ? merge(base[key], value) : value;
  }

  return merged;
}

/**
 * loadConfig は cwd（リポジトリルート）の設定ファイルを読み、既定値と合成して返します。
 * 設定ファイルが無ければ既定値をそのまま返します。壊れた JSON は例外にします。
 * 黙って既定値に倒すと、設定を書いたつもりの利用者が既定値で検証されたことに気づけないためです。
 */
export function loadConfig(rootDirectory = process.cwd()) {
  const configPath = resolve(rootDirectory, configFileName);

  if (!existsSync(configPath)) {
    return structuredClone(defaultConfig);
  }

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (error) {
    throw new Error(
      `${configFileName} を解釈できません: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!isPlainObject(parsed)) {
    throw new Error(`${configFileName} は JSON オブジェクトにしてください`);
  }

  return merge(structuredClone(defaultConfig), parsed);
}
