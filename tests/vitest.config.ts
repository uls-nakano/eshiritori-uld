import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["integration/**/*.integration.test.ts"],
    // 待ち受けの起動と DB を含むので、既定より長くする
    testTimeout: 10_000,
  },
});
