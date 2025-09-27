/**
 * Consolidated API client exports
 * Single entry point for all API operations
 */

// Base client
export { apiClient, ApiClient, ApiError } from "./client.js";

// Games API
export {
  searchGames,
  getAutocompleteSuggestions,
  getPopularGames,
  getRecentGames,
  getGameById,
  submitGameRequest,
  rescindRequest,
  igdbRequest,
} from "./games.js";

// Watchlist API
export { watchlistClient, watchlistService } from "./watchlist.js";

// Additional convenience APIs

/**
 * Send notification webhook
 * @param {Object} notificationData - Notification data
 * @returns {Promise<Object>} - Response
 */
export async function sendNotification(notificationData) {
  return await apiClient.post("/api/webhooks", notificationData);
}

/**
 * ROMM cross-reference games
 * @param {Array} gameIds - Array of game IDs
 * @returns {Promise<Object>} - Cross-reference response
 */
export async function crossReferenceWithROMM(gameIds) {
  return await apiClient.post("/api/romm/cross-reference", { gameIds });
}
