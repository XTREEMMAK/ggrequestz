/**
 * Shared helpers for the e2e suite.
 *
 * The suite runs against the seeded Docker stack (`make test-seeded`), whose
 * credentials come from scripts/testing/seed-app.sh and
 * scripts/testing/seed-data.js.
 */

export const ADMIN = { identifier: "admin", password: "ggr-test-admin" };
export const USER = { identifier: "player", password: "ggr-test-user" };

/**
 * Sign in through the basic-auth form.
 *
 * Anything that asserts on the application shell has to do this first: an
 * unauthenticated visitor never sees it. `/` redirects to /login, and the login
 * page drops the shell on hydration, so navigation assertions made against an
 * anonymous page were testing markup that is not there.
 *
 * @param {import("@playwright/test").Page} page
 * @param {{identifier: string, password: string}} credentials
 * @returns {Promise<boolean>} - False when the instance has no admin yet
 */
export async function signIn(page, credentials = ADMIN) {
  await page.goto("/login/basic");

  if (page.url().includes("/setup")) {
    return false; // blank instance; nothing to sign in to
  }

  await page.fill('input[name="identifier"]', credentials.identifier);
  await page.fill('input[name="password"]', credentials.password);

  await Promise.all([
    page
      .waitForURL((url) => !url.pathname.startsWith("/login"), {
        timeout: 20000,
      })
      .catch(() => {}),
    page.getByRole("button", { name: /login/i }).click(),
  ]);

  await page.waitForLoadState("networkidle");

  return !page.url().includes("/login");
}
