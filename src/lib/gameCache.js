/**
 * Unified games cache management system
 * Implements cache-first strategy with IGDB API fallback
 */

import { gamesCache } from "./database.js";
import {
  searchGamesByTitle as igdbSearchGames,
  getGameById as igdbGetGame,
  getPopularGames as igdbGetPopular,
  getRecentGames as igdbGetRecent,
} from "./igdb.js";
import { generateSlug } from "./utils.js";

// Cache TTL settings (in milliseconds)
const CACHE_TTL = {
  POPULAR_GAMES: 6 * 60 * 60 * 1000, // 6 hours
  RECENT_GAMES: 12 * 60 * 60 * 1000, // 12 hours
  GAME_DETAILS: 24 * 60 * 60 * 1000, // 24 hours
  SEARCH_RESULTS: 2 * 60 * 60 * 1000, // 2 hours
};

/**
 * Check if cached data is stale
 * @param {Date} lastUpdated - Last update timestamp
 * @param {number} ttl - Time to live in milliseconds
 * @returns {boolean} - Whether data is stale
 */
function isStale(lastUpdated, ttl) {
  if (!lastUpdated) return true;
  return Date.now() - new Date(lastUpdated).getTime() > ttl;
}

/**
 * Format IGDB data for cache storage
 * @param {Object} igdbGame - Raw IGDB game object
 * @returns {Object} - Formatted game data
 */
function formatForCache(igdbGame) {
  const title = igdbGame.title || igdbGame.name;
  return {
    igdb_id: igdbGame.igdb_id || igdbGame.id?.toString(),
    title: title,
    slug: igdbGame.slug || generateSlug(title),
    summary: igdbGame.summary || "",
    cover_url: igdbGame.cover_url,
    rating: igdbGame.rating,
    release_date: igdbGame.release_date,
    platforms: igdbGame.platforms || [],
    genres: igdbGame.genres || [],
    screenshots: igdbGame.screenshots || [],
    videos: igdbGame.videos || [],
    companies: igdbGame.companies || [],
    game_modes: igdbGame.game_modes || [],
    popularity_score: igdbGame.popularity_score || 0,
  };
}

/**
 * Format cached data for application use
 * @param {Object} cachedGame - Cached game object
 * @returns {Object} - Formatted game data
 */
function formatFromCache(cachedGame) {
  // Helper function to convert IGDB URLs to proxy URLs
  const toProxyUrl = (url) => {
    if (
      !url ||
      !url.includes("igdb.com") ||
      url.includes("/api/images/proxy")
    ) {
      return url;
    }
    return `/api/images/proxy?url=${encodeURIComponent(url)}`;
  };

  return {
    id: cachedGame.igdb_id,
    igdb_id: cachedGame.igdb_id,
    title: cachedGame.title,
    slug: cachedGame.slug || generateSlug(cachedGame.title),
    summary: cachedGame.summary,
    cover_url: toProxyUrl(cachedGame.cover_url),
    rating: cachedGame.rating,
    release_date: cachedGame.release_date
      ? new Date(cachedGame.release_date).getTime()
      : null,
    platforms: cachedGame.platforms || [],
    genres: cachedGame.genres || [],
    screenshots: (cachedGame.screenshots || []).map(toProxyUrl),
    videos: cachedGame.videos || [],
    companies: cachedGame.companies || [],
    game_modes: cachedGame.game_modes || [],
    popularity_score: cachedGame.popularity_score || 0,
  };
}

// Request deduplication map to prevent parallel fetches of the same game
const pendingRequests = new Map();

/**
 * Get game by ID with cache-first strategy and request deduplication
 * @param {string} igdbId - IGDB game ID
 * @param {boolean} forceRefresh - Force refresh from IGDB
 * @returns {Promise<Object|null>} - Game data or null
 */
export async function getGameById(igdbId, forceRefresh = false) {
  // Check if there's already a pending request for this game
  const requestKey = `${igdbId}-${forceRefresh}`;
  if (pendingRequests.has(requestKey)) {
    console.log(`♻️ Reusing pending request for game ${igdbId}`);
    return pendingRequests.get(requestKey);
  }

  // Create the request promise
  const requestPromise = _getGameByIdInternal(igdbId, forceRefresh);

  // Store it in the pending requests map
  pendingRequests.set(requestKey, requestPromise);

  // Clean up after completion (whether success or failure)
  requestPromise.finally(() => {
    pendingRequests.delete(requestKey);
  });

  return requestPromise;
}

/**
 * Internal implementation of getGameById
 * @private
 */
