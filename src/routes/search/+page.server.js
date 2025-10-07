/**
 * Search page data loader with cache-first strategy
 */

import { searchGames } from "$lib/gameCache.js";
import { watchlist, query } from "$lib/database.js";
import { getGlobalFilters, filterBannedGames } from "$lib/globalFilters.js";
import { getUserPreferences } from "$lib/userPreferences.js";
import { mergeFiltersWithGlobal } from "$lib/globalFilters.js";
import { assessContentSafety } from "$lib/contentRating.js";
import { filterGamesByGenre } from "$lib/genreFiltering.js";

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
          return {
            query: searchQuery,
            searchResults: { hits: [], found: 0, facet_counts: [] },
            userWatchlist: [],
            initialFilters: { platforms, genres, sortBy, page },
            blockedSearch: true,
          };
        }
      }

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
        let cachedResults = await searchGames(searchQuery, perPage);

        // Apply global filters
        const globalFilters = await getGlobalFilters();
        if (globalFilters && globalFilters.enabled) {
          // Filter out banned games
          cachedResults = filterBannedGames(cachedResults, globalFilters);

          // Get user preferences and merge with global filters
          let userPreferences = null;
          let userId = null;

          if (user?.sub?.startsWith("basic_auth_")) {
            userId = parseInt(user.sub.replace("basic_auth_", ""));
          } else if (user?.sub) {
            const userResult = await query(
              "SELECT id FROM ggr_users WHERE authentik_sub = $1",
              [user.sub],
            );
            if (userResult.rows.length > 0) {
              userId = userResult.rows[0].id;
            }
          }

          if (userId) {
            try {
              userPreferences = await getUserPreferences(userId);
              // Only apply user filters if they have apply_to_search enabled
              if (!userPreferences?.apply_to_search) {
                userPreferences = null;
              }
            } catch (error) {
              console.warn(
                "Failed to load user preferences for search:",
                error,
              );
            }
          }

          // Merge global filters with user preferences
          const mergedPreferences = mergeFiltersWithGlobal(
            userPreferences,
            globalFilters,
          );

          // Apply content and genre filters
          if (mergedPreferences) {
            // Filter by content safety
            cachedResults = cachedResults.filter((game) => {
              const rating = {
                esrb_rating: game.esrb_rating,
                is_mature: game.is_mature,
                is_nsfw: game.is_nsfw,
                content_warnings: game.content_warnings || [],
              };
              const safety = assessContentSafety(
                rating,
                mergedPreferences,
                game.name,
              );
              return safety.allowed;
            });

            // Filter by genres
            cachedResults = filterGamesByGenre(
              cachedResults,
              mergedPreferences,
            );
          }
        }

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
