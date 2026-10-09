# eshiritori-uld

絵しりとりを Web 上で遊ぶためのアプリケーションです。**ULD（ULS Loop Development）** の標準プロセスで、要求のヒアリングから実装まで AI と人のループで開発します。

## 開発の進め方

- AI への案内（索引）は [CLAUDE.md](CLAUDE.md)（[AGENTS.md](AGENTS.md) と同一内容）
- 規約は [rules/](rules/README.md)。トピックごとに標準 `standard.md`（uld-kit が配布）と `project.md`（このプロジェクトの追記）
- 目的は [docs/product/](docs/product/)、受け入れ基準は [docs/usecases/](docs/usecases/)、ジャーニーは [docs/journeys/](docs/journeys/)、ドメインモデルと用語集は [docs/domain/](docs/domain/)
- 開発フローの記録（ログ資料）は [.designs/](.designs/README.md)
- 新しい要求は Claude Code で `/uld-impl` から始めます（シナリオ → 設計 → 実装。各フェーズの出口で PR を出し、人が承認してから次へ進む）

## 検証

```bash
npm run db:up        # 初回とコンテナの再起動後（DynamoDB Local の起動と表の作成。実 DB を使うテストの前提）
npm run check        # コミット前・プッシュ前
npm run check:fast   # 実装ループの中
```

内訳は [rules/testing](rules/testing/) にあります。

## uld-kit の版上げ

```bash
npx --yes github:uls-nakano/uld-kit#<tag> init
```

配られたファイル（`uld-kit.lock.json` に載っているもの）はこのリポジトリで直接編集しません（`npm run check:kit` が検出します）。
