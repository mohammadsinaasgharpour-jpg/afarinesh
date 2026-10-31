import { defineConfig, devices } from "@playwright/test";

// UI tests run against the local server in the system's Chrome (no browser download needed).
export default defineConfig({
  testDir: "tests/ui",
  timeout: 30_000,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:8099", channel: "chrome", locale: "fa-IR" },
  webServer: {
    command: "node server/index.mjs",
    env: { PORT: "8099", DATA_DIR: "test-results/data" },
    url: "http://127.0.0.1:8099/api/health",
    reuseExistingServer: false,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
    { name: "mobile", use: { ...devices["Pixel 7"], channel: "chrome" } },
  ],
});
