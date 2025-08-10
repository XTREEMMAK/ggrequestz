/**
 * API endpoint for paginated popular games directly from IGDB
 */

import { json, error } from "@sveltejs/kit";
import { getPopularGames } from "$lib/igdb.js";
import { isRommAvailable, crossReferenceWithROMM } from "$lib/romm.js";

export async function GET({ url }) {
  try {
    const searchParams = url.searchParams;
    const page = parseInt(searchParams.get("page")) || 1;
    const limit = parseInt(searchParams.get("limit")) || 12;

    // Calculate offset for pagination
    const offset = (page - 1) * limit;

    // Check if ROMM is available for cross-referencing
    const rommAvailable = await isRommAvailable();

    // Get popular games directly from IGDB
    let games = await getPopularGames(limit, offset);

    // Cross-reference with ROMM if available
    if (rommAvailable && games.length > 0) {
      games = await crossReferenceWithROMM(games);
    }

    return json({
      success: true,
      games,
      page,
      limit,
      hasMore: games.length === limit,
    });
  } catch (err) {
    console.error("Popular games API error:", err);
    throw error(500, "Failed to fetch popular games");
  }
}
