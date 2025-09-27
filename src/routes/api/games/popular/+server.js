/**
 * API endpoint for paginated popular games directly from IGDB
 */

import { json } from "@sveltejs/kit";
import { getPopularGames } from "$lib/igdb.js";
import { isRommAvailable, crossReferenceWithROMM } from "$lib/romm.server.js";
import { cachePopularGames, invalidateCache, withCache } from "$lib/cache.js";
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
    const bypassCache = searchParams.get("fresh") === "true";
    const userId = searchParams.get("user_id");

    // Get user preferences with popular games filter check
    const userPreferences = await loadUserPreferences(
      userId,
      "apply_to_popular",
    );

    // Check if ROMM is available for cross-referencing
    const rommAvailable = await isRommAvailable();

    // Force cache refresh if explicitly requested
    const forceRefresh = searchParams.get("refresh") === "true";

    if (forceRefresh) {
      await invalidateCache("popular-games");
    }

    // Simplified approach: direct IGDB query like Recent Games
    const games = await getPopularGames(limit, offset, userPreferences, false);

    // TEMPORARY: Skip ROMM cross-reference for debugging
    // if (rommAvailable && games.length > 0) {
    //   games = await crossReferenceWithROMM(games);
    // }

    // Return standard paginated response
    return json(buildPaginatedResponse(games, page, limit));
  } catch (err) {
    handleApiError(
      err,
      "Failed to fetch popular games",
      "Popular games API error",
    );
  }
}
