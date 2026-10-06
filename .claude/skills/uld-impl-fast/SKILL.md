---
name: uld-impl-fast
description: Run the ULD implementation-phase loop for one child task by orchestrating the phase skills — uld-task-design and uld-implement run in the main session, uld-review runs in an independent fresh-context subagent in parallel with npm run check in the background. Loops until the convergence condition is met (all machine checks pass, zero blocking review findings), syncs every living document the change makes stale, records loop events via uld record-loop-event, then commits with the task ID, opens a child pull request onto the stack, and continues to the next task in tasks.md without asking. Escalates with a diagnosis when it does not converge within the iteration limit. Use when the user wants a task from tasks.md (or a small fix) implemented end-to-end, e.g. "/uld-impl-fast 1.2.1" or "/uld-impl-fast <task description>".
# 日本語訳: ULD 実装フェーズのループを、工程スキルを束ねて回す実行系スキル。uld-task-design と uld-implement はメインセッションで実行し、uld-review は独立したサブエージェント(新しいコンテキスト)で npm run check のバックグラウンド実行と並行して走らせる。収束条件(機械チェック全通過 + 要修正指摘ゼロ)を満たすまで修正を繰り返し、この変更で古くなる生き資料を同じタスクの中で同期し、ループイベントは node scripts/uld/uld.mjs record-loop-event で記録し、収束したらタスク ID 付きでコミットして子タスク PR をスタックに積み、確認を求めずに tasks.md の次の段へ進む。反復上限内に収束しない場合は診断を添えてエスカレーションする。tasks.md のタスクや小さな修正を一貫して実装したいときに使う。
---

# ULD 実装フェーズ(高速ループ)

> **このスキルはツール固有(実行系)です。** サブエージェントの起動とバックグラウンド実行を前提としており、他のツールではこのまま動きません。
> **既定の実行系ではありません。** 実装フェーズの既定は `uld-impl`（ワークフロー方式）です。このスキルは設計と実装をメインセッションが担うため、子タスクを続けて回すとセッションの文脈が肥大し、レビューの周回が増えて速度の利点が消えます（`rules/skills` の「実行系の既定」）。影響ファイルが数件の chore を 1 件だけ回すときに使い、`runner: subagent` で記録して既定の方式と比較できるようにします。
> 各工程の手順の実体はツール非依存の工程スキル(`uld-task-design` / `uld-implement` / `uld-review`)と `rules/` にあります。このスキルが持つのは、工程の起動・並列実行・収束判定・記録だけです。
> 記述ルールは `rules/skills`を参照してください。

## Overview

**子タスク 1 件**を実装フェーズのループで完了させます。

- **設計**(`uld-task-design`)と**実装**(`uld-implement`): メインセッションが実行する。調査結果とタスク文脈を全工程で再利用し、工程ごとの調査のやり直し(コールドスタート)を無くす
- **レビュー**(`uld-review`): 独立したサブエージェント(毎回新しいコンテキスト)に委譲する。**実装者とレビュアーの分離が品質の生命線なので、ここは絶対にメインセッションでやらない**
- **機械チェック**: 周回中は `npm run check:fast`（変更した workspace だけを検証）をバックグラウンドで起動し、レビューと並行実行する。フルの `npm run check` は収束後、コミット前に 1 回だけ通す
- **記録**: ループイベントを `node scripts/uld/uld.mjs record-loop-event` で追記する(採番・時刻・検証は機械化されている)

収束条件は 2 つです。両方を満たしたときだけ「人に見せてよい」状態になります(詳細は `rules/review`)。

1. 機械的チェックの全通過(周回中は `npm run check:fast`、コミット前に `npm run check`)
2. AI レビューの要修正指摘(critical / major)がゼロ

この方式が手放しているのは「設計・実装・修正のコンテキスト分離」です。影響範囲の広いタスクや設計に不確実性の残るタスクでは、先にタスクの分割を検討してください。

## 手順

### 1. タスクの確定

引数からタスクを決めます。

