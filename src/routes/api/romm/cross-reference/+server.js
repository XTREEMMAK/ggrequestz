/**
 * ROMM Cross-Reference API Endpoint
 * Handles client-side requests for ROMM availability checking
 */

import { json, error } from "@sveltejs/kit";
import { crossReferenceWithROMM } from "$lib/romm.server.js";
import { getGameById } from "$lib/gameCache.js";

export async function POST({ request, cookies }) {
  try {
    const { gameIds } = await request.json();

    if (!Array.isArray(gameIds) || gameIds.length === 0) {
      throw error(400, "Invalid gameIds provided");
    }

    // Limit batch size to prevent abuse
    if (gameIds.length > 20) {
      throw error(400, "Too many games in batch (max 20)");
    }

    // Get cookie header for ROMM authentication
    const cookieHeader = request.headers.get("cookie");

    // Get game data for the requested IDs
    const gamePromises = gameIds.map((id) => getGameById(id.toString()));
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
