import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // .claude/worktrees/ に別ブランチの複製が残るため、既定の glob は使わない
    include: ["packages/*/src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts"],
      // テスト・再 export だけの公開入口（振る舞いを持たない）・fixture・生成物は計測しない
      exclude: ["**/*.test.ts", "packages/*/src/index.ts", "**/fixtures/**", "**/generated/**"],
      thresholds: {
        statements: 85,
        branches: 80,
        functions: 85,
        lines: 85,
        "packages/*/src/domain/**": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "packages/*/src/application/**": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        // domain がその上に立つため、shared kernel の誤りは全 module の誤りになる
        "packages/shared-kernel/src/**": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
      },
    },
  },
});
