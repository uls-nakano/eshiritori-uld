// このファイルは uld-kit が配布するワークフロー script です（`npx --yes github:uls-nakano/uld-kit#<tag> init` が各リポジトリの .claude/workflows/ にコピーします）。
// 変更は uld-kit 側で行い、リポジトリ側では直接編集しません（食い違いは `node scripts/uld/uld.mjs check-kit` が検出します）。
// 依存: 対象リポジトリの package.json に check:fast / check / test:e2e があり、@uls-nakano/uld-kit（uld CLI）が devDependency に入っていること。
export const meta = {
  name: "uld-impl",
  description:
    "ULD 実装フェーズ。設計→実装（check:fast まで）→レビュー→修正を別エージェントで回し、収束したらコミットして PR を積む",
  whenToUse:
    "子タスク 1 件を実装フェーズのループで完了させたいとき。args に { task, taskId, unitDirectory } を渡す（採番のない作業は { task, memoPath }）。工程ごとのモデルとエフォートは models / efforts で上書きできる。",
  phases: [
    { title: "Design", detail: "設計エージェントが設計メモをファイルに書き出す" },
    { title: "Implement", detail: "設計メモに従い TDD で実装し、check:fast を通す" },
    { title: "Review", detail: "レビューエージェントが差分を検査" },
    { title: "Fix", detail: "要修正指摘・チェック失敗を修正し、check:fast を通す" },
    { title: "Test", detail: "収束後にフルの check を 1 回" },
    { title: "Record", detail: "イベントを記録し、収束していれば script でコミットして PR を積む" }
  ]
};

// ---- 入力 ----
// args は { task, taskId, unitDirectory, memoPath, oversizeDecision, models, efforts } のオブジェクト。
// 文字列だけを渡した場合は採番のない作業のタスク説明として扱う。
const input = typeof args === "string" ? { task: args } : args || {};
const task = input.task;
// taskId は .designs/*/tasks.md の {slice}.{phase}.{連番}。土台整備など採番のない作業では省略できる
const taskId = input.taskId || null;
// unitDirectory は tasks.md のある移行単位フォルダ（.designs/REQ-xxx-<slug>/UC-yy-<slug>）。
// 設計メモとイベントログの置き場をここから決める。ワークフロースクリプトはファイルを読めないため、
// 呼び出し側（実行系スキル）が tasks.md を特定して渡す。
const unitDirectory = input.unitDirectory || null;
// 影響ファイルが上限を超えた設計を、人が分割せずに進めると承認した記録（rules/branch の「子タスクの規模」）。
// 承認が無ければワークフローは設計の後で止まり、人の判断を仰ぐ。
const oversizeDecision = input.oversizeDecision || null;
// baseBranch は子タスク PR の base（スタックの 1 段下。底なら develop）。Record の script に渡す。
// 省くと Record エージェントが git の履歴と命名規約から判断する。
const baseBranch = input.baseBranch || null;
// branch は作業ブランチ名。Record の script が「別セッションがブランチを切り替えていないか」を確かめる鍵。
const branch = input.branch || null;

// ---- 工程ごとのモデルとエフォート ----
// 設計とレビューは判断の重い工程なので opus / high に置く。実装と修正は精密な設計メモを前提に
// sonnet で回し、テスト実行と記録は手順どおりに動けばよいので haiku / low にする。
// 既定を script に 1 か所で持ち、args.models / args.efforts で工程ごとに上書きする。
// 上書きで null を渡した工程はセッションのモデル・エフォートを継ぐ。
const DEFAULT_MODELS = {
  design: "opus",
  implement: "sonnet",
  review: "opus",
  fix: "sonnet",
  test: "haiku",
  record: "haiku"
};
const DEFAULT_EFFORTS = {
  design: "high",
  implement: "medium",
  review: "high",
  fix: "medium",
  test: "low",
  record: "low"
};
const models = { ...DEFAULT_MODELS, ...(input.models || {}) };
const efforts = { ...DEFAULT_EFFORTS, ...(input.efforts || {}) };

if (!task) {
  return {
    success: false,
    error:
      "タスク内容が指定されていません。args に { task, taskId, unitDirectory }（採番のない作業は { task, memoPath }）を渡してください。"
  };
}

if (taskId && !unitDirectory) {
  return {
    success: false,
    error:
      "taskId を渡す場合は unitDirectory（tasks.md のある移行単位フォルダ）も渡してください。設計メモとイベントログの置き場を決めるために必要です。"
  };
}

// 設計メモとイベントログの置き場（rules/design-records の「構成」と uld-task-design の「入力」に従う）
const memoPath = taskId
  ? `${unitDirectory}/impl/${taskId}-design.md`
  : input.memoPath ||
    `.designs/reviews/impl-${task.replace(/[^\w-]+/gu, "-").slice(0, 40)}-design.md`;
const eventLogPath = taskId
  ? `${unitDirectory}/events/loop-events.jsonl`
  : ".designs/events/loop-events.jsonl";

// 反復上限。上限に達したら残存指摘と修正履歴を添えて人にエスカレーションする
const MAX_FIX_ROUNDS = 5;

