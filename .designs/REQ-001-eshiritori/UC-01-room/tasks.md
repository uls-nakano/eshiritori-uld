# 実装計画: 部屋に集まってゲームを始める

> 置き場: `.designs/REQ-001-eshiritori/UC-01-room/tasks.md`
> **設計フェーズの成果物**で、実装スタックの**段数と束ね方の索引**です。設計 PR に含め、人は「何段のスタックをどう積むか」だけを見ます（要確認〔設計〕1 件。[rules/branch](../../../rules/branch/project.md) の「フェーズごとの PR と承認」）。
> 各タスクの実装方針・テスト項目・完了条件はここに書きません。実装フェーズの設計メモ（`impl/<タスクID>-design.md`）が持ちます。
> 実装中に束ね方が変わったら、その子タスク PR でこのファイルを更新し、要確認〔予定外〕に載せます。チェックボックスはコミット時に `node scripts/uld/uld.mjs finish-task` が `[x]` にします。

## 概要

| 項目 | 内容 |
| --- | --- |
| 移行単位 | REQ-001/UC-01 |
| 総タスク数（= スタックの段数） | 15 |
| スタックの底 | `task/REQ-001-UC-01/1.1.1-foundation` |
| 生き資料（仕様の正） | `docs/usecases/UC-01-部屋を作って仲間を招く.md`（要件 1〜5）、`docs/usecases/UC-02-招待された部屋に入る.md`（要件 1〜10）、`docs/usecases/UC-03-ゲームを始める.md`（要件 1〜6）、`docs/journeys/E2E-01-仲間と部屋に集まってゲームを始める.md`、`docs/domain/room/`、`docs/architecture/README.md`。OpenAPI は 1.6.1 で起こす |

## 束ね方の判断

- **最初のスライス（ウォーキングスケルトン）なので、土台を最初の段に含める。** リポジトリの検証コマンド（lint・型・単体テスト・import 境界）と shared kernel の `DomainError`・`Result` を 1.1.1 に置き、その単体テストを観測点にする
- **domain は値オブジェクトと集約を 3 段に割った。** 部屋集約の値オブジェクト・集約・port をまとめると 20 ファイルを超えるため。割り方は依存の向きで、package の雛形とエラーコードを持つ段（1.2.1）→ 識別子と改訂番号（1.3.1）→ 集約（1.4.1。描く順番の並べ替えを含む）。どの段も domain の単体テストが観測点になる
- **Logger は domain の段と並べた（1.2.2）。** shared kernel の中で閉じ、room の値オブジェクトと互いの成果物を使わないため
- **DynamoDB の部屋リポジトリは単独の段にした（1.5.1）。** 改訂番号を条件にした保存（同時に入ろうとした 2 人の先着判断、部屋コードの重なり）と、項目と集約の対応という判断を持ち、実 DB に接続する adapter のテストが観測点になるため
- **use case・route・API 契約は、結合テストまで束ねた（1.6.1・1.7.1・1.7.2）。** use case は取得 → 判断 → 保存の受け渡しだけで、単独では人が正しさを判定できないため。ユースケース単位で、受け入れ基準 ID を持つ結合テストを観測点にする
- **1.6.1 は上限 15 を超える（約 25 ファイル）が、割らずに進める。** 最初の API の段に、API 契約の package と生成、`apps/api` の composition root、`tests/` ワークスペースの立ち上げが集まるため。2 段に割る案（サーバーの入口と結合テストの土台 → 部屋を作る API）を示し、依頼者が割らずに進めることを承認した（`hearing.md` の Q4）
- **WebSocket の通知は 2 段に割った（1.8.1・1.9.1）。** 接続の登録と送信（`packages/realtime`）は、接続表への読み書きという adapter の判断を持ち、実 DB の adapter テストで観測できる。通知の配線（publisher・WebSocket の入口・通知の形の契約）は受け渡しだけなので、WebSocket で通知を受ける結合テストまで束ねる
- **UC-02 要件 10（招待 URL を開き直したら待機室に戻る）は画面の組み込み（1.12.1）で外す。** 「参加画面を出さずに待機室を出す」の判断は、ブラウザに保存したトークンとページの配線が持ち、API の結合テストでは観測できないため
- **画面は表示（1.10.1・1.11.1）と組み込み（1.12.1）に分けた。** 表示は component と story、組み込みはページの配線・API と WebSocket の呼び出し・トークンの保存。表示は、`apps/web` と Storybook の立ち上げを含めると 15 を超えるため、入力フォーム（1.10.1）と待機室・ゲーム開始（1.11.1）の 2 段に割った
- **E2E は別の段にした（1.13.1）。**
- **「結合テストへの対応」表（`scenarios.md`）は、結合テストを書いた段が埋める。**
- 新しい package・app を作る段は、`.dependency-cruiser.cjs`（import 境界）と `CLAUDE.md` / `AGENTS.md` の「構成」を同じ変更で更新する。件数に含めている

