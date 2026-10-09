---
name: uld-design
description: Run the ULD design phase for one migration unit (REQ-xxx/UC-yy) whose scenario PR has landed on develop — confirm the business answers on the scenarios, decide architecture and package placement when it is the first slice, design the domain model first in docs/domain, write the final form of the use case descriptions (docs/usecases, new criteria marked unimplemented) and journeys, refine screens, check the scenarios against the model and record any behavior gaps for business confirmation, write the implementation stack index (tasks.md), run uld-design-review in an independent context until no blocking findings remain, then open the design pull request and stop at the approval gate. Produces only documents that keep npm run check green. Use after the scenario PR is merged, e.g. "/uld-design REQ-001/UC-01".
# 日本語訳: シナリオ PR が develop に着地した移行単位（REQ-xxx/UC-yy）1 件の設計フェーズを進めるスキル。シナリオへの業務側の回答を確かめ、最初のスライスならアーキテクチャと package の置き場を決め、ドメインモデルを docs/domain に先に設計し、ユースケース記述（docs/usecases。新しい基準は（未実装））とジャーニーの最終形を書き、画面を詰め、シナリオをモデルと突き合わせて挙動の差分を業務側の確認に回し、実装スタックの索引（tasks.md）を書く。独立した文脈で uld-design-review を通して要修正ゼロにしてから、設計 PR を出して承認ゲートで止まる。npm run check を緑に保つ成果物だけを出す。シナリオ PR のマージ後に使う。
---

# 設計フェーズ

## Overview

移行単位 1 件について、**何をどういう構造で作るかを決め、生き資料に最終形として書く**フェーズです。成果物の大半は生き資料（`docs/`）で、出口は設計 PR の承認（`develop` へのマージ）です。マージした時点で、`develop` 上の生き資料が「合意済みで未実装」の姿を表します。

人が設計 PR で見るのは、決めるべきこと（仕様の最終形・モデルの構造）と、実装スタックの段数と束ね方（`tasks.md`）です。各タスクの実装方針は見せません。それは実装フェーズの設計メモ（`uld-task-design`）が持ちます。

規約は次のトピックにあります。この本文には手順だけを書きます。

| 成果物 | 読むトピック |
| --- | --- |
| 層・package の置き場 | `rules/architecture` |
| ドメインモデルと図 | `rules/model-design`（図の更新手順は `uld-domain-model`） |
| ユースケース記述・ジャーニー記述・用語集 | `rules/documentation`、`rules/naming`、`rules/acceptance-testing`（仕様トレーサビリティ） |
| 実装スタックの索引 | `rules/branch`（子タスクの単位と規模）、`rules/design-records`（`tasks.md` テンプレート） |
| ブランチ・PR | `rules/branch`、`rules/pull-request` |

## 入力

- **移行単位**（`REQ-xxx/UC-yy`）。`.designs/REQ-xxx-<要求名>/` の `request.md` `hearing.md` `plan.md` と、`UC-yy-<移行単位名>/` の `hearing.md`（あれば）`usecase.md` `scenarios.md` `mockups/` を読む

## 手順

### 1. ゲートと回答の確認

1. `develop` から `design/REQ-xxx-UC-yy-<slug>` を切り、`npm run check:branch` を通す。失敗したら（シナリオ PR が未着地）止まる
2. `scenarios.md` の「業務側の確認」と `plan.md` の業務側の確認がすべて埋まっていることを確かめる。空欄が残っていれば回答を求めて止まる
3. **回答を突き合わせる。** 否認されたシナリオ・提案値、条件付きの承認、チャットで先に得た回答との食い違いがあれば、設計を書き始めずに確認し、`UC-yy/hearing.md` に追加ヒアリングとして書き起こす。シナリオの期待結果を変える回答は、ここで決めた最終形を以降の手順の正とする

### 2. アーキテクチャ（最初のスライスだけ）

リポジトリに package・app がまだ無い場合（ウォーキングスケルトン）に行います。

1. 要求の制約（基盤・費用・ローカルでの動作など。`request.md` と `hearing.md`）と `rules/architecture` から、層と package の置き場、使う技術、ローカルと本番の構成の対応を決める
2. 決定と、捨てた選択肢とその理由を、アーキテクチャ文書（`docs/architecture/`）に生き資料として書く
3. `uld.config.json`（`domainSources` などの置き場）と、`CLAUDE.md` / `AGENTS.md` の「構成」を、決めた置き場に合わせる。中身のコードは書かない（実装フェーズの最初の段が作る）
4. 技術の選定は PR の要確認〔設計〕に 1 件ずつ載せる

### 3. ドメインモデル

