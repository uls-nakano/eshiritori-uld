# テストルール（標準）

> 標準 v0.1。ULD（ULS Loop Development）の標準ルールで、uld-kit から配布されます。プロジェクト固有の追記・上書きは同じフォルダの `project.md` にあります。

テスト戦略と、単体テストの書き方、変更を検証する手順のルールです。受け入れ基準やジャーニーを外から検証するテスト（HTTP 結合テスト・E2E・仕様トレーサビリティ）は [acceptance-testing](../acceptance-testing/standard.md) にあります。

## テスト戦略

TDD を標準とします。実装前に期待する振る舞いをテストで表現し、失敗を確認してから最小実装を行います。テストの目的は個々の値を守ることではなく、システムが目的どおりに振る舞っていることを守ることです。

```text
E2E                   少数。ユースケースを貫くジャーニーの正常系を守る（acceptance-testing）
Storybook tests       UI component の表示状態を守る
HTTP 結合テスト        受け入れ基準を API 境界で守る（acceptance-testing）
Adapter tests         repository 実装・外部 API client を実 I/O と fixture で守る
Application tests     use case と port の契約を守る
Domain unit tests     Entity、Value Object、Domain Service を厚く守る
```

- **Domain unit test** は Entity の不変条件、Value Object の生成と等価性、Domain Service の判断・集計ルール、境界値を対象にする。外部 I/O は使わず、最も多く、最も速いテストにする。
- **Application test** は use case の成功・失敗ケース、port の呼び出し、トランザクション境界、unknown case の扱いを対象にする。依存は fake または in-memory adapter で置き換える。
- **Adapter test** は DB 直結の repository 実装を実 DB で、外部 API client を保存済みの応答 fixture で検証する。外部 SaaS への live call は CI の必須条件にしない。
- **受け入れ基準の検証責務**は結合テストと Storybook に置き、単体テストには置かない（[acceptance-testing](../acceptance-testing/standard.md)）。
- 文書とテストは ID で結び、機械チェックが両方向に突き合わせる。受け入れ基準とジャーニーは `npm run check:trace`、ドメインモデル図の公開メソッドと単体テストの `describe` は `npm run check:model-trace`。

## TDD 標準ループ

すべての実装タスクは、原則として次の順序で進めます。

1. 仕様または期待する振る舞いを確認する。
2. fixture またはテストデータを追加する。
3. API 変更がある場合は OpenAPI specification を先に更新する。
4. 生成コマンドで API 型・client・server contract を更新する。
5. 失敗するテストを書く。
6. テストが期待どおり失敗することを確認する。
7. 最小実装でテストを通す。
8. 設計を崩さない範囲でリファクタリングする。
9. import 境界を確認する。
10. カバレッジを確認する。
11. `npm run check` を通す。
12. 変更した仕様、制約、未決定事項をドキュメントに反映する。

### Red

- 先に domain または application test を書く。
- UI から始める場合でも、表示値の根拠となる use case test を先に書く。
- 失敗理由が期待どおりか確認する。

### Green

- 最小の実装でテストを通す。
- この段階で抽象化を増やしすぎない。
- 外部 I/O が必要な場合は fake adapter から始める。

### Refactor

- クラス責務を小さく保つ。
- Entity と Value Object の境界を見直す。
- use case から業務ルールが漏れていないか確認する。
- adapter に domain rule が混ざっていないか確認する。

## ハーネス

ハーネスは、AI が書いた変更が目的どおりに振る舞うことを機械的に確かめる仕組みの総称です。各機能には、少なくとも次のどれかを含めます。UI が値に依存する前に、その値を導く判断には fixture ベースのテストを用意します。

- 判断の入力（外部から取得する payload の形）を表す小さな fixture と、それを使う単体テスト
- 受け入れ基準を API 境界で検証する HTTP 結合テスト
- 外部アダプター（外部 API client・repository 実装）の実 I/O または fixture によるテスト
- UI component の表示状態を確認する Storybook story
- ジャーニーを本物の UI と API で確かめる E2E

### Fixture

- fixture は小さく、レビュー時に読み切れるサイズに保つ。実データを置く場合は secret と個人情報を必ず除去する。
- fixture が表すべき傾向は、正常系の代表だけでなく、判定できないケース（unknown）、境界（空・0 件・欠損）を含める。
- 外部システムのスタブは、登録された応答だけを返す小さな実装にし、結合テストと E2E で 1 つの実装を共有する（[acceptance-testing](../acceptance-testing/standard.md)）。

