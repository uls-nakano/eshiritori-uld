import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

// 開発サーバー（API 3000・画面 5173）と重ならない固定のポート
const API_PORT = 3100;
const WEB_PORT = 5273;
const WEB_ORIGIN = `http://localhost:${String(WEB_PORT)}`;
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.e2e.test.ts",
  globalSetup: "./globalSetup.ts",
  timeout: 60_000,
  forbidOnly: Boolean(process.env["CI"]),
  retries: 0,
  workers: 1,
  reporter: "list",
  use: { baseURL: WEB_ORIGIN, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm run start:api",
      port: API_PORT,
      env: { PORT: String(API_PORT) },
      cwd: REPO_ROOT,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npm run start -w @eshiritori/web -- --port ${String(WEB_PORT)} --strictPort`,
      url: WEB_ORIGIN,
      env: { API_ORIGIN: `http://localhost:${String(API_PORT)}` },
      cwd: REPO_ROOT,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
