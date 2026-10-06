# 開発ルール（標準）

> 標準 v0.1。ULD（ULS Loop Development）の標準ルールで、uld-kit から配布されます。プロジェクト固有の追記・上書きは同じフォルダの `project.md` にあります。

実装コードを書くときのルールです。層の責務・依存方向・import 境界の機械チェックは [architecture](../architecture/standard.md) を参照してください。

## 基本方針

- TDD を標準の開発手順とする。手順は [testing](../testing/standard.md) を参照する。
- Clean Architecture を採用する。層の責務と依存方向は [architecture](../architecture/standard.md) を参照する。
- ドメインモデルはオブジェクト指向で実装する。設計ルールは [model-design](../model-design/standard.md) を参照する。
- Entity、Value Object、Domain Service、Use Case、Adapter の責務を混ぜない。
- 1 クラス 1 `.ts` ファイルを原則とする。
- 1 クラスは 1 つの責務だけを持つ。

### 実装順序

- 実装は **domain → application → adapter → presentation のボトムアップ**で進め、各層で単体テストを通してから次の層へ進む。
- 意図は、ロジックを domain 側に書かせること。domain から実装して単体テストを通すと、後続層は「すでに domain にある判断」を呼ぶしかなくなり、ドメインモデルが CRUD の入れ物になるのを防げる。
- 垂直スライスで進める: fixture → ドメインモデル → ユースケース → アダプター → UI。
- API 契約の早期確定は、実装順序ではなく OpenAPI 起点の運用（specification を先に更新してから生成）で担保する。
- 機能スライスの実装中に広範なリファクタリングをしない。

## コーディングルール

- TypeScript は strict mode を前提にし、型推論に頼りすぎず公開 API には明示的な型を付ける。
- `interface` と `type` のどちらでも表現できる公開契約では、拡張性が必要な場合は `interface` を優先する。
- 外部から取得した raw の payload type と、正規化済みの domain type を分ける。
- 外部から取得した raw の記録は解釈を加えず保存し、判断（分類・集計）はそこから何度でも再実行できる形にする。再実行で raw を上書きしない。
- 判断結果には、その判断に至った理由（reason）を説明用に持たせる。
- 集計やグルーピングは決定的なコードで行う。LLM などの非決定的な手段は意味分類にだけ使う。
- live API call より先に fixture を使う。
- グローバルな service object より、小さな adapter を優先する。
- 用語・指標の定義を変えるときは、定義のドキュメントを先に更新する（[documentation](../documentation/standard.md)）。定義は、コード・テスト・ドキュメントの距離を近く保つ。
- 命名と言語（識別子・コメント・テスト名）のルールは [naming](../naming/standard.md) を参照する。

## Logger ルール

- プロジェクト全体で使うログ出力は、共通 logger を通す。処理側では `getLogger().error(...)` のように共通の取得口から直接呼び出し、実装クラスへ直接依存する箇所を増やさない。
- logger の公開契約は `Logger` interface として定義し、interface・共通 facade・実装クラス（console 出力・メモリ蓄積など）は責務ごとに別ファイルに分ける（1 クラス 1 `.ts` ファイル）。
- テストや検証でログを配列に蓄積したい場合は、手書きの object literal logger を各テストに作らず、共通のメモリ蓄積実装を使う。
- error log の stack trace は logger 内部で補い、各処理側で stack を組み立てない。呼び出し元の処理位置が分かるように logger 内部の frame は除外し、context に既に `stack` があれば上書きしない。

## Factory ルール

- ID や時刻などの生成を伴う新規作成は `generate` または `createXxx` の factory method に寄せる。
- `generate` は、Value Object 自身の値を新しく生成する場合に使う。
- `createXxx` は、特定の役割や初期状態を持つ Entity を新規作成する場合に使う。
- Create 系 factory で新規作成する場合は、内部で必要な ID を生成する。
- 既存 ID や永続化済みデータから復元する場合は、新規生成 factory を使わず、復元用 factory または constructor を使う。
- 検証は constructor ではなく factory に置く。

## Repository / Use Case ルール

