---
name: uld-scenario
description: Run the ULD scenario phase for one requirement (REQ) — record the original request verbatim, write the hearing sheet with questions, options and recommendations, and stop for the requester's answers; once answered, cross-check the answers, split the requirement into migration units, write each unit's use case definition (EARS acceptance criteria) and pass/fail scenarios with rough mockups, run uld-scenario-review in an independent context until no blocking findings remain, then open the scenario pull request and stop at the approval gate. Never fills answer fields on the requester's behalf. Use when a new requirement or a change to user-visible behavior arrives, e.g. "/uld-scenario <request text>" or "/uld-scenario REQ-001" to resume after the hearing is answered.
# 日本語訳: 要求（REQ）1 件のシナリオフェーズを進めるスキル。元の要望をそのまま記録し、質問・選択肢・推奨を書いたヒアリングシートを出して依頼者の回答を待つ。回答が揃ったら回答どうしを突き合わせ、要求を移行単位に分け、移行単位ごとのユースケース定義（EARS の受け入れ基準）と合格シナリオ集・画面ラフを書き、独立した文脈で uld-scenario-review を通して要修正ゼロにしてから、シナリオ PR を出して承認ゲートで止まる。回答欄を依頼者の代わりに埋めない。新しい要求や、利用者から見える振る舞いの変更が届いたときに使う。
---

# シナリオフェーズ

## Overview

要求（REQ）1 件について、**何をどこまで作るかを業務側と閉じる**フェーズです。成果物はすべてログ資料（`.designs/REQ-xxx-<要求名>/`）で、出口はシナリオ PR の承認（`develop` へのマージ）です。

フェーズは回答待ちを挟んで 2 段に分かれます。

| 段 | 成果物 | 止まる場所 |
| --- | --- | --- |
| A. ヒアリング | `request.md` `hearing.md` | 回答を待つ |
| B. シナリオ | 移行単位の追加ヒアリング、`plan.md`、各 `UC-yy/` の `usecase.md` `scenarios.md` `mockups/` | シナリオ PR を出して承認を待つ |

成果物の書式・置き場・採番は `rules/design-records`、フェーズのゲートとブランチは `rules/branch`、受け入れ基準と画面ラフの書き方は `rules/documentation` と `rules/design-records/templates/` が持ちます。この本文には手順だけを書きます。

## 入力

- **要望の文面**（新しい要求のとき）、または **REQ 番号**（段 A の回答が揃い、段 B を始めるとき）
- 差分ルート（既存の振る舞いの変更）の場合は、対象の受け入れ基準 ID（`docs/usecases/`）

引数から何を作るか判断できないほど曖昧な場合は、書き始める前に確認します。

## 手順

### 段 A: ヒアリング

1. `rules/design-records` と `rules/branch` を読む
2. 採番を決める。`.designs/` の既存 REQ の最大番号 + 1 を使う。`<要求名>` は英小文字のケバブケースの短い slug にする
3. `develop` から `scenario/REQ-xxx-<slug>` を切る
4. `request.md` をテンプレートから書く。**元の要望は要約せず、受け取った文面をそのまま残す。** ルート（フル / 差分 / 修正）を選び、差分ルートなら拡張する受け入れ基準を `docs/usecases/` から特定して書く
5. `hearing.md` をテンプレートから書く
   - 冒頭に要望の理解の要約を置く
   - 質問は、要件を確定するのに本当に必要なものだけにする。既に明確なことは聞かない
   - 各質問に選択肢・選択の観点・推奨（理由つき）を付ける。**回答欄は空のまま残す**
   - 1 つの論点は 1 か所でだけ聞く（Q と確認事項で言い換えて聞き直さない）
   - 画面の構成を選ばせる質問には、選択肢ごとの HTML ラフを `mockups/` に置いて添える
   - 技術的な制約（使う基盤・費用の上限など）が要望にあれば、確認事項として理解を確かめ、具体的な構成の決定は設計フェーズに委ねる
6. `npm run check` を通してコミットする（コミットの書式は `rules/branch`）
7. **ヒアリングシートを提示し、回答を待つ。** 依頼者がその場にいれば質問を提示して答えを受け、受けた答えは日付と経路を添えて回答欄に書き起こす。依頼者がいなければ、回答欄が空のまま PR を出して止まる。**AI の想定で回答欄を埋めない**

