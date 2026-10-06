---
name: uld-task-design
description: Create the implementation design for one child task — investigate the existing code, rules, and domain model, then produce a design memo covering approach, affected files, domain model impact, test plan, and risks. No file changes other than the memo. Usable standalone or as the design step of the implementation loop. Use when the user wants a task designed before implementing, e.g. "/uld-task-design 1.2.1".
# 日本語訳: 子タスク 1 件の実装設計を作るスキル。既存コード・規約・ドメインモデルを調査し、実装方針・影響ファイル・ドメインモデルへの影響・テスト計画・リスクをまとめた設計メモを成果物として出す。メモ以外のファイル変更は行わない。単体でも、実装ループの設計工程としても使える。実装前にタスクの設計だけ作りたいときに使う。
---

# 子タスクの実装設計

## Overview

**子タスク 1 件**の実装設計を作り、設計メモとして書き出します。実装ループ（`uld-impl` / `uld-impl-fast`）の設計工程として呼ばれるほか、単体でも使えます(設計だけ先に見たい・レビューしたい場合)。

上流の設計フェーズ(モデル・OpenAPI・ERD)とは別物です。ここで作るのは、確定済みの上流設計を前提とした**実装の作戦**です。

## 入力

- **タスク**: タスク説明の文字列、またはタスク ID(例: `1.2.1`)。ID の場合は対応する `.designs/REQ-xxx/UC-yy/tasks.md`(索引。設計フェーズで段数と束ね方が確定している)を読み、そのタスクの「観測点」「変更ファイル」「入力」「外す(未実装)ID」「要件・シナリオ」と「束ね方の判断」から説明を組み立てる。実装方針・テスト項目・完了条件は索引に無く、このスキルが決める
- **設計メモの出力先**: 呼び出し元の指定があればそれに従う。無ければ、タスク ID 付きのタスクは `.designs/REQ-xxx/UC-yy/impl/<taskId>-design.md`、採番のない作業は一時的な作業ファイル

## 手順

1. 変更対象に応じた `rules/` のトピックを読む(対応表は `rules/README.md`。呼び出し元が読むトピックを指定していればそれに従い、全トピックを読み直さない)
2. タスク説明が挙げる入力ファイルと、その周辺の既存コードを調査し、現状の構造を把握する。`docs/architecture/` は層の置き場を決めるときだけ、`docs/domain/`(README.md 含む)は domain を変えるタスクだけ読む
3. 変更が必要なパッケージ・レイヤー・ファイルを特定する
4. ドメインモデルへの影響(Entity / VO / Domain Service / Repository port の追加・変更)を整理する
5. タスクが利用者から見える振る舞いを追加・変更する場合、`docs/usecases/` の対応するユースケースと受け入れ基準 ID を特定する(記述の新設・追記が必要ならその旨も設計メモに含める。書き方は `rules/documentation` の「ユースケース記述の書き方」)
6. TDD 前提のテスト計画を立てる(何をどのレベル unit / integration / contract でテストするか、domain / application のカバレッジ 100% 要件の満たし方)
7. 設計メモを出力先に書き出す

## 設計メモの構成

次の 5 セクションを必ず含めます。後工程(実装・レビュー)はこのメモだけを読んで動けることが完了条件です。**タスク説明や tasks.md に書いてあることは写しません**(メモが長くなるだけで、写した先が古くなると設計と索引が食い違う)。書くのは、そこに無い判断・確定した影響ファイル・テスト計画・リスクです。該当なしのセクションは 1 行で済ませます。

1. **実装方針** — レイヤーごとの変更内容、追加・変更するクラスや関数、処理の流れ
2. **影響ファイル** — 追加・変更が必要なファイルのパス一覧(新規ファイル含む)。**この変更で古くなる生き資料（`docs/usecases/` `docs/journeys/` `docs/domain/` `docs/architecture/` `docs/product/`）もここに挙げる。** 同期を後続タスクや最後の「ドキュメント同期」へ送らない（`rules/branch` の「子タスクの単位は 1 観測点」）。古くなるものが無いなら「生き資料の同期は不要」と理由付きで明記する
3. **ドメインモデルへの影響** — なければ「なし」と明記
4. **テスト計画** — 何をどのレベルでテストするか。対応する受け入れ基準 ID(`docs/usecases/`)があれば挙げる
5. **リスク・注意点** — なければ「なし」と明記

## 制約

- 設計はこのリポジトリの既存パターン(factory メソッド、Repository port、route-table 方式など)に沿わせる
- **設計メモ以外のファイル変更は一切行わない**(読み取り・調査のみ)
- 規約をプロンプトや記憶から推測せず、必ず `rules/` のファイルを読んで確認する