// 子タスクの規模の上限（rules/branch の「子タスクの規模」）。uld.config.json の limits.maxAffectedFiles と同じ値にする
// （ワークフロー script はファイルを読めないため、ここにも置く。食い違うと node scripts/uld/uld.mjs record-loop-event が記録を拒む）
const MAX_AFFECTED_FILES = 15;

// ---- イベント収集 ----
// ループの各段階をイベントとして残し、KPI をここから導出できるようにする。
// ワークフロースクリプトでは現在時刻を取得できないため、フェーズの所要時間は
// 各エージェントに実測させて startedAt / completedAt として受け取る。
// seq・recordedAt・runId・branch・runner・taskId は node scripts/uld/uld.mjs record-loop-event が付与する
// （イベント側に含めると拒否される）ので、ここでは type と固有フィールドだけを持つ。
const events = [];

/** recordEvent はループイベントを 1 件記録します。 */
function recordEvent(type, payload) {
  events.push({ type, ...payload });
}

recordEvent("task_started", { task });

// ---- 工程スキルの参照 ----
// 各工程の手順の実体はツール非依存の工程スキルにある。プロンプトに手順を書き写すと
// スキル本文と二重管理になって乖離するため、参照だけを渡す（rules/skills）。
// 工程スキルは uld-kit の init が .claude/skills/ にコピーしたファイルで、担当エージェントはそのパスを読む。
const SKILL_DESIGN = ".claude/skills/uld-task-design/SKILL.md";
const SKILL_IMPLEMENT = ".claude/skills/uld-implement/SKILL.md";
const SKILL_REVIEW = ".claude/skills/uld-review/SKILL.md";

// ---- 読む規約の指定 ----
// 「rules/ を読んで確認せよ」だけ渡すと、全工程が同じ 10 ファイルを読み直す。工程ごとに必要なトピックを
// 参照で示す（規約本文は書き写さない。rules/skills の「規約をプロンプトに書き写さない」）。変更対象に
// 応じて足すトピックは rules/README.md の対応表で引く。
const RULES_FOR = {
  design:
    "rules/architecture・rules/model-design・rules/testing（テスト計画）と、変更対象に対応するトピック",
  implement: "rules/development・rules/testing・rules/naming と、変更対象に対応するトピック",
  review: "rules/review と、変更対象に対応するトピック",
  fix: "指摘・失敗の該当箇所に対応するトピック（rules/development・rules/testing・rules/naming が基本）"
};

// ---- 時刻の実測指示 ----
// ワークフロースクリプトは現在時刻を取得できない(再開時の再現性を壊すため禁止されている)。
// フェーズごとの所要時間を残すには、各エージェントに自分で時刻を測ってもらうしかない。
const TIMING = `
## 時刻の記録(必須)
作業を始める直前と終えた直後に \`date -u +%Y-%m-%dT%H:%M:%SZ\` を実行し、
その**実測値**を startedAt / completedAt に入れること。推測や概算で書かないこと。
この 2 つの値からループの所要時間を導出するため、測っていない値を入れると計測が濁る。
`;

// ---- このワークフロー固有の制約 ----
const WORKFLOW_CONSTRAINTS = `
## このワークフローの制約
- git commit と git push は Record フェーズの script（uld finish-task）だけが行う。あなたは実行しないこと
- git commit --amend と git push --force はこのワークフローの誰も行わない
`;

// ---- check:fast を工程の完了条件にする指示 ----
// 実装・修正が check:fast まで通してからレビューに渡す。レビューが型エラーや lint を拾って修正ループが
// 1 周増える（実測で 3 回に 1 回）のを、レビューの手前で潰すため。
const CHECK_FAST = `
## 完了条件に含める機械チェック
作業の最後にリポジトリルートで \`npm run check:fast\` を実行し、全通過させてから完了とすること。
失敗が残る場合は根本原因を直す（テストを消す・skip する・閾値を下げるのは禁止）。それでも通せない
失敗だけを checkFastFailures に残し、checkFastPassed を false にして返す。フルの \`npm run check\` は不要。
`;

// ---- スキーマ ----
const TIMED = {
  startedAt: { type: "string", description: "作業開始時刻。date -u +%Y-%m-%dT%H:%M:%SZ の実測値" },
  completedAt: { type: "string", description: "作業完了時刻。date -u +%Y-%m-%dT%H:%M:%SZ の実測値" }
};

// reviewPoints は PR 本文の「要確認」の材料。人だけが判定できる 4 分類（rules/pull-request の「要確認の 4 分類」）を
// 設計と実装の担当がその場で挙げ、Record の script が PR 本文に組み込む。
const REVIEW_POINT_SCHEMA = {
  type: "object",
  properties: {
    category: {
      type: "string",
      enum: ["仕様", "設計", "予定外", "名前"],
      description: "要確認の分類"
    },
    title: { type: "string", description: "太字 1 行の「〇〇をした」。名前の場合は識別子" },
    problem: {
      type: "string",
      description: "課題（何が決まっていなかったか・何が困るか）。名前の場合は意味と選んだ理由"
    },
    solution: {
      type: "string",
      description: "解決（採った判断・捨てた選択肢と理由）。名前の場合は空でよい"
    }
  },
  required: ["category", "title", "problem"]
};