### 段 B: シナリオ

1. 回答が `hearing.md` に揃っていることを確かめる。空の回答欄が残っていれば、段 B を始めずに回答を求める
2. **回答を突き合わせる。** 次を探し、見つかったら書き始めずに確認する
   - 回答どうしの矛盾（Q と確認事項の食い違い、チャットの答えと記入の食い違い）
   - 回答によって前提が消えて行き先を失った質問（例: 「制限時間なし」と答えた結果、時間切れの扱いを聞いた質問が宙に浮く）
   - 選択肢は選ばれたが値が無い回答（例: 「決まった回数」と答えたが回数が無い）
   - 回答で新しく生じた論点（例: スマートフォン中心と答えたので、接続の切断の扱いが要る）

   確認した結果は、どの移行単位の論点かを決めて `UC-yy/hearing.md`（移行単位の追加ヒアリング）に、質問・選択肢・推奨・回答（日付と経路つき）の形で書き起こす。REQ の `hearing.md` の回答欄は依頼者の記入なので書き換えない
3. `plan.md` を書く。移行単位への分割は、その単位だけで業務が成立し、テスト項目が書け、設計フェーズで読み切れる量になるように切る。依存は、シナリオの期待結果が他の単位の規則に乗るかどうかまで見て書く。ウォーキングスケルトンを仮選定する
4. 移行単位ごとに `usecase.md` を書く。受け入れ基準は EARS で、合格・不合格を客観的に判定できる文にする。**観客は業務側で、技術の語彙を書かない**。非機能要件は数値か判定可能なルールにする
5. 移行単位ごとに `scenarios.md` を書く。正常系に加えて、考えられる異常系を必ず展開する。各シナリオに対応する受け入れ基準を書き、前提・操作・期待結果を判定可能な形にする。数値の例（得点・回数・順番など）は、前提から実際に到達できる値にする
6. 画面を伴う移行単位は `mockups/` に HTML のラフを置く（ワイヤーフレーム程度）
7. **回答に無い値を AI が置いた箇所を 1 か所に一覧する。** 文字数の上限・待ち時間・範囲・同点の扱いのように、回答から決まらず AI が提案した値と扱いを `plan.md` に表で並べ、それを確かめるシナリオの ID を添える。各シナリオの「業務側の確認」欄で採否を答えてもらう
8. 目的・対象利用者の定義を待っている生き資料（例: 最初の要求での `docs/product/`）があれば、ヒアリングで合意した範囲だけを書く。書いたら PR の要確認〔予定外〕に載せる
9. `npm run check` を通す
10. **`uld-scenario-review` の手順でレビューする。** レビューは成果物を書いた経緯を知らない独立した文脈で行い、渡すのは REQ のフォルダの場所だけにする。要修正（critical / major）が残っていれば直して再レビューする。指摘が業務側の判断を要する論点（回答で決まっていない振る舞い）なら、直す前に依頼者に確認し、移行単位の追加ヒアリングに書き起こす
11. コミットし、push して `develop` 向けのシナリオ PR を出す。本文は `.github/PULL_REQUEST_TEMPLATE.md` と `rules/pull-request` に従う。要確認には、追加ヒアリングで決めたこと・AI の提案値の一覧・業務側の確認欄への回答のお願い・分割の判断を載せる
12. **止まる。** PR がマージされるまで設計フェーズのブランチを切らない（`rules/branch` の「フェーズごとの PR と承認」）。「自律的に進める」という指示もこのゲートを免除しない

## 完了条件

- 段 A: `request.md` と `hearing.md` がコミットされ、ヒアリングシートが依頼者に提示されている
- 段 B: `plan.md` と全移行単位の `usecase.md` `scenarios.md` が揃い、`npm run check` が通り、`uld-scenario-review` の要修正がゼロで、シナリオ PR が出ている

## 制約

- 回答欄（`回答:` と確認事項）と「業務側の確認」欄を AI の想定で埋めない。埋めてよいのは、依頼者から受けた答えの書き起こしだけ
- 過去の REQ を仕様の根拠や書式の見本にしない（`rules/design-records` の「読む範囲」）。見本はテンプレートだけ
- 規約をプロンプトや記憶から推測せず、`rules/` を読んで確認する
