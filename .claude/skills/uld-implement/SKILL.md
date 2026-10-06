---
name: uld-implement
description: Implement one child task with TDD following a design memo — fixture, failing test, minimal implementation, refactoring — run the unit tests for the changed modules, and sync every living document the change makes stale (domain model, use cases, architecture, glossary) within the same task. Records deviations from the design with reasons. Does not commit or push. Usable standalone or as the implementation step of the implementation loop. Use when the user wants a task implemented, e.g. "/uld-implement 1.2.1" or "/uld-implement <task description>".
# 日本語訳: 設計メモに従って子タスク 1 件を TDD で実装するスキル。fixture → 失敗するテスト → 最小実装 → リファクタリングの順で進め、変更したモジュールの単体テストを通し、この変更で古くなる生き資料（ドメインモデル図・ユースケース記述・アーキテクチャ文書・用語集）は同じタスクの中ですべて同期する。設計からの逸脱は理由付きで記録する。コミット・プッシュは行わない。単体でも、実装ループの実装工程としても使える。タスクを実装したいときに使う。
---

# 子タスクの実装

## Overview

設計メモに従って**子タスク 1 件**を TDD で実装します。実装ループ（`uld-impl` / `uld-impl-fast`）の実装工程として呼ばれるほか、単体でも使えます。

## 入力

- **タスク**: タスク説明の文字列、またはタスク ID(例: `1.2.1`)。ID の場合は対応する `.designs/REQ-xxx/UC-yy/tasks.md`(索引)のタスク行から説明を組み立てる
- **設計メモ**: `uld-task-design` の成果物のパス。**無い場合は先に `uld-task-design` の手順で設計を作ってから始める**(設計なしで書き始めると、影響範囲とテスト計画の見落としがレビューで手戻りになる)

## 手順

1. 変更対象に対応する `rules/` のトピックを読み、設計メモで挙げられた関連ファイルを確認する
2. 利用者から見える振る舞いを追加・変更する場合、`docs/usecases/` のユースケース記述を**実装より先に**更新する(書き方は `rules/documentation` の「ユースケース記述の書き方」、受け入れ基準 ID は `rules/acceptance-testing` の「仕様トレーサビリティ」)
3. TDD で進める: fixture → 失敗するテスト → 最小実装 → リファクタリング。受け入れ基準を検証する結合テスト・story には基準の ID を記す（付け方と置き場は `rules/acceptance-testing` の「仕様トレーサビリティ」）
4. 変更したモジュールの単体テストを `npx vitest run <path>` で実行し、通ることを確認する
5. **この変更で古くなる生き資料を、同じ変更ですべて直す。** 後続のタスクや最後の「ドキュメント同期」へ送らない（`rules/branch` の「子タスクの単位は 1 観測点」）。設計メモの「同期する生き資料」に挙がっているものに加えて、次を自分で確かめる
   - `docs/domain/` — domain 層を変更した場合。図・属性名・本文の設計判断との整合（表記は `rules/model-design`）
   - `docs/usecases/` `docs/journeys/` — 手順 2 で先に直した記述が、実装した振る舞いとまだ一致しているか（実装中に決めた表示や文面が要件の文面とずれていないか）
   - `docs/architecture/` — 層・package・route・adapter の構成を変えた場合。列挙されているものが増減したか
   - `docs/product/` `docs/domain/ubiquitous-language.md` — 新しい語を導入した、または既存の語の意味を変えた場合
6. レビューに渡す前にセルフチェックする。レビュー側と同じ基準（`rules/review`）で、機械が拾えず AI レビューの 2 周目になりやすい次の 3 点を自分で照合する
   - **設計メモとの差分**: `git diff --stat` の変更ファイルを設計メモの「影響ファイル」「テスト計画」と突き合わせ、増減した箇所がすべて逸脱として理由付きで設計メモに追記されていること
   - **ID と状態マークの整合**: `npm run check:trace` を実行し、テスト・story に書いた受け入れ基準 ID と `docs/usecases/` `docs/journeys/` の状態マークが一致すること（数秒で終わる。フルの検証ではない）
   - **ストーリーと手順名の往復**: ユースケース記述の手順・受け入れ基準の言い回しと、テスト名・story 名・画面の文言を双方向に読み、片方にしか無い語や別の言い換えを揃えること（語の統一は `rules/naming`）

## 完了条件

- 設計メモのテスト計画にある単体テストが存在し、自分が触った範囲の単体テストがすべて通ること
- **`npm run check:fast` が全通過していること**（変更した workspace と下流の型検査・lint・単体テスト・結合テスト・Storybook。`rules/testing` の「検証コマンド」）。レビューに渡る差分を常に緑にし、機械が拾う失敗で修正ループが 1 周増えるのを手前で潰すため。通せない失敗が残るなら、その内容を理由付きで呼び出し元に返す（テストを消す・skip する・閾値を下げるのは禁止）
- 設計から逸脱した場合、逸脱内容と理由が設計メモに追記されていること。**記録にはテスト件数・story の本数・変更ファイル数・検証結果の数字を書かない。** 数字はその後の修正で必ず動き、書いた時点の値のまま古くなる（検証の結果はループのイベントログと PR のエビデンス欄が持つ）
- 利用者から見える振る舞いを変えた場合、`docs/usecases/` のユースケース記述が同期され、対応する結合テスト・story に受け入れ基準 ID が記されていること
- この変更で古くなる生き資料が同じ変更で直っていること（手順 5 の 4 か所。直す必要が無いものは設計メモに「不要」と理由付きで残す）
- 手順 6 のセルフチェック 3 点を通過していること（設計メモとの差分が記録済み、`npm run check:trace` が通る、ストーリーとテスト名・story 名の言い回しが揃っている）

## 制約

- フルの検証(`npm run check`。build と全 workspace)まで通す義務はない。それは収束後の検証工程の仕事であり、二重に走らせると時間を失う。周回中の `npm run check:fast` は自分で通す（完了条件）
- タスクの目的から外れた大規模なリファクタリングはしない
- **コミット・プッシュは行わない**(タイミングは呼び出し元が決める)
- テストを消したり skip したりして通すことは禁止
