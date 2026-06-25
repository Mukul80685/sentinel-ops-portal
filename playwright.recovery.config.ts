import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "password-recovery.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  reporter: "list",
  use: {
    baseURL: "http://localhost:8099",
    channel: "chrome",
  },
  webServer: {
    command: "npm run build && npm run preview -- --port 8099 --host",
    url: "http://localhost:8099",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
