/**
 * Admin user edit page data loader and form handler
 */

import { error, redirect } from "@sveltejs/kit";
import { query } from "$lib/database.js";
import { verifySessionToken } from "$lib/auth.server.js";
import { userHasPermission } from "$lib/userProfile.js";
import { invalidateCache } from "$lib/cache.js";

export async function load({ params, parent }) {
  const { userPermissions } = await parent();

  // Check permission
  if (!userPermissions.includes("user.edit")) {
    throw redirect(302, "/admin?error=permission_denied");
  }

  try {
    const userId = params.id;

    // Validate userId parameter
    if (!userId || userId === "undefined" || userId === "null") {
      console.error("Invalid user ID parameter:", userId);
      throw error(400, "Invalid user ID");
    }

    // Convert to integer and validate
    const userIdInt = parseInt(userId, 10);
    if (isNaN(userIdInt) || userIdInt <= 0) {
      console.error("User ID is not a valid positive integer:", userId);
      throw error(400, "User ID must be a valid number");
    }

    // Get user details with roles
    const userQuery = `
      SELECT 
        u.id, u.authentik_sub, u.email, u.name, u.preferred_username, 
        u.avatar_url, u.is_active, u.is_admin, u.created_at, u.updated_at, u.last_login,
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', r.id,
              'name', r.name,
              'display_name', r.display_name
            )
          ) FILTER (WHERE r.id IS NOT NULL), 
          '[]'
        ) as roles
      FROM ggr_users u
      LEFT JOIN ggr_user_roles ur ON u.id = ur.user_id AND ur.is_active = true
      LEFT JOIN ggr_roles r ON ur.role_id = r.id AND r.is_active = true
      WHERE u.id = $1
      GROUP BY u.id, u.authentik_sub, u.email, u.name, u.preferred_username, 
               u.avatar_url, u.is_active, u.is_admin, u.created_at, u.updated_at, u.last_login
    `;

    const userResult = await query(userQuery, [userIdInt]);

    if (userResult.rows.length === 0) {
      throw error(404, "User not found");
    }

    const user = userResult.rows[0];

    // Filter out null roles
    if (user.roles) {
      user.roles = user.roles.filter((role) => role.id !== null);
    }

    // Get all available roles
    const rolesResult = await query(
      "SELECT id, name, display_name FROM ggr_roles WHERE is_active = true ORDER BY display_name",
    );
    const availableRoles = rolesResult.rows;

    // Check admin protection status
    let adminProtection = {
      isCurrentUser: false,
      isLastActiveAdmin: false,
      canModifyUser: true,
    };

    // Get current user's ID from parent data
    const currentUserId = userPermissions.localUserId;
    if (currentUserId) {
      adminProtection.isCurrentUser =
        parseInt(userIdInt) === parseInt(currentUserId);
    }

    // Check if target user is an admin
    const userAdminCheck = await query(
      `
      SELECT COUNT(*) as count
      FROM ggr_user_roles ur
      JOIN ggr_roles r ON ur.role_id = r.id
      WHERE ur.user_id = $1 AND r.name = 'admin' AND ur.is_active = true
      `,
      [userIdInt],
    );

    if (parseInt(userAdminCheck.rows[0].count) > 0) {
      // User has admin role, check if they're the last active admin
      const activeAdminCount = await query(
        `
        SELECT COUNT(*) as count
        FROM ggr_users u
        JOIN ggr_user_roles ur ON u.id = ur.user_id
        JOIN ggr_roles r ON ur.role_id = r.id
        WHERE r.name = 'admin' 
        AND ur.is_active = true 
        AND u.is_active = true
        AND u.id != $1
        `,
        [userIdInt],
      );

      adminProtection.isLastActiveAdmin =
        parseInt(activeAdminCount.rows[0].count) === 0;
    }

    // Can't modify if it's current user or if it would leave no admins
    adminProtection.canModifyUser =
      !adminProtection.isCurrentUser && !adminProtection.isLastActiveAdmin;

    // Add role-specific protection data for the UI
    adminProtection.hasAdminRole = parseInt(userAdminCheck.rows[0].count) > 0;
    adminProtection.canRemoveAdminRole = !adminProtection.isLastActiveAdmin;

    return {
      user,
      availableRoles,
      adminProtection,
    };
  } catch (err) {
    console.error("User edit page load error:", err);
    console.error("Error details:", {
      message: err.message,
      code: err.code,
      position: err.position,
      userId: userIdInt,
    });

    if (err.status) throw err;
    throw error(500, `Failed to load user details: ${err.message}`);
  }
}

