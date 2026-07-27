import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;

// Locally the suite runs against the Docker test stack (`make test-seeded`),
// not against `npm run dev`.
//
// It used to boot the dev server, which loads .env.development — a file that
// points at whatever database the developer happens to be working against. On
// this repo that is a live remote Postgres, so running the e2e suite locally
// wrote to real data. There was a hardcoded env block for CI and nothing at all
// for local runs.
//
// The stack is disposable and already seeded, which is what these tests want.
const TEST_STACK_PORT = process.env.GGR_TEST_PORT || "3100";
const TEST_STACK_URL = `http://127.0.0.1:${TEST_STACK_PORT}`;

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./tests/e2e",
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: isCI,
  /* Retry on CI only */
  retries: isCI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: isCI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: "html",
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: isCI ? "http://127.0.0.1:4173" : TEST_STACK_URL,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",

    /* Take screenshot on failure */
    screenshot: "only-on-failure",
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },

    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },

    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },

    /* Test against mobile viewports. */
    {
      name: "Mobile Chrome",
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "Mobile Safari",
      use: { ...devices["iPhone 12"] },
    },
  ],

  /*
   * CI builds and previews the app itself, against the postgres service
   * declared in .github/workflows/test.yml.
   *
   * Locally there is no webServer: the target is the already-running test
   * stack. globalSetup fails with an actionable message if it is not up, which
   * is friendlier than every test timing out on a connection refused.
   */
  globalSetup: isCI ? undefined : "./tests/e2e/global-setup.js",

  webServer: isCI
    ? {
        command: "npm run preview",
        port: 4173,
        reuseExistingServer: false,
        env: {
          POSTGRES_HOST: "localhost",
          POSTGRES_PORT: "5432",
          POSTGRES_DB: "ggrequestz_test",
          POSTGRES_USER: "postgres",
          POSTGRES_PASSWORD: "test_password",
          SESSION_SECRET: "test_session_secret_for_github_actions_32_chars",
          IGDB_CLIENT_ID: "test_client_id",
          IGDB_CLIENT_SECRET: "test_client_secret",
          AUTH_METHOD: "basic",
          NODE_ENV: "test",
        },
      }
    : undefined,
});
