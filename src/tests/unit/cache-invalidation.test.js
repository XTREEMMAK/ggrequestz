/**
 * Guards cross-worker cache invalidation.
 *
 * `set` writes to Redis and the local memory map; `delete` can only reach the
 * memory of the worker handling that request. Under PM2 (one process per core by
 * default) a Redis miss used to fall through to local memory, so invalidation
 * cleared Redis plus one worker while the others kept serving stale copies:
 * a saved preference applied or not depending on which worker answered next.
 *
 * With Redis healthy, a miss must now mean "not cached".
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import cache from "$lib/cache.js";

/** Stand in for Redis, so the store is observable and controllable. */
function fakeRedis() {
  const store = new Map();
  return {
    store,
    get: vi.fn(async (k) => (store.has(k) ? store.get(k) : null)),
    setEx: vi.fn(async (k, _ttl, v) => void store.set(k, v)),
    del: vi.fn(async (k) => void store.delete(k)),
  };
}

let redis;

beforeEach(async () => {
  redis = fakeRedis();
  cache.redisClient = redis;
  cache.redisConnected = true;
  cache.memoryCache.clear();
  cache.memoryTtlMap.clear();
});

describe("invalidation with Redis connected", () => {
  it("does not serve a stale memory copy after the shared entry is deleted", async () => {
    await cache.set("appearance-1", { uiTheme: "glass" }, 60_000);
    expect(await cache.get("appearance-1")).toEqual({ uiTheme: "glass" });

    // Another worker invalidates: Redis is cleared, but this worker's memory
    // still holds the value; `delete` there cannot reach across processes.
    redis.store.delete("appearance-1");
    expect(cache.memoryCache.has("appearance-1")).toBe(true);

    expect(await cache.get("appearance-1")).toBeNull();
  });

  it("still returns a value that is present in Redis", async () => {
    await cache.set("appearance-2", { uiTheme: "default" }, 60_000);
    cache.memoryCache.clear(); // this worker never cached it locally
    expect(await cache.get("appearance-2")).toEqual({ uiTheme: "default" });
  });
});

describe("fallback when Redis is unavailable", () => {
  it("uses memory, so an outage degrades rather than breaks", async () => {
    await cache.set("appearance-3", { uiTheme: "glass" }, 60_000);

    // Redis drops out. The memory copy is all this worker has.
    cache.redisConnected = false;
    expect(await cache.get("appearance-3")).toEqual({ uiTheme: "glass" });
  });

  it("honours the memory TTL during an outage", async () => {
    await cache.set("appearance-4", { uiTheme: "glass" }, 60_000);
    cache.redisConnected = false;
    cache.memoryTtlMap.set("appearance-4", Date.now() - 1);
    expect(await cache.get("appearance-4")).toBeNull();
  });
});