- **タスク ID が渡された場合**(例: `1.2.1`)— 対応する `.designs/REQ-xxx/UC-yy/tasks.md` を特定し、タスク説明を組み立てる(組み立て方は `uld-task-design` の「入力」)
- **自由記述が渡された場合** — そのままタスク説明として使う。採番がないので taskId は無しとする
- 引数が空、または何を作るか判断できないほど曖昧な場合は、ユーザーに確認してから進む
- **タスク ID 付きでも、その REQ のシナリオフェーズと UC の設計フェーズが `develop` に着地していなければ起動しない**（`rules/branch` の「フェーズごとの PR と承認」）。手順 2 で作業ブランチを切った直後に `npm run check:branch` を実行して確かめる。検証工程まで進んでから止まると設計と実装が無駄になるので、着手前に通す。失敗したら「前のフェーズの PR が承認・マージされるのを待つ」と伝えて止まる。人の承認（PR のマージ）を AI の判断やチャットの了解で代えない
- **自由記述のタスクが利用者から見える振る舞いの追加・変更（受け入れ基準の新設・変更）を伴うなら、採番のないまま進めない。** それは採番のない作業（`chore/`）ではなく要求であり、新しい REQ を起こしてヒアリングで範囲を決め、tasks.md に採番するのが先になる（条件と理由は `rules/branch` の「採番を持たない作業」）。該当すると判断したら、その旨と REQ を起こす提案をユーザーに伝えて止まる。判断に迷う場合も同じく確認する。採番が済めば、このスキルをタスク ID 付きで起動し直して通常どおり回す。見逃しても `npm run check:branch` が検証工程で止めるが、そこまで進んでからでは設計と実装が無駄になる

会話の文脈に設計上の決定事項や制約があれば、タスク説明に含めます。あわせてイベントログの出力先を決めます。

| タスク | イベントログの出力先 |
| --- | --- |
| タスク ID 付き | `.designs/REQ-xxx/UC-yy/events/loop-events.jsonl`(tasks.md と同じ UC フォルダ配下) |
| 採番のない作業 | `.designs/events/loop-events.jsonl` |

UC フォルダ配下に置くのは、並列開発で複数のループが同じファイルへ追記するとマージコンフリクトになるためです。同一 UC 内の子タスクはスタックで直列に積まれるので衝突しません。

### 2. ブランチをスタックに積む

**作業を始める前に**作業ブランチを用意します。子タスクの PR はスタックの 1 段になるので、base の選び方が重要です。

| このタスクが | base にするブランチ |
| --- | --- |
| スライスの最初の子タスク | `develop`(この PR がスタックの底になる。`tasks.md` は設計フェーズで着地済み) |
| 2 件目以降の子タスク | **直前の子タスクのブランチ**(`develop` ではない) |
| 採番のない作業 | `develop`(`chore/<slug>` として単独で切る) |

命名の規約は `rules/branch`、積み方の規約は `rules/pull-request` を参照してください。`main` / `develop` のまま作業を始めないでください。

### 3. ループ開始の記録

`task_started` イベントを記録し、出力された runId を以降の呼び出しで使い回します。

```
node scripts/uld/uld.mjs record-loop-event --file <イベントログ> --task-id <taskId> --runner subagent \
  --event '{"type":"task_started","task":"<タスク説明>"}'
```

以降の各工程では、開始直前と終了直後に `date -u +%Y-%m-%dT%H:%M:%SZ` を実測して startedAt / completedAt に入れます(スクリプトが必須チェックします)。推測値を入れると所要時間の計測が濁ります。

### 4. 設計

`uld-task-design` の手順に従い、メインセッションで設計メモを作ります。完了したら `design_completed` イベント(summary・affectedFileCount・startedAt・completedAt)を記録します。

**影響ファイル数が `rules/branch` の「子タスクの規模」の上限を超えたら、実装に入らず分割案をユーザーに提示して判断を待ちます。** 分割するなら、このループはそこで終え、分割後の子タスクごとにループを起動し直します。分割せずに進める承認を得た場合だけ、`design_completed` に `oversizeDecision: "approved_by_user"` を付けて記録します(承認の無い上限超えは `node scripts/uld/uld.mjs record-loop-event` が記録を拒みます)。

