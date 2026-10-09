---
name: uld-scenario-review
description: Review the scenario-phase artifacts of one requirement (.designs/REQ-xxx/) — fidelity to the requester's hearing answers, decisions invented without being flagged for business confirmation, two-way mapping between acceptance criteria and scenarios, reachable preconditions and numbers, dependencies between migration units, testable EARS criteria without implementation vocabulary, and template conformance — and return findings with severity, file, line, description and fix suggestion. Read-only. Must run in a context isolated from the author's. Use as the review step of uld-scenario, or standalone, e.g. "/uld-scenario-review REQ-001".
# 日本語訳: 要求 1 件のシナリオフェーズの成果物（.designs/REQ-xxx/）をレビューするスキル。ヒアリング回答への忠実さ、業務側の確認に回さず AI が決めた事項、受け入れ基準とシナリオの双方向の対応、前提と数値が到達可能か、移行単位の依存、EARS の判定可能性と技術語彙の混入、テンプレート準拠を検査し、severity・ファイル・行・内容・修正提案つきの指摘を返す。読み取り専用。書き手と隔離した文脈で実行する。uld-scenario のレビュー工程として、または単体で使う。
---

# シナリオ成果物のレビュー

## Overview

シナリオフェーズの成果物を、シナリオ PR に出す前に検査します。シナリオ集は設計フェーズのシナリオ整合チェックの正解データになり、結合テストにそのまま流用されるため、**ここで見逃した矛盾は設計と実装の全段に相続されます。**

**書き手の経緯を知らない状態で行うことが品質の生命線です。** 受け取ってよい文脈は REQ のフォルダの場所と、（再レビュー時の）前回の指摘一覧だけです。

## 入力

- **REQ のフォルダ**（`.designs/REQ-xxx-<要求名>/`）
- **前回の指摘一覧**（再レビューの場合）

## 手順

1. `rules/review`（severity と収束条件）、`rules/design-records`（テンプレートとヒアリングの回答）、`rules/documentation`（ユースケースの書き方）を読む
2. `request.md` と REQ の `hearing.md`、全移行単位の `hearing.md` を読み、**依頼者の回答だけ**を一覧にする（AI が書いた推奨は回答ではない）
3. 次の観点で `plan.md` と各移行単位の `usecase.md` `scenarios.md` `mockups/` を検査する

| 観点 | 見ること |
| --- | --- |
| 回答への忠実さ | 受け入れ基準・シナリオが回答と矛盾していないか。回答で選ばれなかった選択肢を採っていないか |
| 決めていない事項 | 回答から決まらない値・振る舞いを、提案値の一覧にも「業務側の確認」にも回さずに確定させていないか。回答で新しく生じた論点（例: 中心となる端末から来る切断・権限を持つ人の不在）に行き先があるか |
| 双方向の対応 | 全シナリオが実在する受け入れ基準を指しているか。全受け入れ基準が少なくとも 1 つのシナリオで確かめられるか。`plan.md` のシナリオ ID の範囲がファイルと一致するか |
| 到達可能性 | 前提の状態が、ゲーム・業務の進行から実際に到達できるか（回数・得点・順番・時刻の算術が合うか）。境界値の例が境界ちょうどの値になっているか |
| 移行単位の依存 | シナリオの期待結果が、他の移行単位で定義する規則に依存していないか。依存するなら `plan.md` の依存に書かれているか |
| 判定可能性 | 受け入れ基準が EARS の形で、合格・不合格を客観的に判定できるか。非機能要件が数値か判定可能なルールか。基準どうしが矛盾していないか |
| 観客 | `usecase.md` に技術の語彙（基盤・DB・通信方式・クラス）が混ざっていないか |
| テンプレート | 埋め忘れのプレースホルダが無いか。空のまま残してよいのは、依頼者が埋める回答欄と「業務側の確認」欄だけ |

4. 指摘を列挙して返す

## 成果物

指摘 1 件につき次を含めます。問題がなければ「指摘なし」と明言します。

- **ファイル**と**行番号**（特定できる場合）
- **severity**: critical / major / minor（定義は `rules/review`）。回答との矛盾・到達できない前提・行き先の無い論点・書かれていない依存は major 以上にする
- **内容**と**修正方法の提案**。業務側の判断が要る指摘は、その旨と、依頼者に示す選択肢を添える

最後に全体の所感を 1 段落添えます。

## 制約

- **ファイルの変更は一切行わない**
- 依頼者の回答欄は、空や書式の崩れを見つけても書き換えを提案しない。依頼者に直してもらう旨を指摘する
- 観点や severity の基準を記憶や依頼文から推測せず、`rules/` を読んで確認する
