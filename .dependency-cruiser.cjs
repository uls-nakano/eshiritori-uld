const TEST = "\\.test\\.tsx?$";

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "循環依存を作らない",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-production-to-tests",
      severity: "error",
      from: { path: "^(packages|apps)/" },
      to: { path: "^tests/" },
    },
    {
      name: "no-package-to-app",
      severity: "error",
      from: { path: "^packages/" },
      to: { path: "^apps/" },
    },
    {
      name: "no-cross-package-internals",
      severity: "error",
      comment: "他 package の内部 path を直接 import しない（公開入口 src/index.ts だけ）",
      from: { path: "^packages/([^/]+)/" },
      to: {
        path: "^packages/[^/]+/src/",
        pathNot: ["^packages/$1/", "^packages/[^/]+/src/index\\.ts$"],
      },
    },
    {
      name: "shared-kernel-depends-on-nothing",
      severity: "error",
      comment: "shared kernel は何にも依存しない",
      from: { path: "^packages/shared-kernel/src/", pathNot: TEST },
      to: { pathNot: "^packages/shared-kernel/" },
    },
    {
      name: "domain-is-pure",
      severity: "error",
      comment: "Domain は外部ライブラリに依存しない",
      from: { path: "^packages/[^/]+/src/domain/", pathNot: TEST },
      to: { dependencyTypes: ["npm", "npm-dev", "npm-optional", "npm-peer", "npm-no-pkg"] },
    },
    {
      name: "domain-not-to-outer-layers",
      severity: "error",
      from: { path: "^packages/[^/]+/src/domain/" },
      to: { path: ["^packages/[^/]+/src/(application|adapters)/", "^packages/api-contract/"] },
    },
    {
      name: "application-not-to-adapters",
      severity: "error",
      from: { path: "^packages/[^/]+/src/application/" },
      to: { path: ["^packages/[^/]+/src/adapters/", "^packages/api-contract/"] },
    },
    {
      name: "not-to-dev-dep",
      severity: "error",
      comment: "テスト用の依存を本番コードに持ち込まない",
      from: { path: "^(packages|apps)/", pathNot: TEST },
      to: { dependencyTypes: ["npm-dev"] },
    },
    {
      name: "not-to-unresolvable",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    tsConfig: { fileName: "tsconfig.base.json" },
    tsPreCompilationDeps: true,
    doNotFollow: { path: "node_modules" },
    exclude: { path: "^(coverage|\\.claude)/|^packages/[^/]+/(dist|coverage)/" },
    // ルートの devDependencies を workspace package からも npm-dev として判定する
    combinedDependencies: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "types", "default"],
    },
  },
};
