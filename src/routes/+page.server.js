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
import {
  getGlobalFilters,
  mergeFiltersWithGlobal,
} from "$lib/globalFilters.js";

export async function load({ parent, cookies, url, depends }) {
  const { user, needsSetup, authMethod } = await parent();

  // Establish dependencies for cache invalidation
  depends("app:watchlist");
  depends("app:preferences"); // Re-fetch when preferences change

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

    // Get user ID for preferences with caching to avoid repeated database lookups
    let userId = user.id;
    if (!userId) {
      if (user.sub?.startsWith("basic_auth_")) {
        // For Basic Auth users, extract actual user ID from sub
        userId = user.sub.replace("basic_auth_", "");
      } else {
        // For Authentik users, look up database ID by authentik_sub with caching
        const userLookupCacheKey = `user-lookup-${user.sub}`;
        userId = await withCache(
          userLookupCacheKey,
          async () => {
            const { query } = await import("$lib/database.js");
            const userResult = await query(
              "SELECT id FROM ggr_users WHERE authentik_sub = $1",
              [user.sub],
            );
            if (userResult.rows.length === 0) {
              throw new Error("User not found in database");
            }
            return userResult.rows[0].id;
          },
          10 * 60 * 1000, // 10 minute cache for user lookups
        );
      }
    }

    // Get user preferences and merge with global filters
    let userPreferences = null;
    try {
      // Always load global filters
      const globalFilters = await getGlobalFilters();

      // Load user preferences
      userPreferences = await getUserPreferences(parseInt(userId));

      // Check if user has enabled filtering for homepage sections
      const hasHomepageFiltering =
        userPreferences &&
        (userPreferences.apply_to_homepage ||
          userPreferences.apply_to_popular ||
          userPreferences.apply_to_recent);

      // Clear user preferences if they haven't enabled homepage filtering
      // (Global filters will still be applied via merge)
      if (!hasHomepageFiltering) {
        userPreferences = null;
      }

      // Merge global filters with user preferences (global takes precedence)
      // If global filters are enabled, this will return an object with banned_games etc.
      // even if userPreferences is null
      userPreferences = mergeFiltersWithGlobal(userPreferences, globalFilters);

      // Only set to null if both global filters are disabled AND no user preferences
      if (!globalFilters.enabled && !hasHomepageFiltering) {
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

    // Prioritize critical data first - load games with enhanced caching
    const criticalDataPromise = Promise.all([
      // Get new releases from IGDB (restored to 24 games with enhanced caching)
      safeAsync(
        async () => {
          // Always apply filters if we have merged preferences (includes global filters)
          if (userPreferences) {
            // Try to use cached filtered results first
            const cacheKey = `recent-games-filtered-${userId}`;
            return await withCache(
              cacheKey,
              () => igdbGetRecentGames(24, 0, userPreferences, false),
              5 * 60 * 1000, // Cache filtered results for 5 minutes
            );
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

      // Get popular games from IGDB (restored to 24 games with enhanced caching)
      safeAsync(
        async () => {
          // Always apply filters if we have merged preferences (includes global filters)
          if (userPreferences) {
            // Try to use cached filtered results first
            const cacheKey = `popular-games-filtered-${userId}`;
            return await withCache(
              cacheKey,
              () => igdbGetPopularGames(24, 0, userPreferences, false),
              5 * 60 * 1000, // Cache filtered results for 5 minutes
            );
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

    // Secondary data - ROMM integration (optimized with enhanced caching)
    const secondaryDataPromise = rommAvailable
      ? Promise.all([
          // Get newest ROMs from ROMM library (20 initial for new simplified loading strategy)
          safeAsync(
            () =>
              cacheRommGames(
                () => getRecentlyAddedROMs(20, 0, cookieHeader),
                "0-v20", // Changed cache key to force fresh fetch with 20 games
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
      resolvedUserId: userId, // Pass the resolved database user ID for client-side API calls
      // PERFORMANCE OPTIMIZATION: Enhanced caching and navigation optimizations applied
      hasUserPreferences: !!userPreferences, // Whether user has filtering preferences
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
