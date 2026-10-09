# このリポジトリで作業する AI への案内

> このファイルは索引です。規約の本文は書きません。**規約は `rules/` にのみ存在します。**
> `CLAUDE.md` と `AGENTS.md` は同一内容です。片方だけを更新しないでください（`npm run check:index` で検出されます）。

## このプロジェクト

絵しりとり（前の人が描いた絵から言葉を読み取り、その言葉の末尾の音で始まる言葉を次の人が絵で描いてつなぐ遊び）を Web 上で遊ぶためのアプリケーションです。ユースケース記述とドメインモデルがあり、実装を始めた段階です。利用者から見える振る舞いの追加・変更は、シナリオフェーズ（`/uld-scenario`）から始めます。

目的の定義は [docs/product/](docs/product/) を、現在の受け入れ基準（ユースケース記述）は [docs/usecases/](docs/usecases/) を、ユースケースを貫くジャーニー（E2E の対象）は [docs/journeys/](docs/journeys/) を参照してください。

このリポジトリは **ULD（ULS Loop Development）** の標準プロセスで開発します。規約は `rules/`（標準 `standard.md` + プロジェクト `project.md`）、開発フローの記録は `.designs/`、実行系は `.claude/`（スキル `uld-*` とワークフローは uld-kit が配布し `npx --yes github:uls-nakano/uld-kit#<tag> init` がコピーする）、機械チェックは `uld` CLI です。

## 生き資料とログ資料

リポジトリ内のドキュメントは 2 種類に分かれます。

- **生き資料（メンテする）** — `docs/` `rules/` と実装のフォルダ。常に「現在の姿」を表し、古くなったら直す義務があります
- **ログ資料（上書きしない）** — `.designs/`。そのとき何を聞き、何に合意したかの記録です。後から書き換えず、変更したい場合は新しいフローを流します

## 開発の進め方

要求はフェーズごとに PR を出し、人の承認（`develop` へのマージ）を得てから次のフェーズへ進みます（[rules/branch](rules/branch/) の「フェーズごとの PR と承認」）。

| フェーズ | 使うスキル | 出口 |
| --- | --- | --- |
| シナリオ（要望・ヒアリング・ユースケース定義・合格シナリオ集） | `/uld-scenario <要望>`、回答が揃ったら `/uld-scenario REQ-xxx` | シナリオ PR |
| 設計（ドメインモデル・ユースケース記述・実装スタックの索引） | `/uld-design REQ-xxx/UC-yy` | 設計 PR |
| 実装（子タスクのループ） | `/uld-impl <タスクID>` | 子タスク PR のスタック |

利用者から見える振る舞いの追加・変更は、規模にかかわらずシナリオフェーズから始めます。

## 作業を始める前に読むもの

規約はトピック単位に分かれています。**変更する対象に応じて必要なトピックだけを読んでください。** 各トピックは `standard.md` → `project.md` の順に両方読みます。

| 変更する対象 | 読むトピック |
| --- | --- |
| 層・package の置き場、package の追加 | [rules/architecture](rules/architecture/) |
| 実装コード全般 | [rules/development](rules/development/) |
| ドメインモデル（Entity・VO・Domain Service）とモデル図 | [rules/model-design](rules/model-design/) |
| 単体テスト、検証コマンド | [rules/testing](rules/testing/) |
| 結合テスト・E2E・受け入れ基準のトレース | [rules/acceptance-testing](rules/acceptance-testing/) |
| 名前・コメント・テスト名の言語 | [rules/naming](rules/naming/) |
| スキル（命名・本文） | [rules/skills](rules/skills/) |
| ブランチ・コミット | [rules/branch](rules/branch/) |
| PR（スタック・本文・通す条件） | [rules/pull-request](rules/pull-request/) |
| レビューする / セルフチェックする | [rules/review](rules/review/) |
| ドキュメントの書き方 | [rules/documentation](rules/documentation/) |
| 開発フローの記録（`.designs/`）の書き起こし・テンプレート | [rules/design-records](rules/design-records/) |

トピックの一覧と読み込み規約は [rules/README.md](rules/README.md) にあります。

## 構成

層と package の置き場（予定を含む）・技術の選定・ローカルと AWS の対応は [docs/architecture/](docs/architecture/README.md) にあります（置き場の規約は [rules/architecture](rules/architecture/)）。package・app を作った段で、ここに 1 行ずつ追記します。

- `docs/` — 目的（`product/`）・アーキテクチャ（`architecture/`）・ユースケース記述（`usecases/`）・ジャーニー（`journeys/`）・ドメインモデルと用語集（`domain/`）
- `packages/room/` — 部屋の作成・参加・ゲームの開始を扱う業務 module（`domain` `application` `adapters` `errors` を置く）
- `apps/api/` — HTTP API の入口と adapter の注入（composition root）。ローカル起動は `npm run start:api`
- `packages/api-contract/` — OpenAPI specification と、そこから生成する型（`npm run generate:api`）
- `tests/` — HTTP 結合テスト（`tests/integration/`）。後に E2E
- `packages/shared-kernel/` — `DomainError` 基底・`Result` など、module をまたぐ最小限の共通物
- `rules/` — 規約（標準 `standard.md` + プロジェクト `project.md`）
- `.designs/` — 開発フローの記録（ログ資料）
- `scripts/uld/` — uld-kit が配る `uld` CLI（kit 所有。直接編集しない）

## 検証

コミット前とプッシュ前に `npm run check` を実行します。検証コマンドの内訳・実行タイミングは [rules/testing](rules/testing/) にあります。
