import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

/**
 * kit-lock.mjs は `uld-kit.lock.json`（配った kit の版と、kit 所有ファイルごとのハッシュ）を読み書きします。
 *
 * 利用側のリポジトリに kit の原本を置かずに「配ったファイルが直接編集されていないか」「版上げで
 * 配り直しを忘れていないか」を検出するため、比較の相手を原本のコピーではなくハッシュで持ちます。
 */

/** lockFileName はリポジトリ直下に置く lock ファイルの名前です。 */
export const lockFileName = "uld-kit.lock.json";

/** normalize は改行コードの差異と末尾の空白を無視するための正規化です（Windows の checkout で偽陽性にしない）。 */
export function normalize(text) {
  return text.replace(/\r\n/gu, "\n").replace(/\s+$/u, "");
}

/** hashOf はファイル内容の正規化後の sha256 を返します。 */
export function hashOf(content) {
  return createHash("sha256").update(normalize(content.toString("utf8"))).digest("hex");
}

/** readLock は lock を読みます。無ければ null です。 */
export function readLock(path = lockFileName) {
  if (!existsSync(path)) {
    return null;
  }

  return JSON.parse(readFileSync(path, "utf8"));
}
