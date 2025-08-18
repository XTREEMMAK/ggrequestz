/**
 * API endpoint for cache statistics - Enhanced with memory cache stats
 */

import { json, error } from "@sveltejs/kit";
import { getCacheStats as getGameCacheStats } from "$lib/gameCache.js";
import {
  getCacheStats as getMemoryCacheStats,
  clearAllCache,
} from "$lib/cache.js";

export async function GET() {
  try {
    // Get stats from both cache systems
    const [gameCacheStats, memoryCacheStats] = await Promise.all([
      getGameCacheStats(),
      Promise.resolve(getMemoryCacheStats()),
    ]);

    return json({
      success: true,
      gameCache: gameCacheStats,
      memoryCache: {
        size: memoryCacheStats.size,
        entries: memoryCacheStats.keys.length,
        keys: memoryCacheStats.keys,
        memoryUsage: process.memoryUsage
          ? {
              rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + " MB",
              heapUsed:
                Math.round(process.memoryUsage().heapUsed / 1024 / 1024) +
                " MB",
              heapTotal:
                Math.round(process.memoryUsage().heapTotal / 1024 / 1024) +
                " MB",
            }
          : "N/A",
      },
    });
  } catch (err) {
    console.error("Cache stats API error:", err);
    throw error(500, "Failed to get cache stats");
  }
}

export async function DELETE() {
  try {
    clearAllCache();

    return json({
      success: true,
      message: "Memory cache cleared successfully",
    });
  } catch (err) {
    console.error("Cache clear error:", err);
    throw error(500, "Failed to clear cache");
  }
}