逆に、設計メモのテスト計画に観測点（人が正しさを判定できるテスト。同節の「子タスクの単位は 1 観測点」）が無く、その変更を検証するテストが後続の子タスクにしか無いと分かった場合は、そのまま実装せず後続タスクとの束ね直しをユーザーに提案します。

### 5. 実装

`uld-implement` の手順に従い、メインセッションで設計メモどおりに実装します。**この変更で古くなる生き資料は同じタスクの中で直します**（`rules/branch` の「子タスクの単位は 1 観測点」。同期だけのタスクを後ろに置かない）。完了したら `implementation_completed` イベント(summary・changedFileCount・startedAt・completedAt)を記録します。

### 6. 検証(並列)

レビューと機械チェックは互いに独立なので、同時に走らせます。

1. `npm run check:fast` をバックグラウンドで起動する（変更した workspace と下流だけを検証し build を省く。`rules/testing` の「検証コマンド」）
2. レビュー担当サブエージェントを起動し、`uld-review`の手順に従うよう指示する。渡すのは **uld-review の「入力」にある文脈だけ**(タスクの目的・設計メモのパス・再レビュー時は前回の指摘一覧)。実装の経緯や苦労した点は渡さない
3. 両方の結果が揃ってから判定し、`review_completed`(round・指摘数・要修正数)と `test_completed`(round・passed・失敗数)を記録する。並列に走った 2 つの所要時間を混ぜないため、startedAt / completedAt はそれぞれの実測値を使う

### 7. 修正ループ(上限 5 周)

要修正指摘(critical / major)またはチェック失敗が残っている間、修正 → 手順 6 の再実行を繰り返します。**minor だけが残った状態は収束です。** minor を直すのは任意で、直した場合も再レビュー（手順 6）には回さず、フルの `npm run check` へ進みます（`rules/review` の「収束条件」）。

- 修正は症状ではなく根本原因に対して行う。テストを消したり skip したりして通すことは禁止
- 指摘が誤りだと判断した場合は無理に変更せず、見送った理由を記録する
- **再レビューは毎回新しいサブエージェント**に依頼する(同じコンテキストの使い回しは独立性を壊す)
- 各周の終わりに `fix_completed` イベント(round・対応件数・見送り件数・startedAt・completedAt)を記録し、修正内容・見送った指摘を設計メモに追記する

収束条件を 2 つとも満たしたら、**フルの `npm run check` を 1 回実行**します。観測点が E2E を含むタスクは、続けて `npm run test:e2e` も通します（`rules/testing` の「検証コマンド」）。通ったら `loop_converged` イベント(rounds)を記録して手順 9 へ進みます。落ちた場合はチェック失敗として手順 7 の修正に戻ります（`check:fast` が省いた build や他 workspace の検証で見つかる失敗）。

### 8. 収束しない場合のエスカレーション

上限 5 周で収束しなければ、`rules/review` の枠組みで診断を作り、`escalated` イベント(rounds・残存指摘数・残存失敗数・interpretation・sendBackTo・recommendedBranch・startedAt・completedAt)を記録して人に判断を仰ぎます。**勝手に再実行しないでください。**

- 第一解釈は「タスク分解が甘い」。実装の問題として扱う前にタスク分割のやり直しを検討する
- 診断・第一解釈・戻し先・推奨分岐(retry / skip / abort)と理由を報告し、ユーザーがどの分岐を選ぶかを確認してから次の行動に移る

### 9. コミットと子タスク PR(収束した場合のみ)

