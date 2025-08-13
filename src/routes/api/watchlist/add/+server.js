/**
 * Add game to user's watchlist
 */

import { json, error } from "@sveltejs/kit";
import { requireAuth } from "$lib/auth.js";
import { watchlist } from "$lib/database.js";
import { query } from "$lib/database.js";

export async function POST({ request }) {
  try {
    // Verify authentication
    const user = await requireAuth(request);
    if (!user) {
      throw error(401, "Authentication required");
    }

    // Get user's local database ID 
    let userResult;
    let localUserId;
    
    if (user.sub?.startsWith('basic_auth_')) {
      // For basic auth, extract ID from the user.sub format: basic_auth_123
      const basicAuthId = user.sub.replace('basic_auth_', '');
      userResult = await query(
        "SELECT id FROM ggr_users WHERE id = $1 AND password_hash IS NOT NULL",
        [parseInt(basicAuthId)]
      );
    } else {
      // For Authentik users
      userResult = await query(
        "SELECT id FROM ggr_users WHERE authentik_sub = $1",
        [user.sub]
      );
    }

    if (userResult.rows.length === 0) {
      throw error(404, "User not found in database");
    }
    
    localUserId = userResult.rows[0].id;

    // Parse request data
    const body = await request.json();
    const { game_id, game_data } = body;

    // Enhanced validation for game_id
    if (!game_id && game_id !== 0) {
      console.error('Watchlist add - missing game_id:', { body, game_id });
      throw error(400, "Missing game_id");
    }

    if (!game_data) {
      throw error(400, "Missing game_data");
    }

    // Ensure game_id is numeric
    const numericGameId = parseInt(game_id);
    if (isNaN(numericGameId)) {
      console.error('Watchlist add - invalid game_id:', { game_id, type: typeof game_id });
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
