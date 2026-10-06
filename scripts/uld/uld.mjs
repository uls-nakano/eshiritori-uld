#!/usr/bin/env node
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import process from "node:process";

/**
 * uld.mjs は ULD の機械チェックとループ用 script の入口です。uld-kit の `init` が対象リポジトリの
 * `scripts/uld/` にこのフォルダ（runtime/）ごとコピーし、package.json の npm script から呼びます。
 *
 *   node scripts/uld/uld.mjs <command> [args...]
 *
 * 各 command は commands/<command>.mjs で、リポジトリルート（cwd）の uld.config.json を読んで動きます。
 * 依存パッケージを持たないのは、CI の npm ci がネットワーク越しに kit を取りに行かずに済むようにするためです。
 */

export const commands = {
  "check-kit": "uld-kit が配ったファイルが uld-kit.lock.json のハッシュと一致するか（直接編集・流し忘れ）を検証する",
  "check-rules": "規約フォルダの構成と standard.md / project.md の対を検証する",
  "check-index": "AI 向け索引ファイル（CLAUDE.md / AGENTS.md）が同一内容かを検証する",
  "check-branch": "保護ブランチへの直接変更と、フェーズの承認ゲート（前フェーズの成果物の着地）を検証する",
  "check-trace": "受け入れ基準 ID・ジャーニーのケース ID とテストの対応、ログ資料の番号の混入を検証する",
  "check-model-trace": "ドメインモデル図と domain 層のクラス・colocate テストの describe の対応を検証する",
  "record-loop-event": "実装ループのイベントを loop-events.jsonl へ追記する",
  "loop-stats": "イベントログから工程ごとの所要時間を表にする",
  "finish-task": "収束した子タスクをコミット・push し、子タスク PR をスタックに積む"
};

/** run は command を解決して実行します。bin/uld.mjs（npx 経由）からも使います。 */
export async function run(argv) {
  const [command, ...rest] = argv;

  if (command === undefined || command === "--help" || command === "-h") {
    process.stdout.write("使い方: node scripts/uld/uld.mjs <command> [args...]\n\n");
    for (const [name, description] of Object.entries(commands)) {
      process.stdout.write(`  ${name.padEnd(20)} ${description}\n`);
    }
    process.stdout.write(
      "\n導入と版上げ: npx --yes github:uls-nakano/uld-kit#<tag> init\n"
    );
    process.exitCode = command === undefined ? 1 : 0;
    return;
  }

  if (!(command in commands)) {
    process.stderr.write(`不明な command です: ${command}（--help で一覧を表示）\n`);
    process.exitCode = 1;
    return;
  }

  const scriptPath = join(dirname(fileURLToPath(import.meta.url)), "commands", `${command}.mjs`);

  if (!existsSync(scriptPath)) {
    process.stderr.write(`script が見つかりません: ${scriptPath}\n`);
    process.exitCode = 1;
    return;
  }

  // 各 script は process.argv.slice(2) を自分の引数として読むので、command 名を取り除いて渡す。
  process.argv = [process.argv[0], scriptPath, ...rest];
  await import(scriptPath);
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  await run(process.argv.slice(2));
}