async function _getGameByIdInternal(igdbId, forceRefresh = false) {
  try {
    // Try cache first (if not forcing refresh)
    if (!forceRefresh) {
      const cached = await gamesCache.get(igdbId);
      if (cached && !isStale(cached.last_updated, CACHE_TTL.GAME_DETAILS)) {
        return formatFromCache(cached);
      }
    }

    // Fallback to IGDB API
    const igdbGame = await igdbGetGame(parseInt(igdbId));

    if (igdbGame) {
      // Cache the result
      const formattedGame = formatForCache(igdbGame);
      await gamesCache.upsert(formattedGame);
      return formatFromCache(formattedGame);
    }

    // Return cached data even if stale, if available
    const staleCache = await gamesCache.get(igdbId);
    if (staleCache) {
      return formatFromCache(staleCache);
    }

    return null;
  } catch (error) {
    console.error("Error getting game by ID:", error);

    // Try to return cached data as fallback
    const fallbackCache = await gamesCache.get(igdbId);
    return fallbackCache ? formatFromCache(fallbackCache) : null;
  }
}

/**
 * Search games with cache-first strategy
 * @param {string} query - Search query
 * @param {number} limit - Number of results
 * @returns {Promise<Array>} - Array of games
 */
export async function searchGames(query, limit = 20) {
  try {
    // Try cache first for partial matches
    const cachedResults = await gamesCache.search(query, limit);

    // If we have enough cached results, return them
    if (cachedResults.length >= Math.min(limit, 5)) {
      return cachedResults.map(formatFromCache);
    }

    // Fallback to IGDB API for comprehensive search
    const igdbResults = await igdbSearchGames(query, limit);

    if (igdbResults.length > 0) {
      // Cache all results for future searches
      const cachePromises = igdbResults.map((game) => {
        const formattedGame = formatForCache(game);
        return gamesCache.upsert(formattedGame);
      });

      // Don't wait for caching to complete
      Promise.all(cachePromises).catch((error) => {
        console.error("Error caching search results:", error);
      });

      return igdbResults;
    }

    // Return cached results if IGDB fails
    return cachedResults.map(formatFromCache);
  } catch (error) {
    console.error("Error searching games:", error);

    // Fallback to cache only
    const fallbackResults = await gamesCache.search(query, limit);
    return fallbackResults.map(formatFromCache);
  }
}

/**
 * Get popular games with cache-first strategy
 * @param {number} limit - Number of games to return
 * @param {number} offset - Offset for pagination
 * @returns {Promise<Array>} - Array of popular games
 */
export async function getPopularGames(limit = 20, offset = 0) {
  try {
    // Check if we have fresh popular games in cache
    const cachedGames = await gamesCache.getPopular(limit + offset);

    // Check if cache is fresh enough
    if (cachedGames.length > 0) {
      const freshGames = cachedGames.filter(
        (game) => !isStale(game.last_updated, CACHE_TTL.POPULAR_GAMES),
      );

      if (freshGames.length >= Math.min(limit + offset, 10)) {
        return freshGames.slice(offset, offset + limit).map(formatFromCache);
      }
    }

    // Fallback to IGDB API
    const igdbGames = await igdbGetPopular(limit, offset);

    if (igdbGames.length > 0) {
      // Cache all results
      const cachePromises = igdbGames.map((game, index) => {
        const formattedGame = formatForCache(game);
        // Add popularity score based on position
        formattedGame.popularity_score = Math.max(
          100 - (offset + index) * 2,
          1,
        );
        return gamesCache.upsert(formattedGame);
      });

      // Don't wait for caching to complete
      Promise.all(cachePromises).catch((error) => {
        console.error("Error caching popular games:", error);
      });

      return igdbGames;
    }

    // Return cached games even if stale
    return cachedGames.slice(offset, offset + limit).map(formatFromCache);
  } catch (error) {
    console.error("Error getting popular games:", error);

    // Fallback to cache only
    const fallbackGames = await gamesCache.getPopular(limit + offset);
    return fallbackGames.slice(offset, offset + limit).map(formatFromCache);
  }
}

/**
 * Get recent games with cache-first strategy
 * @param {number} limit - Number of games to return
 * @param {number} offset - Offset for pagination
 * @returns {Promise<Array>} - Array of recent games
 */
export async function getRecentGames(limit = 20, offset = 0) {
  try {
    // Check if we have fresh recent games in cache
    const cachedGames = await gamesCache.getRecent(limit + offset);

    // Check if cache is fresh enough
    if (cachedGames.length > 0) {
      const freshGames = cachedGames.filter(
        (game) => !isStale(game.last_updated, CACHE_TTL.RECENT_GAMES),
      );

      if (freshGames.length >= Math.min(limit + offset, 10)) {
        return freshGames.slice(offset, offset + limit).map(formatFromCache);
      }
    }

    // Fallback to IGDB API
    const igdbGames = await igdbGetRecent(limit, offset);

    if (igdbGames.length > 0) {
      // Cache all results
      const cachePromises = igdbGames.map((game) => {
        const formattedGame = formatForCache(game);
        return gamesCache.upsert(formattedGame);
      });

      // Don't wait for caching to complete
      Promise.all(cachePromises).catch((error) => {
        console.error("Error caching recent games:", error);
      });

      return igdbGames;
    }

    // Return cached games even if stale
    return cachedGames.slice(offset, offset + limit).map(formatFromCache);
  } catch (error) {
    console.error("Error getting recent games:", error);

    // Fallback to cache only
    const fallbackGames = await gamesCache.getRecent(limit + offset);
    return fallbackGames.slice(offset, offset + limit).map(formatFromCache);
  }
}

