/**
 * API endpoint for revoking API keys
 * POST /admin/api/keys/revoke
 */

import { json } from "@sveltejs/kit";
import { revokeApiKey } from "$lib/apiKeys.js";
import { getAuthenticatedUser } from "$lib/auth.server.js";
import { query } from "$lib/database.js";

export async function POST({ request, cookies }) {
  try {
    // Authenticate user
    const user = await getAuthenticatedUser(cookies, request);
    if (!user) {
      return json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    // Get local user ID and check admin permissions
    let localUserId;
    let isAdmin = false;

    if (user.auth_type === "basic") {
      // For basic auth users
      const userResult = await query(
        "SELECT id, is_admin FROM ggr_users WHERE id = $1 AND is_active = TRUE AND password_hash IS NOT NULL",
        [parseInt(user.id)],
      );

      if (userResult.rows.length === 0) {
        return json(
          { success: false, error: "User not found" },
          { status: 401 },
        );
      }

      localUserId = userResult.rows[0].id;
      isAdmin = userResult.rows[0].is_admin;

      // If not a direct admin, check role-based permissions
      if (!isAdmin) {
        const { userHasPermission } = await import("$lib/userProfile.js");
        isAdmin = await userHasPermission(localUserId, "admin.panel");
      }
    } else {
      // For Authentik users
      const userResult = await query(
        "SELECT id, is_admin FROM ggr_users WHERE authentik_sub = $1 AND is_active = TRUE",
        [user.sub],
      );

      if (userResult.rows.length === 0) {
        return json(
          { success: false, error: "User not found" },
          { status: 401 },
        );
      }

      localUserId = userResult.rows[0].id;
      isAdmin = userResult.rows[0].is_admin;

      // Also check if user is in admin group
      if (!isAdmin && user.groups && Array.isArray(user.groups)) {
        isAdmin = user.groups.includes("gg-requestz-admins");
      }
    }

    // Check if user has permission to revoke API keys
    // Check for either admin access OR apikey.revoke permission
    const { userHasPermission } = await import("$lib/userProfile.js");
    const hasRevokePermission =
      isAdmin || (await userHasPermission(localUserId, "apikey.revoke"));

    if (!hasRevokePermission) {
      return json(
        {
          success: false,
          error:
            "Insufficient permissions. You need the 'apikey.revoke' permission to revoke API keys.",
        },
        { status: 403 },
      );
    }

    // Parse request body
    const body = await request.json();
    const { key_id } = body;

    // Validate input
    if (!key_id || typeof key_id !== "number") {
      return json({ success: false, error: "Invalid key ID" }, { status: 400 });
    }

    // Revoke the API key
    const success = await revokeApiKey(key_id, localUserId);

    if (!success) {
      return json(
        { success: false, error: "Failed to revoke API key or key not found" },
        { status: 404 },
      );
    }

    return json({
      success: true,
      message: "API key revoked successfully",
    });
  } catch (error) {
    console.error("Error revoking API key:", error);
    return json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
