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
 * Make sure the instance has the admin these tests sign in as.
 *
 * Both locally and in CI the admin is created before anything else, through
 * scripts/testing/seed-app.sh, so this is normally a no-op that confirms the
 * account can sign in. It still tries first-run setup, for a database that
 * has no account at all.
 *
 * POST /api/auth/basic/setup is unauthenticated, so it only opens while the
 * instance has no account of any kind (GHSA-xm2w-327g-3fxg). Once the seeded
 * demo accounts exist it answers 403, which is the expected response here,
 * not a failure; the same contract scripts/testing/seed-app.sh relies on.
 *
 * @param {import("@playwright/test").APIRequestContext} request
 * @param {string} baseURL - required; the endpoint is origin-checked
 */
export async function ensureAdmin(request, baseURL) {
  const setup = await request.post("/api/auth/basic/setup", {
    headers: { Origin: baseURL },
    multipart: {
      username: ADMIN.identifier,
      email: "admin@example.test",
      password: ADMIN.password,
    },
    failOnStatusCode: false,
  });

  if (setup.ok()) return "created";

  // Any non-2xx is ambiguous on its own: "already exists", a unique-constraint
  // violation from another worker racing this one, or a real failure all arrive
  // as 400. Rather than pattern-match the message, assert the postcondition we
  // actually care about: that this account can authenticate.
  const login = await request.post("/api/auth/basic/login", {
    headers: { Origin: baseURL },
    multipart: {
      username: ADMIN.identifier,
      password: ADMIN.password,
    },
    failOnStatusCode: false,
  });

  if (login.ok()) return "existing";

  throw new Error(
    `Could not ensure the test admin exists.\n` +
      `  setup: ${setup.status()} ${await setup.text()}\n` +
      `  login: ${login.status()} ${await login.text()}`,
  );
}

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
