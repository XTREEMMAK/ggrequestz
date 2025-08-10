/**
 * Typesense search endpoint
 */

import { json, error } from "@sveltejs/kit";
import {
  searchGames,
  getAutocompleteSuggestions,
  initializeGamesCollection,
} from "$lib/typesense.js";
import { normalizeTitle, createSearchVariations } from "$lib/utils.js";

// Initialize Typesense collection on server start
initializeGamesCollection().catch((err) => {
  console.error("Failed to initialize Typesense collection:", err);
});

export async function GET({ url }) {
  try {
    const searchParams = url.searchParams;
    const query = searchParams.get("q") || "";
    const page = parseInt(searchParams.get("page")) || 1;
    const perPage = parseInt(searchParams.get("per_page")) || 20;
    const sortBy = searchParams.get("sort_by") || "popularity:desc";
    const platforms = searchParams.get("platforms");
    const genres = searchParams.get("genres");
    const autocomplete = searchParams.get("autocomplete") === "true";

    // Handle autocomplete requests
    if (autocomplete) {
      if (query.length < 2) {
        return json({
          success: true,
          suggestions: [],
        });
      }

      const suggestions = await getAutocompleteSuggestions(query, 5);
      return json({
        success: true,
        suggestions,
      });
    }

    // Build filters
    let filters = [];
    if (platforms) {
      const platformList = platforms.split(",").map((p) => p.trim());
      filters.push(
        `platforms:=[${platformList.map((p) => `'${p}'`).join(",")}]`,
      );
    }
    if (genres) {
      const genreList = genres.split(",").map((g) => g.trim());
      filters.push(`genres:=[${genreList.map((g) => `'${g}'`).join(",")}]`);
    }

    const searchOptions = {
      page,
      perPage,
      sortBy,
      filters: filters.length > 0 ? filters.join(" && ") : undefined,
    };

    // Perform search
    const results = await searchGames(query, searchOptions);

    return json({
      success: true,
      hits: results.hits,
      found: results.found,
      page: results.page,
      per_page: results.request_params.per_page,
      facet_counts: results.facet_counts,
      search_time_ms: results.search_time_ms,
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
      sortBy = "popularity:desc",
      platforms = [],
      genres = [],
      advanced = false,
    } = await request.json();

    let searchQuery = query;

    // Advanced search processing
    if (advanced && query) {
      // Normalize the search query
      const normalizedQuery = normalizeTitle(query);

      // Create search variations
      const variations = createSearchVariations(query);

      // Use the best variation or original query
      searchQuery =
        variations.length > 1 ? variations.join(" OR ") : normalizedQuery;
    }

    // Build filters
    let filters = [];
    if (platforms.length > 0) {
      filters.push(`platforms:=[${platforms.map((p) => `'${p}'`).join(",")}]`);
    }
    if (genres.length > 0) {
      filters.push(`genres:=[${genres.map((g) => `'${g}'`).join(",")}]`);
    }

    const searchOptions = {
      page,
      perPage,
      sortBy,
      filters: filters.length > 0 ? filters.join(" && ") : undefined,
    };

    // Perform search
    const results = await searchGames(searchQuery, searchOptions);

    return json({
      success: true,
      hits: results.hits,
      found: results.found,
      page: results.page,
      per_page: results.request_params.per_page,
      facet_counts: results.facet_counts,
      search_time_ms: results.search_time_ms,
      normalized_query: advanced ? searchQuery : undefined,
    });
  } catch (err) {
    console.error("Search POST API error:", err);
    throw error(500, "Failed to process search request");
  }
}
