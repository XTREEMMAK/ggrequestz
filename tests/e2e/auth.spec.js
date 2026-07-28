import { test, expect } from "@playwright/test";
import { ensureAdmin } from "./helpers.js";

/**
 * An unauthenticated request lands in one of two places, and which one depends
 * on whether the instance has an admin yet:
 *
 *   make test-blank   -> /setup   (needsInitialSetup() is true)
 *   make test-seeded  -> /login
 *
 * These tests previously branched on "/setup or everything else", and treated
 * everything else as the signed-in application. Against a blank database only
 * the /setup branch ever ran, so the assertions in the other branch had never
 * executed once and did not match the real markup.
 */
async function pageState(page) {
  const url = page.url();
  if (url.includes("/setup")) return "setup";
  if (url.includes("/login")) return "login";
  return "app";
}

// The admin these tests sign in as must exist before any of them run. See
// ensureAdmin() in helpers.js — locally this is a no-op, in CI it creates it.
test.beforeAll(async ({ playwright, baseURL }) => {
  const context = await playwright.request.newContext({ baseURL });
  try {
    await ensureAdmin(context, baseURL);
  } finally {
    await context.dispose();
  }
});

test.describe("Authentication Flow", () => {
  test("should display login page for unauthenticated users", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/(login|setup)/);

    if ((await pageState(page)) === "setup") {
      await expect(page.getByText(/setup/i).first()).toBeVisible();
      return;
    }

    // The login page is branded and offers at least one way in. The basic-auth
    // entry point is a link, not a button.
    await expect(
      page.getByRole("heading", { name: /g\.?g\.? requestz/i }),
    ).toBeVisible();
    await expect(page.locator('a[href="/login/basic"]')).toBeVisible();
  });

  test("should show appropriate login options", async ({ page }) => {
    await page.goto("/login");

    if ((await pageState(page)) === "setup") {
      await expect(page.getByText(/setup/i).first()).toBeVisible();
      return;
    }

    // At least one authentication route must be offered, or the page is a dead
    // end. Basic auth and OIDC both render as links into /login/*.
    const authLinks = page.locator('a[href^="/login/"], a[href^="/api/auth/"]');
    await expect(authLinks.first()).toBeVisible();
  });

  test("should handle navigation between auth pages", async ({ page }) => {
    await page.goto("/login");

    if ((await pageState(page)) === "setup") {
      await expect(page.getByText(/setup/i).first()).toBeVisible();
      return;
    }

    const heading = page.getByRole("heading", { name: /g\.?g\.? requestz/i });
    await expect(heading).toBeVisible();
    await heading.click();

    // Clicking the wordmark must not navigate somewhere broken.
    await expect(page.locator("body")).toBeVisible();
    await expect(page).toHaveURL(/\/(login|setup|)$|\/login\//);
  });

  test("should reach the basic-auth form when it is enabled", async ({
    page,
  }) => {
    await page.goto("/login");
    test.skip(
      (await pageState(page)) === "setup",
      "instance has no admin yet; nothing to sign in to",
    );

    const basicAuth = page.locator('a[href="/login/basic"]');
    test.skip(
      (await basicAuth.count()) === 0,
      "basic auth is not enabled on this instance",
    );

    await basicAuth.click();
    await expect(page).toHaveURL(/\/login\/basic/);

    // The field is named "identifier" — it takes a username or an email.
    await expect(page.locator('input[name="identifier"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
  });

  test("should sign in with the seeded admin", async ({ page }) => {
    await page.goto("/login/basic");
    test.skip(page.url().includes("/setup"), "instance has no admin yet");

    await page.fill('input[name="identifier"]', "admin");
    await page.fill('input[name="password"]', "ggr-test-admin");
    await page.getByRole("button", { name: /login/i }).click();

    await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/, { timeout: 20000 });
  });

  test("should handle setup page if needed", async ({ page }) => {
    await page.goto("/setup");

    if (page.url().includes("/setup")) {
      await expect(page.getByText(/setup/i).first()).toBeVisible();
    } else {
      // A seeded instance sends /setup away, since setup is already done.
      expect(page.url()).toMatch(/\/(login|)$/);
    }
  });
});

test.describe("Authentication Security", () => {
  test("should protect admin routes", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/(login|setup)/);
  });

  test("should protect user-specific routes", async ({ page }) => {
    await page.goto("/profile");
    await expect(page).toHaveURL(/\/(login|setup)/);
  });

  test("should protect API routes", async ({ page }) => {
    const response = await page.request.get("/api/watchlist/add");

    // 405 is expected for a GET against a POST-only endpoint; the rest are the
    // various ways the app can refuse an unauthenticated caller.
    expect([401, 302, 403, 405]).toContain(response.status());
  });
});
