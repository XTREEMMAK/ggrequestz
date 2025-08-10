/**
 * API endpoint for paginated ROMM recent games
 */

import { json, error } from "@sveltejs/kit";
import { getRecentlyAddedROMs, isRommAvailable } from "$lib/romm.js";

export async function GET({ url, request }) {
  try {
    const searchParams = url.searchParams;
    const page = parseInt(searchParams.get("page")) || 1;
    const limit = parseInt(searchParams.get("limit")) || 12;

    // Forward cookies from the client request
    const cookies = request.headers.get("cookie");

    // Check if ROMM is available
    const rommAvailable = await isRommAvailable(cookies);
    if (!rommAvailable) {
      return json({
        success: false,
        error: "ROMM service is not available",
        games: [],
      });
    }

    // Calculate offset for pagination
    const offset = (page - 1) * limit;

    // Get recent ROMs with pagination
    const games = await getRecentlyAddedROMs(limit, offset, cookies);

    return json({
      success: true,
      games,
      page,
      limit,
      hasMore: games.length === limit,
    });
  } catch (err) {
    console.error("ROMM recent API error:", err);
    throw error(500, "Failed to fetch recent ROMs");
  }
}
