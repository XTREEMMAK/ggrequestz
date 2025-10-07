/**
 * ROMM Cross-Reference API Endpoint
 * Handles client-side requests for ROMM availability checking
 */

import { json, error } from "@sveltejs/kit";
import { crossReferenceWithROMM } from "$lib/romm.server.js";
import { getGameById } from "$lib/gameCache.js";
import { getGlobalFilters } from "$lib/globalFilters.js";

export async function POST({ request, cookies }) {
  try {
    const { gameIds } = await request.json();

    if (!Array.isArray(gameIds) || gameIds.length === 0) {
      throw error(400, "Invalid gameIds provided");
    }

    // Filter out globally banned games
    const globalFilters = await getGlobalFilters();
    let filteredGameIds = gameIds;

    if (
      globalFilters &&
      globalFilters.enabled &&
      Array.isArray(globalFilters.banned_games) &&
      globalFilters.banned_games.length > 0
    ) {
      const bannedSet = new Set(
        globalFilters.banned_games.map((id) => id.toString()),
      );
      const originalCount = gameIds.length;
      filteredGameIds = gameIds.filter((id) => !bannedSet.has(id.toString()));

      if (filteredGameIds.length < originalCount) {
        console.log(
          `🚫 Filtered ${originalCount - filteredGameIds.length} banned games from ROMM cross-reference`,
        );
      }
    }

    if (filteredGameIds.length === 0) {
      return json({ enrichedGames: [] });
    }

    // Limit batch size to prevent abuse
    if (filteredGameIds.length > 20) {
      throw error(400, "Too many games in batch (max 20)");
    }

    // Get cookie header for ROMM authentication
    const cookieHeader = request.headers.get("cookie");

    // Get game data for the requested IDs (using filtered IDs)
    const gamePromises = filteredGameIds.map((id) =>
      getGameById(id.toString()),
    );
    const games = await Promise.all(gamePromises);

    // Filter out null results
    const validGames = games.filter(Boolean);

    if (validGames.length === 0) {
      return json({ enrichedGames: [] });
    }

    // Cross-reference with ROMM
    try {
      const enrichedGames = await crossReferenceWithROMM(
        validGames,
        cookieHeader,
      );

      return json({
        enrichedGames,
        success: true,
      });
    } catch (rommError) {
      console.warn("ROMM cross-reference failed:", rommError);

      // Return original games if ROMM fails
      return json({
        enrichedGames: validGames,
        success: false,
        error: "ROMM unavailable",
      });
    }
  } catch (err) {
    console.error("ROMM cross-reference API error:", err);

    if (err.status) {
      throw err; // Re-throw SvelteKit errors
    }

    throw error(500, "Internal server error");
  }
}