const DESIGN_SCHEMA = {
  type: "object",
  properties: {
    ...TIMED,
    summary: { type: "string", description: "設計の要約(日本語・1〜2 文)" },
    memoPath: { type: "string", description: "書き出した設計メモのリポジトリ相対パス" },
    affectedFiles: {
      type: "array",
      items: { type: "string" },
      description:
        "追加・変更が必要なファイルのパス一覧(新規ファイル含む)。設計メモの「影響ファイル」と同じ"
    },
    hasObservationPoint: {
      type: "boolean",
      description:
        "テスト計画に観測点(人が正しさを判定できるテスト。domain の単体テスト・受け入れ基準 ID 付きの結合テスト・story・E2E)があるか。無ければ後続タスクとの束ね直しを人に提案する"
    },
    observesWithE2e: {
      type: "boolean",
      description:
        "観測点に E2E（tests/e2e の *.e2e.test.ts）を含むか。true ならコミット前のフル検証で npm run test:e2e も通す"
    },
    reviewPoints: {
      type: "array",
      items: REVIEW_POINT_SCHEMA,
      description: "設計で人の判断が要る点（仕様の解釈・設計の選択・新しい名前）。無ければ空配列"
    }
  },
  required: [
    "summary",
    "memoPath",
    "affectedFiles",
    "hasObservationPoint",
    "observesWithE2e",
    "reviewPoints",
    "startedAt",
    "completedAt"
  ]
};

const IMPLEMENT_SCHEMA = {
  type: "object",
  properties: {
    ...TIMED,
    summary: { type: "string", description: "実装内容の要約(日本語)" },
    changedFiles: {
      type: "array",
      items: { type: "string" },
      description: "実際に追加・変更したファイルのパス一覧"
    },
    deviations: {
      type: "string",
      description:
        "設計から逸脱した点とその理由。設計メモの「実装の記録」にも追記済みであること。なければ「なし」"
    },
    checkFastPassed: { type: "boolean", description: "npm run check:fast が全通過したか" },
    checkFastFailures: {
      type: "array",
      items: { type: "string" },
      description:
        "check:fast で通せなかった項目（コマンド・テスト名・エラーの要点）。通過時は空配列"
    },
    reviewPoints: {
      type: "array",
      items: REVIEW_POINT_SCHEMA,
      description:
        "実装で新たに生じた人の判断が要る点（予定になかった変更・新しい名前・実装で決めた設計）。無ければ空配列"
    }
  },
  required: [
    "summary",
    "changedFiles",
    "deviations",
    "checkFastPassed",
    "checkFastFailures",
    "reviewPoints",
    "startedAt",
    "completedAt"
  ]
};

const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    ...TIMED,
    issues: {
      type: "array",
      description: "検出した問題の一覧。問題がなければ空配列",
      items: {
        type: "object",
        properties: {
          file: { type: "string", description: "問題のあるファイルのリポジトリ相対パス" },
          line: { type: "number", description: "該当行番号(特定できる場合)" },
          severity: {
            type: "string",
            enum: ["critical", "major", "minor"],
            description:
              "定義は rules/review。critical / major は収束条件を満たさない、minor は任意対応"
          },
          description: { type: "string", description: "問題の内容(日本語)" },
          suggestion: { type: "string", description: "修正方法の提案" }
        },
        required: ["file", "severity", "description"]
      }
    },
    overallComment: { type: "string", description: "レビュー全体の所感(日本語)" }
  },
  required: ["issues", "overallComment", "startedAt", "completedAt"]
};

const TEST_SCHEMA = {
  type: "object",
  properties: {
    ...TIMED,
    passed: { type: "boolean", description: "指示された検証コマンドが全て成功したか" },
    failures: {
      type: "array",
      items: { type: "string" },
      description:
        "失敗した項目ごとの内容。コマンド名・失敗したテスト名/ファイル・エラーメッセージの要点を含める。成功時は空配列"
    },
    coverageNote: {
      type: "string",
      description: "カバレッジ閾値(domain/application 100%)に関する特記事項。なければ「なし」"
    }
  },
  required: ["passed", "failures", "startedAt", "completedAt"]
};

const FIX_SCHEMA = {
  type: "object",
  properties: {
    ...TIMED,
    summary: { type: "string", description: "修正内容の要約(日本語)" },
    fixedItems: {
      type: "array",
      items: { type: "string" },
      description: "対応した指摘・テスト失敗の一覧"
    },
    skippedItems: {
      type: "array",
      items: { type: "string" },
      description: "対応しなかった指摘とその理由。なければ空配列"
    },
    changedFiles: {
      type: "array",
      items: { type: "string" },
      description: "修正で追加・変更したファイルのパス一覧"
    },
    checkFastPassed: { type: "boolean", description: "npm run check:fast が全通過したか" },
    checkFastFailures: {
      type: "array",
      items: { type: "string" },
      description: "check:fast で通せなかった項目。通過時は空配列"
    },
    reviewPoints: {
      type: "array",
      items: REVIEW_POINT_SCHEMA,
      description: "修正で新たに生じた人の判断が要る点。無ければ空配列"
    }
  },
  required: [
    "summary",
    "fixedItems",
    "skippedItems",
    "changedFiles",
    "checkFastPassed",
    "checkFastFailures",
    "reviewPoints",
    "startedAt",
    "completedAt"
  ]
};