/**
 * Batch refresh stale games in background
 * @param {number} batchSize - Number of games to refresh at once
 * @returns {Promise<void>}
 */
export async function refreshStaleGames(batchSize = 10) {
  try {
    const staleGames = await gamesCache.getNeedingRefresh(batchSize);

    if (staleGames.length === 0) {
      return;
    }

    const refreshPromises = staleGames.map(async (game) => {
      try {
        const igdbGame = await igdbGetGame(parseInt(game.igdb_id));
        if (igdbGame) {
          const formattedGame = formatForCache(igdbGame);
          await gamesCache.upsert(formattedGame);
        }
      } catch (error) {
        console.error(`Failed to refresh game ${game.igdb_id}:`, error);
      }
    });

    await Promise.allSettled(refreshPromises);
  } catch (error) {
    console.error("Error refreshing stale games:", error);
  }
}

/**
 * Warm up cache with popular and recent games
 * @returns {Promise<void>}
 */
export async function warmUpCache() {
  try {
    // Clean up old cache first
    await cleanupStaleCache();

    // Warm up popular games
    await getPopularGames(30);

    // Warm up recent games
    await getRecentGames(30);
  } catch (error) {
    console.error("Error warming up cache:", error);
  }
}

/**
 * Clean up stale cache entries
 * @param {number} maxAge - Maximum age in milliseconds (default: 7 days)
 * @returns {Promise<number>} - Number of entries cleaned up
 */
export async function cleanupStaleCache(maxAge = 7 * 24 * 60 * 60 * 1000) {
  try {
    const result = await gamesCache.cleanup(maxAge);
    return result;
  } catch (error) {
    console.error("Error cleaning up cache:", error);
    return 0;
  }
}

/**
 * Clear all cache data
 * @returns {Promise<boolean>} - Success status
 */
export async function clearAllCache() {
  try {
    await gamesCache.clear();
    return true;
  } catch (error) {
    console.error("Error clearing cache:", error);
    return false;
  }
}

/**
 * Cache statistics
 * @returns {Promise<Object>} - Cache statistics
 */
export async function getCacheStats() {
  try {
    const popularGames = await gamesCache.getPopular(1);
    const recentGames = await gamesCache.getRecent(1);
    const staleGames = await gamesCache.getNeedingRefresh(1);

    return {
      hasPopularGames: popularGames.length > 0,
      hasRecentGames: recentGames.length > 0,
      hasStaleGames: staleGames.length > 0,
      cacheActive: true,
    };
  } catch (error) {
    console.error("Error getting cache stats:", error);
    return {
      hasPopularGames: false,
      hasRecentGames: false,
      hasStaleGames: false,
      cacheActive: false,
    };
  }
}

// ========================================
// CLIENT-SAFE FUNCTIONS
// ========================================

import { browser } from "$app/environment";

/**
 * Client-safe version of getGameById
 * @param {string} igdbId - IGDB game ID
 * @param {boolean} forceRefresh - Force refresh from IGDB
 * @returns {Promise<Object|null>} - Game data or null
 */
export async function getGameByIdClient(igdbId, forceRefresh = false) {
  if (!browser) {
    console.warn("getGameByIdClient called on server side");
    return null;
  }

  try {
    // First try to get from API endpoint (which has proper caching)
    const response = await fetch(
      `/api/games/${igdbId}${forceRefresh ? "?refresh=true" : ""}`,
    );
    if (response.ok) {
      return await response.json();
    }

    // If API fails, try the cache module as fallback
    try {
      return await getGameById(igdbId, forceRefresh);
    } catch (error) {
      console.warn("Fallback to server cache failed:", error);
      return null;
    }
  } catch (error) {
    console.warn("Client-side getGameById failed:", error);
    return null;
  }
}

/**
 * Client-safe version of searchGames
 * @param {string} query - Search query
 * @param {number} limit - Number of results
 * @returns {Promise<Array>} - Array of games
 */
export async function searchGamesClient(query, limit = 20) {
  if (!browser) return [];

  try {
    const response = await fetch(
      `/api/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    );
    if (response.ok) {
      const data = await response.json();
      return data.games || [];
    }
    return [];
  } catch (error) {
    console.warn("Client-side searchGames failed:", error);
    return [];
  }
}

/**
 * Warm cache for visible games (client-side only)
 * @param {Array} gameIds - Array of game IDs to warm
 * @returns {Promise<void>}
 */
export async function warmGameCacheClient(gameIds) {
  if (!browser || !gameIds?.length) return;

  // Batch the requests to avoid overwhelming the server
  const batchSize = 5;
  const batches = [];

  for (let i = 0; i < gameIds.length; i += batchSize) {
    batches.push(gameIds.slice(i, i + batchSize));
  }

  for (const batch of batches) {
    try {
      await Promise.all(batch.map((id) => getGameByIdClient(id)));

      // Small delay between batches
      if (batches.length > 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.warn("Batch cache warming failed:", error);
    }
  }
}
