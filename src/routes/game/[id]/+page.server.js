/**
 * Game details page data loader with cache-first strategy
 */

import { error, redirect } from "@sveltejs/kit";
import { getGameById } from "$lib/gameCache.js";
import { watchlist } from "$lib/database.js";
import { crossReferenceWithROMM } from "$lib/romm.server.js";
import { cacheGameDetails, withCache } from "$lib/cache.js";

export async function load({ params, parent, request, url }) {
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
    const forceRefresh = url.searchParams.get("refresh") === "true";

    let game;

    if (forceRefresh) {
      // Skip cache entirely when forcing refresh
      let gameData = await getGameById(gameId, forceRefresh);

      if (!gameData) {
        throw error(404, "Game not found");
      }

      // Cross-reference with ROMM to check if game is available in library
      try {
        const [enrichedGame] = await crossReferenceWithROMM(
          [gameData],
          cookieHeader,
        );
        game = enrichedGame || gameData;
      } catch (rommError) {
        console.warn("Failed to cross-reference with ROMM:", rommError);
        game = gameData;
      }
    } else {
      // Get base game details directly (temporarily bypass cacheGameDetails)
      let gameData = await getGameById(gameId, forceRefresh);

      if (!gameData) {
        throw error(404, "Game not found");
      }

      // Cross-reference with ROMM to check if game is available in library
      try {
        const [enrichedGame] = await crossReferenceWithROMM(
          [gameData],
          cookieHeader,
        );
        game = enrichedGame || gameData;
      } catch (rommError) {
        console.warn("Failed to cross-reference with ROMM:", rommError);
        game = gameData;
      }
    }

    // Check if game is in user's watchlist
    let isInWatchlist = false;
    if (user) {
      try {
        // Get user's local database ID using the same logic as API endpoints
        let userId;
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
            console.error("User not found in database for watchlist check");
            userId = null;
          } else {
            userId = userResult.rows[0].id;
          }
        }

        if (userId) {
          isInWatchlist = await watchlist.contains(userId, gameId);
        }
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
