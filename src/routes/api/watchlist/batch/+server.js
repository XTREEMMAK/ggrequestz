/**
 * Batch Watchlist Status API - Optimized for multiple game queries
 * Reduces database round trips by fetching multiple game statuses in one query
 */

import { json } from "@sveltejs/kit";
import { getAuthenticatedUser } from "$lib/auth.server.js";
import { getUserIdFromAuth } from "$lib/getUserId.js";
import { watchlist } from "$lib/database.js";
import { query } from "$lib/database.js";

export async function POST({ request, cookies }) {
  try {
    // Parse request body
    const body = await request.json();
    console.log("📥 Batch API received:", body);

    const { gameIds } = body;

    if (!Array.isArray(gameIds) || gameIds.length === 0) {
      console.error("❌ Invalid gameIds array:", {
        gameIds,
        isArray: Array.isArray(gameIds),
        length: gameIds?.length,
      });
      return json({ error: "Invalid game IDs array" }, { status: 400 });
    }

    // Validate each game ID
    const validGameIds = gameIds.filter((id) => {
      if (id === null || id === undefined || id === "") {
        console.warn("⚠️ Filtered out invalid ID:", id);
        return false;
      }
      return true;
    });

    if (validGameIds.length === 0) {
      console.error("❌ No valid game IDs after filtering");
      return json({ error: "No valid game IDs provided" }, { status: 400 });
    }

    // Limit batch size to prevent abuse
    if (validGameIds.length > 100) {
      return json({ error: "Too many game IDs (max 100)" }, { status: 400 });
    }

    // Verify authentication (supports session, basic auth, and API keys)
    const user = await getAuthenticatedUser(cookies, request);
    if (!user) {
      return json({ error: "Authentication required" }, { status: 401 });
    }

    // Get user's database ID
    let userId;
    try {
      userId = await getUserIdFromAuth(user, query);
      console.log("✅ Extracted userId:", userId);
    } catch (err) {
      console.error("Failed to get user ID:", err);
      return json({ error: "Authentication error" }, { status: 401 });
    }

    // Batch fetch watchlist status directly (watchlist.batchContains returns a Map)
    const watchlistStatuses = await watchlist.batchContains(
      userId,
      validGameIds,
    );

    // Convert Map to object for JSON response
    const statusObject = {};
    if (watchlistStatuses instanceof Map) {
      watchlistStatuses.forEach((status, gameId) => {
        statusObject[gameId] = status;
      });
    } else {
      console.error(
        "Unexpected watchlistStatuses type:",
        typeof watchlistStatuses,
      );
      // Fallback: treat all as not in watchlist
      validGameIds.forEach((gameId) => {
        statusObject[gameId] = false;
      });
    }

    return json({
      success: true,
      statuses: statusObject,
    });
  } catch (error) {
    console.error("Batch watchlist status error:", error);
    return json(
      { error: "Failed to fetch watchlist statuses" },
      { status: 500 },
    );
  }
}
