/**
 * User Preferences API endpoint
 * Handles saving and updating user content filtering preferences
 */

import { json, error } from "@sveltejs/kit";
import {
  saveUserPreferences,
  getUserPreferences,
} from "$lib/userPreferences.js";
import { verifyBasicAuthToken } from "$lib/basicAuth.js";

export async function POST({ request, cookies }) {
  try {
    // Get user from cookie - check both session types
    const sessionCookie = cookies.get("session");
    const basicAuthSessionCookie = cookies.get("basic_auth_session");

    if (!sessionCookie && !basicAuthSessionCookie) {
      throw error(401, "Authentication required");
    }

    const activeCookie = sessionCookie || basicAuthSessionCookie;

    // Parse token to get user info
    let payload;
    try {
      if (sessionCookie) {
        // JWT format (Authentik session)
        payload = JSON.parse(atob(sessionCookie.split(".")[1]));
      } else if (basicAuthSessionCookie) {
        // Basic Auth token format
        payload = verifyBasicAuthToken(basicAuthSessionCookie);
        if (!payload) {
          throw new Error("Invalid basic auth token");
        }
      }
    } catch (e) {
      console.error("Failed to parse session token:", e);
      throw error(401, "Invalid session token");
    }

    console.log("🔍 JWT Payload:", { payload });
    let userId = payload.id;

    // Handle different auth methods
    if (!userId) {
      if (payload.sub?.startsWith("basic_auth_")) {
        userId = parseInt(payload.sub.replace("basic_auth_", ""));
      } else {
        // For Authentik users, look up database ID
        const { query } = await import("$lib/database.js");
        const userResult = await query(
          "SELECT id FROM ggr_users WHERE authentik_sub = $1",
          [payload.sub],
        );
        if (userResult.rows.length === 0) {
          throw error(404, "User not found");
        }
        userId = userResult.rows[0].id;
      }
    }

    console.log("🔍 Resolved userId:", userId);

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

    return json({
      success: true,
      message: "Preferences saved successfully",
    });
  } catch (err) {
    console.error("User preferences API error:", err);

    if (err.status) {
      throw err; // Re-throw HTTP errors
    }

    throw error(500, "Failed to update preferences");
  }
}

export async function GET({ url, cookies }) {
  try {
    // Get user from cookie - check both session types
    const sessionCookie = cookies.get("session");
    const basicAuthSessionCookie = cookies.get("basic_auth_session");

    if (!sessionCookie && !basicAuthSessionCookie) {
      throw error(401, "Authentication required");
    }

    const activeCookie = sessionCookie || basicAuthSessionCookie;

    // Parse token to get user info
    let payload;
    try {
      if (sessionCookie) {
        // JWT format (Authentik session)
        payload = JSON.parse(atob(sessionCookie.split(".")[1]));
      } else if (basicAuthSessionCookie) {
        // Basic Auth token format
        payload = verifyBasicAuthToken(basicAuthSessionCookie);
        if (!payload) {
          throw new Error("Invalid basic auth token");
        }
      }
    } catch (e) {
      console.error("Failed to parse session token:", e);
      throw error(401, "Invalid session token");
    }
    let userId = payload.id;

    // Handle different auth methods
    if (!userId) {
      if (payload.sub?.startsWith("basic_auth_")) {
        userId = parseInt(payload.sub.replace("basic_auth_", ""));
      } else {
        // For Authentik users, look up database ID
        const { query } = await import("$lib/database.js");
        const userResult = await query(
          "SELECT id FROM ggr_users WHERE authentik_sub = $1",
          [payload.sub],
        );
        if (userResult.rows.length === 0) {
          throw error(404, "User not found");
        }
        userId = userResult.rows[0].id;
      }
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