## テスト配置ルール

- 単体テストは原則として、対象の class、function、Value Object、Use Case と同じ directory に colocate する。
- 単体テストの file name は対象 file に `.test.ts` または `.test.tsx` を付けた名前にする。例: `RepositoryId.ts` の単体テストは `RepositoryId.test.ts` に置く。
- domain/application の単体テストは、実装 file と隣接させ、未テストの class や分岐が directory listing で分かる状態を保つ。
- adapter、mapper、presenter の小さな単体テストも、対象 file と同じ directory に置く。
- アプリを起動して外から確かめるテスト（HTTP 結合テスト・E2E）は、どのアプリにも属さないルートの `tests/` ワークスペースに置く（[acceptance-testing](../acceptance-testing/standard.md)）。それ以外の横断的なテスト（contract test、golden snapshot test）は、単一 package に閉じるなら package の `tests/` に置いてよい。
- DB 直結の repository 実装は、モック DB client ではなく**実 DB に接続する colocate 単体テスト**で検証し、カバレッジ計測にも含める。モックでは発行する操作の形しか検証できず実挙動を保証しないため（ORM 固有の query、nullability、date/time 変換、record と domain 集約の mapper はモックでは見落としやすい）。DB が起動していることをテストの前提条件とし、接続できない場合は原因調査ではなく起動・マイグレーション手順を案内するエラーメッセージで失敗させる。mapper など DB に触れない純粋ロジックは従来どおりモック不要の単体テストで検証する。
- 実 DB を使う単体テストは、テストごとにトランザクションを張り終了時に必ずロールバックして分離する。`deleteMany` などの削除クリーンアップはテストの並列実行を妨げるため使わない（repository 実装が内部でトランザクションを張らないルールとセットで成立する）。
- 特定のテスト専用の小さな fixture は、テストとの関連が分かるように、対象テストと同じ directory の `fixtures/` サブディレクトリに置く。
- 複数テストや実行環境をまたいで共有する fixture、golden snapshot、大きな raw data は package 直下の `fixtures/` または対象 harness が定める directory に置き、単体テスト file と同列に raw data を直置きしない。
- 新しい実装 file を追加したら、同じ directory に対応する単体テストが必要かを必ず判断する。不要な場合は、既存の横断テストで覆われる理由を PR または関連 docs に残す。
- テスト名（`describe` / `it` / `test`）の言語は [naming](../naming/standard.md) を参照する。
- テストは仕様（期待する振る舞い）から書き、実装の出力をそのまま期待値に写した「実装に合わせただけのテスト」にしない。実装が間違っていてもテストが通る状態になるため。

## テストの記述スタイル

- トップレベル（大外）の `describe` は、テスト対象の関数名・メソッド名でまとめる。クラス名はテストファイル名で表現されるため `describe` には書かない。コンストラクタの振る舞いは `describe("constructor", ...)` とする。モデル図の公開メソッドとこの `describe` の対応は `npm run check:model-trace` が突き合わせる（[model-design](../model-design/standard.md)）。
- 対象となる関数が存在しない場合（enum の契約テストなど）は例外とし、対象を表す説明的な `describe` を使ってよい。例: `describe("ErrorCode の契約", ...)`
- テストランナーの `describe`、`it`、`expect`、`vi` などは明示 import し、テストファイルの依存を読みやすく保つ。
- 単体テストのテスト名に受け入れ基準 ID を置かない。単体テストのトレース相手はドメインモデル図であり、受け入れ基準のトレース相手は結合テストと Storybook（[acceptance-testing](../acceptance-testing/standard.md)）。

## カバレッジ

カバレッジは品質そのものではなく、重要な振る舞いをテストで守れているかを確認する補助指標です。ただし TDD と Clean Architecture を前提にするため、domain と application は 100% を必須にします。

