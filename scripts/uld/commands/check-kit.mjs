import { existsSync, readFileSync } from "node:fs";
import process from "node:process";
import { hashOf, lockFileName, readLock } from "../lib/kit-lock.mjs";

/**
 * check-kit.mjs は、uld-kit が配ったファイル（uld CLI・標準スキル・ワークフロー script・標準ルール・
 * 記録テンプレート・イベントログのスキーマ）が、uld-kit.lock.json に記録したハッシュと一致するかを検証します。
 *
 * これらはリポジトリ側で直接編集しない kit 所有のファイルです。直接編集を許すと、標準の変更が
 * プロジェクトごとに分岐して版上げのたびに衝突します。食い違いを機械で止め、変更を uld-kit 側に集めます。
 */

const lock = readLock();
const violations = [];

if (lock === null) {
  violations.push(`${lockFileName} がありません。npx --yes github:uls-nakano/uld-kit#<tag> init で配置してください`);
} else {
  for (const [path, expectedHash] of Object.entries(lock.files ?? {})) {
    if (!existsSync(path)) {
      violations.push(`${path}: uld-kit が配ったファイルがありません`);
    } else if (hashOf(readFileSync(path)) !== expectedHash) {
      violations.push(`${path}: uld-kit v${lock.version} が配った内容と違います`);
    }
  }
}

if (violations.length > 0) {
  process.stderr.write("kit violation:\n");
  for (const violation of violations) {
    process.stderr.write(`- ${violation}\n`);
  }
  process.stderr.write(
    "kit 所有のファイルはリポジトリ側で直接編集しません。変更は uld-kit 側で行い、" +
      "npx --yes github:uls-nakano/uld-kit#<tag> init で配り直してください。\n"
  );
  process.exitCode = 1;
} else {
  process.stdout.write(
    `check:kit OK — uld-kit v${lock.version} が配った ${Object.keys(lock.files).length} ファイルは配布時の内容のままです\n`
  );
}
