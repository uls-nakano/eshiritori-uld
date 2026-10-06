---
name: uld-domain-model
description: Update the domain model docs (docs/domain/) following the notation rules in rules/model-design. The diagrams are design-first — design changes are drawn here before implementation, and domain code changes in each package's domain layer (uld.config.json domainSources) are synced back into the diagrams. Use when domain design is discussed or changed, when domain entities, value objects, domain services, or repository ports are added, changed, or removed in code, or when the user asks to update or fix the domain model diagram.
# 日本語訳: docs/domain/ 配下のドメインモデルドキュメントを rules/model-design の記法ルールに従って更新するスキル。設計先行 — 設計変更はまず図に描いてから実装し、domain 層（uld.config.json の domainSources が指す場所）のコード変更は図に同期する。ドメイン設計の議論・変更時、domain 層コードの追加・変更・削除時、またはユーザーがドメインモデル図の修正を依頼したときに使う。
---

# ドメインモデル図の更新（設計・同期）

## Overview

`docs/domain/` 配下のドメインモデルドキュメントを更新するスキルです。図の記法は `rules/model-design` の「ドメインモデル図ルール」に従います。

ファイル構成は「パッケージごとのフォルダ + 1 境界 = 1 ファイル」です。

- `README.md` — プロジェクト全体の概要（パッケージ一覧・保存の大原則・raw と集約の対応関係）
- `ubiquitous-language.md` — ユビキタス言語の表（ここに集約し、境界のファイルには重複させない）
- `<package>/` — パッケージごとのフォルダ（フォルダ名は `uld.config.json` の `domainSources.packagesDirectory` 配下の package 名と一致させる。`npm run check:model-trace` がこの対応で図と実装を突き合わせる）。`README.md`（パッケージ内の集約俯瞰図）と境界ごとの詳細ファイル（ファイル名は「コードのフォルダ名-日本語の境界名」。例: `pull-request-プルリクエスト集約.md`）。domain 層外の要素（外部システムの raw レコードなど）を図にする場合も同じ形で置き、domain 層外である旨を本文に書く

どのパッケージがあるかは対象リポジトリの `docs/domain/README.md` と `rules/model-design/project.md` を読んで把握する。

ULD は**設計先行**です。更新には 2 方向があります。

- **設計変更 → 図を先に更新**: ドメイン設計の変更はまず図に反映し、実装はあとから追いつく。図がコードより先行している状態は正常
- **コード変更 → 図を同期**: domain 層のコードを変更したら、同じ変更で図も更新する

乖離を見つけたときの正の判断:

- **実装済み要素の記述がコードと食い違う** → コードが正。図を直す
- **図にあってコードにない要素** → 未実装の設計かもしれないので**勝手に削除しない**。git 履歴にコードからの削除痕跡があれば図からも消してよい。判断がつかなければユーザーに確認する

このスキルはドキュメントだけを変更します。domain 層のコードは変更しません。

## 手順

### 1. ルールの確認

`rules/model-design` の「ドメインモデル図ルール」（共通・俯瞰図・詳細図）を読み、記法を把握する。

### 2. 実装の棚卸し

各パッケージの domain 層（`uld.config.json` の `domainSources`。既定は `packages/<package>/src/domain/`）配下の `.ts`（`.test.ts` を除く）をすべて読み、次を抽出する。

- **境界**: `domain/` 直下のディレクトリ（例: `pull-request`、`shared`）が境界の単位
- **要素と役割**: Entity / Aggregate Root、Value Object、Domain Service、Repository port、入力型
- **論理名**: 各 class・property・method の日本語 JSDoc コメントの表現（図の論理名はこれに合わせる。図側を先に改名した場合は実装同期時に JSDoc を追従させる旨を報告する）
- **属性・操作**: private property、factory（`create` / `restore` などの static メソッド）、getter、メソッド
- **不変条件**: factory 内の検証ロジック（何を拒否し、どの `ErrorCode` を throw するか）
- **関連と多重度**: property の保持関係（コンポジション）、戻り値・引数の依存関係、配列は `0..*`、nullable は `0..1`、固定数の列挙は実数（例: 分類 5 値）

### 3. 現行ドキュメントとの差分特定

`docs/domain/` 配下のドキュメント（README・ユビキタス言語・境界ごとの詳細）を読み、実装との差分を列挙する。

- 図にない新規クラス / 図にだけ存在するクラス（後者は未実装の設計の可能性あり — Overview の判断基準に従う）
- 属性・操作・論理名・多重度・不変条件の相違
- 境界の増減（新しい集約・モデル群の追加など）