const ESCALATION_SCHEMA = {
  type: "object",
  properties: {
    ...TIMED,
    diagnosis: {
      type: "string",
      description:
        "なぜ収束しなかったかの診断(日本語)。残存指摘の共通点や、修正が堂々巡りになった箇所を具体的に書く"
    },
    interpretation: {
      type: "string",
      enum: ["task_decomposition", "specification", "implementation"],
      description:
        "第一解釈。task_decomposition=子タスクの詳細度不足(既定の第一候補) / specification=仕様が曖昧 / implementation=実装だけの問題"
    },
    sendBackTo: {
      type: "string",
      enum: ["task_breakdown", "design_phase", "scenario_phase", "implementation_loop"],
      description:
        "戻し先。task_breakdown=実装フェーズ内でタスク分割をやり直す(人の承認は不要) / design_phase=モデル・OpenAPI・ERD から直す / scenario_phase=仕様から直す / implementation_loop=実装だけ直す"
    },
    recommendedBranch: {
      type: "string",
      enum: ["retry", "skip", "abort"],
      description:
        "推奨する分岐。retry=このタスクだけやり直す / skip=保留にして先へ(依存タスクも止まる) / abort=この親タスクを中断する"
    },
    reason: { type: "string", description: "その分岐を推奨する理由(日本語)" }
  },
  required: [
    "diagnosis",
    "interpretation",
    "sendBackTo",
    "recommendedBranch",
    "reason",
    "startedAt",
    "completedAt"
  ]
};

const RECORD_SCHEMA = {
  type: "object",
  properties: {
    eventsAppended: { type: "number", description: "イベントログに追記した件数" },
    committed: { type: "boolean", description: "コミットしたか" },
    commitSubject: {
      type: "string",
      description: "コミットの件名。コミットしていない場合は「なし」"
    },
    branch: { type: "string", description: "作業していたブランチ名" },
    baseBranch: {
      type: "string",
      description:
        "この子タスク PR の base ブランチ(スタックの 1 段下)。PR を作っていない場合は「なし」"
    },
    pullRequestUrl: {
      type: "string",
      description: "作成した子タスク PR の URL。作っていない場合は「なし」"
    },
    note: { type: "string", description: "特記事項(script が止まった理由など)。なければ「なし」" }
  },
  required: [
    "eventsAppended",
    "committed",
    "commitSubject",
    "branch",
    "baseBranch",
    "pullRequestUrl",
    "note"
  ]
};

/** agentOptions は工程名からモデルとエフォートを組み立てます。null に上書きされた工程はセッションの設定を継ぎます。 */
function agentOptions(stage, options) {
  return {
    ...options,
    ...(models[stage] ? { model: models[stage] } : {}),
    ...(efforts[stage] ? { effort: efforts[stage] } : {})
  };
}

// ---- Phase 1: 設計 ----
phase("Design");
log(`タスク: ${task}`);

const design = await agent(
  `あなたは設計担当エージェントです。工程スキル ${SKILL_DESIGN} を読み、その手順に従って以下のタスクの設計メモを作成してください。

## タスク
${task}
${taskId ? `\nタスク ID: ${taskId}（索引は ${unitDirectory}/tasks.md。段数と束ね方は設計フェーズで人が見て確定済み）` : ""}

## 設計メモの出力先
${memoPath}
（このパスに書き出すこと。フォルダが無ければ作る。スキルの 5 セクションを必ず含める）

## 読む規約
${RULES_FOR.design}。それ以外のトピックは変更対象に関係するときだけ読む

## 制約
- 設計メモ以外のファイル変更は一切行わないこと（読み取り・調査のみ）
- tasks.md やタスク説明に書いてあることを写さない。メモに書くのは、それらに無い判断・影響ファイルの確定・テスト計画・リスク
- 人の判断が要る点（仕様の解釈・設計の選択・新しい名前）は reviewPoints に分類付きで返す。PR 本文の要確認になる
${TIMING}${WORKFLOW_CONSTRAINTS}`,
  agentOptions("design", { label: "design", phase: "Design", schema: DESIGN_SCHEMA })
);

if (!design) {
  return {
    success: false,
    error: "設計エージェントが結果を返しませんでした。ワークフローを中断します。",
    events
  };
}
log(
  `設計完了: ${design.summary}（影響 ${design.affectedFiles.length} ファイル、メモ ${design.memoPath}）`
);

// 影響ファイルが上限を超えたら、実装に入らずここで止める。分割するか、分割せずに進めるかは人の判断
// （rules/branch の「子タスクの規模」）。承認は呼び出し側が args.oversizeDecision で渡して再開する。
if (design.affectedFiles.length > MAX_AFFECTED_FILES && oversizeDecision === null) {
  return {
    success: false,
    needsUserDecision: "oversize",
    design,
    memoPath: design.memoPath,
    note: `影響ファイルが ${design.affectedFiles.length} 件で上限 ${MAX_AFFECTED_FILES} を超えています。設計メモを読んで分割案を人に提示してください。分割せずに進める承認を得たら、同じ args に oversizeDecision: "approved_by_user" を足して再開してください（設計の結果はキャッシュから再利用されます）。`,
    events
  };
}

