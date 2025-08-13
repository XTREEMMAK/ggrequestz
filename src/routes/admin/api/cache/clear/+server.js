/**
 * Admin API endpoint for clearing specific cache keys
 */

import { json, error } from "@sveltejs/kit";
import cache from "$lib/cache.js";

export async function POST({ request }) {
  try {
    const { cacheKey } = await request.json();
    
    if (!cacheKey) {
      throw error(400, "Cache key is required");
    }
    
    // Clear the specific cache key
    await cache.delete(cacheKey);
    
    return json({
      success: true,
      message: `Cache key '${cacheKey}' cleared successfully`,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error("Cache clear error:", err);
    throw error(500, "Failed to clear cache");
  }
}

// Alternative: clear all cache
export async function DELETE() {
  try {
    await cache.clear();
    
    return json({
      success: true,
      message: "All cache cleared successfully",
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error("Cache clear all error:", err);
    throw error(500, "Failed to clear all cache");
  }
}