- カバレッジは毎回確認する。
- 全体はできる限り statements、branches、functions、lines すべて 100% を目指す。
- 全体の最低閾値は statements 85%、branches 80%、functions 85%、lines 85% とする。
- domain と application は statements、branches、functions、lines すべて 100% を必須閾値として扱い、`npm run coverage` は package ごとの閾値でローカルでも CI でも失敗させる。
- 少なくとも application test レベルまでは、未実行の分岐や関数を残さない。
- 閾値未満で完了しない。
- adapter、presentation、E2E 周辺で 100% にできない場合は、理由、代替テスト、残リスクを PR に書く。
- 型定義だけの DTO、port interface、生成コード、composition root など、振る舞いを持たないファイルは coverage 対象から除外してよい。除外理由は設定または PR で分かるようにする。
- 到達困難な defensive branch を coverage から除外する場合は、除外コメントに理由を書く。数値を上げるためだけの除外は禁止する。例: `/* v8 ignore next -- defensive: 外部 client が unknown error を返した場合の最後の保険 */`
- domain/application が 100% 未満の状態でコミット・プッシュ・マージしない。

## Storybook

Storybook は、UI component の表示状態を fixture ベースで確認し、回帰を検出するためのハーネスとして扱います。値そのものだけでなく、判定できない状態（unknown・未観測）が正しく区別して表示されることを固定します。

- UI component を追加または変更するときは、対応する story を追加または更新する。
- stories は live API に依存させず、fixture または test harness のデータを使う。
- UI component は Storybook stories で loading、empty、error、unknown、normal を確認できるようにする。
- story 内で domain rule や集計ロジックを再実装しない。fixture と異なる手書き数値を story に埋め込まない。
- 個人情報や実データの機微なコメントを story に置かない。
- 表示系の受け入れ基準の ID は play 関数内の期待値コメントに置く（[acceptance-testing](../acceptance-testing/standard.md)）。
- 視覚回帰検出（Chromatic など）を導入する場合も、domain/application のテストを置き換えるものではなく、presentation の状態確認を補助するものとして扱う。

## 検証コマンド

コミット前とプッシュ前には `npm run check` を実行します。`npm run check` は CI と同じ検証をまとめて実行する入口です。

**検証は省かず、並べ方だけを変えます。** 段は逐次、段の中は並列です。同じ段の中で 1 つ落ちても残りは止めず、落ちた分をまとめて報告します。実装ループは失敗をまとめて直す方が周回が減るためです。8 コアの機械で逐次と並列を 3 回ずつ交互に実測し、平均 57 秒が 38 秒になりました。

- **安い規約チェックを先の段に置く**のは、それが落ちている状態で重い検証を回しても結果を捨てるだけになるため
- **実 DB を使うテストを 1 レーンに集める**のは、別レーンから同時に同じ DB を叩かせないため

**実装ループの周回中は `npm run check:fast` で回し、フルの `npm run check` はコミット前に 1 回だけ実行します。** 周回ごとに 4〜8 分かかっていたフル検証を 1〜2 分に縮めるためのもので、`check:fast` が通っても `check` を通さずにコミットしません。

- **整形を `check:fast` から外さない。** 外すと整形漏れはコミット前の `check` で初めて見つかり、修正と再レビューの 1 周が増える（実測で 1 回あたり約 9 分、1 スライス 3 段のうち 2 段で起きた）
- **観測点が E2E の子タスクは、コミット前に `npm run check` に加えて `npm run test:e2e` を通す。** E2E は重いため `check` に含めていない（[acceptance-testing](../acceptance-testing/standard.md) の「E2E テスト」）。そのままでは観測点が機械で一度も確かめられないまま収束し、実行したかどうかを担当の申告に頼ることになる

- **ESLint の `--cache` は `check:fast` だけで使う。** ESLint の cache は file 単位の新旧しか見ず、型情報を使う rule が別 file の型変更で結果を変えることを追跡しないため、cache 付きの結果は古くなり得る。判定の権威は cache を使わない `npm run check`（CI も同じ）に置き、`check:fast` は周回中の目安として使う

- 結合テスト（`npm run test:integration`）は `npm run check` に含める。含めていなかった間に、単体テストを通した変更が既存の結合テストを壊していたことに後の子タスクまで気付けなかったため。実 DB が要るが、単体テストの repository 実装が既に実 DB を前提にしているので前提条件は増えない。
- E2E（`npm run test:e2e`）は `npm run check` に含めない。ブラウザと UI のビルドを伴い重いため、CI の専用ジョブと手動実行、および観測点が E2E の子タスクのコミット前（上の「観測点が E2E の子タスクは」）で走らせる。
- Git hooks を導入する場合は、pre-commit に軽い検査（import 境界・型・lint・関連 unit test）、pre-push に `npm run check` を置く。hook を bypass した場合でも CI で必ず同じ違反を検出する。
