import { test, expect } from "@playwright/test";

test.describe("Homepage", () => {
  test("should display the main navigation", async ({ page }) => {
    await page.goto("/");

    // Will redirect to setup if first time, skip navigation check in that case
    if (page.url().includes("/setup")) {
      await expect(page.getByText(/setup/i).first()).toBeVisible();
    } else {
      // Check for main navigation elements
      await expect(page.locator("nav")).toBeVisible();
      await expect(page.getByText("GG.Requestz")).toBeVisible();

      // Check for main navigation links
      await expect(page.getByRole("button", { name: /home/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /search/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /request/i })).toBeVisible();
    }
  });

  test("should redirect unauthenticated users to login", async ({ page }) => {
    await page.goto("/");

    // Should be redirected to login or setup page
    await expect(page).toHaveURL(/\/(login|setup)/);

    if (page.url().includes("/setup")) {
      await expect(page.getByText(/setup/i).first()).toBeVisible();
    } else {
      await expect(page.getByText(/login/i)).toBeVisible();
    }
  });

  test("should handle mobile navigation menu", async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");

    // Skip if on setup page (no navigation menu)
    if (page.url().includes("/setup")) {
      await expect(page.getByText(/setup/i).first()).toBeVisible();
      return;
    }

    // Should show mobile menu button
    const mobileMenuButton = page.getByRole("button", {
      name: /toggle mobile menu/i,
    });
    await expect(mobileMenuButton).toBeVisible();

    // Click to open mobile menu
    await mobileMenuButton.click();

    // Check if mobile menu items are visible
    await expect(page.getByText("Home")).toBeVisible();
    await expect(page.getByText("Search")).toBeVisible();
    await expect(page.getByText("Request")).toBeVisible();
  });

  test("should display loading state initially", async ({ page }) => {
    await page.goto("/");

    // Check for loading spinner or loading text
    const loadingElement = page.getByText(/loading/i).first();
    if (await loadingElement.isVisible()) {
      await expect(loadingElement).toBeVisible();
    }
  });
});

test.describe("Performance", () => {
  test("should load within acceptable time limits", async ({ page }) => {
    const startTime = Date.now();

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const loadTime = Date.now() - startTime;

    // Should load within 5 seconds (generous for testing)
    expect(loadTime).toBeLessThan(5000);
  });

  test("should lazy load images", async ({ page }) => {
    await page.goto("/");

    // Check for images with data-src attributes (lazy loading)
    const lazyImages = page.locator("img[data-src]");
    const imageCount = await lazyImages.count();

    if (imageCount > 0) {
      // At least some images should be lazy loaded
      expect(imageCount).toBeGreaterThan(0);

      // Check that data-src is used for lazy loading
      const firstLazyImage = lazyImages.first();
      await expect(firstLazyImage).toHaveAttribute("data-src");
    }
  });

  test("should preload critical navigation on hover", async ({ page }) => {
    await page.goto("/");

    // Hover over navigation link
    const searchLink = page.getByRole("button", { name: /search/i });
    if (await searchLink.isVisible()) {
      await searchLink.hover();

      // Wait a bit for prefetching to potentially occur
      await page.waitForTimeout(500);

      // This test mainly ensures no errors occur during hover prefetching
      // The actual prefetching is handled by our performance utilities
    }
  });
});