- Repository port は集約単位の domain object を返す。DB record、fixture record、OpenAPI DTO、read model、response shape を返してはいけない。
- トランザクション境界は application use case 層で開始する。repository 実装の内部でトランザクションを張らない。複数書き込みの原子性やチャンク分割の判断は use case が持つ。
- repository 実装には素の DB client か、use case が張ったトランザクションの tx client を渡す。
- Repository port の戻り値に対応する集約が domain に存在しない場合は、先に Entity/Value Object と不変条件を定義してから repository port を作る。
- Repository implementation は外部 record を domain 集約へ復元する責務を持つ。変換が大きくなる場合は mapper に分離する。
- Application use case は取得 → 判断 → 保存の編成（オーケストレーション）に徹する。raw payload や外部データの解釈・判断ロジック（フィールドの読み取り規則、null の意味づけ、種別判定など）を use case に書かず、Domain Service や Entity / Value Object に集約する。例: 外部 payload の日時フィールドから「マージ済みか」を読み取る規則は、use case のヘルパー関数ではなく Domain Service に置く。
- **識別子の組み立て規則を use case に書かない。** 接頭辞・区切り・書式のような「その識別子がどう作られるか」の知識は、その識別子を持つドメインオブジェクト側の factory に置く。use case で文字列を組み立てると、同じ規則が呼び出し側ごとに散り、片方だけ変わっても機械では気づけない。例: 由来ごとに接頭辞を付けた ID を `` `review:${id}` `` のように use case で作らず、その ID を持つ Entity の factory に作らせる。
- Application use case は repository port から受け取った集約を使ってユースケースを実行し、外側へ返す値は application DTO に変換する。
- Application use case は domain 集約を presentation/API 層へそのまま返さない。
- API controller/presenter は OpenAPI 生成型と application DTO の境界変換だけを担当し、domain rule を再実装しない。

## エラーハンドリングルール

- ドメイン上の失敗は共通の DomainError と ErrorCode で表現する。
- DomainError は安定した `code` / `errorCode` と、調査やログで使う `detail` 文字列を保持する。
- ErrorCode は UI の多国語表示文から独立した英語 snake_case の識別子にする。
- API のエラー response は表示文ではなく `code` と `detail` を返す。画面は `code` を多国語対応の文言へマップする。
- DomainError の `detail` は API や調査で扱う安定した英語の説明にする。
- DomainError 自体はログを出力しない。例外を throw する直前の各処理で、原因となった入力値や集計値を logger に出力する。
- 例外を throw する前に出す error log の message は日本語にする。
- error log の context には、その分岐に入った原因を調査するための変数値だけを入れる。
- error log の context には、コード行や message から分かる `packageCode`、`errorCode`、`detail` を重複して入れない。
- log message と DomainError detail を共有するためだけの `detail` などの一時変数は作らず、必要な値をそれぞれ直接渡す。
- DomainError にログ専用の `causeData` のような未使用 property を追加しない。
- 成功/失敗を戻り値で扱う箇所では Result 型を使い、`isSuccess` / `isFailure` のような型ガードで分岐する。
- Result の内部 property に直接依存する分岐は避ける。
- JSON parse error と値の validation error を混ぜない。壊れた JSON や必須 body の欠落は専用の invalid JSON 系エラーコードで扱う。
- Application use case で予期しない例外を捕捉する場合は、外へそのまま再 throw せず、DomainError または application error に変換する。
- クライアントへ返すエラー情報は最小限にし、詳細な原因は構造化ログや reason/context に残す。

## Adapter / Mapper ルール

- 外部 payload、DB record、OpenAPI DTO、ViewModel を domain object と混ぜない。
- DTO 定義、mapper、repository implementation は責務を分ける。
- Repository implementation 内で ad hoc な inline DTO や inline domain 変換を増やさず、専用 mapper に委譲する。
- Mapper は fixture または contract test で単独検証できるようにする。
- 外部入力を DTO として扱う前に runtime validation または型ガードを通す。

## API 生成

- API request/response 型を手書きしない。
- API 型、API client、server contract は生成物を使い、手書きで重複定義しない。
- API request/response を変更するときは、必ず OpenAPI specification を先に更新する。

## Lint ルール

- TypeScript/React には ESLint を使う。
- formatting には Prettier または同等の formatter を使う。
- import order、unused import、unused export、循環依存、境界違反を検出する。
- `any`、unsafe cast、non-null assertion は原則禁止する。必要な場合は理由をコメントに残す。
- lint disable は原則禁止する。必要な場合は、理由が分かる最小範囲の inline disable だけを許可する。
- Markdown は可能なら markdownlint などで lint する。
- 生成コードは手編集せず、lint 対象から除外するか生成専用設定で扱う。生成コードの lint error は手編集で直さず、generator 設定または除外設定で解決する。
- `npm run lint:fix` は自動修正だけに使い、修正後は必ず `npm run lint` を通す。
- lint 違反は build error として扱い、CI と pre-commit/pre-push で検出する。
