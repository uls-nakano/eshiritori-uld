import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// 画面は API と WebSocket を同じオリジンへ要求し、開発サーバーが apps/api へ中継する
const apiOrigin = process.env["API_ORIGIN"] ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/rooms": apiOrigin,
      "/ws": { target: apiOrigin, ws: true },
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
});
