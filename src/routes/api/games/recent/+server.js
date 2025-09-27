/**
 * API endpoint for paginated recent games directly from IGDB
 */

import { json } from "@sveltejs/kit";
import { getRecentGames } from "$lib/igdb.js";
import {
  parsePaginationParams,
  loadUserPreferences,
  handleApiError,
  buildPaginatedResponse,
} from "$lib/api/apiUtils.js";

export async function GET({ url }) {
  try {
    const searchParams = url.searchParams;
    const { page, limit, offset } = parsePaginationParams(searchParams);
    const userId = searchParams.get("user_id");

    // Get user preferences with recent games filter check
    const userPreferences = await loadUserPreferences(
      userId,
      "apply_to_recent",
    );

    // Get recent games directly from IGDB
    const games = await getRecentGames(limit, offset, userPreferences, false);

    // Return standard paginated response
    return json(buildPaginatedResponse(games, page, limit));
  } catch (err) {
    handleApiError(
      err,
      "Failed to fetch recent games",
      "Recent games API error",
    );
  }
}
