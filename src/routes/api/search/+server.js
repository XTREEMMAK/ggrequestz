/**
 * IGDB-based search endpoint (replaces Typesense)
 */

import { json, error } from "@sveltejs/kit";
import { searchGames } from "$lib/gameCache.js";
import { normalizeTitle, createSearchVariations } from "$lib/utils.js";
import { getGlobalFilters, filterBannedGames } from "$lib/globalFilters.js";

export async function GET({ url }) {
  try {
    const searchParams = url.searchParams;
    const query = searchParams.get("q") || "";
    const page = parseInt(searchParams.get("page")) || 1;
    const perPage = parseInt(searchParams.get("per_page")) || 20;
    const autocomplete = searchParams.get("autocomplete") === "true";

    // Handle autocomplete requests (no filtering for autocomplete)
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

    // Check if search query contains blocked keywords from global filters
    const globalFilters = await getGlobalFilters();
    if (globalFilters && globalFilters.enabled && query) {
      const blockedKeywords = globalFilters.custom_content_blocks || [];
      const queryLower = query.toLowerCase();
      const isBlocked = blockedKeywords.some((keyword) =>
        queryLower.includes(keyword.toLowerCase()),
      );

      if (isBlocked) {
        // Return empty results if query contains blocked keywords
        return json({
          success: true,
          hits: [],
          found: 0,
          page,
          per_page: perPage,
          facet_counts: [],
          search_time_ms: 0,
          blocked: true,
        });
      }
    }

    // For regular search, get more results to handle pagination
    const limit = Math.min(perPage * page, 100); // IGDB limit
    let results = await searchGames(query, limit);

    // Apply global filters (banned games)
    if (globalFilters && globalFilters.enabled) {
      results = filterBannedGames(results, globalFilters);
    }

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

    // Check if search query contains blocked keywords from global filters
    const globalFilters = await getGlobalFilters();
    if (globalFilters && globalFilters.enabled && searchQuery) {
      const blockedKeywords = globalFilters.custom_content_blocks || [];
      const queryLower = searchQuery.toLowerCase();
      const isBlocked = blockedKeywords.some((keyword) =>
        queryLower.includes(keyword.toLowerCase()),
      );

      if (isBlocked) {
        // Return empty results if query contains blocked keywords
        return json({
          success: true,
          hits: [],
          found: 0,
          page,
          per_page: perPage,
          facet_counts: [],
          search_time_ms: 0,
          normalized_query: advanced ? searchQuery : undefined,
          blocked: true,
        });
      }
    }

    // Get results from IGDB
    const limit = Math.min(perPage * page, 100);
    let results = await searchGames(searchQuery, limit);

    // Apply global filters (banned games)
    if (globalFilters && globalFilters.enabled) {
      results = filterBannedGames(results, globalFilters);
    }

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
