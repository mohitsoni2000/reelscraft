import { defineConfig } from "@playwright/test";

const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;
const isCI = Boolean(process.env.CI);

/**
 * End-to-end tests run against the static export in ./out (build first: `npm run build`).
 *
 *   npm run test:e2e                               everything
 *   npx playwright test --project=chromium-mobile  one project
 *   npx playwright test --project=unit             config/script tests, no browser needed
 *
 * Only Chromium is used (WebKit/Firefox are not installed in this project).
 */
export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "test-results",
  timeout: 45_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : undefined,
  reporter: isCI
    ? [["github"], ["list"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  webServer: {
    // --no-port-switching: if 4173 is taken, fail loudly instead of silently serving elsewhere.
    command: `npx serve out -l ${PORT} --no-clipboard --no-port-switching`,
    url: BASE_URL,
    reuseExistingServer: !isCI,
    timeout: 60_000,
  },
  projects: [
    {
      name: "chromium-mobile",
      testDir: "./tests/e2e",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
    {
      name: "chromium-desktop",
      testDir: "./tests/e2e",
      use: {
        browserName: "chromium",
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      // Node-only tests for deploy/headers.mjs and scripts/verify-out.mjs (no browser is launched).
      name: "unit",
      testDir: "./tests/unit",
    },
  ],
});
