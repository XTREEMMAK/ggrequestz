/**
 * API endpoint for creating new API keys
 * POST /admin/api/keys/create
 */

import { json } from "@sveltejs/kit";
import { createApiKey } from "$lib/apiKeys.js";
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

    // Check if user has permission to create API keys
    // Check for either admin access OR apikey.create permission
    const { userHasPermission } = await import("$lib/userProfile.js");
    const hasCreatePermission =
      isAdmin || (await userHasPermission(localUserId, "apikey.create"));

    if (!hasCreatePermission) {
      return json(
        {
          success: false,
          error:
            "Insufficient permissions. You need the 'apikey.create' permission to create API keys.",
        },
        { status: 403 },
      );
    }

    // Parse request body
    const body = await request.json();
    const { name, scopes, expires_at } = body;

    // Validate input
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return json(
        { success: false, error: "Name is required" },
        { status: 400 },
      );
    }

    if (!scopes || !Array.isArray(scopes) || scopes.length === 0) {
      return json(
        { success: false, error: "At least one scope is required" },
        { status: 400 },
      );
    }

    // Validate expiration date if provided
    let expirationDate = null;
    if (expires_at) {
      expirationDate = new Date(expires_at);
      if (isNaN(expirationDate.getTime())) {
        return json(
          { success: false, error: "Invalid expiration date" },
          { status: 400 },
        );
      }
      if (expirationDate <= new Date()) {
        return json(
          { success: false, error: "Expiration date must be in the future" },
          { status: 400 },
        );
      }
    }

    // Create API key
    const result = await createApiKey(
      localUserId,
      name.trim(),
      scopes,
      localUserId, // created_by
      expirationDate,
    );

    if (!result) {
      return json(
        { success: false, error: "Failed to create API key" },
        { status: 500 },
      );
    }

    // Return the full API key ONLY ONCE
    // This is the only time the user will see the full key
    return json({
      success: true,
      message:
        "API key created successfully. Save this key securely - you won't see it again!",
      key: result.key, // Full API key - only shown once
      id: result.id,
      prefix: result.prefix,
      created_at: result.created_at,
    });
  } catch (error) {
    console.error("Error creating API key:", error);
    return json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
