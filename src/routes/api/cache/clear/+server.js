/**
 * API endpoint for clearing cache data
 */

import { json, error } from "@sveltejs/kit";
import { clearAllCache } from "$lib/gameCache.js";
import { getAuthenticatedUser } from "$lib/auth.server.js";
import { getUserIdFromAuth } from "$lib/getUserId.js";
import { userHasPermission } from "$lib/userProfile.js";
import { query } from "$lib/database.js";

export async function POST({ request, cookies }) {
  try {
    const user = await getAuthenticatedUser(cookies, request);
    if (!user) {
      throw error(401, "Authentication required");
    }

    const localUserId = await getUserIdFromAuth(user, query);
    if (!(await userHasPermission(localUserId, "admin.panel"))) {
      throw error(403, "Admin permissions required");
    }

    const success = await clearAllCache();

    if (!success) {
      throw error(500, "Failed to clear cache");
    }

    return json({
      success: true,
      message: "All cache data cleared successfully",
    });
  } catch (err) {
    if (err?.status) throw err;
    console.error("Cache clear API error:", err);
    throw error(500, "Failed to clear cache");
  }
}
