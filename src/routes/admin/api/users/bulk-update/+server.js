/**
 * Admin API endpoint for bulk updating users
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

    // Parse request data
    const { user_ids, action, value } = await request.json();

    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
      return json(
        {
          success: false,
          error: "Missing or invalid user_ids array",
        },
        { status: 400 },
      );
    }

    if (!action) {
      return json(
        {
          success: false,
          error: "Missing required field: action",
        },
        { status: 400 },
      );
    }

    // Limit bulk operations to prevent abuse
    if (user_ids.length > 100) {
      return json(
        {
          success: false,
          error: "Bulk operations limited to 100 users at a time",
        },
        { status: 400 },
      );
    }

    // Check permissions based on action
    let requiredPermission = "";
    switch (action) {
      case "activate":
      case "deactivate":
        requiredPermission = "user.edit";
        break;
      case "ban":
      case "unban":
        requiredPermission = "user.ban";
        break;
      case "delete":
        requiredPermission = "user.delete";
        break;
      case "assign_role":
      case "remove_role":
        requiredPermission = "user.edit";
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

    // Prevent users from modifying themselves in bulk operations
    if (
      user_ids.includes(localUserId) &&
      ["deactivate", "ban", "delete"].includes(action)
    ) {
      return json(
        { success: false, error: "Cannot perform this action on yourself" },
        { status: 400 },
      );
    }

    // Admin protection checks
    if (["deactivate", "delete"].includes(action)) {
      // Check if any of the targeted users are admins
      const placeholders = user_ids
        .map((_, index) => `$${index + 1}`)
        .join(",");
      const adminCheckResult = await query(
        `
        SELECT u.id, u.name, u.email 
        FROM ggr_users u
        JOIN ggr_user_roles ur ON u.id = ur.user_id
        JOIN ggr_roles r ON ur.role_id = r.id
        WHERE u.id IN (${placeholders}) AND r.name = 'admin' AND ur.is_active = true
      `,
        user_ids,
      );

      if (adminCheckResult.rows.length > 0) {
        // Count total active admins
        const totalAdminsResult = await query(`
          SELECT COUNT(*) as count
          FROM ggr_users u
          JOIN ggr_user_roles ur ON u.id = ur.user_id
          JOIN ggr_roles r ON ur.role_id = r.id
          WHERE r.name = 'admin' AND ur.is_active = true AND u.is_active = true
        `);

        const totalAdmins = parseInt(totalAdminsResult.rows[0].count) || 0;
        const adminUsersBeingAffected = adminCheckResult.rows.length;

        // Prevent action if it would remove all admins
        if (totalAdmins <= adminUsersBeingAffected) {
          return json(
            {
              success: false,
              error:
                "Cannot deactivate/delete all admin users. At least one admin must remain active.",
            },
            { status: 400 },
          );
        }

        // Warning if affecting some admins but not all
        console.warn(
          `⚠️  Bulk operation ${action} affecting ${adminUsersBeingAffected} admin user(s), ${totalAdmins - adminUsersBeingAffected} will remain`,
        );
      }
    }

    // Build the update query based on action
    let updateQuery = "";
    let queryParams = [];
    let result;

    switch (action) {
      case "activate":
        {
          const placeholders = user_ids
            .map((_, index) => `$${index + 1}`)
            .join(",");
          updateQuery = `
            UPDATE ggr_users 
            SET is_active = true, updated_at = NOW()
            WHERE id IN (${placeholders})
            RETURNING id, email, name
          `;
          queryParams = user_ids;
        }
        break;

      case "deactivate":
        {
          const placeholders = user_ids
            .map((_, index) => `$${index + 1}`)
            .join(",");
          updateQuery = `
            UPDATE ggr_users 
            SET is_active = false, updated_at = NOW()
            WHERE id IN (${placeholders})
            RETURNING id, email, name
          `;
          queryParams = user_ids;
        }
        break;

      case "delete":
        {
          const placeholders = user_ids
            .map((_, index) => `$${index + 1}`)
            .join(",");
          updateQuery = `
            UPDATE ggr_users 
            SET is_active = false, updated_at = NOW()
            WHERE id IN (${placeholders})
            RETURNING id, email, name
          `;
          queryParams = user_ids;
        }
        break;

      case "assign_role":
        {
          if (!value) {
            return json(
              {
                success: false,
                error: "Role ID required for assign_role action",
              },
              { status: 400 },
            );
          }

          // Insert role assignments for all users (ignore duplicates)
          const valueRows = user_ids
            .map(
              (userId, index) =>
                `($${index + 1}, $${user_ids.length + 1}, $${user_ids.length + 2}, NOW())`,
            )
            .join(",");

          updateQuery = `
            INSERT INTO ggr_user_roles (user_id, role_id, assigned_by, assigned_at)
            VALUES ${valueRows}
            ON CONFLICT (user_id, role_id) DO NOTHING
            RETURNING user_id
          `;
          queryParams = [...user_ids, value, localUserId];
        }
        break;

      case "remove_role":
        {
          if (!value) {
            return json(
              {
                success: false,
                error: "Role ID required for remove_role action",
              },
              { status: 400 },
            );
          }

          const placeholders = user_ids
            .map((_, index) => `$${index + 1}`)
            .join(",");
          updateQuery = `
            DELETE FROM ggr_user_roles 
            WHERE user_id IN (${placeholders}) AND role_id = $${user_ids.length + 1}
            RETURNING user_id
          `;
          queryParams = [...user_ids, value];
        }
        break;

      default:
        return json(
          { success: false, error: "Action not implemented" },
          { status: 400 },
        );
    }

    result = await query(updateQuery, queryParams);
    const updatedCount = result.rows.length;

    if (updatedCount === 0) {
      return json(
        { success: false, error: "No users were updated" },
        { status: 404 },
      );
    }

    // Log the bulk action for analytics
    try {
      await query(
        `
        INSERT INTO ggr_user_analytics (user_id, action, metadata)
        VALUES ($1, $2, $3)
      `,
        [
          localUserId,
          "admin_bulk_user_update",
          JSON.stringify({
            user_ids: user_ids,
            action: action,
            value: value,
            updated_count: updatedCount,
          }),
        ],
      );
    } catch (analyticsError) {
      console.warn("Failed to log analytics:", analyticsError);
    }
    console.log(
      `✅ Bulk updated ${updatedCount} users (${action}) by admin ${user.name || user.email}`,
    );

    return json({
      success: true,
      action: action,
      updated_count: updatedCount,
      updated_users: result.rows,
    });
  } catch (error) {
    console.error("❌ Bulk user update error:", error);
    return json(
      {
        success: false,
        error: "Failed to update users",
      },
      { status: 500 },
    );
  }
}
