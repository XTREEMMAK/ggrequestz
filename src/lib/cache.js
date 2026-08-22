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
          // Retry forever with a capped backoff. Returning `false` here (the
          // previous behaviour after 5 attempts) permanently disabled Redis
          // for the life of the worker: one transient blip silently downgraded
          // the process to its in-memory cache until the next restart.
          reconnectStrategy: (retries) => Math.min(retries * 200, 5000),
        },
        // Keeps the socket alive so it is not silently dropped by NAT/conntrack
        // idle timeouts and then discovered dead on the next command.
        pingInterval: 30000,
      });

      this.redisClient.on("error", (err) => {
        if (
          !err.message.includes("ECONNREFUSED") &&
          !err.message.includes("ETIMEDOUT")
        ) {
          console.error("Redis error:", err.message);
        }
        if (this.redisConnected) {
          console.warn(
            "⚠️ Redis connection lost, falling back to in-memory cache",
          );
        }
        this.redisConnected = false;
      });

      // `connect` fires before the client is ready to accept commands; a
      // command issued in that window throws and flips the flag back off.
      this.redisClient.on("ready", () => {
        if (!this.redisConnected) {
          console.log("✅ Redis connected");
        }
        this.redisConnected = true;
      });

      this.redisClient.on("reconnecting", () => {
        this.redisConnected = false;
      });

      await this.redisClient.connect();
    } catch (error) {
      console.warn(
        `⚠️ Redis unavailable (${error?.message}), using in-memory cache`,
      );
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

      // A miss in a healthy Redis means "not cached": do not consult this
      // worker's memory.
      //
      // `set` writes to both stores but `delete` can only reach the memory of
      // the worker handling that request, so with PM2 running one process per
      // core, invalidation clears Redis and one worker. Falling through to
      // memory here served the other workers' stale copies, which is why a
      // saved preference appeared to apply only sometimes: it depended on which
      // worker answered the next request.
      //
      // Memory stays the fallback for an actual outage: `redisConnected` goes
      // false on error, and this branch is then skipped entirely.
      if (this.redisConnected) return null;
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

/** Rebuilds currently in progress, keyed by cache key. */
const inFlight = new Map();

/**
 * Cache wrapper for async functions.
 *
 * Deliberately does NOT coalesce concurrent rebuilds.
 *
 * An earlier version did, so that N concurrent misses on a cold key shared one
 * rebuild. That is unsafe here: if `fn()` itself calls `withCache()` with the
 * same key (which `getUserPermissions()` did, under a wrapper using an
 * identical key), the nested call is handed the outer call's own in-flight
 * promise and awaits itself. The result is a permanent deadlock, and because it
 * only triggers for authenticated users it survived every unauthenticated
 * smoke test.
 *
 * Making this safe needs async-context tracking (AsyncLocalStorage), which is
 * not available here because this module is bundled for the browser as well.
 * Duplicating a rebuild is cheap; deadlocking a request is not. If a specific
 * call site genuinely needs single-flight behaviour, use
 * `withStaleWhileRevalidate` and make sure `fn` never re-enters the same key.
 *
 * @param {string} key - Cache key
 * @param {Function} fn - Function to execute if not cached
 * @param {number} ttl - Time to live in milliseconds
 * @returns {Promise<any>} - Cached or fresh result
 */
export async function withCache(key, fn, ttl = 5 * 60 * 1000) {
  const cached = await cache.get(key);
  if (cached !== null) return cached;

  const result = await fn();
  await cache.set(key, result, ttl);
  return result;
}

/**
 * Like `withCache`, but serves a stale value immediately and refreshes in the
 * background once the entry passes `staleAfter`.
 *
 * Use this wherever a rebuild would otherwise land on a request path. A failed
 * refresh keeps the previous value rather than propagating the error.
 *
 * This one DOES single-flight, so `fn` must never call back into this function
 * (or `withCache`) with the same key: it would await its own rebuild and
 * deadlock. See the note on `withCache`.
 *
 * @param {string} key - Cache key
 * @param {Function} fn - Function to execute to (re)build the value
 * @param {Object} options - Timing options
 * @param {number} options.ttl - How long the entry is retained
 * @param {number} options.staleAfter - Age at which a background refresh starts
 * @returns {Promise<any>} - Cached (possibly stale) or fresh result
 */
export async function withStaleWhileRevalidate(key, fn, options = {}) {
  const { ttl = 15 * 60 * 1000, staleAfter = 5 * 60 * 1000 } = options;
  const metaKey = `${key}:builtAt`;

  const [cached, builtAt] = await Promise.all([
    cache.get(key),
    cache.get(metaKey),
  ]);

  const refresh = async () => {
    if (inFlight.has(key)) return inFlight.get(key);

    const rebuild = (async () => {
      try {
        const result = await fn();
        await cache.set(key, result, ttl);
        await cache.set(metaKey, Date.now(), ttl);
        return result;
      } finally {
        inFlight.delete(key);
      }
    })();

    inFlight.set(key, rebuild);
    return rebuild;
  };

  if (cached === null) return refresh();

  if (!builtAt || Date.now() - builtAt > staleAfter) {
    // Serve stale now, refresh behind the response.
    refresh().catch((error) =>
      console.warn(
        `⚠️ Background refresh failed for "${key}": ${error?.message || error}`,
      ),
    );
  }

  return cached;
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
 * Cache key for a user's appearance preferences (background and chrome theme).
 *
 * Exported because two modules have to agree on it: the root layout writes it,
 * and the preferences endpoint invalidates it on save. When those drifted apart,
 * the endpoint cleared a key nothing wrote and a theme change silently did not
 * apply until the TTL expired. Invalidating a missing key is not an error.
 * Deriving both from here removes the opportunity.
 *
 * @param {number|string} userId - Local user ID
 * @returns {string} - Cache key
 */
export const appearanceCacheKey = (userId) => `appearance-${userId}`;

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
