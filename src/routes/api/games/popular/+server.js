/**
 * API endpoint for paginated popular games directly from IGDB
 */

import { json } from "@sveltejs/kit";
import { getPopularGames } from "$lib/igdb.js";
import { invalidateCache } from "$lib/cache.js";
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

    // Force cache refresh if explicitly requested
    const forceRefresh = searchParams.get("refresh") === "true";

    if (forceRefresh) {
      await invalidateCache("popular-games");
    }

    // Simplified approach: direct IGDB query like Recent Games
    const games = await getPopularGames(limit, offset, userPreferences, false);

    // No ROMM cross-reference here. It was disabled some time ago, but the
    // uncached isRommAvailable() probe that fed it was left in place — so this
    // route paid a live ROMM round trip, up to the full 12s retry budget, for a
    // value it discarded. If cross-referencing returns, read availability from
    // getRommAvailabilitySnapshot() rather than probing on the request path.

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
