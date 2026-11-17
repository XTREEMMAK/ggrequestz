/**
 * API endpoint for cleaning up stale cache entries
 */

import { json, error } from "@sveltejs/kit";
import { cleanupStaleCache } from "$lib/gameCache.js";
import { requireAdministrator } from "$lib/server/requireAdministrator.js";

export async function POST({ url, request, cookies }) {
  // Administrators only. It deletes every cached game not on a watchlist, with
  // a caller-chosen age, and needed nothing but a signed-in session
  // (GHSA-rrjq-wcr3-vjqf). Outside the try: its catch turns every error into
  // a 500, which would hide the refusal.
  await requireAdministrator({ cookies, request });

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