- 変更したファイルを `git add` で明示的に追加する(`git add .` は使わない)。イベントログと設計メモも同じコミットに含める
- コミットの件名は、taskId があれば `[<taskId>] <変更内容の要約>`、無ければ `<type>(<scope>): <変更内容の要約>` の形式。本文には **Why** を書き、How は書かない(コードに書いてある)。書き分けは `rules/naming` の「コメント」を参照
- 現在のブランチを push する(他のブランチへは push しない)
- 子タスク PR をスタックに積む。**base は手順 2 で選んだブランチ(スタックの 1 段下)。2 件目以降の子タスクの base を `develop` にしないこと。** title は件名と同じ形式、body は `.github/PULL_REQUEST_TEMPLATE.md` の骨格と `rules/pull-request` の「PR 本文はレビュー依頼書として書く」に従う。要確認の各分類は、設計メモの決定事項・修正ループで見送った指摘・設計メモで宣言した範囲との差分・差分に導入した新しい名前から拾う。**各項目は「やったこと（太字 1 行）→ 課題 → 解決」の順**で書き、作業の経過（何を調べ、何を試したか）は書かない。先頭は文章の TL;DR ではなく「一目で」の表にし、各行を 1 行に収める
- スタックの底の PR のレビューガイドへ、この PR の行を追記する。底の特定と新設・省略の条件は `rules/pull-request` の「スタックの底の PR にレビューガイドを置く」に従う
- **PR はマージしない。** 人のレビュー前にマージすると差分が畳まれ、タスク単位で読めなくなる。スタックを積む目的は、1 回のレビューで読む量を小さく保つことにある

### 10. 結果の報告

- 収束したかどうかと、設計要約・実装要約・変更ファイル一覧
- 修正ループの回数と各周で直した内容・見送った指摘
- コミットの有無と件名、作成した子タスク PR の URL と base ブランチ。**コミットや PR 作成を見送った場合はその理由**
- minor 指摘は任意対応として列挙する
- domain 層に変更が入った場合、`docs/domain/` の更新漏れがあれば `uld-domain-model` スキルでの同期を提案する
- 利用者から見える振る舞いが変わった場合、`docs/usecases/` のユースケース記述の同期と、テスト名への受け入れ基準 ID の埋め込み(`rules/acceptance-testing` の「仕様トレーサビリティ」)に漏れがないかを確認し、漏れていれば報告する
- `docs/architecture/`（層・package・route・adapter の構成）と `docs/product/` `docs/domain/ubiquitous-language.md`（語彙）も、この変更で古くなっていないかを確認する。古いまま次の段へ送らない

### 11. 次の段へ続ける

索引（`tasks.md`）に未完了のタスクが残っていれば、**確認を求めずに次の段を始めます**（`rules/branch` の「止まるのはフェーズの出口だけで、フェーズの中では止まらない」）。手順 2 に戻り、直前の段のブランチから次のブランチを切って同じ流れを回します。

止まるのは、エスカレーションしたとき・索引の全タスクが完了したとき（スライスの出口）・人の判断が要る事象（採番の無いまま受け入れ基準を変えることになった、script が止まった、など）が起きたときだけです。

### 12. 指摘のルール還元とスキル改善

人のレビュー指摘を受け取ったら、`uld-rules` スキルで振り分けます。指摘が PR のレビューではなくチャットで届いた場合は、修正に着手する前に PR のレビューとして書き起こします（`rules/pull-request` の「チャットで受けた修正依頼は PR に人の指摘として書き起こす」）。指摘を使い捨てにせず、次から同じ指摘が出ないようにするためです。振り分けの基準は `rules/review` の「指摘のルール還元」にあります。

加えて、ループの中で「同じ指摘が繰り返し出る」「ルールやスキルの記述不足が原因で手戻りした」と気づいた場合は、**ループ完了後に** `uld-rules` での還元や工程スキル本文の修正を提案してください。

**還元したルールは走行中のループには効かせません。次のループから適用します。** 走行中に前提が変わると、それまでの検証・承認の前提が崩れ、再現性と計測が濁るためです。

## 注意事項

- **1 周の流れで 1 子タスク**。複数タスクをまとめて渡さない。タスクが大きすぎる場合は分割をユーザーに提案する。ただし 1 段が収束したら、確認を求めずに次の段へ進む（手順 11）— 1 段ずつ回すのと、段の切れ目で止まるのは別のこと
- レビュアーの独立性がこの方式の品質担保のすべてです。レビューを省略しない・メインセッションで代行しない・実装の文脈を渡さない、を崩さないこと
- イベントは各工程の完了時にその都度記録する(最後にまとめて書くと、途中で止まったとき全イベントを失う)
- コンテキストの要約が入っても続行できるよう、設計メモと残指摘は常にファイルに永続化しておくこと
