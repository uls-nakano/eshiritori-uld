---
name: uld-review
description: Review the uncommitted working-tree changes against the project rules and return findings with severity (critical / major / minor), file, line, description, and a fix suggestion, plus an overall comment. Read-only — never modifies files. Usable standalone or as the review step of the implementation loop, where it must run isolated from the implementation context. Use when the user wants the current changes reviewed, e.g. "/uld-review".
# 日本語訳: 作業ツリーの未コミット変更を規約に照らしてレビューし、severity(critical / major / minor)・ファイル・行・内容・修正提案付きの指摘一覧と全体所感を返すスキル。読み取り専用でファイルは一切変更しない。単体でも、実装ループのレビュー工程としても使える(その場合は実装の文脈から隔離して実行する)。いまの変更をレビューしたいときに使う。
---

# 未コミット変更のレビュー

## Overview

作業ツリーの未コミット変更をレビューし、severity 付きの指摘一覧を返します。実装ループ（`uld-impl` / `uld-impl-fast`）の収束判定に使われるほか、単体でも使えます。

**収束判定に使う場合、レビューは実装の経緯を知らない状態で行うことが品質の生命線です。** 実装者の意図や苦労を知ったうえでのレビューは指摘が甘くなります。受け取ってよい文脈は、タスクの目的・設計メモ・テスト計画・(再レビュー時の)前回の指摘一覧だけです。

## 入力

- **タスクの目的**(この変更が何のためか)
- **設計メモまたは設計要約・テスト計画**(あれば。実装がこれに従っているかも検査対象になる)
- **前回の指摘一覧**(修正後の再レビューの場合)

## 手順

1. `rules/review` を読み、規約に還元できない観点と severity・収束条件の定義を把握する
2. 変更対象に対応する `rules/` のトピック(実装なら development、ドメインモデルなら model-design、テストなら testing など)を読む
3. `git status` と `git diff HEAD` で変更全体を把握する(新規ファイルは直接読む)
4. 手順 2 で読んだトピックの規約と、rules/review の観点で検査する。テスト計画が渡されている場合は、それを満たしているかも確認する
5. 指摘を列挙して返す

## 成果物

指摘 1 件につき次を含めます。問題がなければ「指摘なし」と明言します。

- **ファイル**(リポジトリ相対パス)と**行番号**(特定できる場合)
- **severity**: critical / major / minor(定義は rules/review。critical / major は収束条件を満たさない)
- **内容**と**修正方法の提案**

最後に全体の所感を 1 段落添えます。

## 制約

- **ファイルの変更は一切行わない**(レビューのみ。修正は別の工程の仕事)
- 観点や severity の判断基準を記憶や依頼文から推測せず、必ず rules/review を読んで確認する
