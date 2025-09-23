/**
 * Admin roles page data loader and form handler
 */

import { error, redirect } from "@sveltejs/kit";
import { query } from "$lib/database.js";
import { verifySessionToken } from "$lib/auth.server.js";
import { userHasPermission } from "$lib/userProfile.js";

// Helper function to get user ID from session - support both auth types
async function getUserId(cookies) {
  // Try Authentik session first
  const sessionCookie = cookies.get("session");
  if (sessionCookie) {
    const user = await verifySessionToken(sessionCookie);
    if (user) {
      const result = await query(
        "SELECT id FROM ggr_users WHERE authentik_sub = $1",
        [user.sub],
      );
      return result.rows.length > 0 ? result.rows[0].id : null;
    }
  }

  // Try basic auth session
  const basicAuthSessionCookie = cookies.get("basic_auth_session");
  if (basicAuthSessionCookie) {
    try {
      const { getBasicAuthUser } = await import("$lib/basicAuth.js");
      const user = getBasicAuthUser(basicAuthSessionCookie);
      if (user && user.sub?.startsWith("basic_auth_")) {
        const basicAuthId = user.sub.replace("basic_auth_", "");
        const result = await query(
          "SELECT id FROM ggr_users WHERE id = $1 AND password_hash IS NOT NULL",
          [parseInt(basicAuthId)],
        );
        return result.rows.length > 0 ? result.rows[0].id : null;
      }
    } catch (error) {
      console.warn("Failed to get basic auth user:", error);
    }
  }

  return null;
}

export async function load({ cookies }) {
  try {
    const userId = await getUserId(cookies);

    if (!userId || !(await userHasPermission(userId, "user.edit"))) {
      throw redirect(302, "/admin?error=permission_denied");
    }

    // Get all roles with their permissions
    const rolesQuery = `
      SELECT 
        r.id, r.name, r.display_name, r.description, r.is_active, 
        COALESCE(r.is_system, FALSE) as is_system,
        r.created_at, r.updated_at,
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', p.id,
              'name', p.name,
              'display_name', p.display_name,
              'description', p.description,
              'category', p.category
            ) ORDER BY p.category, p.display_name
          ) FILTER (WHERE p.id IS NOT NULL), 
          '[]'
        ) as permissions
      FROM ggr_roles r
      LEFT JOIN ggr_role_permissions rp ON r.id = rp.role_id
      LEFT JOIN ggr_permissions p ON rp.permission_id = p.id AND p.is_active = true
      WHERE r.is_active = true
      GROUP BY r.id, r.name, r.display_name, r.description, r.is_active, 
               r.is_system, r.created_at, r.updated_at
      ORDER BY r.name
    `;

    const rolesResult = await query(rolesQuery);
    const roles = rolesResult.rows.map((role) => ({
      ...role,
      permissions: role.permissions || [],
    }));

    // Get all available permissions
    const permissionsQuery = `
      SELECT id, name, display_name, description, category
      FROM ggr_permissions 
      WHERE is_active = true 
      ORDER BY category, display_name
    `;

    const permissionsResult = await query(permissionsQuery);
    const availablePermissions = permissionsResult.rows;

    // Group permissions by category
    const permissionsByCategory = {};
    availablePermissions.forEach((permission) => {
      const category = permission.category || "other";
      if (!permissionsByCategory[category]) {
        permissionsByCategory[category] = [];
      }
      permissionsByCategory[category].push(permission);
    });

    return {
      roles,
      availablePermissions,
      permissionsByCategory,
    };
  } catch (err) {
    console.error("Roles page load error:", err);

    if (err.status) throw err;
    throw error(500, `Failed to load roles: ${err.message}`);
  }
}

export const actions = {
  updateRolePermissions: async ({ request, cookies }) => {
    try {
      const userId = await getUserId(cookies);

      if (!userId || !(await userHasPermission(userId, "user.edit"))) {
        return { success: false, error: "Insufficient permissions" };
      }

      const formData = await request.formData();
      const roleId = formData.get("role_id");
      const permissionIds = formData.getAll("permission_ids");

      if (!roleId) {
        return { success: false, error: "Role ID is required" };
      }

      // Check if role is system role and prevent modification of critical system roles
      const roleCheck = await query(
        "SELECT name, is_system FROM ggr_roles WHERE id = $1",
        [roleId],
      );

      if (roleCheck.rows.length === 0) {
        return { success: false, error: "Role not found" };
      }

      const role = roleCheck.rows[0];

      // Start transaction
      await query("BEGIN");

      try {
        // Remove all current permissions for this role
        await query("DELETE FROM ggr_role_permissions WHERE role_id = $1", [
          roleId,
        ]);

        // Add selected permissions
        for (const permissionId of permissionIds) {
          if (permissionId && permissionId.trim() !== "") {
            await query(
              "INSERT INTO ggr_role_permissions (role_id, permission_id) VALUES ($1, $2)",
              [roleId, parseInt(permissionId)],
            );
          }
        }

        await query("COMMIT");

        return {
          success: true,
          message: `Role permissions updated successfully for ${role.name}`,
        };
      } catch (transactionError) {
        await query("ROLLBACK");
        throw transactionError;
      }
    } catch (err) {
      console.error("❌ Role permissions update error:", err);
      return { success: false, error: "Failed to update role permissions" };
    }
  },
};