1. `usecase.md` の受け入れ基準と `scenarios.md` の業務ルールから、Entity・Value Object・Domain Service・Repository port を設計する。状態遷移と業務の判断はモデルに宿らせ、画面や保存の都合を持ち込まない
2. `uld-domain-model` の手順で `docs/domain/` に図を先に書く（設計先行）。新しい語は `docs/domain/ubiquitous-language.md` に足す
3. **シナリオ整合チェック。** 全シナリオについて、前提・操作・期待結果がモデルの状態と操作で説明できるかを確かめる。説明できないシナリオはモデルを直す
4. **差分確認（D2'）。** モデルから展開できる挙動のうち、シナリオ集に無いもの（例: モデル上ありうる状態遷移で、どのシナリオも扱っていないもの）を列挙する。業務側に差分だけを確認し、回答を `scenarios.md` の「差分確認（D2'）の記録」に追記する。依頼者がいなければ、差分を PR の要確認〔仕様〕に載せ、回答を受けるまで該当する受け入れ基準を確定させない

### 4. ユースケース記述とジャーニー

1. `docs/usecases/UC-zz-<日本語のユースケース名>.md` を書く。1 ユースケース = 利用者のゴール 1 つで切り直し、移行単位（`.designs/` の UC-yy）の番号や区切りを引きずらない。`docs/usecases/` の番号は生き資料の通し番号で、`.designs/` の UC 番号とは別に採る
2. フローを背骨にし、各ステップの下に受け入れ基準（`**UC-zz 要件 n**（未実装）`）を置く。`usecase.md` の全受け入れ基準と、差分確認で増えた基準が、どこかの ID に対応していること。既存の基準を置き換える場合は「（廃止予定）」と対で書く
3. `docs/usecases/README.md` の一覧を更新する
4. 複数のユースケースを貫く流れがあれば `docs/journeys/` にジャーニー記述を書く（ケース ID は「（未実装）」）
5. 画面は `mockups/` のラフを設計の粒度まで詰める（状態ごとの表示・権限による出し分け）。置き場は移行単位の `mockups/` のままでよい

### 5. 生成の入力になるファイル

OpenAPI specification や DB スキーマ定義のように、型やクライアントを生成する入力になるファイルは、生成物と利用側の追随を同じ変更に含められる場合だけ書く。含められないなら、設計としての内容は図（ERD・シーケンス図）で表し、ファイルそのものは実装フェーズのタスクにする（`rules/branch` の「マージするものは単体でリポジトリを緑に保つ」）

### 6. 実装スタックの索引

1. `rules/design-records/templates/tasks.md` から `.designs/REQ-xxx-<要求名>/UC-yy-<移行単位名>/tasks.md` を書く
2. 子タスクは 1 観測点で切る。判断の要る層は単独、受け渡しだけの層は観測点まで束ねる、画面は表示と組み込みの 2 段、E2E は別タスク、生き資料の同期だけの段は作らない（`rules/branch` の「子タスクの単位は 1 観測点」）。最初のスライスでは、土台（package の雛形・ローカルの実行環境・検証コマンド）を最初の段に含める
3. テンプレートの「品質チェック」を全項目確かめる。（未実装）の全 ID とすべてのシナリオが、いずれかのタスクに 1 回ずつ現れること

### 7. レビューと PR

1. `npm run check` を通す
2. **`uld-design-review` の手順でレビューする。** 書いた経緯を知らない独立した文脈で行い、渡すのは移行単位のフォルダと設計ブランチの差分だけにする。要修正（critical / major）が残っていれば直して再レビューする。業務側の判断が要る指摘は、直す前に依頼者に確認して追加ヒアリングに書き起こす
3. コミットし、push して `develop` 向けの設計 PR を出す。本文は `.github/PULL_REQUEST_TEMPLATE.md` と `rules/pull-request` に従う。要確認には、ユースケースの切り方〔仕様〕、差分確認の結果〔仕様〕、モデルの構造と技術選定〔設計〕、`tasks.md` の段数と束ね方〔設計〕1 件、新しく付けた名前〔名前〕を載せる
4. **止まる。** PR がマージされるまで実装フェーズのブランチを切らない

## 完了条件

ドメインモデル図・ユースケース記述（全基準が（未実装）か（廃止予定）つき）・必要ならジャーニー記述とアーキテクチャ文書・`tasks.md` が揃い、`npm run check` が通り、`uld-design-review` の要修正がゼロで、設計 PR が出ていること。

## 制約

- 実装コード・テストは書かない。例外は、生成の入力になるファイルとその追随を同じ変更に含める場合だけ
- `.designs/` のシナリオ成果物は書き換えない。追記してよいのは移行単位の `hearing.md`（追加ヒアリング）と `scenarios.md` の差分確認の記録だけ
- 過去の REQ を仕様の根拠にしない。既存の仕様は `docs/` とコードで確認する
- 規約をプロンプトや記憶から推測せず、`rules/` を読んで確認する
