/**
 * Admin API endpoint to clear game cache for testing
 */

import { json } from "@sveltejs/kit";
import { query } from "$lib/database.js";

export async function POST({ request }) {
  try {
    const { gameId, clearEsrbOnly } = await request.json();

    if (gameId) {
      // Clear specific game from cache
      await query("DELETE FROM ggr_games_cache WHERE igdb_id = $1", [gameId]);
      return json({
        success: true,
        message: `Cleared cache for game ${gameId}`,
      });
    } else if (clearEsrbOnly) {
      // Force refresh all games by setting them to stale
      const result = await query(`
        UPDATE ggr_games_cache
        SET needs_refresh = true, last_updated = '2020-01-01'
      `);
      return json({
        success: true,
        message: `Cleared ${result.rowCount} games from cache - they will be re-fetched with ESRB data`,
      });
    } else {
      // Clear all games cache (use with caution)
      await query("DELETE FROM ggr_games_cache");
      return json({ success: true, message: "Cleared all games cache" });
    }
  } catch (error) {
    console.error("Cache clear error:", error);
    return json({ success: false, error: error.message }, { status: 500 });
  }
}