// 観測点の無いタスク（検証するテストが後続タスクにしか無い）は、単独の PR にすると人が正しさを
// 判定できない（rules/branch の「子タスクの単位は 1 観測点」）。束ね直しの判断は人に委ねる。
if (!design.hasObservationPoint) {
  return {
    success: false,
    needsUserDecision: "no_observation_point",
    design,
    memoPath: design.memoPath,
    note: "設計メモのテスト計画に観測点がありません。後続タスクとの束ね直しを人に提案してください。生き資料の同期だけのタスクなら、束ね直しではなく、古くする変更を入れた段に同期を戻すのが正しい直し方です（rules/branch の「子タスクの単位は 1 観測点」）。",
    events
  };
}

recordEvent("design_completed", {
  summary: design.summary,
  affectedFileCount: design.affectedFiles.length,
  ...(oversizeDecision ? { oversizeDecision } : {}),
  startedAt: design.startedAt,
  completedAt: design.completedAt
});

// ---- Phase 2: 実装（check:fast まで） ----
phase("Implement");

const impl = await agent(
  `あなたは実装担当エージェントです。工程スキル ${SKILL_IMPLEMENT} を読み、その手順に従って以下のタスクを実装してください。

## タスク
${task}

## 設計メモ
${design.memoPath} を読み、これに従う。設計から逸脱する必要があれば、逸脱内容と理由をメモの「実装の記録」に追記すること

## 読む規約
${RULES_FOR.implement}

## 制約
- 人の判断が要る点（予定になかった変更・新しい名前・実装で決めた設計）は reviewPoints に分類付きで返す。PR 本文の要確認になる
${CHECK_FAST}${TIMING}${WORKFLOW_CONSTRAINTS}`,
  agentOptions("implement", { label: "implement", phase: "Implement", schema: IMPLEMENT_SCHEMA })
);

if (!impl) {
  return {
    success: false,
    error: "実装エージェントが結果を返しませんでした。ワークフローを中断します。",
    design,
    events
  };
}
log(
  `実装完了: ${impl.summary} (変更ファイル ${impl.changedFiles.length} 件、check:fast ${impl.checkFastPassed ? "成功" : `失敗 ${impl.checkFastFailures.length} 件`})`
);
recordEvent("implementation_completed", {
  summary: impl.summary,
  changedFileCount: impl.changedFiles.length,
  startedAt: impl.startedAt,
  completedAt: impl.completedAt
});
// check:fast は実装エージェントが自分で通す。所要時間は実装に含まれるため、イベントには結果だけを残す
recordEvent("test_completed", {
  round: 1,
  scope: "fast",
  testPassed: impl.checkFastPassed,
  testFailureCount: impl.checkFastFailures.length,
  startedAt: impl.startedAt,
  completedAt: impl.completedAt
});

/** testPrompt は検証担当エージェントへの指示を、コマンドを差し替えて組み立てます。 */
function testPrompt(command, purpose) {
  return `あなたはテスト担当エージェントです。${purpose}

## 手順
1. リポジトリルートで \`${command}\` を実行する
2. 失敗があれば、どのコマンドのどの項目が失敗したかを整理する。テスト失敗はテスト名とエラーメッセージの要点、カバレッジ不足はどのファイルの何が閾値未達かまで特定する
3. domain/application のカバレッジ 100% 要件を満たしているか確認する

## 制約
- ファイルの変更は一切行わないこと(実行と報告のみ)
- 失敗の「修正」はしないこと(修正は別エージェントが担当する)
${TIMING}`;
}

// ---- Phase 3-5: レビュー → 問題があれば修正（check:fast まで）→ 再レビュー、のループ ----
// check:fast は実装・修正の担当が自分で通してからレビューに渡す。周回中の別エージェントによる
// check:fast は置かない。要修正ゼロかつ fast が通った時点で、フルの check を 1 回だけ別エージェントで通す
// （rules/testing の「検証コマンド」）。フルで落ちたら修正に戻る。
// minor だけが残った状態は収束で、minor を直すための周回はしない（rules/review の「収束条件」）。
let round = 0;
let review = null;
let test = null;
let escalation = null;
let fastPassed = impl.checkFastPassed;
let fastFailures = impl.checkFastFailures;
const fixHistory = [];
const changedFiles = new Set(impl.changedFiles);
const reviewPoints = [...design.reviewPoints, ...impl.reviewPoints];

