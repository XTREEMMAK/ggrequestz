/**
 * Remove game from user's watchlist
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
    const { game_id } = await request.json();

    if (!game_id) {
      throw error(400, "Missing game_id");
    }

    // Check if game is in watchlist and remove it
    const success = await watchlist.remove(user.sub, game_id);

    if (!success) {
      return json(
        {
          success: false,
          error: "Game is not in your watchlist",
        },
        { status: 400 },
      );
    }

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
