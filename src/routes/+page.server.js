/**
 * Homepage data loader - fetches dashboard data using cache-first strategy
 */

import {
  getRecentGames,
  getPopularGames,
  warmUpCache,
} from "$lib/gameCache.js";
import {
  getRecentGames as igdbGetRecentGames,
  getPopularGames as igdbGetPopularGames,
} from "$lib/igdb.js";
import { getUserPreferences } from "$lib/userPreferences.js";
import { gameRequests, watchlist } from "$lib/database.js";
import {
  getRecentlyAddedROMs,
  isRommAvailable,
  crossReferenceWithROMM,
} from "$lib/romm.server.js";
import {
  cachePopularGames,
  cacheRecentGames,
  cacheRommGames,
  cacheGameRequests,
  withCache,
  getCacheStats,
} from "$lib/cache.js";
import { safeAsync, withTimeout } from "$lib/utils.js";

import { redirect } from "@sveltejs/kit";

export async function load({ parent, cookies, url, depends }) {
  const { user, needsSetup, authMethod } = await parent();

  // Establish dependency for watchlist invalidation
  depends("app:watchlist");

  // Redirect to setup if initial setup is needed
  if (needsSetup) {
    throw redirect(302, "/setup");
  }

  // Redirect unauthenticated users to login page
  if (!user) {
    throw redirect(302, "/login");
  }

  try {
    // Detect Docker environment
    const isDocker = process.env.NODE_ENV === "production";
    const timeoutMultiplier = isDocker ? 1.5 : 1; // Increase timeouts by 50% in Docker

    // Get cookies for ROMM authentication
    const cookieHeader = cookies.get("session")
      ? `session=${cookies.get("session")}`
      : null;

    // Get user ID for preferences
    let userId = user.id;
    if (!userId) {
      if (user.sub?.startsWith("basic_auth_")) {
        // For Basic Auth users, extract actual user ID from sub
        userId = user.sub.replace("basic_auth_", "");
      } else {
        // For Authentik users, look up database ID by authentik_sub
        const { query } = await import("$lib/database.js");
        const userResult = await query(
          "SELECT id FROM ggr_users WHERE authentik_sub = $1",
          [user.sub],
        );
        if (userResult.rows.length === 0) {
          throw new Error("User not found in database");
        }
        userId = userResult.rows[0].id;
      }
    }

    // Get user preferences
    let userPreferences = null;
    try {
      userPreferences = await getUserPreferences(parseInt(userId));
      // Check if user has enabled filtering for homepage sections
      const hasHomepageFiltering =
        userPreferences &&
        (userPreferences.apply_to_homepage ||
          userPreferences.apply_to_popular ||
          userPreferences.apply_to_recent);

      // If no homepage filtering is enabled, don't use preferences
      if (!hasHomepageFiltering) {
        userPreferences = null;
      }
    } catch (error) {
      console.warn("Failed to load user preferences for homepage:", error);
      userPreferences = null;
    }

    // Check if ROMM is available (with caching and timeout) - optimized for speed
    const rommAvailable = await safeAsync(
      () =>
        withCache(
          "romm-availability",
          () =>
            withTimeout(
              isRommAvailable(cookieHeader),
              1500 * timeoutMultiplier,
              "ROMM availability check timed out",
            ),
          5 * 60 * 1000, // 5 minutes cache
        ),
      {
        timeout: 2000 * timeoutMultiplier,
        fallback: false,
        errorContext: "ROMM availability check",
      },
    );

    // Prioritize critical data first - load games without ROMM cross-reference for speed
    const criticalDataPromise = Promise.all([
      // Get new releases from IGDB (optimized - fetch only what we need initially)
      safeAsync(
        async () => {
          // Fetch more games for dynamic display limits (up to 24 for wide screens)
          if (userPreferences && userPreferences.apply_to_recent) {
            // Use direct IGDB call with user preferences
            return await igdbGetRecentGames(24, 0, userPreferences);
          } else {
            // Use cached approach
            return await cacheRecentGames(() => getRecentGames(24));
          }
        },
        {
          timeout: 3000 * timeoutMultiplier,
          fallback: [],
          errorContext: "Recent games loading",
        },
      ),

      // Get popular games from IGDB (fetch more for dynamic display limits)
      safeAsync(
        async () => {
          if (userPreferences && userPreferences.apply_to_popular) {
            // Use direct IGDB call with user preferences
            return await igdbGetPopularGames(24, 0, userPreferences);
          } else {
            // Use cached approach
            return await getPopularGames(24);
          }
        },
        {
          timeout: 3000 * timeoutMultiplier,
          fallback: [],
          errorContext: "Popular games loading",
        },
      ),

      // Get recent game requests (with caching)
      safeAsync(() => cacheGameRequests(() => gameRequests.getRecent(6)), {
        timeout: 2000 * timeoutMultiplier,
        fallback: [],
        errorContext: "Recent requests loading",
      }),

      // Get user's watchlist - optimize with cache
      safeAsync(
        async () => {
          // Force a fresh database connection to avoid stale reads
          const { query } = await import("$lib/database.js");

          const userWatchlistData = await watchlist.get(userId);

          return userWatchlistData;
        },
        {
          timeout: 1500 * timeoutMultiplier,
          fallback: [],
          errorContext: "User watchlist loading",
        },
      ),
    ]);

    // Secondary data - ROMM integration (optimized)
    const secondaryDataPromise = rommAvailable
      ? Promise.all([
          // Get newest ROMs from ROMM library (increased for dynamic display limits)
          safeAsync(
            () =>
              cacheRommGames(
                () => getRecentlyAddedROMs(24, 0, cookieHeader),
                0,
              ),
            {
              timeout: 4000 * timeoutMultiplier,
              fallback: [],
              errorContext: "ROMM library loading",
            },
          ),
          // ROMM cross-reference for critical games (will be done client-side for better UX)
        ])
      : Promise.resolve([[], []]);

    // Wait for critical data first
    const [newReleases, popularGames, recentRequests, userWatchlist] =
      await criticalDataPromise;

    // Get secondary data
    const [newInLibrary] = await secondaryDataPromise;

    // If no games were loaded, start cache warming in background
    if (newReleases.length === 0 && popularGames.length === 0) {
      warmUpCache().catch((error) => {
        console.error("❌ Failed to warm up cache:", error);
      });
    }

    return {
      newInLibrary,
      newReleases,
      popularGames,
      recentRequests,
      userWatchlist,
      rommAvailable,
      loading: false,
      // Flag to indicate ROMM cross-reference should be done client-side
      needsRommCrossReference:
        rommAvailable && (newReleases.length > 0 || popularGames.length > 0),
      cookieHeader, // Pass for client-side ROMM operations
    };
  } catch (error) {
    console.error("Homepage load error:", error);
    return {
      newInLibrary: [],
      newReleases: [],
      popularGames: [],
      recentRequests: [],
      userWatchlist: [],
      rommAvailable: false,
      loading: false,
      needsRommCrossReference: false,
      error: error.message,
    };
  }
}
