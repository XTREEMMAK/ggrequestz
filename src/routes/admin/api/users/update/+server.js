/**
 * Admin API endpoint for updating individual users
 */

import { json } from "@sveltejs/kit";
import { query } from "$lib/database.js";
import { verifySessionToken } from "$lib/auth.js";
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
    if (user.sub?.startsWith('basic_auth_')) {
      const basicAuthId = user.sub.replace('basic_auth_', '');
      userResult = await query(
        "SELECT id FROM ggr_users WHERE id = $1 AND password_hash IS NOT NULL",
        [parseInt(basicAuthId)]
      );
    } else {
      userResult = await query(
        "SELECT id FROM ggr_users WHERE authentik_sub = $1",
        [user.sub]
      );
    }

    if (userResult.rows.length === 0) {
      return json({ success: false, error: "User not found" }, { status: 404 });
    }

    const localUserId = userResult.rows[0].id;

    // Parse request data
    const { user_id, action, value } = await request.json();

    if (!user_id || !action) {
      return json(
        {
          success: false,
          error: "Missing required fields: user_id and action",
        },
        { status: 400 },
      );
    }

    // Check permissions based on action
    let requiredPermission = "";
    switch (action) {
      case "toggle_active":
        requiredPermission = "user.edit";
        break;
      case "assign_role":
      case "remove_role":
        requiredPermission = "user.edit";
        break;
      case "ban":
      case "unban":
        requiredPermission = "user.ban";
        break;
      case "delete":
        requiredPermission = "user.delete";
        break;
      default:
        return json(
          { success: false, error: "Invalid action" },
          { status: 400 },
        );
    }

    const hasPermission = await userHasPermission(
      localUserId,
      requiredPermission,
    );
    if (!hasPermission) {
      return json(
        { success: false, error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    // Prevent users from modifying themselves in certain ways
    if (
      user_id === localUserId &&
      ["toggle_active", "ban", "delete", "remove_role"].includes(action)
    ) {
      return json(
        { success: false, error: "Cannot perform this action on yourself" },
        { status: 400 },
      );
    }

    // Admin protection checks
    if (["toggle_active", "delete", "remove_role"].includes(action)) {
      // Check if target user is an admin (both role-based and is_admin flag)
      const targetUserAdminCheck = await query(
        `
        SELECT 
          CASE 
            WHEN u.is_admin = true THEN 1
            WHEN EXISTS (
              SELECT 1 FROM ggr_user_roles ur
              JOIN ggr_roles r ON ur.role_id = r.id
              WHERE ur.user_id = u.id AND r.name = 'admin' AND ur.is_active = true
            ) THEN 1
            ELSE 0
          END as is_admin_count
        FROM ggr_users u
        WHERE u.id = $1
      `,
        [user_id],
      );

      const isTargetAdmin = targetUserAdminCheck.rows.length > 0 && 
                           parseInt(targetUserAdminCheck.rows[0].is_admin_count) > 0;

      if (isTargetAdmin) {
        // Count total active admins (both role-based and is_admin flag)
        const totalAdminsResult = await query(`
          SELECT COUNT(DISTINCT u.id) as count
          FROM ggr_users u
          WHERE u.is_active = true AND (
            u.is_admin = true OR
            EXISTS (
              SELECT 1 FROM ggr_user_roles ur
              JOIN ggr_roles r ON ur.role_id = r.id
              WHERE ur.user_id = u.id AND r.name = 'admin' AND ur.is_active = true
            )
          )
        `);

        const totalAdmins = parseInt(totalAdminsResult.rows[0].count) || 0;

        // Additional check for remove_role action
        if (action === "remove_role" && value) {
          const roleCheck = await query(
            "SELECT name FROM ggr_roles WHERE id = $1",
            [value],
          );
          if (
            roleCheck.rows.length > 0 &&
            roleCheck.rows[0].name === "admin" &&
            totalAdmins <= 1
          ) {
            return json(
              {
                success: false,
                error:
                  "Cannot remove the last admin role. At least one admin must remain.",
              },
              { status: 400 },
            );
          }
        } else if (
          ["toggle_active", "delete"].includes(action) &&
          totalAdmins <= 1
        ) {
          return json(
            {
              success: false,
              error:
                "Cannot deactivate/delete the last admin user. At least one admin must remain active.",
            },
            { status: 400 },
          );
        }
      }
    }

    // Execute the action
    let result;
    switch (action) {
      case "toggle_active":
        result = await query(
          `
          UPDATE ggr_users 
          SET is_active = NOT is_active, updated_at = NOW()
          WHERE id = $1
          RETURNING id, is_active
        `,
          [user_id],
        );
        break;

      case "assign_role":
        if (!value) {
          return json(
            {
              success: false,
              error: "Role ID required for assign_role action",
            },
            { status: 400 },
          );
        }
        // First check if role assignment already exists
        const existingRole = await query(
          "SELECT id FROM ggr_user_roles WHERE user_id = $1 AND role_id = $2",
          [user_id, value],
        );
        if (existingRole.rows.length > 0) {
          return json(
            { success: false, error: "User already has this role" },
            { status: 400 },
          );
        }

        result = await query(
          `
          INSERT INTO ggr_user_roles (user_id, role_id, assigned_by, assigned_at)
          VALUES ($1, $2, $3, NOW())
          RETURNING id
        `,
          [user_id, value, localUserId],
        );
        break;

      case "remove_role":
        if (!value) {
          return json(
            {
              success: false,
              error: "Role ID required for remove_role action",
            },
            { status: 400 },
          );
        }
        result = await query(
          `
          DELETE FROM ggr_user_roles 
          WHERE user_id = $1 AND role_id = $2
          RETURNING user_id
        `,
          [user_id, value],
        );
        break;

      case "delete":
        // Soft delete by setting is_active to false and clearing sensitive data
        result = await query(
          `
          UPDATE ggr_users 
          SET is_active = false, updated_at = NOW()
          WHERE id = $1
          RETURNING id
        `,
          [user_id],
        );
        break;

      default:
        return json(
          { success: false, error: "Action not implemented" },
          { status: 400 },
        );
    }

    if (result.rows.length === 0) {
      return json(
        { success: false, error: "User not found or action failed" },
        { status: 404 },
      );
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
          "admin_user_updated",
          JSON.stringify({
            target_user_id: user_id,
            action: action,
            value: value,
          }),
        ],
      );
    } catch (analyticsError) {
      console.warn("Failed to log analytics:", analyticsError);
    }
console.log(
      `✅ User ${user_id} updated (${action}) by admin ${user.name || user.email}`,
    );

    return json({
      success: true,
      action: action,
      user_id: user_id,
    });
  } catch (error) {
    console.error("❌ User update error:", error);
    return json(
      {
        success: false,
        error: "Failed to update user",
      },
      { status: 500 },
    );
  }
}
