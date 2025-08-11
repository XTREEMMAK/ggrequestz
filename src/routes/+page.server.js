/**
 * Homepage data loader - fetches dashboard data using cache-first strategy
 */

import { getRecentGames, getPopularGames, warmUpCache } from "$lib/gameCache.js";
import { gameRequests, watchlist } from "$lib/database.js";
import {
  getRecentlyAddedROMs,
  isRommAvailable,
  crossReferenceWithROMM,
} from "$lib/romm.js";
import {
  cachePopularGames,
  cacheRecentGames,
  cacheRommGames,
  cacheGameRequests,
  withCache
} from "$lib/cache.js";

import { redirect } from "@sveltejs/kit";

export async function load({ parent, cookies, url }) {
  const { user, needsSetup, authMethod } = await parent();
  
  
  // Redirect to setup if initial setup is needed
  if (needsSetup) {
    throw redirect(302, "/setup");
  }
  
  // Redirect unauthenticated users to login page
  if (!user) {
    throw redirect(302, "/login");
  }

  try {
    if (process.env.NODE_ENV === 'development') {
    }

    // Get cookies for ROMM authentication
    const cookieHeader = cookies.get("session")
      ? `session=${cookies.get("session")}`
      : null;

    // Check if ROMM is available (with caching)
    const rommAvailable = await withCache(
      'romm-availability',
      () => isRommAvailable(cookieHeader),
      2 * 60 * 1000 // 2 minutes
    );

    // Fetch data in parallel with caching for better performance
    const [
      newInLibrary,
      newReleases,
      popularGames,
      recentRequests,
      userWatchlist,
    ] = await Promise.all([
      // Get top 16 newest ROMs from ROMM library (with caching)
      rommAvailable
        ? cacheRommGames(
            () => getRecentlyAddedROMs(16, 0, cookieHeader),
            0
          ).catch((err) => {
            console.error("Error loading new in library ROMs:", err);
            return [];
          })
        : Promise.resolve([]),

      // Get new releases from IGDB with ROMM cross-reference (with caching)
      cacheRecentGames(
        () => getRecentGames(8).then((games) =>
          rommAvailable ? crossReferenceWithROMM(games, cookieHeader) : games,
        )
      ).catch((err) => {
        console.error("Error loading recent games:", err);
        return [];
      }),

      // Get popular games from IGDB with ROMM cross-reference (with caching)
      cachePopularGames(
        () => getPopularGames(8).then((games) =>
          rommAvailable ? crossReferenceWithROMM(games, cookieHeader) : games,
        )
      ).catch((err) => {
        console.error("Error loading popular games:", err);
        return [];
      }),

      // Get recent game requests (with caching)
      cacheGameRequests(
        () => gameRequests.getRecent(6)
      ).catch((err) => {
        console.error("Error loading recent requests:", err);
        return [];
      }),

      // Get user's watchlist
      watchlist.get(user.sub).catch((err) => {
        console.error("Error loading user watchlist:", err);
        return [];
      }),
    ]);


    // If no games were loaded, start cache warming in background
    if (newReleases.length === 0 && popularGames.length === 0) {
      warmUpCache().catch(error => {
        console.error('❌ Failed to warm up cache:', error);
      });
    }

    return {
      newInLibrary,
      // recentlyAddedROMs removed
      newReleases,
      popularGames,
      recentRequests,
      userWatchlist,
      rommAvailable,
      loading: false,
    };
  } catch (error) {
    console.error("Homepage load error:", error);
    return {
      newInLibrary: [],
      // recentlyAddedROMs removed
      newReleases: [],
      popularGames: [],
      recentRequests: [],
      userWatchlist: [],
      rommAvailable: false,
      loading: false,
      error: error.message,
    };
  }
}