## タスク

フェーズは domain → application → adapter → presentation のボトムアップ。同一フェーズ内のタスクは互いに依存しない。

### Phase 1: 土台

- [x] 1.1.1 リポジトリの検証コマンドと shared kernel の土台（`DomainError`、`Result`）
  - 観測点: shared kernel の単体テスト
  - 変更ファイル: `package.json`（workspaces・検証コマンド・Prettier の設定）、`package-lock.json`、`tsconfig.base.json`、`eslint.config.js`、`vitest.config.ts`、`.dependency-cruiser.cjs`、`packages/shared-kernel/{package.json,tsconfig.json,src/index.ts,src/DomainError.ts,src/DomainError.test.ts,src/Result.ts,src/Result.test.ts}`、`CLAUDE.md`・`AGENTS.md`（構成）（15 件。うち `package-lock.json` は生成物）
  - 同期する生き資料: `CLAUDE.md` / `AGENTS.md` の「構成」、検証コマンドの内訳が `rules/testing` の「検証コマンド」と食い違えば `rules/testing/project.md`
  - 入力: なし
  - 外す（未実装）ID: なし
  - _シナリオ: なし（土台）_ / _要件: なし_

### Phase 2: domain の値と共通の Logger

- [x] 1.2.1 room package の雛形・エラーコードと、名乗り・周回数・進行状態の値（`Nickname`、`RoundCount`、`RoomStatus`、`RoomErrorCode`、`RoomError`）
  - 観測点: domain の単体テスト
  - 変更ファイル: `packages/room/{package.json,tsconfig.json,src/index.ts}`、`packages/room/src/errors/{RoomErrorCode.ts,RoomError.ts}`、`packages/room/src/domain/room/{Nickname,RoundCount,RoomStatus}.ts` とそれぞれの `.test.ts`、`.dependency-cruiser.cjs`、`package-lock.json`、`CLAUDE.md`・`AGENTS.md`（構成）（15 件）
  - 同期する生き資料: `docs/domain/room/room-部屋集約.md`（実装で図と変わった場合）、`CLAUDE.md` / `AGENTS.md` の「構成」
  - 入力: 1.1.1
  - 外す（未実装）ID: なし
  - _シナリオ: S-01-14、S-01-15、S-01-16、S-01-17_ / _要件: UC-01 要件 4・5、UC-02 要件 8・9 の判断部分_
- [x] 1.2.2 共通の Logger（`Logger`、`getLogger`、`ConsoleLogger`、`MemoryLogger`）
  - 観測点: shared kernel の単体テスト
  - 変更ファイル: `packages/shared-kernel/src/{Logger.ts,getLogger.ts,getLogger.test.ts,ConsoleLogger.ts,ConsoleLogger.test.ts,MemoryLogger.ts,MemoryLogger.test.ts,index.ts}`（8 件）
  - 同期する生き資料: なし
  - 入力: 1.1.1
  - 外す（未実装）ID: なし
  - _シナリオ: なし（土台）_ / _要件: なし_

### Phase 3: domain の識別子と改訂番号

- [x] 1.3.1 部屋コード・プレイヤー識別子・プレイヤートークン・改訂番号と乱数の源（`RoomCode`、`PlayerId`、`PlayerToken`、`Revision`、`RandomSource`）
  - 観測点: domain の単体テスト
  - 変更ファイル: `packages/room/src/domain/random/RandomSource.ts`、`packages/room/src/domain/room/{RoomCode,PlayerId,PlayerToken,Revision}.ts` とそれぞれの `.test.ts`、`packages/room/src/index.ts`（10 件）
  - 同期する生き資料: `docs/domain/room/`（実装で図と変わった場合）
  - 入力: 1.2.1
  - 外す（未実装）ID: なし
  - _シナリオ: S-01-01、S-01-11_ / _要件: UC-01 要件 2 の判断部分_

### Phase 4: domain の集約

