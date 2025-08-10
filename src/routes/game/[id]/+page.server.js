/**
 * Game details page data loader with cache-first strategy
 */

import { error, redirect } from "@sveltejs/kit";
import { getGameById } from "$lib/gameCache.js";
import { watchlist } from "$lib/database.js";
import { crossReferenceWithROMM } from "$lib/romm.js";
import { cacheGameDetails, withCache } from "$lib/cache.js";

export async function load({ params, parent, request }) {
  const { user } = await parent();
  
  // Redirect unauthenticated users to login page
  if (!user) {
    throw redirect(302, "/login");
  }
  
  const gameId = params.id;

  if (!gameId) {
    throw error(404, "Game not found");
  }

  try {
    // Get game details with comprehensive caching
    const cookieHeader = request.headers.get("cookie");
    
    const game = await cacheGameDetails(gameId, async () => {
      // Get base game details
      let gameData = await getGameById(gameId);
      
      if (!gameData) {
        throw error(404, "Game not found");
      }

      // Cross-reference with ROMM to check if game is available in library
      try {
        const [enrichedGame] = await crossReferenceWithROMM([gameData], cookieHeader);
        return enrichedGame || gameData;
      } catch (rommError) {
        console.warn("Failed to cross-reference with ROMM:", rommError);
        return gameData;
      }
    });

    let isInWatchlist = false;

    // Check if game is in user's watchlist (with shorter cache)
    if (user) {
      try {
        isInWatchlist = await withCache(
          `watchlist-${user.sub}-${gameId}`,
          () => watchlist.contains(user.sub, gameId),
          60 * 1000 // 1 minute cache for watchlist status
        );
      } catch (watchlistError) {
        console.error("Failed to check watchlist status:", watchlistError);
        // Continue without watchlist status
      }
    }

    return {
      game,
      isInWatchlist,
    };
  } catch (err) {
    console.error("Game details load error:", err);

    if (err.status === 404) {
      throw err; // Re-throw 404 errors
    }

    throw error(500, "Failed to load game details");
  }
}
