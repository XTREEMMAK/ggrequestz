/**
 * Lightweight watchlist status API endpoint
 * Returns real-time watchlist status for a specific game without affecting page cache
 */

import { json, error } from "@sveltejs/kit";
import { watchlist } from "$lib/database.js";

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
    // Convert user.sub to the correct userId format for database lookup
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
        throw error(404, "User not found in database");
      }
      userId = userResult.rows[0].id;
    }

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
