// playwright.config.js — RepFlow smoke harness.
// Chromium-only, headless by default, against a deployed URL.
// Override base via PLAYWRIGHT_BASE_URL or BASE_URL env vars.
const { defineConfig, devices } = require("@playwright/test");

const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ||
  process.env.BASE_URL ||
  "https://koino-insurance-os.vercel.app";

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 240_000,          // total per test (7 steps × ~30s each)
  expect: { timeout: 30_000 }, // per assertion / per "step"
  fullyParallel: false,
  retries: 0,
  reporter: process.env.CI ? "line" : [["list"]],
  use: {
    baseURL,
    headless: true,
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
