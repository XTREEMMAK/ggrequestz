/**
 * Redis + Memory fallback cache system for API responses and database queries
 * Helps reduce 2-second page load times by caching frequently requested data
 * Uses Redis when available, falls back to in-memory cache
 */

import { createClient } from "redis";
import { browser } from "$app/environment";

class HybridCache {
  constructor() {
    // Memory cache fallback
    this.memoryCache = new Map();
    this.memoryTtlMap = new Map();
    this.defaultTTL = 5 * 60 * 1000; // 5 minutes default

    // Redis client
    this.redisClient = null;
    this.redisConnected = false;
    this.initRedis();

    // Clean up expired memory entries every 2 minutes
    setInterval(() => this.memoryCleanup(), 2 * 60 * 1000);
  }

  async initRedis() {
    // Redis environment check (debug mode only)
    if (process.env.NODE_ENV === "development") {
    }

    // Skip Redis initialization on client-side
    if (browser) {
      return;
    }

    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      if (process.env.NODE_ENV === "development") {
      }
      return;
    }

    try {
      // Parse Redis URL (handle http:// prefix)
      const parsedRedisUrl = redisUrl.replace("http://", "redis://");
      this.redisClient = createClient({ url: parsedRedisUrl });

      this.redisClient.on("error", (err) => {
        console.warn("🚨 Redis connection error:", err.message);
        this.redisConnected = false;
      });

      this.redisClient.on("connect", () => {
        if (process.env.NODE_ENV === "development") {
        }
        this.redisConnected = true;
      });

      await this.redisClient.connect();
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.warn("🚨 Failed to connect to Redis:", error.message);
      }
      this.redisConnected = false;
    }
  }

  /**
   * Get cached value
   * @param {string} key - Cache key
   * @returns {Promise<any|null>} - Cached value or null if expired/missing
   */
  async get(key) {
    // Try Redis first if connected
    if (this.redisConnected && this.redisClient) {
      try {
        const value = await this.redisClient.get(key);
        if (value !== null) {
          return JSON.parse(value);
        }
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.warn("🚨 Redis get error for key", key, ":", error.message);
        }
        this.redisConnected = false;
      }
    }

    // Fallback to memory cache
    if (!this.memoryCache.has(key)) return null;

    const expiry = this.memoryTtlMap.get(key);
    if (expiry && Date.now() > expiry) {
      this.delete(key);
      return null;
    }

    return this.memoryCache.get(key);
  }

  /**
   * Set cached value
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in milliseconds
   * @returns {Promise<void>}
   */
  async set(key, value, ttl = this.defaultTTL) {
    // Try Redis first if connected
    if (this.redisConnected && this.redisClient) {
      try {
        const ttlSeconds = Math.ceil(ttl / 1000);
        await this.redisClient.setEx(key, ttlSeconds, JSON.stringify(value));
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.warn("🚨 Redis set error for key", key, ":", error.message);
        }
        this.redisConnected = false;
      }
    }

    // Always set in memory cache as fallback
    this.memoryCache.set(key, value);
    this.memoryTtlMap.set(key, Date.now() + ttl);
  }

  /**
   * Delete cached value
   * @param {string} key - Cache key
   * @returns {Promise<void>}
   */
  async delete(key) {
    // Try Redis first if connected
    if (this.redisConnected && this.redisClient) {
      try {
        await this.redisClient.del(key);
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.warn(
            "🚨 Redis delete error for key",
            key,
            ":",
            error.message,
          );
        }
        this.redisConnected = false;
      }
    }

    // Always delete from memory cache
    this.memoryCache.delete(key);
    this.memoryTtlMap.delete(key);
  }

  /**
   * Clear all cached values
   * @returns {Promise<void>}
   */
  async clear() {
    // Try Redis first if connected
    if (this.redisConnected && this.redisClient) {
      try {
        await this.redisClient.flushDb();
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.warn("🚨 Redis clear error:", error.message);
        }
        this.redisConnected = false;
      }
    }

    // Always clear memory cache
    this.memoryCache.clear();
    this.memoryTtlMap.clear();
  }

  /**
   * Clean up expired memory cache entries
   * (Redis handles expiration automatically)
   */
  memoryCleanup() {
    const now = Date.now();
    for (const [key, expiry] of this.memoryTtlMap.entries()) {
      if (expiry && now > expiry) {
        this.memoryCache.delete(key);
        this.memoryTtlMap.delete(key);
      }
    }
  }

  /**
   * Get cache statistics
   * @returns {Promise<Object>}
   */
  async stats() {
    let redisStats = { size: 0, connected: false };

    if (this.redisConnected && this.redisClient) {
      try {
        const info = await this.redisClient.info("keyspace");
        const dbInfo = info.match(/db0:keys=(\d+)/);
        redisStats = {
          size: dbInfo ? parseInt(dbInfo[1]) : 0,
          connected: true,
        };
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.warn("🚨 Redis stats error:", error.message);
        }
        redisStats.connected = false;
      }
    }

    return {
      redis: redisStats,
      memory: {
        size: this.memoryCache.size,
        keys: Array.from(this.memoryCache.keys()),
      },
    };
  }
}

