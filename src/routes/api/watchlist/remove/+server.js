/**
 * Remove game from user's watchlist
 */

import { json, error } from "@sveltejs/kit";
import { getAuthenticatedUser } from "$lib/auth.server.js";
import { getUserIdFromAuth } from "$lib/getUserId.js";
import { watchlist } from "$lib/database.js";
import { query } from "$lib/database.js";
import { invalidateCache } from "$lib/cache.js";

export async function POST({ request, cookies }) {
  try {
    // Verify authentication (supports session, basic auth, and API keys)
    const user = await getAuthenticatedUser(cookies, request);
    if (!user) {
      throw error(401, "Authentication required");
    }

    // Get user's database ID
    const localUserId = await getUserIdFromAuth(user, query);

    // Parse request data
    const body = await request.json();
    const { game_id } = body;

    // Enhanced validation for game_id
    if (!game_id && game_id !== 0) {
      throw error(400, "Missing game_id");
    }

    // Ensure game_id is numeric
    const numericGameId = parseInt(game_id);
    if (isNaN(numericGameId)) {
      throw error(400, "Invalid game_id format");
    }

    // Check if game is in watchlist and remove it
    const success = await watchlist.remove(localUserId, numericGameId);

    if (!success) {
      return json(
        {
          success: false,
          error: "Game is not in your watchlist",
        },
        { status: 400 },
      );
    }

    // Invalidate watchlist-related cache entries
    await invalidateCache([
      `watchlist-${localUserId}-${numericGameId}`,
      `user-${localUserId}-watchlist`,
      // Also clear any game detail caches for this game
      `game-details-${numericGameId}`,
    ]);

    return json({
      success: true,
      message: "Game removed from watchlist",
    });
  } catch (err) {
    console.error("Remove from watchlist error:", err);

    if (err.status) {
      throw err; // Re-throw SvelteKit errors
    }

    throw error(500, "Failed to remove from watchlist");
  }
}
