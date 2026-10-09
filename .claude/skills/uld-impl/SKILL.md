---
name: uld-impl
description: Run the ULD implementation-phase loop from a given child task through the rest of the slice — for each task: design, implement (through check:fast), review, and auto-fix until the convergence condition is met, then commit with the task ID and open a child pull request onto the stack via script, and continue to the next task in tasks.md without asking. Stops only when the harness needs a human decision (oversize task, no observation point, escalation after the iteration limit) or the slice is complete. Use when the user wants a task from tasks.md (or a small fix) implemented end-to-end, e.g. "/uld-impl 1.2.1" or "/uld-impl <task description>".
# 日本語訳: ULD 実装フェーズのループを、指定した子タスクからスライスの残り全段まで回すスキル。段ごとに設計・実装（check:fast まで）・レビュー・修正を別エージェントが担当し、収束条件(機械チェック全通過 + 要修正指摘ゼロ)を満たすまで自動修正を繰り返し、収束したら script でタスク ID 付きのコミットと子タスク PR をスタックに積み、確認を求めずに tasks.md の次の段へ進む。止まるのはハーネスが人の判断を求めたとき（規模超過・観測点なし・反復上限でのエスカレーション）とスライスが終わったときだけ。tasks.md のタスクや小さな修正を一貫して実装したいときに使う。
---

# ULD 実装フェーズ

> **このスキルはツール固有（実行系）です。** Claude Code の Workflow 機構を起動する薄い層であり、他のツールではこのまま動きません。
> 手順とルールの実体はツール非依存の側にあります（規約は `rules/`、成果物とその置き場は `.designs/`）。
> 記述ルールは `rules/skills`を参照してください。

## Overview

`.claude/workflows/uld-impl.js`（uld-kit が配布し `npx --yes github:uls-nakano/uld-kit#<tag> init` がリポジトリへコピーしたワークフロー script）を段ごとに起動して、**指定した子タスクからスライスの残り全段**を実装フェーズのループで完了させます（1 段が収束したら確認を求めずに次の段へ進む。手順 5）。**実装フェーズの既定の実行系です**（`rules/skills` の「実行系の既定」）。各工程は新しいコンテキストのエージェントが担当し、工程間の受け渡しはファイル（設計メモ）だけで行うため、メインセッションは起動と結果の受け取りしか持たず、1 スライス分の子タスクを続けて回しても肥大しません。

- **Design**: 設計エージェントが `uld-task-design` の手順で設計メモを `.designs/REQ-xxx/UC-yy/impl/<taskId>-design.md` に書き出す。影響ファイルが上限を超えるか、観測点が無い場合はここで止まり、人の判断を返す
- **Implement**: 実装エージェントが `uld-implement` の手順で設計メモに従い TDD で実装し、`npm run check:fast` を通してから完了にする
- **Review**: レビューエージェントが `uld-review` の手順で差分を検査する。check:fast を通った差分だけがレビューに渡るので、機械が拾う種類の指摘に時間を使わない
- **Fix**: 要修正指摘（critical / major）があれば修正し、`check:fast` を通してから再レビュー。**上限 5 周**。minor だけが残った状態は収束で、minor のために周回しない
- **Full check**: 要修正ゼロで `check:fast` が通ったら、コミット前に `npm run check` をフルで 1 回。設計メモの観測点が E2E を含む段は `npm run test:e2e` も続けて通す（`rules/testing` の「検証コマンド」）。落ちたら Fix に戻る
- **Record**: ループのイベントを `node scripts/uld/uld.mjs record-loop-event`（`--runner workflow`）で追記し、収束していれば `node scripts/uld/uld.mjs finish-task` でコミット・push・子タスク PR の作成・底 PR のレビューガイド更新・`tasks.md` のチェックを行う。エージェントは PR 本文の材料を入力 JSON に整えるだけで、git と gh の操作は script が持つ

周回中の `check:fast` を実装・修正の担当に持たせ、別のテストエージェントを置かないのは、レビューに渡る差分を常に緑にして機械チェック起点の修正ループの周回を手前で潰すためです。Record を script にしたのは、コミット・push・PR 作成が判断の要らない手順であり、エージェントに任せると amend や二重記録のような状況判断が混ざるためです。

収束条件は 2 つです。両方を満たしたときだけ「人に見せてよい」状態になります（詳細は `rules/review`）。

1. 機械的チェックの全通過（周回中は `npm run check:fast`、コミット前に `npm run check`。`rules/testing` の「検証コマンド」）
2. AI レビューの要修正指摘がゼロ

### 工程ごとのモデルとエフォート

工程ごとにモデルとエフォートを持ち、`args.models` / `args.efforts` で上書きできます（`rules/skills` の「工程ごとにモデルとエフォートを選べる」）。既定は次のとおりで、実体はワークフロー script の先頭に 1 か所で置いています。

