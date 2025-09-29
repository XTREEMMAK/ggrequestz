/**
 * Watchlist API client - simplified and unified watchlist operations
 */

import { apiClient } from "./client.js";

class WatchlistClient {
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
    const now = Date.now();
    if (this.cache && now - this.lastFetch < this.cacheTTL) {
      return this.cache;
    }

    try {
      const watchlist = await apiClient.get("/api/watchlist");
      this.cache = watchlist;
      this.lastFetch = now;
      return watchlist;
    } catch (error) {
      return this.cache || [];
    }
  }

  /**
   * Add game to watchlist
   * @param {string} gameId - Game ID to add
   * @param {Object} gameData - Game data
   * @returns {Promise<boolean>} - Success status
   */
  async addToWatchlist(gameId, gameData) {
    try {
      await apiClient.post("/api/watchlist/add", {
        game_id: gameId,
        game_data: gameData,
      });

      // Clear cache to force fresh data
      this.clearCache();
      return true;
    } catch (error) {
      // Handle case where game is already in watchlist
      if (
        error.status === 400 &&
        error.data?.error === "Game is already in your watchlist"
      ) {
        this.clearCache();
        return true;
      }

      return false;
    }
  }

  /**
   * Remove game from watchlist
   * @param {string} gameId - Game ID to remove
   * @returns {Promise<boolean>} - Success status
   */
  async removeFromWatchlist(gameId) {
    try {
      await apiClient.post("/api/watchlist/remove", {
        game_id: gameId,
      });

      // Clear cache to force fresh data
      this.clearCache();
      return true;
    } catch (error) {
      // Handle case where game is not in watchlist
      if (
        error.status === 400 &&
        error.data?.error === "Game is not in your watchlist"
      ) {
        this.clearCache();
        return true;
      }

      return false;
    }
  }

  /**
   * Check if game is in watchlist
   * @param {string} gameId - Game ID to check
   * @returns {Promise<boolean>} - Whether game is in watchlist
   */
  async isInWatchlist(gameId) {
    try {
      const watchlist = await this.getUserWatchlist();
      return watchlist.some((item) => (item.igdb_id || item.id) === gameId);
    } catch (error) {
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

// Export singleton instance
export const watchlistClient = new WatchlistClient();

// Export for legacy compatibility
export const watchlistService = watchlistClient;
