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
import { safeAsync, withTimeout } from "$lib/utils.js";

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

    // Check if ROMM is available (with caching and timeout)
    const rommAvailable = await safeAsync(
      () => withCache(
        'romm-availability',
        () => withTimeout(isRommAvailable(cookieHeader), 3000, 'ROMM availability check timed out'),
        2 * 60 * 1000 // 2 minutes
      ),
      { 
        timeout: 4000, 
        fallback: false, 
        errorContext: 'ROMM availability check' 
      }
    );

    // Prioritize critical data first - load games without ROMM cross-reference for speed
    const criticalDataPromise = Promise.all([
      // Get new releases from IGDB (fast, no ROMM cross-reference yet)
      safeAsync(
        () => cacheRecentGames(() => getRecentGames(8)),
        { timeout: 8000, fallback: [], errorContext: 'Recent games loading' }
      ),

      // Get popular games from IGDB (fast, no ROMM cross-reference yet)
      safeAsync(
        () => cachePopularGames(() => getPopularGames(8)),
        { timeout: 8000, fallback: [], errorContext: 'Popular games loading' }
      ),

      // Get recent game requests (with caching)
      safeAsync(
        () => cacheGameRequests(() => gameRequests.getRecent(6)),
        { timeout: 5000, fallback: [], errorContext: 'Recent requests loading' }
      ),

      // Get user's watchlist - handle both auth types properly
      safeAsync(
        async () => {
          let userId;
          
          if (user.sub?.startsWith('basic_auth_')) {
            // For Basic Auth users, extract actual user ID from sub
            userId = user.sub.replace('basic_auth_', '');
          } else {
            // For Authentik users, look up database ID by authentik_sub
            const { query } = await import('$lib/database.js');
            const userResult = await query(
              "SELECT id FROM ggr_users WHERE authentik_sub = $1",
              [user.sub]
            );
            if (userResult.rows.length === 0) {
              throw new Error('User not found in database');
            }
            userId = userResult.rows[0].id;
          }
          
          return watchlist.get(userId);
        },
        { timeout: 3000, fallback: [], errorContext: 'User watchlist loading' }
      ),
    ]);

    // Secondary data - ROMM integration (can be slower)
    const secondaryDataPromise = rommAvailable
      ? Promise.all([
          // Get top 16 newest ROMs from ROMM library
          safeAsync(
            () => cacheRommGames(
              () => getRecentlyAddedROMs(16, 0, cookieHeader),
              0
            ),
            { timeout: 10000, fallback: [], errorContext: 'ROMM library loading' }
          ),
          // ROMM cross-reference for critical games (will be done client-side for better UX)
        ])
      : Promise.resolve([[], []]);

    // Wait for critical data first
    const [newReleases, popularGames, recentRequests, userWatchlist] = await criticalDataPromise;
    
    // Get secondary data
    const [newInLibrary] = await secondaryDataPromise;


    // If no games were loaded, start cache warming in background
    if (newReleases.length === 0 && popularGames.length === 0) {
      warmUpCache().catch(error => {
        console.error('❌ Failed to warm up cache:', error);
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
      needsRommCrossReference: rommAvailable && (newReleases.length > 0 || popularGames.length > 0),
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
