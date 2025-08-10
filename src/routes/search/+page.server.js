/**
 * Search page data loader with cache-first strategy
 */

import { searchGames as searchCachedGames } from "$lib/gameCache.js";
import { searchGames } from "$lib/typesense.js";
import { watchlist } from "$lib/database.js";

import { redirect } from "@sveltejs/kit";

export async function load({ url, parent }) {
  const { user } = await parent();
  
  // Redirect unauthenticated users to login page
  if (!user) {
    throw redirect(302, "/login");
  }

  // Get search parameters from URL
  const query = url.searchParams.get("q") || "";
  const platforms =
    url.searchParams.get("platforms")?.split(",").filter(Boolean) || [];
  const genres =
    url.searchParams.get("genres")?.split(",").filter(Boolean) || [];
  const sortBy = url.searchParams.get("sort") || "popularity:desc";
  const page = parseInt(url.searchParams.get("page")) || 1;
  const perPage = 20;

  let searchResults = { hits: [], found: 0, facet_counts: [] };
  let userWatchlist = [];

  try {
    // Perform initial search if query or filters are present
    if (query || platforms.length > 0 || genres.length > 0) {
      // Build filters
      let filters = [];
      if (platforms.length > 0) {
        filters.push(
          `platforms:=[${platforms.map((p) => `'${p}'`).join(",")}]`,
        );
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

      try {
        // Try Typesense first for advanced search
        searchResults = await searchGames(query, searchOptions);
      } catch (error) {
        console.error(
          "Typesense search failed, falling back to cache search:",
          error,
        );
        // Fallback to cached games search
        const cachedResults = await searchCachedGames(query, perPage);
        searchResults = {
          hits: cachedResults.map((game) => ({ document: game })),
          found: cachedResults.length,
          facet_counts: [],
        };
      }
    }

    // Get user's watchlist if authenticated
    if (user) {
      userWatchlist = await watchlist.get(user.sub).catch(() => []);
    }
  } catch (error) {
    console.error("Search page load error:", error);
    // Return empty results on error
  }

  return {
    query,
    searchResults,
    userWatchlist,
    initialFilters: {
      platforms,
      genres,
      sortBy,
      page,
    },
  };
}
