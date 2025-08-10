/**
 * IGDB API proxy endpoint with cache-first strategy
 */

import { json, error } from "@sveltejs/kit";
import {
  searchGames,
  getGameById,
  getPopularGames,
  getRecentGames,
} from "$lib/gameCache.js";

export async function GET({ url }) {
  try {
    const searchParams = url.searchParams;
    const action = searchParams.get("action");
    const query = searchParams.get("q");
    const limit = parseInt(searchParams.get("limit")) || 10;
    const id = searchParams.get("id");

    let result = [];

    switch (action) {
      case "search":
        if (!query) {
          throw error(400, "Query parameter is required for search");
        }
        result = await searchGames(query, limit);
        break;

      case "game":
        if (!id) {
          throw error(400, "ID parameter is required for game details");
        }
        const game = await getGameById(id);
        result = game ? [game] : [];
        break;

      case "popular":
        result = await getPopularGames(limit);
        break;

      case "recent":
        result = await getRecentGames(limit);
        break;

      default:
        throw error(
          400,
          "Invalid action parameter. Use: search, game, popular, or recent",
        );
    }

    return json({
      success: true,
      data: result,
      count: result.length,
    });
  } catch (err) {
    console.error("IGDB API error:", err);

    if (err.status) {
      throw err; // Re-throw SvelteKit errors
    }

    throw error(500, "Failed to fetch data from IGDB");
  }
}

export async function POST({ request }) {
  try {
    const { action, query, limit = 10, id } = await request.json();

    let result = [];

    switch (action) {
      case "search":
        if (!query) {
          throw error(400, "Query is required for search");
        }
        result = await searchGames(query, limit);
        break;

      case "batch_search":
        if (!Array.isArray(query)) {
          throw error(400, "Query must be an array for batch search");
        }

        // Perform multiple searches in parallel
        const searchPromises = query.map((q) => searchGames(q, 5));
        const searchResults = await Promise.all(searchPromises);
        result = searchResults.flat();
        break;

      default:
        throw error(400, "Invalid action for POST request");
    }

    return json({
      success: true,
      data: result,
      count: result.length,
    });
  } catch (err) {
    console.error("IGDB API POST error:", err);

    if (err.status) {
      throw err; // Re-throw SvelteKit errors
    }

    throw error(500, "Failed to process IGDB request");
  }
}