- [ ] 1.4.1 部屋集約とメンバー・部屋リポジトリの port（`Room`、`Member`、`RoomRepository`）
  - 観測点: domain の単体テスト
  - 変更ファイル: `packages/room/src/domain/room/{Room,Member}.ts` とそれぞれの `.test.ts`、`packages/room/src/domain/room/RoomRepository.ts`、`packages/room/src/domain/room/fixtures/roomFixtures.ts`、`packages/room/src/index.ts`（7 件）
  - 同期する生き資料: `docs/domain/room/`（実装で図と変わった場合）
  - 入力: 1.2.1、1.3.1
  - 外す（未実装）ID: なし
  - _シナリオ: S-01-01〜S-01-06、S-01-12〜S-01-14、S-01-18、差分確認の 3 件_ / _要件: UC-01〜UC-03 の判断部分_

### Phase 5: adapter（永続化）

- [ ] 1.5.1 DynamoDB の部屋リポジトリと暗号論的な乱数の源（`DynamoDbRoomRepository`、`RoomItemMapper`、`CryptoRandomSource`）とローカルの DynamoDB
  - 観測点: 実 DB（DynamoDB Local）に接続する adapter の単体テスト
  - 変更ファイル: `compose.yaml`（DynamoDB Local）、`packages/room/src/adapters/persistence/{DynamoDbRoomRepository.ts,DynamoDbRoomRepository.test.ts,RoomItemMapper.ts,RoomItemMapper.test.ts,roomTable.ts}`、`packages/room/src/adapters/random/{CryptoRandomSource.ts,CryptoRandomSource.test.ts}`、`scripts/create-tables.ts`、`package.json`（DB の起動・作成コマンド）、`package-lock.json`、`packages/room/package.json`（12 件）
  - 同期する生き資料: `docs/architecture/README.md`（テーブルの設計が「データの保存と期限」と変わった場合）、`rules/testing/project.md`（DB の起動手順）
  - 入力: 1.4.1
  - 外す（未実装）ID: なし
  - _シナリオ: S-01-06（期限の判断に使う時刻の保存）_ / _要件: UC-02 要件 6 の同時参加の判断部分_

### Phase 6: 最初の API

- [ ] 1.6.1 部屋を作る API（OpenAPI の作成と型の生成、`CreateRoom` use case、`apps/api` の composition root とローカル起動、`tests/` ワークスペース）
  - 観測点: 結合テスト `tests/integration/uc-01-create-room.integration.test.ts`
  - 変更ファイル: `packages/api-contract/{package.json,tsconfig.json,openapi.yaml,src/generated/schema.ts,src/index.ts}`、`packages/room/src/application/{CreateRoom.ts,CreateRoom.test.ts,Clock.ts,RoomSnapshotDto.ts}`、`packages/room/src/index.ts`、`apps/api/{package.json,tsconfig.json,src/createApp.ts,src/composition.ts,src/main.ts}`、`tests/{package.json,vitest.config.ts,integration/support/startServer.ts,integration/uc-01-create-room.integration.test.ts}`、`package.json`、`.dependency-cruiser.cjs`、`CLAUDE.md`・`AGENTS.md`（構成）、`package-lock.json`、`scenarios.md`（結合テストへの対応）（約 25 件。**上限 15 を超えるが承認済み**。束ね方の判断を参照）
  - 同期する生き資料: `docs/architecture/README.md`（入口の構成が変わった場合）、`CLAUDE.md` / `AGENTS.md` の「構成」
  - 入力: 1.2.2、1.4.1、1.5.1
  - 外す（未実装）ID: UC-01 要件 1、UC-01 要件 4、UC-01 要件 5
  - _シナリオ: S-01-01、S-01-02、S-01-15、S-01-16、S-01-17_ / _要件: UC-01 要件 1・4・5_

### Phase 7: 入る・始める API

- [ ] 1.7.1 部屋に入る API と部屋の状態を取る API（`JoinRoom`、`GetRoom` use case、route、OpenAPI の追記）
  - 観測点: 結合テスト `tests/integration/uc-02-join-room.integration.test.ts`
  - 変更ファイル: `packages/api-contract/{openapi.yaml,src/generated/schema.ts}`、`packages/room/src/application/{JoinRoom.ts,JoinRoom.test.ts,GetRoom.ts,GetRoom.test.ts}`、`packages/room/src/index.ts`、`apps/api/src/{createApp.ts,composition.ts}`、`tests/integration/uc-02-join-room.integration.test.ts`、`scenarios.md`（結合テストへの対応）（11 件）
  - 同期する生き資料: なし
  - 入力: 1.6.1
  - 外す（未実装）ID: UC-02 要件 2、UC-02 要件 4、UC-02 要件 5、UC-02 要件 6、UC-02 要件 7、UC-02 要件 8、UC-02 要件 9
  - _シナリオ: S-01-03、S-01-04、S-01-06、S-01-11〜S-01-16、差分確認の 1 件（同時参加）_ / _要件: UC-02 要件 2・4〜9_
