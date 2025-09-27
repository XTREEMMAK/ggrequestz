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

    // Simple approach: fetch more games dynamically without complex cache expansion
    let allGames;

    // If user has filtering preferences, skip cache and fetch directly
    // Caching filtered results is complex and may not be worth the effort for MVP
    if (userPreferences) {
      // Fetch directly from IGDB with user preferences
      allGames = await getPopularGames(limit, offset, userPreferences);
    } else {
      // For the first few pages, use cached popular games
      // But if we need more games than cache has, fetch directly
      if (page <= 3 && offset + limit <= 50) {
        allGames = await cachePopularGames(() =>
          getPopularGames(50, 0, null, false),
        );
      } else {
        // For higher pages, fetch directly from IGDB starting from offset
        allGames = await getPopularGames(limit, offset, null, false);
      }

      // Only refresh cache if we get 0 games (actual error), not just fewer than expected
      // Docker environments may have different cache states
      if (allGames.length === 0 && !forceRefresh) {
        await invalidateCache("popular-games");
        allGames = await cachePopularGames(async () => {
          const freshGames = await getPopularGames(50, 0, null, false);
          return freshGames;
        });
      }
    }

    // Apply pagination based on approach
    let games;
    if (userPreferences) {
      // For filtered results, we already fetched exactly what we need
      games = allGames;
    } else if (page <= 3 && offset + limit <= 50) {
      // Use normal pagination for cached results
      games = allGames.slice(offset, offset + limit);
    } else {
      // For higher pages, we fetched exactly what we need
      games = allGames;
    }

    // Cross-reference with ROMM if available
    if (rommAvailable && games.length > 0) {
      games = await crossReferenceWithROMM(games);
    }

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
