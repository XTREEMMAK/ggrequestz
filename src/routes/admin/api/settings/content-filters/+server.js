/**
 * Global Content Filters API Endpoint
 * Allows admins to configure system-wide content filtering
 * Requires cookie-based authentication (no API key support for security)
 */

import { json, error } from "@sveltejs/kit";
import { query } from "$lib/database.js";
import { verifySessionToken } from "$lib/auth.server.js";
import { getBasicAuthUser } from "$lib/basicAuth.js";
import { getUserIdFromAuth } from "$lib/getUserId.js";
import { userHasPermission } from "$lib/userProfile.js";
import { saveGlobalFilters } from "$lib/globalFilters.js";

export async function POST({ request, cookies }) {
  try {
    // Authenticate user via cookie only (no API key support for admin endpoints)
    const sessionCookie = cookies.get("session");
    const basicAuthSessionCookie = cookies.get("basic_auth_session");

    if (!sessionCookie && !basicAuthSessionCookie) {
      throw error(401, "Authentication required");
    }

    let user = null;
    if (sessionCookie) {
      user = await verifySessionToken(sessionCookie);
    } else if (basicAuthSessionCookie) {
      user = getBasicAuthUser(basicAuthSessionCookie);
    }

    if (!user) {
      throw error(401, "Invalid session");
    }

    // Get user's database ID using standard utility (handles all auth types)
    const localUserId = await getUserIdFromAuth(user, query);

    console.log(
      `🔐 Content filter save request from user ID: ${localUserId}, auth type: ${user.auth_type || "oidc"}`,
    );

    // Check permissions using proper permission check function
    const hasPermission = await userHasPermission(
      localUserId,
      "system.settings",
    );

    if (!hasPermission) {
      throw error(
        403,
        "Insufficient permissions. system.settings permission required.",
      );
    }

    // Parse request body
    const filters = await request.json();

    // Validate filter structure
    if (typeof filters !== "object") {
      throw error(400, "Invalid filter data");
    }

    // Validate ESRB rating if provided
    const validRatings = ["EC", "E", "E10+", "T", "M", "AO", null];
    if (
      filters.max_esrb_rating &&
      !validRatings.includes(filters.max_esrb_rating)
    ) {
      throw error(400, "Invalid ESRB rating");
    }

    // Validate arrays
    if (
      filters.custom_content_blocks &&
      !Array.isArray(filters.custom_content_blocks)
    ) {
      throw error(400, "custom_content_blocks must be an array");
    }

    if (filters.excluded_genres && !Array.isArray(filters.excluded_genres)) {
      throw error(400, "excluded_genres must be an array");
    }

    if (filters.banned_games && !Array.isArray(filters.banned_games)) {
      throw error(400, "banned_games must be an array");
    }

    // Validate banned games are integers
    if (filters.banned_games) {
      for (const gameId of filters.banned_games) {
        if (!Number.isInteger(gameId) || gameId <= 0) {
          throw error(400, "banned_games must contain only positive integers");
        }
      }
    }

    // Save filters with user tracking
    console.log(`💾 Attempting to save global filters for user ${localUserId}`);
    const success = await saveGlobalFilters(filters, localUserId);

    if (!success) {
      console.error(`❌ Failed to save global filters for user ${localUserId}`);
      throw error(500, "Failed to save global filters");
    }

    console.log(
      `✅ Admin ${user.email || user.username || localUserId} (ID: ${localUserId}) updated global content filters`,
    );

    return json({
      success: true,
      message: "Global content filters saved successfully",
      filters,
    });
  } catch (err) {
    console.error("Global content filters API error:", err);
    console.error("Error details:", {
      message: err.message,
      status: err.status,
      stack: err.stack,
    });

    if (err.status) {
      throw err; // Re-throw HTTP errors
    }

    throw error(500, "Failed to update global content filters");
  }
}