- [ ] 1.7.2 ゲームを始める API（`StartGame` use case、route、OpenAPI の追記）
  - 観測点: 結合テスト `tests/integration/uc-03-start-game.integration.test.ts`
  - 変更ファイル: `packages/api-contract/{openapi.yaml,src/generated/schema.ts}`、`packages/room/src/application/{StartGame.ts,StartGame.test.ts}`、`packages/room/src/index.ts`、`apps/api/src/{createApp.ts,composition.ts}`、`tests/integration/uc-03-start-game.integration.test.ts`、`scenarios.md`（結合テストへの対応）（9 件）
  - 同期する生き資料: なし
  - 入力: 1.6.1
  - 外す（未実装）ID: UC-03 要件 4、UC-03 要件 5、UC-03 要件 6
  - _シナリオ: S-01-05、S-01-18、差分確認の 1 件（二重の開始）_ / _要件: UC-03 要件 4〜6_

### Phase 8: 接続の管理

- [ ] 1.8.1 WebSocket の接続の登録と送信（`packages/realtime`: `DynamoDbConnectionRegistry`、`LocalWebSocketSender`）
  - 観測点: 実 DB（DynamoDB Local）に接続する adapter の単体テストと、送信 adapter の単体テスト
  - 変更ファイル: `packages/realtime/{package.json,tsconfig.json,src/index.ts,src/DynamoDbConnectionRegistry.ts,src/DynamoDbConnectionRegistry.test.ts,src/LocalWebSocketSender.ts,src/LocalWebSocketSender.test.ts}`、`scripts/create-tables.ts`（接続表）、`.dependency-cruiser.cjs`、`package-lock.json`、`CLAUDE.md`・`AGENTS.md`（構成）（12 件）
  - 同期する生き資料: `CLAUDE.md` / `AGENTS.md` の「構成」、`docs/architecture/README.md`（接続の管理が「ローカルと AWS の構成の対応」と変わった場合）
  - 入力: 1.5.1
  - 外す（未実装）ID: なし
  - _シナリオ: S-01-03、S-01-05（通知の宛先の判断部分）_ / _要件: UC-02 要件 3、UC-03 要件 2 の判断部分_

### Phase 9: 変化の通知

- [ ] 1.9.1 待機室とゲーム開始の通知の配線（`RoomEventPublisher` port と実装、WebSocket の入口、通知の形の契約）
  - 観測点: 結合テスト（WebSocket で通知を受ける）`uc-02-join-room.integration.test.ts` と `uc-03-start-game.integration.test.ts` への追記
  - 変更ファイル: `packages/room/src/application/{RoomEventPublisher.ts,JoinRoom.ts,StartGame.ts}`、`packages/room/src/index.ts`、`packages/api-contract/{openapi.yaml,src/generated/schema.ts}`（通知の形）、`apps/api/src/{RealtimeRoomEventPublisher.ts,webSocketEndpoint.ts,composition.ts,main.ts}`、`tests/integration/support/connectWebSocket.ts`、`tests/integration/{uc-02-join-room,uc-03-start-game}.integration.test.ts`、`scenarios.md`（結合テストへの対応）（14 件。WebSocket サーバーは `packages/realtime` が公開する口を使い、テストの接続は Node の標準の WebSocket を使うため、依存は増やさない）
  - 同期する生き資料: `docs/architecture/README.md`（通知の経路が「操作と通知の経路を分ける」と変わった場合）
  - 入力: 1.7.1、1.7.2、1.8.1
  - 外す（未実装）ID: UC-02 要件 3、UC-03 要件 2、UC-03 要件 3
  - _シナリオ: S-01-03、S-01-04、S-01-05_ / _要件: UC-02 要件 3、UC-03 要件 2・3_

### Phase 10: 画面の土台と入力の表示

