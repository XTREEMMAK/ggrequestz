/**
 * API endpoint for paginated popular games directly from IGDB
 */

import { json, error } from "@sveltejs/kit";
import { getPopularGames } from "$lib/igdb.js";
import { isRommAvailable, crossReferenceWithROMM } from "$lib/romm.server.js";
import { cachePopularGames, invalidateCache, withCache } from "$lib/cache.js";

export async function GET({ url }) {
  try {
    const searchParams = url.searchParams;
    const page = parseInt(searchParams.get("page")) || 1;
    const limit = parseInt(searchParams.get("limit")) || 12;
    const bypassCache = searchParams.get("fresh") === "true";

    // Calculate offset for pagination
    const offset = (page - 1) * limit;

    // Check if ROMM is available for cross-referencing
    const rommAvailable = await isRommAvailable();

    // Force cache refresh if explicitly requested
    const forceRefresh = searchParams.get("refresh") === "true";

    if (forceRefresh) {
      console.log("🧹 FORCING CACHE REFRESH...");
      await invalidateCache("popular-games");
    }

    // Simple approach: fetch more games dynamically without complex cache expansion
    let allGames;

    // For the first few pages, use cached popular games
    // But if we need more games than cache has, fetch directly
    if (page <= 3 && offset + limit <= 50) {
      allGames = await cachePopularGames(() => getPopularGames(50, 0));
    } else {
      // For higher pages, fetch directly from IGDB starting from offset
      console.log(
        `🔄 Fetching page ${page} directly from IGDB with offset ${offset}`,
      );
      allGames = await getPopularGames(limit, offset);
    }

    // Only refresh cache if we get 0 games (actual error), not just fewer than expected
    // Docker environments may have different cache states
    if (allGames.length === 0 && !forceRefresh) {
      console.log("⚠️ No games in cache, attempting refresh...");
      await invalidateCache("popular-games");
      allGames = await cachePopularGames(async () => {
        console.log("🔄 Re-fetching fresh popular games from IGDB...");
        const freshGames = await getPopularGames(50, 0); // Get more for pagination
        console.log(
          "📊 Refreshed - First 3 popular games:",
          freshGames.slice(0, 3).map((g) => g.title),
        );
        return freshGames;
      });
    }

    console.log("📊 Cached popular games total:", allGames.length);
    console.log(
      "📊 First 3 cached games:",
      allGames.slice(0, 3).map((g) => g.title),
    );

    // Apply pagination based on approach
    let games;
    if (page <= 3 && offset + limit <= 50) {
      // Use normal pagination for cached results
      games = allGames.slice(offset, offset + limit);
      console.log(
        `📊 Page ${page} (offset ${offset}, limit ${limit}) from cache:`,
        games.map((g) => g.title),
      );
    } else {
      // For higher pages, we fetched exactly what we need
      games = allGames;
      console.log(
        `📊 Page ${page} direct fetch (${games.length} games):`,
        games.map((g) => g.title),
      );
    }

    // Cross-reference with ROMM if available
    if (rommAvailable && games.length > 0) {
      games = await crossReferenceWithROMM(games);
    }

    // Simple hasMore logic: if we got exactly what we asked for, there might be more
    const hasMore = games.length === limit;

    console.log(
      `📊 hasMore logic: games=${games.length}, limit=${limit}, hasMore=${hasMore}`,
    );

    return json({
      success: true,
      games,
      page,
      limit,
      hasMore,
    });
  } catch (err) {
    console.error("Popular games API error:", err);
    throw error(500, "Failed to fetch popular games");
  }
}
