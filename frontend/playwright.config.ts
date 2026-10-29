import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: ".next/phase-3-results",
  timeout: 40_000,
  expect: { timeout: 10_000 },
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: "list",
  use: { baseURL: "http://localhost:3100", viewport: { width: 1440, height: 1000 }, trace: "retain-on-failure" },
  // Dedicated ports avoid reusing an unrelated development process.
  webServer: [
    { command: "npm run dev --workspace=@wangmai/backend --prefix ..", url: "http://127.0.0.1:4100/api/health", env: { PORT: "4100", BETTER_AUTH_URL: "http://localhost:3100" }, reuseExistingServer: false, timeout: 60_000 },
    { command: "npm exec -- next dev --hostname 127.0.0.1 --port 3100", url: "http://localhost:3100", env: { PORT: "3100", NEXT_DIST_DIR: ".next-e2e", API_PROXY_ORIGIN: "http://127.0.0.1:4100", API_INTERNAL_ORIGIN: "http://127.0.0.1:4100" }, reuseExistingServer: false, timeout: 60_000 },
  ],
});
