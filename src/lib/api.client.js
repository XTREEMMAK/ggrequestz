/**
 * Client-side API utilities for making requests to our backend
 */

/**
 * Search games via our API
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @returns {Promise<Object>} - Search results
 */
export async function searchGames(query, options = {}) {
  const response = await fetch("/api/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      ...options,
    }),
  });

  if (!response.ok) {
    throw new Error(`Search failed: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get autocomplete suggestions
 * @param {string} query - Partial query
 * @returns {Promise<string[]>} - Array of suggestions
 */
export async function getAutocompleteSuggestions(query) {
  if (!query || query.length < 2) return [];

  const response = await fetch(
    `/api/search?q=${encodeURIComponent(query)}&autocomplete=true`,
  );

  if (!response.ok) {
    throw new Error(`Autocomplete failed: ${response.statusText}`);
  }

  const data = await response.json();
  return data.suggestions || [];
}

/**
 * Search games from IGDB via our proxy
 * @param {string} action - API action (search, game, popular, recent)
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} - API response
 */
export async function igdbRequest(action, params = {}) {
  const searchParams = new URLSearchParams({
    action,
    ...params,
  });

  const response = await fetch(`/api/igdb?${searchParams.toString()}`);

  if (!response.ok) {
    throw new Error(`IGDB request failed: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Submit a game request
 * @param {Object} requestData - Request data
 * @returns {Promise<Object>} - Response
 */
export async function submitGameRequest(requestData) {
  const response = await fetch("/request", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestData),
  });

  return response.json();
}

// Watchlist functions moved to clientServices.js for better caching and optimistic updates
// Import from: import { watchlistService } from '$lib/clientServices.js';
// Usage: await watchlistService.addToWatchlist(gameId, gameData)
//        await watchlistService.removeFromWatchlist(gameId)

/**
 * Send notification webhook
 * @param {Object} notificationData - Notification data
 * @returns {Promise<Object>} - Response
 */
export async function sendNotification(notificationData) {
  const response = await fetch("/api/webhooks", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(notificationData),
  });

  return response.json();
}

/**
 * Rescind (withdraw) a game request
 * @param {number} requestId - Request ID
 * @returns {Promise<Object>} - Response
 */
export async function rescindRequest(requestId) {
  const response = await fetch("/api/request/rescind", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      request_id: requestId,
    }),
  });

  if (!response.ok) {
    // Try to get error details from response
    try {
      const errorData = await response.json();
      throw new Error(
        errorData.error || `HTTP ${response.status}: ${response.statusText}`,
      );
    } catch (jsonError) {
      // If JSON parsing fails, use status text
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  }

  return response.json();
}
