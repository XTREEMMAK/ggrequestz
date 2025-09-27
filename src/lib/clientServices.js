/**
 * Client-side services for progressive enhancement
 * Handles operations that can be moved from server to client for better UX
 */

import { browser } from "$app/environment";

/**
 * ROMM cross-reference service - runs client-side for better performance
 */
export class RommCrossReferenceService {
  constructor() {
    this.cache = new Map();
    this.isProcessing = false;
    this.queue = [];
  }

  /**
   * Cross-reference games with ROMM library
   * @param {Array} games - Games to cross-reference
   * @param {boolean} useCache - Whether to use cached results
   * @returns {Promise<Array>} - Games with ROMM availability info
   */
  async crossReference(games, useCache = true) {
    if (!browser || !games?.length) return games;

    const uncachedGames = useCache
      ? games.filter((game) => !this.cache.has(game.igdb_id || game.id))
      : games;

    if (uncachedGames.length === 0) {
      // Return cached results
      return games.map((game) => {
        const cached = this.cache.get(game.igdb_id || game.id);
        return cached || game;
      });
    }

    try {
      // Batch the requests to avoid overwhelming the server
      const batches = this.createBatches(uncachedGames, 10);
      const results = [];

      for (const batch of batches) {
        const batchResults = await this.processBatch(batch);
        results.push(...batchResults);

        // Cache the results
        batchResults.forEach((game) => {
          this.cache.set(game.igdb_id || game.id, game);
        });

        // Small delay between batches
        if (batches.length > 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      // Merge with original games, preserving order
      return games.map((originalGame) => {
        const processed = results.find(
          (g) =>
            (g.igdb_id || g.id) === (originalGame.igdb_id || originalGame.id),
        );
        return processed || originalGame;
      });
    } catch (error) {
      console.warn("Client-side ROMM cross-reference failed:", error);
      return games; // Return original games on error
    }
  }

  /**
   * Process a batch of games
   * @private
   */
  async processBatch(games) {
    const gameIds = games.map((g) => g.igdb_id || g.id).filter(Boolean);

    if (gameIds.length === 0) return games;

    try {
      const response = await fetch("/api/romm/cross-reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameIds }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const { enrichedGames } = await response.json();
      return enrichedGames || games;
    } catch (error) {
      console.warn("Batch ROMM cross-reference failed:", error);
      return games;
    }
  }

  /**
   * Create batches from array
   * @private
   */
  createBatches(array, batchSize) {
    const batches = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Clear the cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Preload ROMM data for games in background
   * @param {Array} games - Games to preload
   */
  async preload(games) {
    if (!browser || this.isProcessing) return;

    this.queue.push(...games);

    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * Process the preload queue
   * @private
   */
  async processQueue() {
    if (this.queue.length === 0) return;

    this.isProcessing = true;

    try {
      const batch = this.queue.splice(0, 5); // Process 5 at a time
      await this.crossReference(batch, false);

      // Continue processing if more items in queue
      if (this.queue.length > 0) {
        setTimeout(() => this.processQueue(), 200);
      } else {
        this.isProcessing = false;
      }
    } catch (error) {
      console.warn("Queue processing failed:", error);
      this.isProcessing = false;
    }
  }
}

/**
 * Watchlist service - handles client-side watchlist operations
 */
export class WatchlistService {
  constructor() {
    this.cache = null;
    this.lastFetch = 0;
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get user's watchlist with caching
   * @returns {Promise<Array>} - User's watchlist
   */
  async getUserWatchlist() {
    if (!browser) return [];

    const now = Date.now();
    if (this.cache && now - this.lastFetch < this.cacheTTL) {
      return this.cache;
    }

    try {
      const response = await fetch("/api/watchlist");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const watchlist = await response.json();
      this.cache = watchlist;
      this.lastFetch = now;

      return watchlist;
    } catch (error) {
      console.warn("Failed to fetch watchlist:", error);
      return this.cache || [];
    }
  }

  /**
   * Add game to watchlist with optimistic updates
   * @param {string} gameId - Game ID to add
   * @param {Object} gameData - Game data
   * @returns {Promise<boolean>} - Success status
   */
  async addToWatchlist(gameId, gameData) {
    if (!browser) return false;

    try {
      const response = await fetch("/api/watchlist/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_id: gameId, game_data: gameData }),
      });

      if (!response.ok) {
        // Handle specific case where game is already in watchlist
        if (response.status === 400) {
          const errorData = await response.json().catch(() => null);
          if (errorData?.error === "Game is already in your watchlist") {
            // Clear cache to force fresh data and treat as success
            this.clearCache();
            return true;
          }
        }
        throw new Error(`HTTP ${response.status}`);
      }

      // Clear cache after successful operation to force fresh data
      this.clearCache();
      return true;
    } catch (error) {
      console.warn("Failed to add to watchlist:", error);
      return false;
    }
  }

  /**
   * Remove game from watchlist with optimistic updates
   * @param {string} gameId - Game ID to remove
   * @returns {Promise<boolean>} - Success status
   */
  async removeFromWatchlist(gameId) {
    if (!browser) return false;

    try {
      const response = await fetch("/api/watchlist/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_id: gameId }),
      });

      if (!response.ok) {
        // Handle specific case where game is not in watchlist
        if (response.status === 400) {
          const errorData = await response.json().catch(() => null);
          if (errorData?.error === "Game is not in your watchlist") {
            // Clear cache to force fresh data and treat as success
            this.clearCache();
            return true;
          }
        }
        throw new Error(`HTTP ${response.status}`);
      }

      // Clear cache after successful operation to force fresh data
      this.clearCache();
      return true;
    } catch (error) {
      console.warn("Failed to remove from watchlist:", error);
      return false;
    }
  }

  /**
   * Clear the cache (useful when user logs out)
   */
  clearCache() {
    this.cache = null;
    this.lastFetch = 0;
  }
}

// Create singleton instances
export const rommService = new RommCrossReferenceService();
export const watchlistService = new WatchlistService();
