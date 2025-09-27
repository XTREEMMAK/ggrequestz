/**
 * Batch Watchlist Status API - Optimized for multiple game queries
 * Reduces database round trips by fetching multiple game statuses in one query
 */

import { json } from "@sveltejs/kit";
import { getSession } from "$lib/auth.server.js";
import { cacheUserPermissions } from "$lib/cache.js";
import { watchlist } from "$lib/database.js";

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

    // Get user session with caching
    const cookieHeader = cookies.get("session")
      ? `session=${cookies.get("session")}`
      : cookies.get("basic_auth_session")
        ? `basic_auth_session=${cookies.get("basic_auth_session")}`
        : null;

    if (!cookieHeader) {
      return json({ error: "Authentication required" }, { status: 401 });
    }

    const user = await getSession(cookieHeader);
    if (!user) {
      return json({ error: "Invalid session" }, { status: 401 });
    }

    // Get user's database ID - enhanced extraction logic
    let userId;
    console.log("🔍 User object:", {
      sub: user.sub,
      localUserId: user.localUserId,
      id: user.id,
      user_id: user.user_id,
    });

    if (user.sub?.startsWith("basic_auth_")) {
      userId = user.sub.replace("basic_auth_", "");
    } else if (user.localUserId) {
      userId = user.localUserId;
    } else if (user.id) {
      userId = user.id;
    } else if (user.user_id) {
      userId = user.user_id;
    } else if (user.sub && !user.sub.startsWith("basic_auth_")) {
      // Try using sub directly if it's not a basic_auth format
      userId = user.sub;
    } else {
      console.error("❌ Could not extract user ID from user object:", user);
      return json({ error: "User ID not found" }, { status: 400 });
    }

    console.log("✅ Extracted userId:", userId);

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
