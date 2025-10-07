/**
 * Add game to user's watchlist
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
    const { game_id, game_data } = body;

    // Enhanced validation for game_id
    if (!game_id && game_id !== 0) {
      console.error("Watchlist add - missing game_id:", { body, game_id });
      throw error(400, "Missing game_id");
    }

    if (!game_data) {
      throw error(400, "Missing game_data");
    }

    // Ensure game_id is numeric
    const numericGameId = parseInt(game_id);
    if (isNaN(numericGameId)) {
      console.error("Watchlist add - invalid game_id:", {
        game_id,
        type: typeof game_id,
      });
      throw error(400, "Invalid game_id format");
    }

    // Check if already in watchlist
    const alreadyExists = await watchlist.contains(localUserId, numericGameId);
    if (alreadyExists) {
      return json(
        {
          success: false,
          error: "Game is already in your watchlist",
        },
        { status: 400 },
      );
    }

    // Add to watchlist
    const watchlistItem = await watchlist.add(localUserId, numericGameId);

    // Invalidate watchlist-related cache entries
    await invalidateCache([
      `watchlist-${localUserId}-${numericGameId}`,
      `user-${localUserId}-watchlist`,
      // Also clear any game detail caches for this game
      `game-details-${numericGameId}`,
    ]);

    return json({
      success: true,
      watchlist_item: watchlistItem,
    });
  } catch (err) {
    console.error("Add to watchlist error:", err);

    if (err.status) {
      throw err; // Re-throw SvelteKit errors
    }

    throw error(500, "Failed to add to watchlist");
  }
}
