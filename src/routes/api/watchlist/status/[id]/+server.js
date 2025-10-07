/**
 * Lightweight watchlist status API endpoint
 * Returns real-time watchlist status for a specific game without affecting page cache
 */

import { json, error } from "@sveltejs/kit";
import { watchlist } from "$lib/database.js";
import { query } from "$lib/database.js";
import { getUserIdFromAuth } from "$lib/getUserId.js";

export async function GET({ params, locals }) {
  const { user } = locals;

  if (!user) {
    throw error(401, "Authentication required");
  }

  const gameId = params.id;
  if (!gameId) {
    throw error(400, "Game ID is required");
  }

  try {
    // Get user's database ID (supports all auth types including API keys)
    const userId = await getUserIdFromAuth(user, query);

    const isInWatchlist = await watchlist.contains(userId, gameId);

    return json({
      isInWatchlist,
      gameId: parseInt(gameId),
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error("Watchlist status check error:", err);
    throw error(500, "Failed to check watchlist status");
  }
}
