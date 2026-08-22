/**
 * SvelteKit server-side hooks for performance optimization, authentication, and security
 */

import { sequence } from "@sveltejs/kit/hooks";
import { redirect } from "@sveltejs/kit";
import { getSession } from "$lib/auth.server.js";
import { getBasicAuthUser } from "$lib/basicAuth.js";
import { verifyScopes } from "$lib/apiKeys.js";
import { resolveRequiredScope } from "$lib/apiScopes.js";
import { warmUpCache } from "$lib/gameCache.js";
import { warmPool } from "$lib/database.js";
import { probeRommAvailability } from "$lib/romm.server.js";
import { resolveLibraryConfig } from "$lib/library/config.js";
import { syncLibrary } from "$lib/library/sync.js";

/**
 * Start the library index sync loop, if the operator asked for one.
 *
 * Off unless LIBRARY_SYNC_ENABLED is exactly "true", so an existing install
 * behaves identically after upgrading.
 *
 * A cycle that throws is logged and dropped. It must not reject out of the
 * timer callback: an unhandled rejection from an async setInterval callback
 * does not stop the timer -- it terminates the *process*, as Node has done for
 * unhandled rejections since v15. The catch is what keeps one unreachable
 * backend from killing the server on the next tick.
 *
 * Started at most once. init() is its only caller and adapter-node calls that
 * once per process, but SvelteKit's prerender pass also constructs a Server and
 * calls init, and a second interval would be two timers racing for the same
 * advisory lock for the life of the process. Same lesson as the "already
 * warmed" flag below.
 *
 * The first cycle runs immediately rather than one interval from now, so a
 * fresh install is not stuck on indexBuilding for fifteen minutes. Nothing
 * awaits it: reaching the library backend must never delay the server becoming
 * ready. Overlap is safe in both directions -- across workers and against a
 * previous slow cycle in this one -- because syncLibrary takes a session
 * advisory lock and a loser returns immediately.
 */
let librarySyncStarted = false;

function startLibrarySync() {
  if (librarySyncStarted) return;

  let config;
  try {
    config = resolveLibraryConfig();
  } catch (error) {
    // A bad LIBRARY_KIND. resolveLibraryConfig refuses rather than guessing;
    // report it once here instead of on every cycle.
    console.error("❌ Library sync not started:", error?.message);
    return;
  }

  if (!config.syncEnabled) return;

  librarySyncStarted = true;

  // Logged on change only. With PM2_INSTANCES=max and a pass that outlives the
  // interval, every worker but the winner reports `locked` on every tick for as
  // long as the process lives -- one line per core per interval, forever,
  // saying nothing new. The first is worth having; the rest bury everything
  // else in the log.
  let lastSkipReason = null;

  const cycle = async () => {
    try {
      const result = await syncLibrary({
        batchSize: config.syncBatchSize,
        maxSweepRatio: config.syncMaxSweepRatio,
      });
      if (result.completed) {
        lastSkipReason = null;
        console.log(
          `📚 Library sync: ${result.upserted} indexed, ${result.removed} marked removed` +
            (result.resumed ? " (resumed pass, so nothing was swept)" : ""),
        );
      } else if (result.reason) {
        if (result.reason !== lastSkipReason) {
          console.log(`📚 Library sync skipped: ${result.reason}`);
        }
        lastSkipReason = result.reason;
      }
    } catch (error) {
      console.error(
        "❌ Library sync cycle failed (non-fatal):",
        error?.message,
      );
    }
  };

  const timer = setInterval(cycle, config.syncIntervalMs);
  // A pending timer must not be the reason the process refuses to exit.
  timer.unref?.();

  console.log(
    `📚 Library index sync enabled: every ${config.syncIntervalMs}ms, ${config.syncBatchSize} per batch`,
  );
  cycle();
}

/**
 * Server startup hook: runs once at boot, before the first request.
 *
 * Everything expensive belongs here rather than on the request path. Cache
 * warming used to be triggered by the first request, so whoever arrived after
 * a restart paid for a full-table DELETE plus IGDB round trips, and because
 * the "already warmed" flag was reset on failure, a failing warm-up re-ran on
 * *every* subsequent request.
 */