while (true) {
  const attempt = round + 1;
  let blockingIssues = [];
  let allIssues = [];

  // check:fast が通っていない差分をレビューしても指摘が機械チェックの再掲になるため、赤いうちは修正へ直行する
  if (fastPassed) {
    review = await agent(
      `あなたはコードレビュー担当エージェントです。工程スキル ${SKILL_REVIEW} を読み、その手順に従って作業ツリーの未コミット変更をレビューしてください。

## タスク(この変更の目的)
${task}

## 設計メモ
${design.memoPath}（実装がこれに従っているか、テスト計画を満たしているかも検査対象）
${round > 0 ? `\n## 前回の指摘（修正後の再レビュー ${attempt} 回目）\n${JSON.stringify(fixHistory[fixHistory.length - 1].blockingIssues)}\n前回の指摘が直っているかを確かめたうえで、新たな問題も探すこと` : ""}

## 読む規約
${RULES_FOR.review}。観点と severity の基準は rules/review（standard.md と project.md）を読んで確認する（記憶で判断しない）

## 前提
この差分は \`npm run check:fast\`（型検査・lint・単体テスト・結合テスト）を通過している。機械チェックの再実行や、機械が拾う種類の指摘に時間を使わず、規約・設計・テスト計画との整合と、機械が拾えない設計上の問題に集中すること

## 制約
- ファイルの変更は一切行わないこと(レビューのみ)
${TIMING}`,
      agentOptions("review", { label: `review#${attempt}`, phase: "Review", schema: REVIEW_SCHEMA })
    );

    allIssues = (review && review.issues) || [];
    blockingIssues = allIssues.filter((i) => i.severity !== "minor");
    log(
      `レビュー(${attempt} 回目): 指摘 ${allIssues.length} 件(要修正 ${blockingIssues.length} 件)`
    );
    recordEvent("review_completed", {
      round: attempt,
      reviewIssueCount: allIssues.length,
      blockingIssueCount: blockingIssues.length,
      startedAt: review ? review.startedAt : null,
      completedAt: review ? review.completedAt : null
    });
  } else {
    log(`check:fast が失敗しているためレビューを飛ばして修正に入ります(${attempt} 回目)`);
  }

  // 要修正ゼロで fast が通ったら、コミット前のフル検証を 1 回だけ通す。観測点が E2E の段は
  // test:e2e も含める。E2E は npm run check に入っていないため、ここで通さないと観測点が一度も
  // 機械で確かめられないまま収束し、実行したかどうかを担当エージェントの申告に頼ることになる。
  if (blockingIssues.length === 0 && fastPassed) {
    const full = await agent(
      testPrompt(
        design.observesWithE2e ? "npm run check && npm run test:e2e" : "npm run check",
        design.observesWithE2e
          ? "コミット前のフル検証（build と全 workspace）と、この段の観測点である E2E を実行してください。E2E の実行環境（Playwright のブラウザ・DB）が無くて失敗した場合は、コードの失敗と区別できるよう failures の先頭に「環境:」と付けて報告してください（修正工程では直せないため）。"
          : "コミット前のフル検証（build と全 workspace）を実行してください。"
      ),
      agentOptions("test", { label: `check#${attempt}`, phase: "Test", schema: TEST_SCHEMA })
    );
    const fullFailed = !full || !full.passed;
    test = full || { passed: false, failures: ["フル検証のエージェントが結果を返しませんでした"] };
    recordEvent("test_completed", {
      round: attempt,
      scope: design.observesWithE2e ? "full+e2e" : "full",
      testPassed: !fullFailed,
      testFailureCount: (test.failures || []).length,
      startedAt: full ? full.startedAt : null,
      completedAt: full ? full.completedAt : null
    });

    if (!fullFailed) {
      recordEvent("loop_converged", { rounds: round });
      log(`収束（修正 ${round} 周、minor ${allIssues.length} 件は任意対応として残す）`);
      break;
    }
    log(
      `フル検証で失敗 ${test.failures.length} 件（check:fast が省いた build や他 workspace）。修正に戻ります。`
    );
    fastPassed = false;
    fastFailures = test.failures;
  }

  if (round >= MAX_FIX_ROUNDS) {
    log(`修正ループの上限(${MAX_FIX_ROUNDS} 回)に達しました。エスカレーションの診断を行います。`);
    escalation = await agent(
      `あなたはエスカレーション判断担当エージェントです。
実装ループが反復上限(${MAX_FIX_ROUNDS} 回)に達しても収束しませんでした。
人に引き継ぐための診断を行ってください。

## タスク
${task}

## 設計メモ
${design.memoPath}

## 残存している要修正指摘
${JSON.stringify(blockingIssues, null, 2)}

## 残存しているテスト失敗
${fastPassed ? "なし" : JSON.stringify(fastFailures, null, 2)}

## 修正履歴(各周で何を直したか)
${JSON.stringify(
  fixHistory.map((h) => ({ round: h.round, summary: h.fix.summary, skipped: h.fix.skippedItems })),
  null,
  2
)}

## 判断の指針
- **第一解釈は「タスク分解が甘い」** とする（rules/review の「収束条件」）。この場合の戻し先は task_breakdown で、実装フェーズ内でタスク分割をやり直す(人の承認は要らないので回復が安い)
- 掘った結果、根がモデル・API・データ構造の筋の悪さにあるなら design_phase へ戻す
- さらに掘った結果、根が仕様の曖昧さにあるなら scenario_phase まで戻す
- 実装だけの問題だと言い切れる根拠がある場合に限り implementation とする
- 分岐は retry / skip / abort の三択から推奨を 1 つ選ぶ

## 制約
- ファイルの変更は一切行わないこと(診断のみ)
- 「もう少し直せば通る」という楽観的な診断をしないこと。上限まで直して通らなかった事実を重く見る
${TIMING}`,
      agentOptions("review", { label: "escalate", phase: "Fix", schema: ESCALATION_SCHEMA })
    );
    recordEvent("escalated", {
      rounds: round,
      remainingBlockingIssueCount: blockingIssues.length,
      remainingTestFailureCount: fastPassed ? 0 : fastFailures.length,
      interpretation: escalation ? escalation.interpretation : "unknown",
      sendBackTo: escalation ? escalation.sendBackTo : "unknown",
      recommendedBranch: escalation ? escalation.recommendedBranch : "unknown",
      startedAt: escalation ? escalation.startedAt : null,
      completedAt: escalation ? escalation.completedAt : null
    });
    break;
  }

  // ---- 修正 ----
  phase("Fix");
  round++;
  const fix = await agent(
    `あなたは修正担当エージェントです。レビュー指摘とテスト失敗を修正してください。

## タスク(この変更の本来の目的)
${task}

## 設計メモ
${design.memoPath}（修正で設計から逸脱する場合は「実装の記録」に理由を追記する）

## レビュー指摘(修正必須: critical / major)
${JSON.stringify(blockingIssues, null, 2)}

## 参考: minor 指摘(ついでに直せるものは直してよいが必須ではない。直しても再レビューの対象にはしない)
${JSON.stringify(
  allIssues.filter((i) => i.severity === "minor"),
  null,
  2
)}

## テスト失敗
${fastPassed ? "なし" : JSON.stringify(fastFailures, null, 2)}
${test && test.coverageNote ? `カバレッジ特記事項: ${test.coverageNote}` : ""}

## 読む規約
${RULES_FOR.fix}

## 手順
1. 各指摘・失敗の該当箇所を確認する
2. 症状ではなく根本原因を修正する。テストを消したり skip したりして通すことは禁止
3. 修正した範囲の単体テストを \`npx vitest run <path>\` で実行して確認する
4. 指摘が誤りだと判断した場合は無理に変更せず、skippedItems に理由を明記する

## 制約
- タスクの目的から外れた大規模なリファクタリングはしないこと
- 修正で人の判断が要る点が生じたら reviewPoints に分類付きで返す
${CHECK_FAST}${TIMING}${WORKFLOW_CONSTRAINTS}`,
    agentOptions("fix", { label: `fix#${round}`, phase: "Fix", schema: FIX_SCHEMA })
  );

  fixHistory.push({
    round,
    blockingIssues,
    testFailures: fastPassed ? [] : fastFailures,
    fix: fix || {
      summary: "修正エージェントが結果を返しませんでした",
      fixedItems: [],
      skippedItems: [],
      changedFiles: [],
      reviewPoints: []
    }
  });

  if (!fix) {
    log(`修正エージェント(${round} 回目)が結果を返しませんでした。再検証に進みます。`);
    fastPassed = false;
    fastFailures = ["修正エージェントが結果を返しませんでした"];
  } else {
    log(
      `修正完了(${round} 回目): ${fix.summary}（check:fast ${fix.checkFastPassed ? "成功" : `失敗 ${fix.checkFastFailures.length} 件`}）`
    );
    fastPassed = fix.checkFastPassed;
    fastFailures = fix.checkFastFailures;
    for (const file of fix.changedFiles) changedFiles.add(file);
    reviewPoints.push(...fix.reviewPoints);
  }
  recordEvent("fix_completed", {
    round,
    fixedItemCount: fix ? fix.fixedItems.length : 0,
    skippedItemCount: fix ? fix.skippedItems.length : 0,
    startedAt: fix ? fix.startedAt : null,
    completedAt: fix ? fix.completedAt : null
  });
  recordEvent("test_completed", {
    round: round + 1,
    scope: "fast",
    testPassed: fastPassed,
    testFailureCount: fastFailures.length,
    startedAt: fix ? fix.startedAt : null,
    completedAt: fix ? fix.completedAt : null
  });
  phase("Review");
}

