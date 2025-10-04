/**
 * SvelteKit server-side hooks for performance optimization, authentication, and security
 */

import { sequence } from "@sveltejs/kit/hooks";
import { redirect } from "@sveltejs/kit";
import { getSession } from "$lib/auth.server.js";
import { getBasicAuthUser } from "$lib/basicAuth.js";
import { warmUpCache } from "$lib/gameCache.js";

// Initialize cache warming on server startup
let cacheWarmed = false;
const startCacheWarming = async () => {
  if (!cacheWarmed) {
    cacheWarmed = true;
    try {
      console.log("🔥 Starting cache warm-up...");
      await warmUpCache();
      console.log("✅ Cache warm-up completed");
    } catch (error) {
      console.error("❌ Cache warm-up failed:", error);
      // Reset flag to allow retry on next request
      cacheWarmed = false;
    }
  }
};

// HTTP Cache headers hook
const cacheHeaders = async ({ event, resolve }) => {
  const response = await resolve(event);

  // Clone headers to make them mutable
  const headers = new Headers(response.headers);

  // Add cache headers for static assets
  if (event.url.pathname.startsWith("/api/")) {
    // API responses - short cache for dynamic content
    headers.set("Cache-Control", "private, max-age=300"); // 5 minutes
    headers.set("Vary", "Cookie");
  } else if (event.url.pathname.startsWith("/_app/")) {
    // Build assets - long cache with versioning
    headers.set("Cache-Control", "public, max-age=31536000, immutable"); // 1 year
  } else if (
    event.url.pathname.match(
      /\.(js|css|woff|woff2|png|jpg|jpeg|gif|svg|ico|webp)$/,
    )
  ) {
    // Static assets - longer cache for images
    headers.set("Cache-Control", "public, max-age=604800, immutable"); // 7 days
  } else if (
    event.url.pathname === "/" ||
    event.url.pathname.startsWith("/game/")
  ) {
    // HTML pages with user-specific content - disable HTTP cache for dynamic data
    headers.set(
      "Cache-Control",
      "private, no-cache, no-store, must-revalidate",
    );
    headers.set("Pragma", "no-cache");
    headers.set("Expires", "0");
    headers.set("Vary", "Accept-Encoding, Cookie");
  }

  // Basic security headers for defense-in-depth
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Return new response with modified headers
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

// Performance timing hook with cache warming
const performanceTiming = async ({ event, resolve }) => {
  const start = Date.now();

  // Start cache warming on first request (non-blocking)
  startCacheWarming().catch((error) => {
    console.error("Cache warming failed:", error);
  });

  const response = await resolve(event);
  const duration = Date.now() - start;

  // Clone headers to make them mutable
  const headers = new Headers(response.headers);

  // Add performance timing header for debugging
  if (event.url.pathname.startsWith("/api/")) {
    headers.set("X-Response-Time", `${duration}ms`);
  }

  // Log slow responses
  if (duration > 1000) {
    console.warn(`Slow response: ${event.url.pathname} took ${duration}ms`);
  }

  // Return new response with modified headers
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

// Authentication hook
const authGuard = async ({ event, resolve }) => {
  const { url, cookies, request } = event;

  // Special logging for admin routes
  if (url.pathname.startsWith("/admin")) {
  }

  // Define routes that don't require authentication
  const publicRoutes = [
    "/login",
    "/login/basic",
    "/register", // User registration page
    "/setup", // Setup pages need to be accessible when database is down
    "/auth/setup",
  ];

  // Define PUBLIC API routes that don't require authentication
  // All other API routes will require authentication by default
  const publicApiRoutes = [
    "/api/auth/", // Auth endpoints
    "/api/version", // Version endpoint
    "/api/images/proxy", // Image proxy
    "/api/webhooks/", // Webhooks from external services
    "/api/docs", // API documentation
    "/api/setup/", // Setup endpoints (needed during initial setup)
    "/api/health", // Health check endpoint (needed for Docker healthchecks)
  ];

  // Check if current route is public
  const isPublicRoute = publicRoutes.some((route) =>
    url.pathname.startsWith(route),
  );

  // Check if this is a public API route
  const isPublicApiRoute = publicApiRoutes.some((route) =>
    url.pathname.startsWith(route),
  );

  // Skip auth check for public routes and public API endpoints only
  if (isPublicRoute || isPublicApiRoute) {
    return resolve(event);
  }

  // Check authentication for protected pages and authenticated API routes
  let user = null;

  try {
    // First, check for API key authentication in Authorization header
    const authHeader = request.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const apiKey = authHeader.substring(7);
      try {
        const { authenticateApiKey } = await import("$lib/apiKeys.js");
        user = await authenticateApiKey(apiKey);
        if (user) {
          user.auth_type = "api_key";
        }
      } catch (error) {
        console.error("🔑 API key authentication failed:", error);
      }
    }

    // If no API key, try Authentik session
    if (!user) {
      const sessionCookie = cookies.get("session");
      if (sessionCookie) {
        user = await getSession(`session=${sessionCookie}`);
      }
    }

    // Try basic auth session if no Authentik session
    if (!user) {
      const basicAuthSession = cookies.get("basic_auth_session");
      if (basicAuthSession) {
        user = getBasicAuthUser(basicAuthSession);
      }
    }
  } catch (error) {
    console.error("🔐 AUTH GUARD: Auth check error:", error);
  }

  // Set user in locals for all routes (they may need it in the handler)
  event.locals.user = user;

  // For API routes (excluding admin API routes), return 401 if no user
  // Note: /admin/api/* routes are admin pages, not public API endpoints
  if (
    url.pathname.startsWith("/api/") &&
    !url.pathname.startsWith("/admin/") &&
    !user
  ) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Authentication required",
        message:
          "Please provide a valid API key in the Authorization header (Bearer <token>)",
      }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // For regular pages (not API), redirect to login if not authenticated
  if (!user && !url.pathname.startsWith("/api/")) {
    throw redirect(302, "/login");
  }

  return resolve(event);
};

export const handle = sequence(authGuard, performanceTiming, cacheHeaders);
