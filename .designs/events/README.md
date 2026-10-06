# ループのイベントログ

`loop-events.jsonl` に、開発ループのイベントを 1 行 1 JSON で**追記**します。ログ資料なので、**既存行は書き換えません**。

## なぜイベントで持つのか

KPI ごとに個別の計測を作ると、指標を足すたびに計測の仕組みを作り直すことになります。ループのイベントを先に構造化して落としておき、**KPI はすべてイベントから導出する**形にします。

現在ここに溜まるのは実装フェーズのイベントだけです。差し戻し・シナリオフェーズ・設計フェーズのイベントは、上流フェーズを整備するときに同じファイルへ足します。

## 出力先

| タスク | 出力先 |
| --- | --- |
| タスク ID 付き | `.designs/REQ-xxx/UC-yy/events/loop-events.jsonl`（`tasks.md` と同じ UC フォルダ配下） |
| 採番のない作業 | `.designs/events/loop-events.jsonl`（このフォルダ） |

UC フォルダ配下に分けるのは、並列開発で複数のループが同じファイルへ追記するとマージコンフリクトになるためです。同一 UC 内の子タスクはスタックで直列に積まれるので衝突しません。KPI を出すときは両方を読み込んで結合します。

追記は `node scripts/uld/uld.mjs record-loop-event` を通して行います。`seq`・`recordedAt`・`runId`・`branch` の付与と必須フィールドの検証を機械に寄せ、手作業でのフィールド欠落や既存行の書き換えを防ぐためです。

## 共通フィールド

| フィールド | 内容 |
| --- | --- |
| `runId` | ループ 1 回の実行を識別する値 |
| `seq` | その実行の中での順序（1 始まり） |
| `type` | イベント種別 |
| `taskId` | 対象の子タスク ID（`{slice}.{phase}.{連番}`）。採番のない作業では `null` |
| `branch` | 作業していたブランチ名 |
| `runner` | ループを回した実行系の識別子。`workflow` = ワークフロー方式（`uld-impl`）、`subagent` = 工程スキルをメインセッションで束ねる方式（`uld-impl-fast`）。実行系を入れ替えたときに前後を比較できるようにするための値で、古い行では省略されている |
| `recordedAt` | **ログを書いた時刻**（UTC、ISO 8601）。1 回の実行の全イベントで同じ値になる |
| `startedAt` / `completedAt` | **そのフェーズの実測時刻**（UTC、ISO 8601）。担当エージェントが `date` で測った値 |

`recordedAt` と `startedAt` / `completedAt` は別物です。**所要時間は必ず `startedAt` / `completedAt` から導出してください。**

なぜ 2 種類あるのか。`recordedAt` はログを追記した瞬間の時刻で、`node scripts/uld/uld.mjs record-loop-event` が付けます。一方フェーズの所要時間は、その工程を担当した側にしか測れません（記録は工程の後で走るため、記録時刻からは開始時刻が復元できない）。この分離をやめて `recordedAt` だけにすると、まとめて追記されたイベントが同じ時刻に潰れ、所要時間が一切導出できなくなります。

`startedAt` / `completedAt` を持たないのは、担当する工程がない節目のイベント（`task_started`・`loop_converged`）だけです。**それ以外のイベントでは `node scripts/uld/uld.mjs record-loop-event` が必須チェックします。**

## イベント種別（実装フェーズ）

| `type` | 意味 | 固有フィールド | 実測時刻 |
| --- | --- | --- | --- |
| `task_started` | ループ開始 | `task` | なし |
| `design_completed` | 設計完了 | `summary`、`affectedFileCount`、（上限超えを人が承認した場合のみ）`oversizeDecision` | あり |
| `implementation_completed` | 実装完了 | `summary`、`changedFileCount` | あり |
| `review_completed` | AI レビュー 1 周分の完了 | `round`、`reviewIssueCount`、`blockingIssueCount` | あり |
| `test_completed` | 機械チェック 1 回分の完了 | `round`、`testPassed`、`testFailureCount`、`scope`（`fast` = 周回中の `check:fast`、`full` = コミット前の `check`。省略時は `full`） | あり（`fast` は実装・修正の担当が自分で通すため、`startedAt` / `completedAt` はその工程と同じ値。所要時間は実装・修正側に含まれる） |
| `fix_completed` | 自動修正 1 周分の完了 | `round`、`fixedItemCount`、`skippedItemCount` | あり |
| `loop_converged` | 収束（人に見せてよい状態） | `rounds` | なし |
| `escalated` | 反復上限に達して収束せず | `rounds`、`remainingBlockingIssueCount`、`remainingTestFailureCount`、`interpretation`、`sendBackTo`、`recommendedBranch` | あり |

レビューと機械チェックは別々のイベントにしています。以前は並列に走る別エージェントの所要時間を混ぜないためでしたが、現行では周回中の `check:fast` を実装・修正の担当が通すので、`fast` の行は結果の記録であり所要時間は持ちません（`full` は別エージェントの実測）。工程別の所要時間は `npm run loop:stats` で表にできます。

`affectedFileCount` が子タスクの規模の上限（[rules/branch](../../rules/branch/project.md) の「子タスクの規模」）を超える `design_completed` は、人が分割せずに進めることを承認した記録 `oversizeDecision: "approved_by_user"` を伴わないと追記できません。規模の判断が人を経たかどうかを、後から KPI（上限超えの頻度・その後の収束率）として読めるようにするためです。

## ここから導出できるもの

- **AI レビューの反復回数** — `review_completed` の `round` の最大値。反復上限と分解基準のチューニング材料
- **フェーズごとの所要時間** — 各イベントの `startedAt` / `completedAt` の差。どのフェーズが時間を食っているかが分かる
- **収束率** — `loop_converged` と `escalated` の比
- **差し戻しのシグナル** — `escalated` の `sendBackTo` の分布。どのフェーズのハーネスに穴があるかを示す

第一 KPI（人の指摘なしマージ率）は PR から計測するもので、このログとは別系統です。両者を突き合わせられるよう、`taskId` と `branch` を必ず残します。

## スキーマの変遷

ログ資料なので、**過去の行は書き換えません**。読む側が新旧の形を吸収してください。

| 変更 | 内容 |
| --- | --- |
| 初版（`runId` が `run-2026-08-16T065456Z-notask` の 5 行） | 全イベントが単一の `at` を持ち、`review_completed` / `test_completed` の代わりに `verification_completed` が 1 件だった。所要時間は導出できない |
| `recordedAt` の導入 | `at` を `recordedAt` に改め、フェーズの実測時刻を `startedAt` / `completedAt` として分離。検証イベントをレビューとテストに分割 |
| `runner` の追加 | 追記を `node scripts/uld/uld.mjs record-loop-event` に寄せ、`runner` を追加。タスク ID 付きのループは UC フォルダ配下へ出力先を分離 |
| 規模の上限 | `design_completed` に規模の上限を置き、上限超えは `oversizeDecision` が無いと記録できないようにした |
| 現行 | 周回中の `check:fast` を実装・修正の担当が通す形にし、`scope: fast` の `test_completed` はその工程の時刻をそのまま持つ（独立した所要時間ではない）。同じタスクに複数の `runId` がある行は、セッションの並走で Record が二重に走った記録で、所要時間の集計では重複として扱う |
