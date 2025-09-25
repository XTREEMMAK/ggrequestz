/**
 * Admin API endpoint for updating system settings
 */

import { json } from "@sveltejs/kit";
import { query } from "$lib/database.js";
import { verifySessionToken } from "$lib/auth.server.js";
import { userHasPermission } from "$lib/userProfile.js";
import { getBasicAuthUser } from "$lib/basicAuth.js";

export async function POST({ request, cookies }) {
  try {
    // Verify authentication - support both auth types
    const sessionCookie = cookies.get("session");
    const basicAuthSessionCookie = cookies.get("basic_auth_session");

    if (!sessionCookie && !basicAuthSessionCookie) {
      return json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    let user = null;
    if (sessionCookie) {
      user = await verifySessionToken(sessionCookie);
    } else if (basicAuthSessionCookie) {
      user = getBasicAuthUser(basicAuthSessionCookie);
    }

    if (!user) {
      return json(
        { success: false, error: "Invalid session" },
        { status: 401 },
      );
    }

    // Get user's local ID - support both basic auth and Authentik users
    let userResult;
    if (user.auth_type === "basic") {
      // For basic auth, use the direct ID from the user object
      userResult = await query(
        "SELECT id FROM ggr_users WHERE id = $1 AND password_hash IS NOT NULL",
        [parseInt(user.id)],
      );
    } else {
      // For Authentik users, use the sub field
      userResult = await query(
        "SELECT id FROM ggr_users WHERE authentik_sub = $1",
        [user.sub],
      );
    }

    if (userResult.rows.length === 0) {
      return json({ success: false, error: "User not found" }, { status: 404 });
    }

    const localUserId = userResult.rows[0].id;

    // Check permissions
    const hasPermission = await userHasPermission(
      localUserId,
      "system.settings",
    );

    if (!hasPermission) {
      return json(
        { success: false, error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    // Parse request data
    const { settings } = await request.json();

    if (!settings || typeof settings !== "object") {
      return json(
        {
          success: false,
          error: "Missing or invalid settings object",
        },
        { status: 400 },
      );
    }

    // Update each setting
    const updatedSettings = [];
    for (const [key, value] of Object.entries(settings)) {
      try {
        await query(
          `
          INSERT INTO ggr_system_settings (key, value, updated_by, updated_at)
          VALUES ($1, $2, $3, NOW())
          ON CONFLICT (key) DO UPDATE SET
            value = EXCLUDED.value,
            updated_by = EXCLUDED.updated_by,
            updated_at = EXCLUDED.updated_at
        `,
          [key, value, localUserId],
        );

        updatedSettings.push(key);
      } catch (settingError) {
        console.warn(`Failed to update setting ${key}:`, settingError);
      }
    }

    // Log the action for analytics
    try {
      await query(
        `
        INSERT INTO ggr_user_analytics (user_id, action, metadata)
        VALUES ($1, $2, $3)
      `,
        [
          localUserId,
          "admin_settings_updated",
          JSON.stringify({
            updated_settings: updatedSettings,
            settings_count: updatedSettings.length,
          }),
        ],
      );
    } catch (analyticsError) {
      console.warn("Failed to log analytics:", analyticsError);
    }

    console.log(
      `✅ Settings updated by admin ${user.name || user.email}: ${updatedSettings.join(", ")}`,
    );

    return json({
      success: true,
      updated_settings: updatedSettings,
      updated_count: updatedSettings.length,
    });
  } catch (error) {
    console.error("❌ Settings update error:", error);
    return json(
      {
        success: false,
        error: "Failed to update settings",
      },
      { status: 500 },
    );
  }
}