// ---- 収束判定 ----
const remainingBlocking = ((review && review.issues) || []).filter((i) => i.severity !== "minor");
const remainingMinor = ((review && review.issues) || []).filter((i) => i.severity === "minor");
const converged = remainingBlocking.length === 0 && fastPassed && !!test && test.passed;

// ---- Phase 6: 記録とコミット ----
// ワークフロースクリプトからはファイル操作も git 操作もできないため、イベントの追記と script の起動は
// このフェーズのエージェントが担当する。コミット・push・PR 作成・レビューガイド更新の手順そのものは
// node scripts/uld/uld.mjs finish-task が持ち、エージェントは PR 本文の材料を入力 JSON に整えて渡すだけにする。
phase("Record");

const commitSubject = taskId ? `[${taskId}] <変更内容の要約>` : "<type>(<scope>): <変更内容の要約>";
const recordCommand = `node scripts/uld/uld.mjs record-loop-event --file ${eventLogPath}${taskId ? ` --task-id ${taskId}` : ""} --runner workflow`;

const record = await agent(
  `あなたは記録担当エージェントです。ループのイベントを追記し、収束していれば script でコミットして
子タスク PR をスタックに積んでください。判断は最小限にし、手順どおりに script を呼ぶことが仕事です。

## このループの結果
- 収束: ${converged ? "した(機械チェック全通過 + 要修正指摘ゼロ)" : "しなかった"}
- 修正ループの回数: ${round}
- タスク ID: ${taskId || "なし(採番のない作業)"}
- 設計メモ: ${design.memoPath}
${converged ? "" : `- 残存する要修正指摘: ${remainingBlocking.length} 件\n- エスカレーション診断: ${escalation ? JSON.stringify(escalation) : "なし"}`}

## 手順

### 1. イベントの追記(収束の有無にかかわらず必ず行う。1 回だけ)
次のコマンドで追記する（採番・記録時刻・runId・ブランチ・実行系の付与と必須フィールドの検証は機械が行う。
手で JSON 行を書かないこと。全イベントを 1 回の呼び出しで渡す）。

\`${recordCommand} --event '<JSON>' --event '<JSON>' ...\`

**イベントが持っている \`startedAt\` / \`completedAt\` は書き換えないこと。**

追記するイベント:
${JSON.stringify(events, null, 2)}
${
  converged
    ? `
### 2. コミットと PR(収束した場合のみ。script が行う)
1. 次の材料から入力 JSON を組み立て、リポジトリ外（例: /tmp/finish-task-${taskId || "chore"}.json）に書く
   - branch: ${branch || "`git rev-parse --abbrev-ref HEAD` の値"}
   - baseBranch: ${baseBranch || "このブランチを切った元のブランチ（スタックの 1 段下。最初の子タスクと chore/* なら develop、2 件目以降なら直前の子タスクのブランチ。`git reflog` と rules/branch の命名から判断）"}
   - taskId: ${taskId ? `"${taskId}"` : "null"} / unitDirectory: ${unitDirectory ? `"${unitDirectory}"` : "null"}
   - files: 変更ファイル一覧（下記）+ 設計メモ ${design.memoPath} + イベントログ ${eventLogPath}
   - commitSubject: \`${commitSubject}\` の形式 / commitBody: **Why**（なぜこの変更が必要か。How は書かない）
   - prTitle: commitSubject と同じ / prBody: .github/PULL_REQUEST_TEMPLATE.md の骨格に従い、要確認は下記 reviewPoints を分類タグの順（〔仕様〕〔設計〕〔予定外〕〔名前〕）に 1 件 1 チェックボックスで書く。「一目で」の要確認の行は分類ごとの件数（0 も書く）。差分の読み方は変更ファイルから。エビデンス欄に検証結果・修正ループ回数・minor 指摘を畳む（書き方は rules/pull-request）
2. \`node scripts/uld/uld.mjs finish-task --input <入力 JSON のパス>\` を実行する。script がコミット・push・PR 作成・底 PR のレビューガイド更新・tasks.md のチェックを行う
3. script が止まった（終了コード 1）場合は、その理由を note に書いて終了する。amend・force push・手作業のコミットで回復しないこと
4. **PR はマージしない。** 人のレビューが終わるまでスタックは開いたままにする

## PR 本文の材料
- 変更ファイル一覧: ${JSON.stringify([...changedFiles])}
- 設計・実装・修正が挙げた要確認（reviewPoints）: ${JSON.stringify(reviewPoints, null, 2)}
- 設計で宣言した影響ファイル（実際の差分と食い違う分は〔予定外〕に足す）: ${JSON.stringify(design.affectedFiles)}
- 実装が申告した設計からの逸脱: ${impl.deviations}
- 修正ループで見送った指摘: ${JSON.stringify(
        fixHistory.map((h) => ({ round: h.round, skipped: h.fix.skippedItems })),
        null,
        2
      )}
- 任意対応として残した minor 指摘: ${JSON.stringify(remainingMinor.map((i) => `${i.file}: ${i.description}`))}
- 検証: check:fast 通過、npm run check 通過、AI レビュー ${round + 1} 周`
    : `
### 2. コミットと PR
収束していないためコミットも PR 作成も行いません。イベントの追記だけ行い、note に理由を書いてください。`
}