- [ ] 1.10.1 `apps/web` の雛形と Storybook、部屋を作る・部屋に入るフォームの表示部品と story（`CreateRoomForm`、`JoinRoomForm`）
  - 観測点: story（play 関数で表示の基準を確かめる）
  - 変更ファイル: `apps/web/{package.json,tsconfig.json,vite.config.ts,index.html,.storybook/main.ts,.storybook/preview.ts}`、`apps/web/src/components/{CreateRoomForm,JoinRoomForm}.tsx` とそれぞれの `.stories.tsx`、`.dependency-cruiser.cjs`、`package-lock.json`、`CLAUDE.md`・`AGENTS.md`（構成）（14 件）
  - 同期する生き資料: `CLAUDE.md` / `AGENTS.md` の「構成」
  - 入力: 1.6.1（API 契約の生成型）
  - 外す（未実装）ID: UC-01 要件 3
  - _シナリオ: S-01-01、S-01-02、S-01-15〜S-01-17（誤りの表示）_ / _要件: UC-01 要件 3_

### Phase 11: 待機室とゲーム開始の表示

- [ ] 1.11.1 待機室とゲーム開始の表示部品と story（`WaitingRoom`、`DrawingOrderView`）
  - 観測点: story（play 関数で表示の基準を確かめる）
  - 変更ファイル: `apps/web/src/components/{WaitingRoom,DrawingOrderView}.tsx` とそれぞれの `.stories.tsx`（4 件）
  - 同期する生き資料: なし
  - 入力: 1.10.1
  - 外す（未実装）ID: UC-01 要件 2、UC-03 要件 1
  - _シナリオ: S-01-01、S-01-05、S-01-18（誤りの表示）_ / _要件: UC-01 要件 2、UC-03 要件 1_

### Phase 12: 画面の組み込み

- [ ] 1.12.1 ページの配線（トップ・`/r/{部屋コード}`）、API と WebSocket の呼び出し、プレイヤートークンの保存
  - 観測点: story（参加画面のページで URL の部屋コードが入力済みになること、トークンを保存済みのブラウザでは待機室が出ること）
  - 変更ファイル: `apps/web/src/{main.tsx,App.tsx}`、`apps/web/src/pages/{TopPage,RoomPage}.tsx` と `RoomPage.stories.tsx`、`apps/web/src/api/{apiClient.ts,apiClient.test.ts,roomSocket.ts}`、`apps/web/src/storage/{playerTokenStore.ts,playerTokenStore.test.ts}`（10 件。画面は 2 つの URL だけなのでルーターのライブラリは使わず、WebSocket もブラウザ標準の API を使うため、依存は増やさない）
  - 同期する生き資料: `docs/architecture/README.md`（画面の配信や URL の構成が変わった場合）
  - 入力: 1.9.1、1.11.1
  - 外す（未実装）ID: UC-02 要件 1、UC-02 要件 10
  - _シナリオ: S-01-03、差分確認の 1 件（招待 URL の開き直しで待機室に戻る）_ / _要件: UC-02 要件 1・10_

### Phase 13: 統合確認（E2E）

- [ ] 1.13.1 E2E-01-01（招待 URL で 1 人を誘って始める）
  - 観測点: E2E
  - 変更ファイル: `tests/e2e/{playwright.config.ts,globalSetup.ts,e2e-01-gather-and-start.e2e.test.ts}`、`tests/package.json`、`package.json`（`test:e2e`）、`package-lock.json`（6 件）
  - 同期する生き資料: なし
  - 入力: 1.12.1
  - 外す（未実装）ID: E2E-01-01
  - _シナリオ: S-01-01、S-01-03、S-01-05_ / _要件: なし（ジャーニー）_

## 品質チェック

索引を設計 PR に出す前に確認します。

- [x] **要件の網羅**: `docs/usecases/UC-01`〜`UC-03` の（未実装）の全 21 ID が、いずれかのタスクの「外す（未実装）ID」に 1 回ずつ現れる（1.6.1: 3、1.7.1: 7、1.7.2: 3、1.9.1: 3、1.10.1: 1、1.11.1: 2、1.12.1: 2）。E2E-01-01 は 1.13.1
- [x] **シナリオの網羅**: `scenarios.md` の全シナリオ（S-01-01〜S-01-06、S-01-11〜S-01-18）と差分確認の 3 件が、いずれかのタスクの `_シナリオ_` に現れる
- [x] **1 観測点 1 タスク**: 全タスクに観測点がある。use case・route は結合テストまで束ねた。E2E は別タスク。画面は表示（1.10.1・1.11.1）と組み込み（1.12.1）に分けた。生き資料の同期だけのタスクは無い
- [x] **規模**: 1.6.1 だけが約 25 件で上限を超えるが、依頼者が割らずに進めることを承認した（`hearing.md` の Q4）。ほかの段は 15 件以内
- [x] **フェーズ内依存の禁止**: 同一フェーズのタスク（1.2.1 と 1.2.2、1.7.1 と 1.7.2）は互いの成果物を入力にしていない
