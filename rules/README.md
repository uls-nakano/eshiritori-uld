# ルール

プロジェクトのルールの single source of truth です。実装 AI もレビュー AI も、ここのファイルだけを規約の根拠とします。`CLAUDE.md` / `AGENTS.md` / スキル本文に規約の本文を書き写さないでください。

ルールは**他のプロジェクトでも使える形**で書きます。このプロダクトが何であるか（目的・ドメインモデル・アーキテクチャの構成・テストの土台の中身）は `docs/` に書き、ルールからはリンクで参照します。ルール本文にプロダクト固有の判断を書き込まないでください。

## 読み込み規約

ルールはトピック単位のフォルダに分かれ、各フォルダは `standard.md`（配布される標準）と `project.md`（このプロジェクトのルール）の対で構成します。

- 1 トピック = 1 作業。読むときは `standard.md` → `project.md` の順に両方読み、合成は連結だけとする
- `project.md` に書けるのは 2 種類だけ。**追記**（標準にないプロジェクト固有のルール）と、**理由つき上書き**（「標準の◯◯を本プロジェクトでは△△に置き換える。理由: …」と明示宣言する）。宣言なしに標準と矛盾する記述は置かない
- `standard.md` は ULD の標準として uld-kit から配布され、`npx --yes github:uls-nakano/uld-kit#<tag> init` で取り込みます。**リポジトリ側で直接編集しません**（食い違いは `npm run check:rules` が検出します）。標準を変えたいときは uld-kit 側で変更し、複数プロジェクトで再現したルールだけを標準に取り込みます
- レビュー指摘のルール還元（`uld-rules` スキル）の還元先は常に `project.md` です

## トピック一覧

| トピック | 読むタイミング |
| --- | --- |
| [architecture](architecture/project.md) | 層や package の置き場を決めるとき、package を追加するとき（依存方向・層の責務・module 境界・import 境界の機械チェック） |
| [development](development/project.md) | 実装コードを書く・変更するとき（コーディング・Logger・Factory・エラー・Adapter/Mapper・Repository/UseCase・import 境界・API 生成・Lint） |
| [model-design](model-design/project.md) | ドメインモデル（Entity・Value Object・Domain Service）を設計・変更するとき。モデル図の記法もここ |
| [testing](testing/project.md) | 単体テストを書くとき、変更を検証するとき（TDD ループ・テスト配置・記述スタイル・カバレッジ・UI の story・検証コマンド） |
| [acceptance-testing](acceptance-testing/project.md) | 受け入れ基準やジャーニーを検証するテストを書くとき（HTTP 結合テスト・E2E・仕様トレーサビリティ） |
| [naming](naming/project.md) | 名前を付けるとき（識別子・ファイル名・ユビキタス言語）、コメント・テスト名・ドキュメントの言語を判断するとき |
| [skills](skills/project.md) | スキル（AI の手順書）を書く・改名するとき（命名・本文の抽象度・ツール非依存） |
| [branch](branch/project.md) | ブランチを切る・コミットするとき（フェーズごとの承認・命名・採番の鎖） |
| [pull-request](pull-request/project.md) | PR を作る・積む・書くとき（スタック・通す条件・PR 本文・レビューガイド・KPI の分母） |
| [review](review/project.md) | コードや成果物をレビューするとき（AI レビュー・人レビュー共通の基準） |
| [documentation](documentation/project.md) | ドキュメントを書くとき（言語・章立て・生き資料とログ資料・ユースケース記述・ジャーニー記述・図の配色） |
| [design-records](design-records/project.md) | 開発フローの記録（`.designs/`）を書き起こす・読むとき（構成・採番・凍結・読む範囲・テンプレート） |

各リンクは `project.md` を指しますが、読むときは同じフォルダの `standard.md` を先に読みます。

変更対象からトピックを引く例:

- Repository 実装を変更する → `development` + `testing`
- package や module を追加する → `architecture`（境界と機械チェック）+ `development`
- Entity や Value Object を追加する → `model-design`（設計とモデル図）+ `development` + `testing`
- UI component を変更する → `development` + `testing`（story）
- 受け入れ基準を追加する → `documentation`（ユースケース記述）+ `acceptance-testing`（結合テストとトレース）
- スキルを書く・変更する → `skills`
- 要求・ヒアリング・シナリオ・タスク一覧を書き起こす → `design-records`（テンプレートと置き場）+ `branch`（採番の鎖）
- 子タスクの PR を積む → `branch`（命名・コミット）+ `pull-request`（スタック・本文）

## 関連ドキュメント

ルールは「どう書くか」を定めます。「何であるか」の説明は `docs/` にあります。

- [docs/usecases/](../docs/usecases/) — 受け入れ基準（ユースケース記述）
- [docs/journeys/](../docs/journeys/) — ジャーニー（E2E の対象）
- [docs/domain/](../docs/domain/) — ドメインモデルとユビキタス言語
- [.designs/](../.designs/README.md) — 開発フローの記録（ログ資料）。構成・採番・テンプレートは [design-records](design-records/standard.md)
