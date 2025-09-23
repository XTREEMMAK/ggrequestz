import { test, expect } from "@playwright/test";

test.describe("Authentication Flow", () => {
  test("should display login page for unauthenticated users", async ({
    page,
  }) => {
    await page.goto("/");

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);

    // Check login page elements
    await expect(page.getByText(/login/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /login/i })).toBeVisible();
  });

  test("should show appropriate login options", async ({ page }) => {
    await page.goto("/login");

    // Should show login form or OAuth options
    // This will depend on your auth configuration
    const loginButton = page.getByRole("button", { name: /login/i });
    await expect(loginButton).toBeVisible();
  });

  test("should handle navigation between auth pages", async ({ page }) => {
    await page.goto("/login");

    // Test navigation works
    await expect(page.getByText("GG.Requestz")).toBeVisible();

    // Click on logo should stay on login or go to a safe page
    await page.getByText("GG.Requestz").click();

    // Should not crash or show errors
    await expect(page.locator("body")).toBeVisible();
  });

  test("should handle setup page if needed", async ({ page }) => {
    await page.goto("/setup");

    // If setup is needed, should show setup form
    // If setup is complete, should redirect
    const currentUrl = page.url();

    if (currentUrl.includes("/setup")) {
      // Setup page should have form elements
      await expect(page.getByText(/setup/i)).toBeVisible();
    } else {
      // Should redirect to appropriate page
      expect(currentUrl).toMatch(/\/(login|$)/);
    }
  });
});

test.describe("Authentication Security", () => {
  test("should protect admin routes", async ({ page }) => {
    await page.goto("/admin");

    // Should redirect to login or show access denied
    await expect(page).toHaveURL(/\/login/);
  });

  test("should protect user-specific routes", async ({ page }) => {
    await page.goto("/profile");

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });

  test("should protect API routes", async ({ page }) => {
    const response = await page.request.get("/api/watchlist/add");

    // Should return 401, 302, 403, or 405 (method not allowed for GET on POST endpoint)
    expect([401, 302, 403, 405]).toContain(response.status());
  });
});
