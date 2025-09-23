import { defineConfig, devices } from "@playwright/test";

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./tests/e2e",
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: "html",
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.CI ? "http://127.0.0.1:4173" : "http://127.0.0.1:5174",

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

  /* Run your local dev server before starting the tests */
  webServer: {
    command: process.env.CI ? "npm run preview" : "npm run dev",
    port: process.env.CI ? 4173 : 5174,
    reuseExistingServer: !process.env.CI,
    env: process.env.CI
      ? {
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
        }
      : {},
  },
});
