/**
 * Search page data loader with cache-first strategy
 */

import { searchGames } from "$lib/gameCache.js";
import { watchlist, query } from "$lib/database.js";

import { redirect } from "@sveltejs/kit";

export async function load({ url, parent }) {
  const { user } = await parent();

  // Redirect unauthenticated users to login page
  if (!user) {
    throw redirect(302, "/login");
  }

  // Get search parameters from URL
  const searchQuery = url.searchParams.get("q") || "";
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
    // Perform initial search if searchQuery or filters are present
    if (searchQuery || platforms.length > 0 || genres.length > 0) {
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
        // Use IGDB search (cached games)
        const cachedResults = await searchGames(searchQuery, perPage);
        searchResults = {
          hits: cachedResults.map((game) => ({ document: game })),
          found: cachedResults.length,
          facet_counts: [],
        };
      } catch (error) {
        console.error("IGDB search failed:", error);
        // Return empty results on error
        searchResults = {
          hits: [],
          found: 0,
          facet_counts: [],
        };
      }
    }

    // Get user's watchlist if authenticated - handle both auth types properly
    if (user) {
      let userId;

      if (user.sub?.startsWith("basic_auth_")) {
        // For Basic Auth users, extract actual user ID from sub
        userId = user.sub.replace("basic_auth_", "");
      } else {
        // For Authentik users, look up database ID by authentik_sub
        const userResult = await query(
          "SELECT id FROM ggr_users WHERE authentik_sub = $1",
          [user.sub],
        );
        if (userResult.rows.length > 0) {
          userId = userResult.rows[0].id;
        }
      }

      if (userId) {
        userWatchlist = await watchlist.get(userId).catch(() => []);
      }
    }
  } catch (error) {
    console.error("Search page load error:", error);
    // Return empty results on error
  }

  return {
    query: searchQuery,
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
