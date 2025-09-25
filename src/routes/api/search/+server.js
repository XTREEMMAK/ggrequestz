/**
 * IGDB-based search endpoint (replaces Typesense)
 */

import { json, error } from "@sveltejs/kit";
import { searchGames } from "$lib/gameCache.js";
import { normalizeTitle, createSearchVariations } from "$lib/utils.js";

export async function GET({ url }) {
  try {
    const searchParams = url.searchParams;
    const query = searchParams.get("q") || "";
    const page = parseInt(searchParams.get("page")) || 1;
    const perPage = parseInt(searchParams.get("per_page")) || 20;
    const autocomplete = searchParams.get("autocomplete") === "true";

    // Handle autocomplete requests
    if (autocomplete) {
      if (query.length < 2) {
        return json({
          success: true,
          suggestions: [],
        });
      }

      // Use IGDB search for autocomplete with small limit
      const results = await searchGames(query, 5);
      const suggestions = results.map((game) => game.name);

      return json({
        success: true,
        suggestions,
      });
    }

    // For regular search, get more results to handle pagination
    const limit = Math.min(perPage * page, 100); // IGDB limit
    const results = await searchGames(query, limit);

    // Calculate pagination
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    const paginatedResults = results.slice(startIndex, endIndex);

    // Format results to match Typesense structure
    const hits = paginatedResults.map((game) => ({
      document: game,
    }));

    return json({
      success: true,
      hits,
      found: results.length,
      page,
      per_page: perPage,
      facet_counts: [], // No faceting with IGDB
      search_time_ms: 0, // Not tracked
    });
  } catch (err) {
    console.error("Search API error:", err);
    throw error(500, "Failed to perform search");
  }
}

export async function POST({ request }) {
  try {
    const {
      query = "",
      page = 1,
      perPage = 20,
      advanced = false,
    } = await request.json();

    let searchQuery = query;

    // Advanced search processing
    if (advanced && query) {
      const normalizedQuery = normalizeTitle(query);
      const variations = createSearchVariations(query);

      // For IGDB, use the normalized query (variations don't work the same way)
      searchQuery = normalizedQuery;
    }

    // Get results from IGDB
    const limit = Math.min(perPage * page, 100);
    const results = await searchGames(searchQuery, limit);

    // Calculate pagination
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    const paginatedResults = results.slice(startIndex, endIndex);

    // Format results to match Typesense structure
    const hits = paginatedResults.map((game) => ({
      document: game,
    }));

    return json({
      success: true,
      hits,
      found: results.length,
      page,
      per_page: perPage,
      facet_counts: [], // No faceting with IGDB
      search_time_ms: 0, // Not tracked
      normalized_query: advanced ? searchQuery : undefined,
    });
  } catch (err) {
    console.error("Search POST API error:", err);
    throw error(500, "Failed to process search request");
  }
}
