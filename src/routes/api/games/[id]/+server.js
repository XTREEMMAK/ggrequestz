/**
 * Individual Game API Endpoint
 * Provides game data with caching for client-side requests
 */

import { json, error } from "@sveltejs/kit";
import { getGameById } from "$lib/gameCache.js";

export async function GET({ params, url, request }) {
  try {
    const gameId = params.id;

    if (!gameId || !/^\d+$/.test(gameId)) {
      throw error(400, "Invalid game ID");
    }

    const forceRefresh = url.searchParams.get("refresh") === "true";
    const isPreloadRequest =
      request.headers.get("x-preload-request") === "true";

    const game = await getGameById(gameId, forceRefresh);

    if (!game) {
      throw error(404, "Game not found");
    }

    // Optimize headers for viewport preloading and Redis caching
    const headers = {
      "Cache-Control": "public, max-age=900, stale-while-revalidate=1800", // 15min cache, 30min stale
      "X-Cache-Source": "redis-optimized",
      Vary: "Accept-Encoding",
    };

    // Add preload-specific headers
    if (isPreloadRequest) {
      headers["X-Preload-Response"] = "true";
      headers["Cache-Control"] =
        "public, max-age=1800, stale-while-revalidate=3600"; // Longer cache for preloads
    }

    return json(game, { headers });
  } catch (err) {
    console.error("Game API error:", err);

    if (err.status) {
      throw err; // Re-throw SvelteKit errors
    }

    throw error(500, "Internal server error");
  }
}
