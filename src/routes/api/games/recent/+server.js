/**
 * API endpoint for paginated recent games directly from IGDB
 */

import { json, error } from "@sveltejs/kit";
import { getRecentGames } from "$lib/igdb.js";

export async function GET({ url }) {
  try {
    const searchParams = url.searchParams;
    const page = parseInt(searchParams.get("page")) || 1;
    const limit = parseInt(searchParams.get("limit")) || 12;

    // Calculate offset for pagination
    const offset = (page - 1) * limit;

    // Get recent games directly from IGDB
    const games = await getRecentGames(limit, offset);

    return json({
      success: true,
      games,
      page,
      limit,
      hasMore: games.length === limit,
    });
  } catch (err) {
    console.error("Recent games API error:", err);
    throw error(500, "Failed to fetch recent games");
  }
}