export const actions = {
  updateProfile: async ({ request, cookies, params }) => {
    try {
      // Verify authentication - support both auth types
      const sessionCookie = cookies.get("session");
      const basicAuthSessionCookie = cookies.get("basic_auth_session");

      if (!sessionCookie && !basicAuthSessionCookie) {
        return { success: false, error: "Authentication required" };
      }

      let user = null;
      if (sessionCookie) {
        user = await verifySessionToken(sessionCookie);
      } else if (basicAuthSessionCookie) {
        const { getBasicAuthUser } = await import("$lib/basicAuth.js");
        user = getBasicAuthUser(basicAuthSessionCookie);
      }

      if (!user) {
        return { success: false, error: "Invalid session" };
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
        return { success: false, error: "User not found" };
      }

      const localUserId = userResult.rows[0].id;

      // Check permissions
      const hasPermission = await userHasPermission(localUserId, "user.edit");
      if (!hasPermission) {
        return { success: false, error: "Insufficient permissions" };
      }

      // Parse form data
      const formData = await request.formData();
      const targetUserId = params.id;
      const name = formData.get("name")?.toString().trim();
      const email = formData.get("email")?.toString().trim();
      const preferredUsername = formData
        .get("preferred_username")
        ?.toString()
        .trim();
      const isActive = formData.get("is_active") === "on";

      // Validate required fields
      if (!email) {
        return { success: false, error: "Email is required" };
      }

      // Prevent users from modifying themselves in certain ways
      if (parseInt(targetUserId) === parseInt(localUserId)) {
        return {
          success: false,
          error: "Cannot modify your own account through this form",
        };
      }

      // Check if target user is an admin and if deactivating would leave no active admins
      if (!isActive) {
        const targetUserAdminCheck = await query(
          `
          SELECT COUNT(*) as count
          FROM ggr_user_roles ur
          JOIN ggr_roles r ON ur.role_id = r.id
          WHERE ur.user_id = $1 AND r.name = 'admin' AND ur.is_active = true
          `,
          [targetUserId],
        );

        if (parseInt(targetUserAdminCheck.rows[0].count) > 0) {
          // Target user has admin role, check if they're the last active admin
          const activeAdminCount = await query(
            `
            SELECT COUNT(*) as count
            FROM ggr_users u
            JOIN ggr_user_roles ur ON u.id = ur.user_id
            JOIN ggr_roles r ON ur.role_id = r.id
            WHERE r.name = 'admin' 
            AND ur.is_active = true 
            AND u.is_active = true
            AND u.id != $1
            `,
            [targetUserId],
          );

          if (parseInt(activeAdminCount.rows[0].count) === 0) {
            return {
              success: false,
              error: "Cannot deactivate the last active admin user",
            };
          }
        }
      }

      // Update user profile
      const updateQuery = `
        UPDATE ggr_users 
        SET 
          name = $1,
          email = $2,
          preferred_username = $3,
          is_active = $4,
          updated_at = NOW()
        WHERE id = $5
        RETURNING *
      `;

      const updateResult = await query(updateQuery, [
        name || null,
        email,
        preferredUsername || null,
        isActive,
        targetUserId,
      ]);

      if (updateResult.rows.length === 0) {
        return { success: false, error: "User not found" };
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
            "admin_user_profile_updated",
            JSON.stringify({
              target_user_id: targetUserId,
              changes: {
                name: name !== updateResult.rows[0].name,
                email: email !== updateResult.rows[0].email,
                is_active: isActive !== updateResult.rows[0].is_active,
              },
            }),
          ],
        );
      } catch (analyticsError) {
        console.warn("Failed to log analytics:", analyticsError);
      }

      console.log(
        `✅ User ${targetUserId} profile updated by admin ${user.name || user.email}`,
      );

      return { success: true, message: "User profile updated successfully" };
    } catch (err) {
      console.error("❌ User profile update error:", err);
      return { success: false, error: "Failed to update user profile" };
    }
  },

  assignRole: async ({ request, cookies, params }) => {
    try {
      // Verify authentication - support both auth types
      const sessionCookie = cookies.get("session");
      const basicAuthSessionCookie = cookies.get("basic_auth_session");

      if (!sessionCookie && !basicAuthSessionCookie) {
        return { success: false, error: "Authentication required" };
      }

      let user = null;
      if (sessionCookie) {
        user = await verifySessionToken(sessionCookie);
      } else if (basicAuthSessionCookie) {
        const { getBasicAuthUser } = await import("$lib/basicAuth.js");
        user = getBasicAuthUser(basicAuthSessionCookie);
      }

      if (!user) {
        return { success: false, error: "Invalid session" };
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
        return { success: false, error: "User not found" };
      }

      const localUserId = userResult.rows[0].id;

      // Check permissions - require role.assign permission to assign roles
      const hasRoleAssignPermission = await userHasPermission(
        localUserId,
        "role.assign",
      );
      if (!hasRoleAssignPermission) {
        // Fallback to user.edit for backward compatibility (temporary)
        const hasUserEditPermission = await userHasPermission(
          localUserId,
          "user.edit",
        );
        if (!hasUserEditPermission) {
          return {
            success: false,
            error:
              "Insufficient permissions. You need the 'role.assign' permission to assign roles to users.",
          };
        }
      }

      // Parse form data
      const formData = await request.formData();
      const targetUserId = parseInt(params.id);
      const roleId = formData.get("role_id")?.toString();

      if (!roleId) {
        return { success: false, error: "Role ID is required" };
      }

      // SECURITY: Prevent users from modifying their own roles
      if (localUserId === targetUserId) {
        return {
          success: false,
          error:
            "You cannot assign roles to yourself. Another administrator must do this.",
        };
      }

      // SECURITY: Check if user is trying to assign a role with higher privileges
      // Get the role being assigned and check its permissions
      const roleCheck = await query(
        `SELECT r.id, r.name, r.display_name,
         EXISTS (
           SELECT 1 FROM ggr_role_permissions rp
           JOIN ggr_permissions p ON rp.permission_id = p.id
           WHERE rp.role_id = r.id
           AND (p.name = 'admin.*' OR p.name LIKE 'admin.%')
         ) as has_admin_perms
         FROM ggr_roles r
         WHERE r.id = $1`,
        [roleId],
      );

      if (roleCheck.rows.length === 0) {
        return { success: false, error: "Role not found" };
      }

      const targetRole = roleCheck.rows[0];

      // Only allow assigning admin-level roles if the assigner is themselves an admin
      if (targetRole.has_admin_perms || targetRole.name === "admin") {
        const assignerIsAdmin = await query(
          `SELECT EXISTS (
            SELECT 1 FROM ggr_users WHERE id = $1 AND is_admin = TRUE
          ) OR EXISTS (
            SELECT 1 FROM ggr_user_roles ur
            JOIN ggr_roles r ON ur.role_id = r.id
            WHERE ur.user_id = $1 AND r.name = 'admin' AND ur.is_active = TRUE
          ) as is_admin`,
          [localUserId],
        );

        if (!assignerIsAdmin.rows[0]?.is_admin) {
          return {
            success: false,
            error: `Only administrators can assign the '${targetRole.display_name}' role. This role grants administrative privileges.`,
          };
        }
      }

      // Check if role assignment already exists
      const existingRole = await query(
        "SELECT id FROM ggr_user_roles WHERE user_id = $1 AND role_id = $2 AND is_active = true",
        [targetUserId, roleId],
      );

      if (existingRole.rows.length > 0) {
        return { success: false, error: "User already has this role" };
      }

      // Assign the role
      const assignResult = await query(
        `
        INSERT INTO ggr_user_roles (user_id, role_id, assigned_by, assigned_at, is_active)
        VALUES ($1, $2, $3, NOW(), true)
        RETURNING id
      `,
        [targetUserId, roleId, localUserId],
      );

      if (assignResult.rows.length === 0) {
        return { success: false, error: "Failed to assign role" };
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
            "admin_role_assigned",
            JSON.stringify({
              target_user_id: targetUserId,
              role_id: roleId,
            }),
          ],
        );
      } catch (analyticsError) {
        console.warn("Failed to log analytics:", analyticsError);
      }

      // Invalidate user-related cache entries
      await invalidateCache([
        `user-${targetUserId}-data`,
        `user-${targetUserId}-roles`,
        `user-${targetUserId}-permissions`,
        "admin-users-list",
        "user-analytics",
      ]);

      console.log(
        `✅ Role ${roleId} assigned to user ${targetUserId} by admin ${user.name || user.email}`,
      );

      return { success: true, message: "Role assigned successfully" };
    } catch (err) {
      console.error("❌ Role assignment error:", err);
      return { success: false, error: "Failed to assign role" };
    }
  },

  removeRole: async ({ request, cookies, params }) => {
    try {
      // Verify authentication - support both auth types
      const sessionCookie = cookies.get("session");
      const basicAuthSessionCookie = cookies.get("basic_auth_session");

      if (!sessionCookie && !basicAuthSessionCookie) {
        return { success: false, error: "Authentication required" };
      }

      let user = null;
      if (sessionCookie) {
        user = await verifySessionToken(sessionCookie);
      } else if (basicAuthSessionCookie) {
        const { getBasicAuthUser } = await import("$lib/basicAuth.js");
        user = getBasicAuthUser(basicAuthSessionCookie);
      }

      if (!user) {
        return { success: false, error: "Invalid session" };
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
        return { success: false, error: "User not found" };
      }

      const localUserId = userResult.rows[0].id;

      // Check permissions - require role.assign permission to remove roles
      const hasRoleAssignPermission = await userHasPermission(
        localUserId,
        "role.assign",
      );
      if (!hasRoleAssignPermission) {
        // Fallback to user.edit for backward compatibility (temporary)
        const hasUserEditPermission = await userHasPermission(
          localUserId,
          "user.edit",
        );
        if (!hasUserEditPermission) {
          return {
            success: false,
            error:
              "Insufficient permissions. You need the 'role.assign' permission to remove roles from users.",
          };
        }
      }

      // Parse form data
      const formData = await request.formData();
      const targetUserId = parseInt(params.id);
      const roleId = formData.get("role_id")?.toString();

      if (!roleId) {
        return { success: false, error: "Role ID is required" };
      }

      // SECURITY: Prevent users from removing their own roles
      if (localUserId === targetUserId) {
        return {
          success: false,
          error:
            "You cannot remove roles from yourself. Another administrator must do this.",
        };
      }

      // Get the role being removed and check if it's an admin role
      const roleCheck = await query(
        `SELECT r.id, r.name, r.display_name,
         EXISTS (
           SELECT 1 FROM ggr_role_permissions rp
           JOIN ggr_permissions p ON rp.permission_id = p.id
           WHERE rp.role_id = r.id
           AND (p.name = 'admin.*' OR p.name LIKE 'admin.%')
         ) as has_admin_perms
         FROM ggr_roles r
         WHERE r.id = $1`,
        [roleId],
      );

      if (roleCheck.rows.length === 0) {
        return { success: false, error: "Role not found" };
      }

      const targetRole = roleCheck.rows[0];

      // SECURITY: Only allow removing admin-level roles if the remover is themselves an admin
      if (targetRole.has_admin_perms || targetRole.name === "admin") {
        const removerIsAdmin = await query(
          `SELECT EXISTS (
            SELECT 1 FROM ggr_users WHERE id = $1 AND is_admin = TRUE
          ) OR EXISTS (
            SELECT 1 FROM ggr_user_roles ur
            JOIN ggr_roles r ON ur.role_id = r.id
            WHERE ur.user_id = $1 AND r.name = 'admin' AND ur.is_active = TRUE
          ) as is_admin`,
          [localUserId],
        );

        if (!removerIsAdmin.rows[0]?.is_admin) {
          return {
            success: false,
            error: `Only administrators can remove the '${targetRole.display_name}' role.`,
          };
        }

        // Check if removing this role would leave no admins
        const adminCount = await query(
          `SELECT COUNT(*) as count
          FROM ggr_user_roles ur
          JOIN ggr_roles r ON ur.role_id = r.id
          WHERE r.name = 'admin'
          AND ur.is_active = true
          AND NOT (ur.user_id = $1 AND ur.role_id = $2)`,
          [targetUserId, roleId],
        );

        if (parseInt(adminCount.rows[0].count) === 0) {
          return {
            success: false,
            error:
              "Cannot remove the last admin role. At least one administrator must remain.",
          };
        }
      }

      // Remove the role
      const removeResult = await query(
        `
        DELETE FROM ggr_user_roles 
        WHERE user_id = $1 AND role_id = $2
        RETURNING user_id
      `,
        [targetUserId, roleId],
      );

      if (removeResult.rows.length === 0) {
        return { success: false, error: "Role assignment not found" };
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
            "admin_role_removed",
            JSON.stringify({
              target_user_id: targetUserId,
              role_id: roleId,
            }),
          ],
        );
      } catch (analyticsError) {
        console.warn("Failed to log analytics:", analyticsError);
      }
      // Invalidate user-related cache entries
      await invalidateCache([
        `user-${targetUserId}-data`,
        `user-${targetUserId}-roles`,
        `user-${targetUserId}-permissions`,
        "admin-users-list",
        "user-analytics",
      ]);

      console.log(
        `✅ Role ${roleId} removed from user ${targetUserId} by admin ${user.name || user.email}`,
      );

      return { success: true, message: "Role removed successfully" };
    } catch (err) {
      console.error("❌ Role removal error:", err);
      return { success: false, error: "Failed to remove role" };
    }
  },

  updatePassword: async ({ request, cookies, params }) => {
    try {
      // Verify authentication - support both auth types
      const sessionCookie = cookies.get("session");
      const basicAuthSessionCookie = cookies.get("basic_auth_session");

      if (!sessionCookie && !basicAuthSessionCookie) {
        return { success: false, error: "Authentication required" };
      }

      let user = null;
      if (sessionCookie) {
        user = await verifySessionToken(sessionCookie);
      } else if (basicAuthSessionCookie) {
        const { getBasicAuthUser } = await import("$lib/basicAuth.js");
        user = getBasicAuthUser(basicAuthSessionCookie);
      }

      if (!user) {
        return { success: false, error: "Invalid session" };
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
        return { success: false, error: "User not found" };
      }

      const localUserId = userResult.rows[0].id;

      // Check permissions
      const hasPermission = await userHasPermission(localUserId, "user.edit");
      if (!hasPermission) {
        return { success: false, error: "Insufficient permissions" };
      }

      // Parse form data
      const formData = await request.formData();
      const targetUserId = params.id;
      const newPassword = formData.get("new_password")?.toString();
      const confirmPassword = formData.get("confirm_password")?.toString();
      const forceChange = formData.get("force_change") === "on";

      // Validate input
      if (!newPassword || !confirmPassword) {
        return { success: false, error: "Both password fields are required" };
      }

      if (newPassword.length < 8) {
        return {
          success: false,
          error: "Password must be at least 8 characters long",
        };
      }

      if (newPassword !== confirmPassword) {
        return { success: false, error: "Passwords do not match" };
      }

      // Verify target user exists and is a basic auth user
      const targetUserResult = await query(
        "SELECT id, email, password_hash FROM ggr_users WHERE id = $1",
        [targetUserId],
      );

      if (targetUserResult.rows.length === 0) {
        return { success: false, error: "Target user not found" };
      }

      const targetUser = targetUserResult.rows[0];

      if (!targetUser.password_hash) {
        return {
          success: false,
          error: "Cannot update password for Authentik users",
        };
      }

      // Hash the new password
      const bcrypt = await import("bcrypt");
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      // Update the password
      const updateResult = await query(
        `
        UPDATE ggr_users 
        SET 
          password_hash = $1,
          password_changed_at = NOW(),
          force_password_change = $2,
          updated_at = NOW()
        WHERE id = $3
        RETURNING email
      `,
        [hashedPassword, forceChange, targetUserId],
      );

      if (updateResult.rows.length === 0) {
        return { success: false, error: "Failed to update password" };
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
            "admin_password_updated",
            JSON.stringify({
              target_user_id: targetUserId,
              target_user_email: targetUser.email,
              force_change: forceChange,
            }),
          ],
        );
      } catch (analyticsError) {
        console.warn("Failed to log analytics:", analyticsError);
      }
      console.log(
        `✅ Password updated for user ${targetUserId} by admin ${user.name || user.email}. Force change: ${forceChange}`,
      );

      return { success: true, message: "Password updated successfully" };
    } catch (err) {
      console.error("❌ Password update error:", err);
      return { success: false, error: "Failed to update password" };
    }
  },
};
