/**
 * Admin API endpoint for clearing specific cache keys
 * Requires cookie-based authentication and cache.manage permission
 */

import { json } from "@sveltejs/kit";
import cache from "$lib/cache.js";
import { query } from "$lib/database.js";
import { verifySessionToken } from "$lib/auth.server.js";
import { userHasPermission } from "$lib/userProfile.js";
import { getBasicAuthUser } from "$lib/basicAuth.js";

/**
 * Authenticate user via cookie only (no API key support for admin endpoints)
 * @param {Object} cookies - Cookies object
 * @returns {Promise<Object|null>} - User object or null
 */
async function authenticateAdmin(cookies) {
  const sessionCookie = cookies.get("session");
  const basicAuthSessionCookie = cookies.get("basic_auth_session");

  if (!sessionCookie && !basicAuthSessionCookie) {
    return null;
  }

  let user = null;
  if (sessionCookie) {
    user = await verifySessionToken(sessionCookie);
  } else if (basicAuthSessionCookie) {
    user = getBasicAuthUser(basicAuthSessionCookie);
  }

  return user;
}

/**
 * Get local user ID from authenticated user
 * @param {Object} user - Authenticated user object
 * @returns {Promise<number|null>} - Local user ID or null
 */
async function getLocalUserId(user) {
  let userResult;
  if (user.auth_type === "basic") {
    userResult = await query(
      "SELECT id FROM ggr_users WHERE id = $1 AND password_hash IS NOT NULL",
      [parseInt(user.id)],
    );
  } else {
    userResult = await query(
      "SELECT id FROM ggr_users WHERE authentik_sub = $1",
      [user.sub],
    );
  }

  return userResult.rows.length > 0 ? userResult.rows[0].id : null;
}

export async function POST({ request, cookies }) {
  try {
    // Authenticate user via cookie only
    const user = await authenticateAdmin(cookies);
    if (!user) {
      return json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    // Get local user ID
    const localUserId = await getLocalUserId(user);
    if (!localUserId) {
      return json({ success: false, error: "User not found" }, { status: 401 });
    }

    // Check permissions
    const hasPermission = await userHasPermission(localUserId, "cache.manage");
    if (!hasPermission) {
      return json(
        { success: false, error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    const { cacheKey } = await request.json();

    if (!cacheKey) {
      return json(
        { success: false, error: "Cache key is required" },
        { status: 400 },
      );
    }

    // Clear the specific cache key
    await cache.delete(cacheKey);

    console.log(
      `✅ Cache key '${cacheKey}' cleared by admin ${user.name || user.email}`,
    );

    return json({
      success: true,
      message: `Cache key '${cacheKey}' cleared successfully`,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Cache clear error:", err);
    return json(
      { success: false, error: "Failed to clear cache" },
      { status: 500 },
    );
  }
}

// Alternative: clear all cache
export async function DELETE({ cookies }) {
  try {
    // Authenticate user via cookie only
    const user = await authenticateAdmin(cookies);
    if (!user) {
      return json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    // Get local user ID
    const localUserId = await getLocalUserId(user);
    if (!localUserId) {
      return json({ success: false, error: "User not found" }, { status: 401 });
    }

    // Check permissions
    const hasPermission = await userHasPermission(localUserId, "cache.manage");
    if (!hasPermission) {
      return json(
        { success: false, error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    await cache.clear();

    console.log(`✅ All cache cleared by admin ${user.name || user.email}`);

    return json({
      success: true,
      message: "All cache cleared successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Cache clear all error:", err);
    return json(
      { success: false, error: "Failed to clear all cache" },
      { status: 500 },
    );
  }
}