// Global cache instance
const cache = new HybridCache();

/**
 * Cache wrapper for async functions
 * @param {string} key - Cache key
 * @param {Function} fn - Function to execute if not cached
 * @param {number} ttl - Time to live in milliseconds
 * @returns {Promise<any>} - Cached or fresh result
 */
export async function withCache(key, fn, ttl = 5 * 60 * 1000) {
  // Try to get from cache first
  const cached = await cache.get(key);
  if (cached !== null) {
    return cached;
  }

  // Execute function and cache result
  try {
    const result = await fn();
    await cache.set(key, result, ttl);
    return result;
  } catch (error) {
    // Don't cache errors, but still throw them
    throw error;
  }
}

/**
 * Cache popular games (longer TTL since they change less frequently)
 * @param {Function} fn - Function to get popular games
 * @returns {Promise<Array>} - Popular games array
 */
export async function cachePopularGames(fn) {
  return withCache("popular-games", fn, 10 * 60 * 1000); // 10 minutes
}

/**
 * Cache recent games (medium TTL)
 * @param {Function} fn - Function to get recent games
 * @returns {Promise<Array>} - Recent games array
 */
export async function cacheRecentGames(fn) {
  return withCache("recent-games", fn, 5 * 60 * 1000); // 5 minutes
}

/**
 * Cache ROMM games (shorter TTL since library changes more frequently)
 * @param {Function} fn - Function to get ROMM games
 * @param {number} page - Page number for cache key
 * @returns {Promise<Array>} - ROMM games array
 */
export async function cacheRommGames(fn, page = 0) {
  return withCache(`romm-games-${page}`, fn, 3 * 60 * 1000); // 3 minutes
}

/**
 * Cache game requests (short TTL since they update frequently)
 * @param {Function} fn - Function to get game requests
 * @returns {Promise<Array>} - Game requests array
 */
export async function cacheGameRequests(fn) {
  return withCache("game-requests", fn, 2 * 60 * 1000); // 2 minutes
}

/**
 * Cache user-specific data (per user)
 * @param {string} userId - User ID
 * @param {string} type - Type of user data (watchlist, requests)
 * @param {Function} fn - Function to get user data
 * @returns {Promise<any>} - User data
 */
export async function cacheUserData(userId, type, fn) {
  return withCache(`user-${userId}-${type}`, fn, 3 * 60 * 1000); // 3 minutes
}

/**
 * Cache game details (longer TTL since game info doesn't change often)
 * @param {string} gameId - Game ID
 * @param {Function} fn - Function to get game details
 * @returns {Promise<Object>} - Game details
 */
export async function cacheGameDetails(gameId, fn) {
  return withCache(`game-details-${gameId}`, fn, 15 * 60 * 1000); // 15 minutes
}

/**
 * Invalidate specific cache entries
 * @param {string|Array} keys - Cache key(s) to invalidate
 * @returns {Promise<void>}
 */
export async function invalidateCache(keys) {
  const keyArray = Array.isArray(keys) ? keys : [keys];
  await Promise.all(keyArray.map((key) => cache.delete(key)));
}

/**
 * Clear all cache
 * @returns {Promise<void>}
 */
export async function clearAllCache() {
  await cache.clear();
}

/**
 * Get cache statistics
 * @returns {Promise<Object>}
 */
export async function getCacheStats() {
  return await cache.stats();
}

/**
 * Get Redis client instance (for health checks and direct operations)
 * @returns {Object|null} Redis client or null if not connected
 */
export function getRedisClient() {
  return cache.redisConnected ? cache.redisClient : null;
}

export default cache;
