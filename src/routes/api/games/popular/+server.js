/**
 * API endpoint for paginated popular games directly from IGDB
 */

import { json, error } from "@sveltejs/kit";
import { getPopularGames } from "$lib/igdb.js";
import { isRommAvailable, crossReferenceWithROMM } from "$lib/romm.js";
import { cachePopularGames, invalidateCache } from "$lib/cache.js";

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

    // Force cache refresh if we detect corrupted cache (< 20 games)
    const forceRefresh = searchParams.get("refresh") === "true";
    
    if (forceRefresh) {
      console.log('🧹 FORCING CACHE REFRESH...');
      await invalidateCache('popular-games');
    }
    
    // Get popular games with optional cache bypass
    let allGames = await cachePopularGames(async () => {
      console.log('🔄 Fetching fresh popular games from IGDB...');
      const freshGames = await getPopularGames(50, 0); // Get more for pagination
      console.log('📊 First 3 popular games:', freshGames.slice(0, 3).map(g => g.title));
      return freshGames;
    });
    
    // If we get too few games, the cache might be corrupted - refresh it
    if (allGames.length < 20 && !forceRefresh) {
      console.log('⚠️ Cache appears corrupted (only', allGames.length, 'games), refreshing...');
      await invalidateCache('popular-games');
      allGames = await cachePopularGames(async () => {
        console.log('🔄 Re-fetching fresh popular games from IGDB...');
        const freshGames = await getPopularGames(50, 0); // Get more for pagination
        console.log('📊 Refreshed - First 3 popular games:', freshGames.slice(0, 3).map(g => g.title));
        return freshGames;
      });
    }
    
    console.log('📊 Cached popular games total:', allGames.length);
    console.log('📊 First 3 cached games:', allGames.slice(0, 3).map(g => g.title));
    
    // Apply pagination to cached results
    let games = allGames.slice(offset, offset + limit);
    console.log(`📊 Page ${page} (offset ${offset}, limit ${limit}):`, games.map(g => g.title));

    // Cross-reference with ROMM if available
    if (rommAvailable && games.length > 0) {
      games = await crossReferenceWithROMM(games);
    }

    return json({
      success: true,
      games,
      page,
      limit,
      hasMore: offset + limit < allGames.length,
    });
  } catch (err) {
    console.error("Popular games API error:", err);
    throw error(500, "Failed to fetch popular games");
  }
}
