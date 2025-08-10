/**
 * API endpoint for cleaning up stale cache entries
 */

import { json, error } from "@sveltejs/kit";
import { cleanupStaleCache } from "$lib/gameCache.js";

export async function POST({ url }) {
  try {
    const searchParams = url.searchParams;
    const maxAge =
      parseInt(searchParams.get("max_age")) || 7 * 24 * 60 * 60 * 1000; // 7 days default

    const cleanedCount = await cleanupStaleCache(maxAge);

    return json({
      success: true,
      message: `Cleaned up ${cleanedCount} stale cache entries`,
      cleanedCount,
    });
  } catch (err) {
    console.error("Cache cleanup API error:", err);
    throw error(500, "Failed to cleanup cache");
  }
}