| 工程 | model | effort | 理由 |
| --- | --- | --- | --- |
| design | opus | high | 判断が重い。セッション上限の待機を別のモデルに逃がす |
| implement | sonnet | medium | 精密な設計メモを前提に軽いモデルで回す |
| review | opus | high | 実装と独立した判断。指摘の質が周回数を決める |
| fix | sonnet | medium | 実装と同じ |
| test | haiku | low | フルの `npm run check` を実行して報告するだけ |
| record | haiku | low | イベント追記と script の起動だけ |

上書きの例: `models: { design: null }` はその工程をセッションのモデルに戻す。effort の値は `low` / `medium` / `high` / `xhigh` / `max`。

## 手順

### 1. タスクの確定

引数からタスクを決めます。

- **タスク ID が渡された場合**（例: `1.2.1`）— 対応する `.designs/REQ-xxx/UC-yy/tasks.md`（索引。設計フェーズで `develop` に着地済み）を特定し、そのタスクの「観測点」「変更ファイル」「入力」「外す（未実装）ID」「要件・シナリオ」と、tasks.md の「束ね方の判断」をタスク説明として組み立てる。tasks.md のあるフォルダを `unitDirectory` として渡す
- **自由記述が渡された場合** — そのままタスク説明として使う。採番がないので `taskId` は渡さない。**利用者から見える振る舞いの追加・変更（受け入れ基準の新設・変更）を伴うなら進めない。** それは要求であり、新しい REQ を起こしてヒアリングで範囲を決めるのが先になる（`rules/branch` の「採番を持たない作業」）。該当すると判断したら、その旨と `uld-scenario` で REQ を起こす提案を伝えて止まる
- 引数が空、または何を作るか判断できないほど曖昧な場合は、ユーザーに確認してから進む
- **前のフェーズが着地していることを確かめる。** タスク ID 付きなら、その REQ / UC のシナリオ成果物と設計フェーズの受け入れ基準・`tasks.md` が `develop` にマージ済みであること（`rules/branch` の「フェーズごとの PR と承認」）。`npm run check:branch` が機械検出するので、作業ブランチを切った直後に一度実行し、失敗したら起動せず止まる

会話の文脈に設計上の決定事項や制約があれば、タスク説明に含めます。

### 2. ブランチをスタックに積む

**ワークフローを起動する前に**作業ブランチを用意します。子タスクの PR はスタックの 1 段になるので、base の選び方が重要です。

| このタスクが | base にするブランチ |
| --- | --- |
| スライスの最初の子タスク | `develop`（この PR がスタックの底になる） |
| 2 件目以降の子タスク | **直前の子タスクのブランチ**（`develop` ではない） |
| 採番のない作業 | `develop`（`chore/<slug>` として単独で切る） |

命名の規約は `rules/branch`、積み方の規約は `rules/pull-request` を参照してください。現在のブランチが `main` または `develop` のまま起動しないでください。

**同じワークツリーを複数のセッションで運転しないでください。** 起動前に `git log --oneline -3` と `gh pr list --head <ブランチ>` で、別のセッションが同じタスクを進めていないことを確かめます。セッションの fork や再開でワークフローを再実行すると Record が二重に走り、イベントの重複やコミットの書き換えが起きます（`node scripts/uld/uld.mjs finish-task` は PR が既にあれば止まりますが、イベントの追記は止められません）。

### 3. ワークフローの起動

Workflow ツールを次の形で呼び出します。

- `name`: `"uld-impl"`
- `args`: `{ task: "<タスク説明>", taskId: "<タスクID>", unitDirectory: "<tasks.md のあるフォルダ>", branch: "<作業ブランチ>", baseBranch: "<base ブランチ>" }`。採番がない作業は `{ task: "<タスク説明>", memoPath: "<設計メモの置き場>", branch, baseBranch: "develop" }`（`memoPath` を省くと `.designs/reviews/` 配下に置く）。`branch` と `baseBranch` は Record の script が期待するブランチと PR の base を確かめる鍵で、省くと記録担当が git の履歴から判断する
- 工程ごとにモデル・エフォートを変えるときは `models: { design, implement, review, fix, test, record }` / `efforts: { … }` を足す（既定は上の表）

ワークフローが `needsUserDecision` を返して終わったら、**人の判断が要る場面**です。勝手に再開しないでください。

- `oversize`: 影響ファイルが上限を超えた。設計メモを読んで分割案を提示し、分割せずに進める承認を得たときだけ同じ `args` に `oversizeDecision: "approved_by_user"` を足して再開する（`rules/branch` の「子タスクの規模」）。分割した場合は `tasks.md` を更新し、その子タスク PR の要確認〔予定外〕に載せる
- `no_observation_point`: テスト計画に観測点が無い。後続タスクとの束ね直しを提案する（同「子タスクの単位は 1 観測点」）

### 4. 結果の報告