## 制約
- git commit / git push / gh pr create を自分で実行しないこと（すべて node scripts/uld/uld.mjs finish-task が行う）
- **PR をマージしないこと**
- イベントログの既存行を書き換えないこと(追記のみ。ログ資料は上書きしない)`,
  agentOptions("record", { label: "record", phase: "Record", schema: RECORD_SCHEMA })
);

// ---- 最終結果 ----
return {
  success: converged,
  task,
  taskId,
  memoPath: design.memoPath,
  design: { summary: design.summary, affectedFileCount: design.affectedFiles.length },
  implementation: {
    summary: impl.summary,
    changedFiles: [...changedFiles],
    deviations: impl.deviations
  },
  reviewPoints,
  fixRounds: round,
  fixHistory: fixHistory.map((h) => ({
    round: h.round,
    fixSummary: h.fix.summary,
    skipped: h.fix.skippedItems
  })),
  finalReview: {
    overallComment: review ? review.overallComment : "レビュー結果なし",
    remainingBlockingIssues: remainingBlocking,
    minorIssues: remainingMinor
  },
  finalTest: test || { passed: false, failures: fastPassed ? [] : fastFailures },
  escalation,
  record: record || {
    eventsAppended: 0,
    committed: false,
    commitSubject: "なし",
    branch: "不明",
    baseBranch: "なし",
    pullRequestUrl: "なし",
    note: "記録エージェントが結果を返しませんでした"
  },
  events,
  models,
  efforts,
  note: converged
    ? "収束しました。Record フェーズの結果で、コミットと子タスク PR の作成を確認してください。PR はマージせず、スライスの全タスクが揃ってから人がスタックをまとめてレビューします。"
    : `反復上限(${MAX_FIX_ROUNDS} 回)に達しても収束しませんでした。escalation の診断と推奨分岐(retry / skip / abort)を人が判断してください。`
};
