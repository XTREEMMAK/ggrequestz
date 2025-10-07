/**
 * User Preferences API endpoint
 * Handles saving and updating user content filtering preferences
 */

import { json, error } from "@sveltejs/kit";
import {
  saveUserPreferences,
  getUserPreferences,
} from "$lib/userPreferences.js";
import { getAuthenticatedUser } from "$lib/auth.server.js";
import { invalidateCache } from "$lib/cache.js";
import { query } from "$lib/database.js";

export async function POST({ request, cookies }) {
  try {
    // Verify user authentication (supports session, basic auth, and API keys)
    const user = await getAuthenticatedUser(cookies, request);
    if (!user) {
      throw error(401, "Authentication required");
    }

    // Get user's database ID
    let userId;
    if (user.auth_type === "api_key") {
      userId = user.user_id;
    } else if (user.auth_type === "basic") {
      userId = user.id || parseInt(user.sub?.replace("basic_auth_", ""));
    } else {
      // Authentik users
      const userResult = await query(
        "SELECT id FROM ggr_users WHERE authentik_sub = $1",
        [user.sub],
      );
      if (userResult.rows.length === 0) {
        throw error(404, "User not found");
      }
      userId = userResult.rows[0].id;
    }

    if (!userId) {
      throw error(400, "Invalid user ID");
    }

    // Parse request body
    const preferences = await request.json();
    console.log("🔍 Received preferences:", preferences);

    // Validate preferences structure
    const validKeys = [
      "content_filter_level",
      "hide_mature_content",
      "hide_nsfw_content",
      "max_esrb_rating",
      "custom_content_blocks",
      "preferred_genres",
      "excluded_genres",
      "apply_to_homepage",
      "apply_to_popular",
      "apply_to_recent",
      "apply_to_search",
      "show_content_warnings",
      "safe_mode_enabled",
      "require_confirmation_for_mature",
    ];

    // Filter out invalid keys
    const filteredPreferences = {};
    for (const key of validKeys) {
      if (preferences.hasOwnProperty(key)) {
        filteredPreferences[key] = preferences[key];
      }
    }

    // Save preferences
    const success = await saveUserPreferences(userId, filteredPreferences);

    if (!success) {
      throw error(500, "Failed to save preferences");
    }

    // Invalidate caches that are affected by preference changes
    // This ensures the next page load gets fresh data with new filters applied
    await Promise.all([
      invalidateCache("popular-games"),
      invalidateCache("recent-games"),
      invalidateCache(`popular-games-filtered-${userId}`),
      invalidateCache(`recent-games-filtered-${userId}`),
      invalidateCache(`user-preferences-${userId}`),
      // Invalidate any user-specific caches
      invalidateCache(`user-session-${userId}`),
      invalidateCache(`user-permissions-${userId}`),
    ]);

    return json({
      success: true,
      message: "Preferences saved successfully",
      cacheInvalidated: true,
    });
  } catch (err) {
    console.error("User preferences API error:", err);

    if (err.status) {
      throw err; // Re-throw HTTP errors
    }

    throw error(500, "Failed to update preferences");
  }
}

export async function GET({ url, cookies, request }) {
  try {
    // Verify user authentication (supports session, basic auth, and API keys)
    const user = await getAuthenticatedUser(cookies, request);
    if (!user) {
      throw error(401, "Authentication required");
    }

    // Get user's database ID
    let userId;
    if (user.auth_type === "api_key") {
      userId = user.user_id;
    } else if (user.auth_type === "basic") {
      userId = user.id || parseInt(user.sub?.replace("basic_auth_", ""));
    } else {
      // Authentik users
      const userResult = await query(
        "SELECT id FROM ggr_users WHERE authentik_sub = $1",
        [user.sub],
      );
      if (userResult.rows.length === 0) {
        throw error(404, "User not found");
      }
      userId = userResult.rows[0].id;
    }

    if (!userId) {
      throw error(400, "Invalid user ID");
    }

    // Get user preferences
    const preferences = await getUserPreferences(userId);

    return json({
      success: true,
      preferences,
    });
  } catch (err) {
    console.error("User preferences API error:", err);

    if (err.status) {
      throw err; // Re-throw HTTP errors
    }

    throw error(500, "Failed to get preferences");
  }
}
