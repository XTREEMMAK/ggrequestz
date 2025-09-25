/**
 * Client-side watchlist status management
 * Works independently of page caching to provide real-time watchlist indicators
 */

import { browser } from "$app/environment";

// In-memory cache for watchlist status
const statusCache = new Map();
const CACHE_TTL = 30000; // 30 seconds

// Cache watchlist status with timestamp
function cacheStatus(gameId, status) {
  statusCache.set(gameId, {
    status,
    timestamp: Date.now(),
  });
}

// Get cached status if still valid
function getCachedStatus(gameId) {
  const cached = statusCache.get(gameId);
  if (!cached) return null;

  const age = Date.now() - cached.timestamp;
  if (age > CACHE_TTL) {
    statusCache.delete(gameId);
    return null;
  }

  return cached.status;
}

// Fetch watchlist status from API with silent error handling
async function fetchWatchlistStatus(gameId) {
  try {
    // Use a custom fetch wrapper to suppress console logging of 401 errors
    const response = await fetch(`/api/watchlist/status/${gameId}`, {
      credentials: "include",
    });

    if (!response.ok) {
      // Return null for any error to fail gracefully
      return null;
    }
    const data = await response.json();
    return data.isInWatchlist;
  } catch (error) {
    // Completely suppress all error logging for clean console
    return null;
  }
}

// Get watchlist status with caching
export async function getWatchlistStatus(gameId) {
  if (!browser || !gameId) return false;

  // Check cache first
  const cached = getCachedStatus(gameId);
  if (cached !== null) {
    return cached;
  }

  // Fetch from API and cache
  const status = await fetchWatchlistStatus(gameId);
  if (status !== null) {
    cacheStatus(gameId, status);
    return status;
  }

  return false; // Default to not in watchlist if fetch fails
}

// Update local cache when watchlist changes
export function updateWatchlistStatus(gameId, isInWatchlist) {
  if (!browser || !gameId) return;
  cacheStatus(gameId, isInWatchlist);
}

// Clear cache for specific game
export function clearWatchlistStatus(gameId) {
  if (!browser) return;
  statusCache.delete(gameId);
}

// Clear all cached status
export function clearAllWatchlistStatus() {
  if (!browser) return;
  statusCache.clear();
}

// Get cached status without making API calls (for synchronization between pages)
export function getCachedWatchlistStatus(gameId) {
  if (!browser || !gameId) return null;
  return getCachedStatus(gameId);
}

// Batch fetch watchlist status for multiple games
export async function batchGetWatchlistStatus(gameIds) {
  if (!browser || !Array.isArray(gameIds) || gameIds.length === 0) {
    return new Map();
  }

  const results = new Map();
  const uncachedIds = [];

  // Check cache for each game
  for (const gameId of gameIds) {
    const cached = getCachedStatus(gameId);
    if (cached !== null) {
      results.set(gameId, cached);
    } else {
      uncachedIds.push(gameId);
    }
  }

  // Fetch uncached games in parallel
  if (uncachedIds.length > 0) {
    const promises = uncachedIds.map(async (gameId) => {
      const status = await fetchWatchlistStatus(gameId);
      if (status !== null) {
        cacheStatus(gameId, status);
        results.set(gameId, status);
      }
      return { gameId, status };
    });

    await Promise.allSettled(promises);
  }

  return results;
}
