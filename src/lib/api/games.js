/**
 * Games API client - consolidates IGDB and game-related API calls
 */

import { apiClient } from "./client.js";

/**
 * Search games via our API
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @returns {Promise<Object>} - Search results
 */
export async function searchGames(query, options = {}) {
  return await apiClient.post("/api/search", {
    query,
    ...options,
  });
}

/**
 * Get autocomplete suggestions
 * @param {string} query - Partial query
 * @returns {Promise<string[]>} - Array of suggestions
 */
export async function getAutocompleteSuggestions(query) {
  if (!query || query.length < 2) return [];

  const response = await apiClient.get(
    `/api/search?q=${encodeURIComponent(query)}&autocomplete=true`,
  );

  return response.suggestions || [];
}

/**
 * Get popular games with pagination
 * @param {number} page - Page number (default: 1)
 * @param {number} limit - Games per page (default: 12)
 * @returns {Promise<Object>} - Popular games response
 */
export async function getPopularGames(page = 1, limit = 12) {
  return await apiClient.get(`/api/games/popular?page=${page}&limit=${limit}`);
}

/**
 * Get recent games with pagination
 * @param {number} page - Page number (default: 1)
 * @param {number} limit - Games per page (default: 12)
 * @returns {Promise<Object>} - Recent games response
 */
export async function getRecentGames(page = 1, limit = 12) {
  return await apiClient.get(`/api/games/recent?page=${page}&limit=${limit}`);
}

/**
 * Get game details by ID
 * @param {string|number} gameId - Game ID
 * @param {boolean} forceRefresh - Force refresh from source
 * @returns {Promise<Object>} - Game details
 */
export async function getGameById(gameId, forceRefresh = false) {
  const url = `/api/games/${gameId}${forceRefresh ? "?refresh=true" : ""}`;
  return await apiClient.get(url);
}

/**
 * Request a game
 * @param {Object} requestData - Request data
 * @returns {Promise<Object>} - Response
 */
export async function submitGameRequest(requestData) {
  return await apiClient.post("/request", requestData);
}

/**
 * Rescind (withdraw) a game request
 * @param {number} requestId - Request ID
 * @returns {Promise<Object>} - Response
 */
export async function rescindRequest(requestId) {
  return await apiClient.post("/api/request/rescind", {
    request_id: requestId,
  });
}

/**
 * IGDB proxy request
 * @param {string} action - API action (search, game, popular, recent)
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} - API response
 */
export async function igdbRequest(action, params = {}) {
  const searchParams = new URLSearchParams({
    action,
    ...params,
  });

  return await apiClient.get(`/api/igdb?${searchParams.toString()}`);
}
