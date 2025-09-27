/**
 * Simplified cache system with Redis primary and memory fallback
 * Streamlined for performance and maintainability
 */

import { browser } from "$app/environment";

class SimpleCache {
  constructor() {
    // Memory cache fallback
    this.memoryCache = new Map();
    this.memoryTtlMap = new Map();
    this.defaultTTL = 15 * 60 * 1000; // 15 minutes

    // Redis client
    this.redisClient = null;
    this.redisConnected = false;

    // Initialize Redis if not in browser
    if (!browser) {
      this.initRedis();
    }

    // Clean up expired memory entries every 5 minutes
    setInterval(() => this.memoryCleanup(), 5 * 60 * 1000);
  }

  async initRedis() {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) return;

    try {
      // Dynamic import to prevent Redis from being bundled for browser
      const { createClient } = await import("redis");
      const parsedRedisUrl = redisUrl.replace("http://", "redis://");

      this.redisClient = createClient({
        url: parsedRedisUrl,
        socket: {
          connectTimeout: 3000,
          reconnectStrategy: (retries) =>
            retries > 5 ? false : Math.min(retries * 200, 2000),
        },
      });

      this.redisClient.on("error", (err) => {
        if (
          !err.message.includes("ECONNREFUSED") &&
          !err.message.includes("ETIMEDOUT")
        ) {
          console.error("Redis error:", err.message);
        }
        this.redisConnected = false;
      });

      this.redisClient.on("connect", () => {
        this.redisConnected = true;
      });

      await this.redisClient.connect();
    } catch (error) {
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
        // Only log in development
        if (process.env.NODE_ENV === "development") {
          console.warn("Redis get error for key", key, ":", error.message);
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
          console.warn("Redis set error for key", key, ":", error.message);
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
}

// Global cache instance
const cache = new SimpleCache();

/**
 * Cache wrapper for async functions
 * @param {string} key - Cache key
 * @param {Function} fn - Function to execute if not cached
 * @param {number} ttl - Time to live in milliseconds
 * @returns {Promise<any>} - Cached or fresh result
 */
export async function withCache(key, fn, ttl = 5 * 60 * 1000) {
  const cached = await cache.get(key);
  if (cached !== null) return cached;

  try {
    const result = await fn();
    await cache.set(key, result, ttl);
    return result;
  } catch (error) {
    throw error;
  }
}

// Simplified cache helpers with standard TTL
export const cachePopularGames = (fn) =>
  withCache("popular-games", fn, 10 * 60 * 1000);
export const cacheRecentGames = (fn) =>
  withCache("recent-games", fn, 5 * 60 * 1000);
export const cacheRommGames = (fn, page = 0) =>
  withCache(`romm-games-${page}`, fn, 3 * 60 * 1000);
export const cacheGameRequests = (fn) =>
  withCache("game-requests", fn, 2 * 60 * 1000);
export const cacheGameDetails = (gameId, fn) =>
  withCache(`game-details-${gameId}`, fn, 15 * 60 * 1000);
export const cacheUserSession = (userId, fn) =>
  withCache(`user-session-${userId}`, fn, 15 * 60 * 1000);
export const cacheUserPermissions = (userId, fn) =>
  withCache(`user-permissions-${userId}`, fn, 15 * 60 * 1000);
export const cacheAuthCredentials = (key, fn) =>
  withCache(`auth-${key}`, fn, 15 * 60 * 1000);

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
 * @returns {Object} Cache statistics
 */
export async function getCacheStats() {
  return {
    memoryCache: {
      size: cache.memoryCache.size,
      ttlEntries: cache.memoryTtlMap.size,
    },
    redis: {
      connected: cache.redisConnected,
      client: cache.redisClient ? "initialized" : "not_initialized",
    },
    defaultTTL: cache.defaultTTL,
    timestamp: Date.now(),
  };
}

/**
 * Get Redis client instance
 * @returns {Object|null} Redis client or null if not connected
 */
export function getRedisClient() {
  return cache.redisClient;
}

export default cache;
