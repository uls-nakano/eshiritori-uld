import { existsSync, readFileSync } from "node:fs";
import process from "node:process";
import { loadConfig } from "../lib/config.mjs";

/**
 * indexFiles は同一内容に保つ索引ファイルの一覧です。
 * AI ツールごとに読むファイル名が違う（Claude Code は CLAUDE.md、Devin/Codex は AGENTS.md）ため、
 * 同じ内容を複数ファイルで持たざるを得ません。片方だけが更新される事故を機械で検出します。
 * 一覧は uld.config.json の indexFiles で変えられます。
 */
const indexFiles = loadConfig().indexFiles;

/** normalize は改行コードの差異と末尾の空白を無視するための正規化です。 */
function normalize(text) {
  return text.replace(/\r\n/gu, "\n").replace(/\s+$/u, "");
}

const missingFiles = indexFiles.filter((fileName) => !existsSync(fileName));

if (missingFiles.length > 0) {
  process.stderr.write("agent index violation:\n");
  for (const fileName of missingFiles) {
    process.stderr.write(`- ${fileName}: 索引ファイルが見つかりません。\n`);
  }
  process.exitCode = 1;
} else {
  const [baseFileName, ...otherFileNames] = indexFiles;
  const baseContent = normalize(readFileSync(baseFileName, "utf8"));

  /** mismatchedFiles は基準ファイルと内容が一致しない索引ファイルです。 */
  const mismatchedFiles = otherFileNames.filter(
    (fileName) => normalize(readFileSync(fileName, "utf8")) !== baseContent
  );

  if (mismatchedFiles.length > 0) {
    process.stderr.write("agent index violation:\n");
    for (const fileName of mismatchedFiles) {
      process.stderr.write(`- ${fileName}: ${baseFileName} と内容が一致しません。\n`);
    }
    process.stderr.write(
      `規約の本文は rules/ にのみ置き、索引ファイルは同一内容に保ってください。\n` +
        `正となるファイルを他方へコピーして修正します: cp ${baseFileName} ${mismatchedFiles.join(" ")}\n`
    );
    process.exitCode = 1;
  }
}
