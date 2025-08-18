/**
 * Individual Game API Endpoint
 * Provides game data with caching for client-side requests
 */

import { json, error } from "@sveltejs/kit";
import { getGameById } from "$lib/gameCache.js";

export async function GET({ params, url }) {
  try {
    const gameId = params.id;

    if (!gameId || !/^\d+$/.test(gameId)) {
      throw error(400, "Invalid game ID");
    }

    const forceRefresh = url.searchParams.get("refresh") === "true";

    const game = await getGameById(gameId, forceRefresh);

    if (!game) {
      throw error(404, "Game not found");
    }

    return json(game);
  } catch (err) {
    console.error("Game API error:", err);

    if (err.status) {
      throw err; // Re-throw SvelteKit errors
    }

    throw error(500, "Internal server error");
  }
}