### 4. ドキュメントの更新

差分に応じて次を更新する。ファイル構成（Overview 参照）は「パッケージごとのフォルダ + 1 境界 = 1 ファイル」を維持する。

- **集約俯瞰図**（パッケージ README の `classDiagram`）: そのパッケージの domain 層の集約・モデル群の間の静的な関係だけを書く。集約ルートと境界をまたぐ要素のみ・属性操作なし・ステレオタイプは「役割 / 所属境界」。domain 層外の要素（外部システム・取り込みレコード）や Repository port は書かない
- **境界ごとの詳細ファイル**: `classDiagram`（論理名・物理名併記、ステレオタイプ、多重度付き関連、他境界クラスは簡略表記）と、責務・不変条件の説明文・表
- **色分け**: すべての図でクラスを種類ごとに `style` 文で色分けする（配色は `rules/model-design` 参照）
- **テーマ指定**: 新しい mermaid ブロックを足したら、先頭に既存の図と同じテーマ指定行（`%%{init: ...}%%`）を置く。実体は `node scripts/uld/uld.mjs check-model-trace` の script（`scripts/uld/commands/check-model-trace.mjs`）が持つ `themeDirective`。これが無いとダークテーマで文字と関連線が読めなくなる
- **ユビキタス言語の表**（`ubiquitous-language.md`）: 新しいドメイン用語の追加、消えた用語の削除
- 新しい境界を追加した場合は、詳細ファイルを新設し、パッケージ README の俯瞰図とリンク一覧にも追加する。新しいパッケージを追加した場合は、フォルダと README を新設し、プロジェクト README のパッケージ一覧にも追加する

### 5. 検証と報告

**目視だけで済ませず、必ず mmdc で全図のレンダリングを検証する。**

```bash
for md in docs/domain/*.md docs/domain/*/*.md; do
  awk -v base="$(basename "$md" .md)" '/^```mermaid$/{n++; f=1; next} /^```$/{f=0; next} f{print > ("/tmp/diagram-" base "-" n ".mmd")}' "$md"
done
for f in /tmp/diagram-*.mmd; do
  mmdc -i "$f" -o "${f%.mmd}-light.png" -b white --quiet \
    && mmdc -i "$f" -o "${f%.mmd}-dark.png" -t dark -b '#1e1e1e' --quiet \
    && echo "$f: OK" || echo "$f: NG"
done
```

目視が済んだら後片付けする。

```bash
rm -f /tmp/diagram-*.mmd /tmp/diagram-*.png
```

- `mmdc` が chrome-headless-shell 不足で失敗する場合は、エラーメッセージのバージョンを使って `npx -y @puppeteer/browsers install chrome-headless-shell@<version> --path ~/.cache/puppeteer` でインストールしてから再実行する
- NG が出たら該当図を修正して再検証する。よくある原因は「Mermaid classDiagram の落とし穴」参照
- 生成した PNG をライトテーマ・ダークテーマの両方で目視し、クラス内の文字・関連線・多重度ラベルが読めることを確認する（読めない場合はテーマ指定行の欠落を疑う）。`-t dark` を外すと閲覧環境のダークテーマを再現できず、この確認は意味を失う
- 図の論理名とソースコードの JSDoc の用語が一致しているか確認する（図が先行改名した場合は乖離をユーザーに報告する）
- 変更内容の要約（追加・変更・削除したクラスと図）を報告する

## Mermaid classDiagram の落とし穴

実際にパースエラー・表示崩れを起こした事例。生成時・修正時に必ず守る。

- **関連ラベルに半角コロン `:` を入れない**。`: 判定結果（1 PR : 1 分類）` の 2 つ目の `:` が別ラベルと解釈されてパースエラーになる。「1 PR につき 1 分類」のように言い換える
- **関連は 1 行につき 1 本**。行が連結されると `Expecting 'NEWLINE', got 'LABEL'` になる。一括置換（特に行末文字列の置換）のあとは行が連結されていないか grep で確認する
- **色分けは `style` 文だけを使う**。`classDef` / `:::` / `cssClass` はレンダラーによって効かない
- static factory の classifier `$` は行末に置く（`+create(value) RepoId$`）

## 注意事項

- 未実装ステータス（【設計】ラベルなど）は図に書かない。見つけたら削除する
- CLAUDE.md や README に記載のドメインオブジェクト一覧が実装と乖離している場合は、修正せずユーザーに報告する
- ドキュメントの言語は日本語、識別子は英語（`rules/naming` の「言語の使い分け」に従う）
- 図が読みづらくなるほど要素が増えた場合は、境界（詳細図）の分割を提案する
