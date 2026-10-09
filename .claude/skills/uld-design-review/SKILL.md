---
name: uld-design-review
description: Review the design-phase changes for one migration unit (design/REQ-xxx-UC-yy branch) — consistency of the domain model with every pass/fail scenario, model-design rules (no CRUD containers, state transitions in the model), mapping from the unit's acceptance criteria to unimplemented IDs in docs/usecases, use case and journey description rules, generated-input files that would turn the repository red, architecture decisions, and the tasks.md quality checklist (one observation point per task, size limit, coverage of IDs and scenarios) — and return findings with severity, file, line, description and fix suggestion. Read-only. Must run in a context isolated from the author's. Use as the review step of uld-design, or standalone, e.g. "/uld-design-review REQ-001/UC-01".
# 日本語訳: 移行単位 1 件の設計フェーズの変更（design/REQ-xxx-UC-yy ブランチ）をレビューするスキル。ドメインモデルと全シナリオの整合、モデル設計ルール（CRUD の入れ物にしない・状態遷移をモデルに宿らせる）、移行単位の受け入れ基準と docs/usecases の（未実装）ID の対応、ユースケース記述・ジャーニー記述の書き方、リポジトリを赤くする生成の入力ファイル、アーキテクチャの決定、tasks.md の品質チェック（1 観測点 1 タスク・規模の上限・ID とシナリオの網羅）を検査し、severity つきの指摘を返す。読み取り専用。書き手と隔離した文脈で実行する。uld-design のレビュー工程として、または単体で使う。
---

# 設計成果物のレビュー

## Overview

設計フェーズの成果物を、設計 PR に出す前に検査します。設計 PR がマージされると、その生き資料と `tasks.md` が実装フェーズの全段の前提になります。**ここで見逃したモデルの穴や索引の甘さは、実装ループが収束しない形で返ってきます。**

**書き手の経緯を知らない状態で行うことが品質の生命線です。** 受け取ってよい文脈は、移行単位のフォルダの場所と設計ブランチの差分、（再レビュー時の）前回の指摘一覧だけです。

## 入力

- **移行単位のフォルダ**（`.designs/REQ-xxx-<要求名>/UC-yy-<移行単位名>/`）
- **設計ブランチ**（`develop` からの差分を `git diff develop...HEAD` で読む）
- **前回の指摘一覧**（再レビューの場合）

## 手順

1. `rules/review` を読む。続けて、差分に含まれる成果物に応じて `rules/model-design`、`rules/documentation`、`rules/acceptance-testing`、`rules/branch`、`rules/architecture`（アーキテクチャ文書を含む場合）を読む
2. 移行単位の `usecase.md` `scenarios.md` `hearing.md` と REQ の `hearing.md` を読み、合意済みの振る舞いを把握する
3. 次の観点で差分を検査する

| 観点 | 見ること |
| --- | --- |
| シナリオ整合 | 全シナリオの前提・操作・期待結果が、モデルの状態と操作で説明できるか。説明できないシナリオ、モデルにあってシナリオにも差分確認の記録にも無い挙動が無いか |
| モデル設計 | 状態遷移と業務の判断がモデルにあるか。属性の入れ物になっていないか。画面・保存・通信の都合が入っていないか。図の記法（`rules/model-design`）と用語集の更新 |
| 基準の対応 | `usecase.md` の全受け入れ基準と差分確認で増えた基準が、`docs/usecases/` のいずれかの ID に対応しているか。新しい ID に「（未実装）」が付いているか。置き換える基準が「（廃止予定）」と対になっているか。`docs/usecases/README.md` の一覧 |
| 記述の書き方 | 1 ユースケース = ゴール 1 つで切れているか。フローが背骨か。実装の語彙が無いか。異常系に理由があるか。ジャーニーは複数ユースケースを貫くものだけか |
| 合意との一致 | 生き資料の振る舞いが、シナリオと回答（追加ヒアリング・差分確認を含む）と食い違っていないか。合意に無い振る舞いを足していないか |
| 緑を保つ | 生成の入力になるファイル（OpenAPI・DB スキーマ定義など）が、生成物と利用側の追随なしに入っていないか。`npm run check` が通るか |
| アーキテクチャ | （最初のスライスのとき）要求の制約を満たす構成か。捨てた選択肢と理由があるか。`uld.config.json` と索引の「構成」が決めた置き場と一致しているか |
| 索引 | `tasks.md` の品質チェックの全項目。特に、観測点の無いタスク、受け渡しだけの層の単独タスク、表示と組み込みを束ねた画面タスク、生き資料の同期だけのタスク、変更ファイルが上限に近い・超えるタスク、同一フェーズ内の依存、（未実装）ID とシナリオの抜けと重複 |

4. 指摘を列挙して返す

## 成果物

指摘 1 件につき次を含めます。問題がなければ「指摘なし」と明言します。

- **ファイル**と**行番号**（特定できる場合）
- **severity**: critical / major / minor（定義は `rules/review`）。シナリオと説明できないモデル・合意との食い違い・対応の無い受け入れ基準・リポジトリを赤くする変更・品質チェックに落ちる索引は major 以上にする
- **内容**と**修正方法の提案**。業務側の判断が要る指摘は、その旨と、依頼者に示す選択肢を添える

最後に全体の所感を 1 段落添えます。

## 制約

- **ファイルの変更は一切行わない**
- 観点や severity の基準を記憶や依頼文から推測せず、`rules/` を読んで確認する