戻り値をもとに次を報告します。

- 収束したか（`success`）と、設計メモのパス（`memoPath`）・設計要約・実装要約・変更ファイル一覧
- 修正ループの回数（`fixRounds`）と各周で直した内容（`fixHistory`）
- `record`: イベントの追記件数、コミットの有無と件名、作成した子タスク PR の URL と base ブランチ。**script が止まった場合はその理由**（`note`）
- **子タスク PR はマージしません。** スライスの全タスクが揃ってから、人がスタックをまとめてレビューします
- minor 指摘（`finalReview.minorIssues`）は任意対応として列挙する
- 工程別の所要時間は `npm run loop:stats -- <イベントログ>` で表にできる。実行系や工程スキルを変えたときは前後を比べる

報告したら、**指示を待たずに次の段へ進みます**（下記）。

### 5. 次の段へ続ける

**索引（`tasks.md`）に未完了のタスクが残っていれば、確認を求めずに次の段を起動します。** 1 段ごとに人の判断を挟まないのは、スライスの全段が揃うまで人のレビューは始まらない（`rules/pull-request` の「読む単位と通す単位を分ける」）ため、段の切れ目で待っても誰も何も決められず、待ち時間だけが増えるからです。

手順は 1 段目と同じです。

1. 次のタスクのブランチを**直前の段のブランチから**切る（`rules/branch` の「命名」。base を `develop` にしない）
2. `npm run check:branch` を通す
3. 手順 1 と同じ形でタスク説明を組み立て、ワークフローを起動する

止まるのは次の場合だけです。

- `needsUserDecision`（規模超過・観測点なし）が返った
- `escalation`（反復上限で収束しなかった）が返った
- 索引の全タスクが完了した（= スライスの出口。ここで人のレビューへ渡す）
- 途中の段で人の判断が要る事象が起きた（script が止まった、契約や受け入れ基準を変える必要が出た、など）

### 6. 収束しなかった場合

`escalation` に診断が入っています。**これは人が判断する場面です。勝手に再実行しないでください。**

報告する内容:

- `diagnosis`: なぜ収束しなかったか
- `interpretation` と `sendBackTo`: 第一解釈と戻し先。**既定の第一候補は「タスク分解が甘い」→ 設計フェーズへの差し戻し**です。収束しないタスクは、実装の問題である前に子タスクの詳細度不足であることが多いためです
- `recommendedBranch`: retry / skip / abort の推奨と理由

ユーザーがどの分岐を選ぶかを確認してから次の行動に移ります。

### 7. 指摘のルール還元

人のレビュー指摘を受け取ったら、`uld-rules` スキルで振り分けます。指摘が PR のレビューではなくチャットで届いた場合は、修正に着手する前に PR のレビューとして書き起こします（`rules/pull-request` の「チャットで受けた修正依頼は PR に人の指摘として書き起こす」）。指摘を使い捨てにせず、次から同じ指摘が出ないようにするためです。振り分けの基準は `rules/review` の「指摘のルール還元」にあります。

**還元したルールは走行中のループには効かせません。** 次のループから適用します。走行中に前提が変わると、それまでの検証・承認の前提が崩れ、再現性と計測が濁るためです。

## 注意事項

- ワークフロー実行中に作業ツリーを並行編集しない（レビュー・修正対象がずれるため）
- **ワークフロー 1 回の起動で 1 子タスク**。複数タスクをまとめて渡さない。タスクが大きすぎる場合は分割をユーザーに提案する。ただし 1 段が収束したら、確認を求めずに次の段を起動する（手順 5）— 起動が 1 段ずつなのと、段の切れ目で止まるのは別のこと
- コミットと PR 作成は Record フェーズの script が行う。**PR のマージは誰も行わない**。amend と force push はこのワークフローの誰も行わない
- **人のレビュー前に子タスク PR をマージしない。** 先にマージすると差分が畳まれ、タスク単位で読めなくなる。スタックを積む目的は、1 回のレビューで読む量を小さく保つことにある
- domain 層に変更が入った場合、`docs/domain/` 配下のドキュメントが更新されているかを報告時に確認し、漏れていれば `uld-domain-model` スキルでの同期を提案する
- 利用者から見える振る舞いが変わった場合、`docs/usecases/` のユースケース記述が同期され、テスト名に受け入れ基準 ID が埋め込まれているか（`rules/acceptance-testing` の「仕様トレーサビリティ」）を報告時に確認し、漏れていれば同期を提案する

## 失敗時のリカバリ

ワークフローが途中で止まった場合は、ツール結果の `runId` と scriptPath を使い `Workflow({scriptPath, resumeFromRunId, args})` で再開できます（完了済みエージェントの結果はキャッシュから再利用されます）。再開する前に `git log --oneline -3` と `gh pr list --head <ブランチ>` で、Record が既に済んでいないかを確かめてください。