export async function init() {
  console.log("🚀 Server starting: warming database pool...");

  // Awaited: opening one connection is fast and it means the first request
  // does not pay for the pg import, TCP handshake and authentication.
  const pooled = await warmPool();
  console.log(
    pooled
      ? "✅ Database pool ready"
      : "⚠️ Database pool not ready, will connect on first query",
  );

  // Not awaited: these reach external services, and a slow or unreachable
  // dependency must never delay the server becoming ready.
  warmUpCache()
    .then(() => console.log("✅ Cache warm-up completed"))
    .catch((error) => {
      // Log and move on. The cache fills lazily on demand regardless.
      console.error("❌ Cache warm-up failed (non-fatal):", error?.message);
    });

  // Populates the availability snapshot the root layout reads, so the first
  // page render already has a real answer instead of an optimistic guess.
  probeRommAvailability().catch(() => {});

  // Nothing else fills ggr_library_entries, so without this the index can
  // never become ready and every read stays on its backend fallback.
  startLibrarySync();
}

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

// Performance timing hook
const performanceTiming = async ({ event, resolve }) => {
  const start = Date.now();

  const response = await resolve(event);
  const duration = Date.now() - start;

  // Clone headers to make them mutable
  const headers = new Headers(response.headers);

  // Emitted for every response, not just /api/*. Page renders are exactly what
  // needed measuring during the cold-start investigation.
  headers.set("X-Response-Time", `${duration}ms`);

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
    // Matches nothing: the route is "/api/webhooks", which does not start with
    // "/api/webhooks/". So the endpoint has always required authentication,
    // contrary to what this entry suggests.
    //
    // Deliberately left ineffective. It relays a caller-supplied title, message
    // and priority to Gotify and the outbound webhook receiver, so opening it up
    // would hand anyone an unauthenticated push channel to the operator. If an
    // external service ever does need to post here, give it an API key with
    // `admin:write` rather than making the route public.
    "/api/webhooks/",
    "/api/docs", // API documentation
    "/api/openapi.json", // OpenAPI spec (needed for API docs)
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

  // Enforce API key scopes.
  //
  // Scopes were recorded on every key and offered in the admin UI, but no route
  // ever checked them, so a key stamped `games:read` still carried its owner's
  // full privileges. Only API keys are subject to this; cookie sessions carry
  // no scopes and are governed by the permission system instead.
  if (user?.auth_type === "api_key" && url.pathname.startsWith("/api/")) {
    const requiredScope = resolveRequiredScope(url.pathname, request.method);
    const keyScopes = Array.isArray(user.scopes) ? user.scopes : [];

    // A null scope means the route has no entry in the table. Deny rather than
    // allow, so a route added later is closed until it is classified.
    const permitted =
      requiredScope !== null && verifyScopes(keyScopes, [requiredScope]);

    if (!permitted) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Insufficient scope",
          message: requiredScope
            ? `This API key lacks the '${requiredScope}' scope required for ${request.method} ${url.pathname}.`
            : `This endpoint is not available to API keys.`,
          required_scope: requiredScope,
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }

  // For regular pages (not API), redirect to login if not authenticated
  if (!user && !url.pathname.startsWith("/api/")) {
    throw redirect(302, "/login");
  }

  return resolve(event);
};

export const handle = sequence(authGuard, performanceTiming, cacheHeaders);

/**
 * Server-side error hook.
 *
 * There was no `handleError` export at all, so unexpected server errors were
 * reported to the client as a bare 500 with nothing written to the logs.
 */
export function handleError({ error, event, status, message }) {
  // 404s are routine; don't bury real failures in that noise.
  if (status !== 404) {
    console.error(
      `❌ ${status} ${event.request.method} ${event.url.pathname}: ${error?.message || message}`,
      error?.stack || "",
    );
  }

  return {
    message:
      status === 404
        ? "Not found"
        : "An unexpected error occurred. Please try again.",
  };
}
