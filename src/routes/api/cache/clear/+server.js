/**
 * API endpoint for clearing cache data
 */

import { json, error } from "@sveltejs/kit";
import { clearAllCache } from "$lib/gameCache.js";

export async function POST() {
  try {
    const success = await clearAllCache();

    if (success) {
      return json({
        success: true,
        message: "All cache data cleared successfully",
      });
    } else {
      throw error(500, "Failed to clear cache");
    }
  } catch (err) {
    console.error("Cache clear API error:", err);
    throw error(500, "Failed to clear cache");
  }
}
