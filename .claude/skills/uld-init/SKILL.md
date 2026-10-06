---
name: uld-init
description: Set up ULD (ULS Loop Development) in a repository or upgrade it — run `npx --yes github:uls-nakano/uld-kit#<tag> init`, which places the uld CLI (scripts/uld/), the standard skills (.claude/skills/uld-*), the workflow script, standard rules, templates and the Stop hook, records their hashes in uld-kit.lock.json, and creates skeleton files only where missing; then guide the project-specific parts (uld.config.json, rules/<topic>/project.md, CLAUDE.md/AGENTS.md, check scripts). Use when the user wants to adopt ULD in a repo (empty or existing) or move it to a newer kit version, e.g. "/uld-init" or "/uld-init v0.4.0".
# 日本語訳: リポジトリに ULD を導入・版上げするスキル。`npx --yes github:uls-nakano/uld-kit#<tag> init` で uld CLI（scripts/uld/）・標準スキル（.claude/skills/uld-*）・ワークフロー script・標準ルール・テンプレート・Stop フックを配り、そのハッシュを uld-kit.lock.json に記録し、骨組みは無いときだけ作る。その後、プロジェクト固有の部分（uld.config.json・rules/<topic>/project.md・CLAUDE.md/AGENTS.md・check の組み込み）を案内する。空のリポジトリでも既存のリポジトリでも、版上げでも同じ手順。
---

# ULD の導入と版上げ

> **このスキルはツール固有（実行系）です。** npm（`npx`）と GitHub への読み取り権限を前提にしています。
> 配置の手順そのものは決定的なので uld-kit の `init` が持ち、このスキルは起動と、その後に人の判断が要る部分の案内だけを担当します。

## Overview

ULD の配布物はすべて対象リポジトリの中のファイルとして届き、どのファイルもリポジトリに 1 部だけ置かれます。kit の原本は `init` を実行するときだけ GitHub から取り、リポジトリには残しません。

| 種類 | 置き場 | 扱い |
| --- | --- | --- |
| uld CLI（機械チェック・ループの記録・finish-task） | `scripts/uld/`（`node scripts/uld/uld.mjs <command>`） | kit 所有。上書き |
| 標準スキル・ワークフロー script | `.claude/skills/uld-*`・`.claude/workflows/uld-impl.js` | kit 所有。上書き |
| 標準ルール・記録テンプレート・イベントログのスキーマ | `rules/<topic>/standard.md`・`rules/design-records/templates/`・`.designs/events/README.md` | kit 所有。上書き |
| Stop フック | `.claude/settings.json` の `[uld]` 印の項目 | kit 所有。差し替え |
| 版とハッシュ | `uld-kit.lock.json` | init が書く |
| 骨組み（設定・索引・`project.md`・PR テンプレート・docs の README・`package.json`・`.gitignore`） | それぞれの場所 | 無いときだけ作る |

kit 所有のファイルはリポジトリ側で直接編集しません。`npm run check:kit` が `uld-kit.lock.json` のハッシュとの食い違いで止まります。変更は uld-kit 側で行い、版上げで配り直します。

## 手順

### 1. 導入・版上げ（同じ 1 コマンド）

引数に版（タグ）があればそれを、無ければ uld-kit の最新タグを使います。空のリポジトリでも既存のリポジトリでも同じです。

```bash
npx --yes github:uls-nakano/uld-kit#<tag> init   # 例: #v0.3.2。省くと最新タグ
```

- 実行前に作業ツリーがクリーンであることを確かめる（配置の差分を 1 つのコミットにするため）
- 出力の「作成」「更新」「削除」「既存のため見送り」を読み、見送られたファイルに人の判断が要るものがないかを確かめる。骨組みは `--force` で上書きしないで、差分を示して人に確認する
- 前の版が配って今回の版に無いファイルは消える（lock に記録されたものだけ）。既存の `.claude/skills/uld-*` に kit に無いスキルがあると警告が出る。標準の部品なら uld-kit へ移し、プロジェクト固有なら `uld-` 接頭辞を外す（`rules/skills`）

### 2. 人が埋める部分（初回）

出力の「次にすること」に従います。

- `uld.config.json`: 統合ブランチ名・規約と記録の置き場・domain 層の場所・影響ファイル数の上限
- `rules/<topic>/project.md`: プロジェクト固有の追記（標準と矛盾する場合は「理由つき上書き」として宣言する。`rules/README.md` の読み込み規約）
- `CLAUDE.md` の `{…}` を埋め、同じ内容を `AGENTS.md` にも置く
- `package.json` の `check` に `check:kit` `check:rules` `check:index` `check:branch` `check:trace` `check:model-trace` を組み込む（並べ方は `rules/testing`）。`check:fast` / `check` / `test:e2e` はプロジェクトが定義する（ワークフローがこの名前で呼ぶ）
- `scripts/uld/` を lint と整形の対象から外す（`.prettierignore`、ESLint の ignores）

### 3. 確認

- `npm run check:kit` と `npm run check:rules` と `npm run check:index` を通す
- スキル一覧に `/uld-impl` などが出ることを確かめる
- 配置の差分を 1 つのコミットにし、PR にする（`chore/` ブランチ。`rules/branch`）

### 4. 報告

- 配置した uld-kit の版（`uld-kit.lock.json` の `version`）と、前の版からの差分の要点
- 作成・更新・削除・見送りになったファイル
- 人が埋める必要がある項目と、その場所
- 機械チェックの結果

## 制約

- kit が所有するファイル（`uld-kit.lock.json` に載っているもの）をリポジトリ側で編集しない。変更したい場合は uld-kit 側の変更として扱い、その旨を報告する
- 既存の `project.md`・`CLAUDE.md`・設定を `--force` で上書きしない
