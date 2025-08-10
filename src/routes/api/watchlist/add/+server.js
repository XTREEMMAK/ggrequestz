/**
 * Add game to user's watchlist
 */

import { json, error } from "@sveltejs/kit";
import { requireAuth } from "$lib/auth.js";
import { watchlist } from "$lib/database.js";

export async function POST({ request }) {
  try {
    // Verify authentication
    const user = await requireAuth(request);
    if (!user) {
      throw error(401, "Authentication required");
    }

    // Parse request data
    const { game_id, game_data } = await request.json();

    if (!game_id || !game_data) {
      throw error(400, "Missing game_id or game_data");
    }

    // Check if already in watchlist
    const alreadyExists = await watchlist.contains(user.sub, game_id);
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
    const watchlistItem = await watchlist.add(user.sub, game_id);

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
