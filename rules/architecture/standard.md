# アーキテクチャルール（標準）

> 標準 v0.1。ULD（ULS Loop Development）の標準ルールで、uld-kit から配布されます。プロジェクト固有の追記・上書きは同じフォルダの `project.md` にあります。

Clean Architecture とモジュラモノリスの構成原則です。層の責務、依存方向、module 境界、import 境界の機械チェックを定めます。コーディングの作法は [development](../development/standard.md)、ドメインモデルの設計は [model-design](../model-design/standard.md) にあります。

## 依存方向

依存方向は常に外側から内側へ向けます。

```text
presentation -> API 契約（生成型）
composition root -> adapters -> application -> domain
```

- `domain` はどの層にも依存しない。`application` は `domain` にだけ依存できる。
- DB、外部 API、UI framework、ORM などの具体技術は `domain` と `application` に入れない。
- Domain から外部ライブラリに依存しない。
- Domain / Application から API 契約の生成物を import しない。

## 層の責務

### Domain

業務概念を表現します。Entity、Value Object、Domain Service、Repository port（抽象）を置きます。

- 入れてよいもの: 業務上の判断（状態の判定・分類・まとめ方）、純粋な計算、不変条件
- 入れないもの: 外部 API のレスポンス形状、ORM の model、API 契約の schema と生成型、SQL、HTTP request/response
- 種類（Entity / Value Object / Domain Service）ではなく業務概念（境界）ごとにフォルダを分ける

### Application

ユースケースを表現します。Domain object を組み合わせ、外部依存は port として受け取ります。

- port は application に置き、実装は adapters に置く。application は port interface だけを知り、具体技術の実装を知らない
- 入出力は DTO として定義し、domain object を presentation にそのまま返さない
- use case の書き方（編成に徹する・トランザクション境界・DTO 変換）は [development](../development/standard.md) の「Repository / Use Case ルール」に従う

### Adapters

外部データと application / domain の変換、および具体技術の実装を置きます。

- DTO・mapper・repository 実装の分け方と外部入力の検証は [development](../development/standard.md) の「Adapter / Mapper ルール」に従う
- 規模が小さい間は interface adapter と infrastructure を分けず、`adapters/` の下に用途別（persistence・外部 API 名など）のフォルダで置いてよい

### Composition Root

- 具体的な adapter を use case に注入する場所は、独立したアプリ（API サーバーなど）に 1 か所だけ置く
- composition root の route / controller は、API 契約の生成型と application DTO の境界変換だけを担当し、domain rule を再実装しない
- HTTP API は API のアプリにだけ置き、フロントエンドのアプリに API route を置かない
- 結合テストは composition root の組み立てを import して、production と同じ構成を検証する（[acceptance-testing](../acceptance-testing/standard.md)）

### Presentation

- UI は API 契約の生成型だけに依存し、domain rule や集計を再実装せず、API が返した値を表示する

## モジュラモノリス境界

- 業務 module は技術別ではなく業務能力別に切り、各 module の内部に `domain`、`application`、`adapters`、`errors` を持つ
- 他 module の内部 path を直接 import せず、公開 entrypoint（`index.ts`）、application port、API 契約、DTO のいずれかを境界にする
- DB table と外部から取得した raw の所有 module を明確にし、他 module から直接読み書きしない
- 複数 module で共有する最小限の共通物（`DomainError` 基底・Logger・共通 Value Object）は shared kernel に置き、業務 rule・use case・adapter は置かない
- 各 module の `errors/` に module 固有の `ErrorCode` と `DomainError` 継承クラスを置き、継承クラスが固定する `packageCode` と module-local な `errorCode` の組でエラーを識別する

## import 境界の機械チェック

- package 境界と import 可否は、import boundary checker で機械的に検証し、違反時に失敗させる。検証コマンドの入口と CI は必ずこれを含める
- import 境界違反は build failure と同等に扱い、eslint disable や ignore で回避しない
- import 解析だけでは検出しにくい禁止配置（フロントエンドのアプリへの API route など）は、配置を見るスクリプトで別に検出する
- 循環依存を禁止する。テスト側のワークスペースを production コードから import することを禁止する
- 新しい package や module を追加する場合は、docs の境界表と機械チェックの設定を同じ変更で更新する
