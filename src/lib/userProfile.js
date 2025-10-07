/**
 * User profile management for Authentik authentication
 */

import { query } from "./database.js";

/**
 * Find user by Authentik subject ID
 * @param {string} authentikSub - Authentik subject identifier
 * @returns {Promise<Object|null>} - User profile or null
 */
export async function findUserByAuthentikSub(authentikSub) {
  try {
    const result = await query(
      "SELECT * FROM ggr_users WHERE authentik_sub = $1",
      [authentikSub],
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error(
      "❌ AUTH DEBUG: Database error in findUserByAuthentikSub:",
      error.message,
    );
    console.error(
      "❌ AUTH DEBUG: Query was: SELECT * FROM ggr_users WHERE authentik_sub = $1 with param:",
      authentikSub,
    );
    return null;
  }
}

/**
 * Create new user profile from Authentik user info
 * @param {Object} userInfo - User info from Authentik
 * @returns {Promise<Object|null>} - Created user profile or null
 */
export async function createUserFromAuthentik(userInfo) {
  try {
    // Check if this is the first user (no admins exist yet)
    const isFirstUser = !(await hasAdminUsers());

    const result = await query(
      `
      INSERT INTO ggr_users (
        authentik_sub, email, name, preferred_username, avatar_url,
        is_admin, created_at, updated_at, last_login
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), NOW())
      RETURNING *`,
      [
        userInfo.sub,
        userInfo.email,
        userInfo.name || null,
        userInfo.preferred_username || null,
        userInfo.picture || userInfo.avatar_url || null,
        isFirstUser, // Make first user an admin automatically
      ],
    );

    const user = result.rows[0];

    if (isFirstUser) {
      console.log(`✅ First Authentik user created as admin: ${user.email}`);
    }

    // Assign roles based on Authentik groups (but skip admin flag update for first user)
    await assignRolesFromAuthentikGroups(
      user.id,
      userInfo.groups || [],
      isFirstUser,
    );

    return user;
  } catch (error) {
    console.error("❌ Failed to create user from Authentik:", error);
    return null;
  }
}

/**
 * Update existing user profile with latest Authentik info
 * @param {number} userId - Local user ID
 * @param {Object} userInfo - User info from Authentik
 * @param {boolean} preserveRoles - Whether to preserve existing roles (true when linking basic auth)
 * @returns {Promise<Object|null>} - Updated user profile or null
 */
export async function updateUserFromAuthentik(
  userId,
  userInfo,
  preserveRoles = false,
) {
  try {
    const result = await query(
      `
      UPDATE ggr_users SET
        email = $2,
        name = $3,
        preferred_username = $4,
        avatar_url = $5,
        last_login = NOW(),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
      [
        userId,
        userInfo.email,
        userInfo.name || null,
        userInfo.preferred_username || null,
        userInfo.picture || userInfo.avatar_url || null,
      ],
    );

    const user = result.rows[0];

    // Update roles based on current Authentik groups
    // Skip role sync if preserveRoles is true (when linking existing basic auth account)
    if (!preserveRoles) {
      await assignRolesFromAuthentikGroups(user.id, userInfo.groups || []);
    } else {
      console.log(
        `ℹ️ Preserving existing roles for user ${user.id} (linked from basic auth)`,
      );
    }

    return user;
  } catch (error) {
    console.error("❌ Failed to update user from Authentik:", error);
    return null;
  }
}

/**
 * Assign roles to user based on Authentik groups
 * @param {number} userId - Local user ID
 * @param {Array} authentikGroups - Array of Authentik group names
 * @param {boolean} isFirstUser - Whether this is the first user (skip admin flag update)
 * @returns {Promise<void>}
 */
async function assignRolesFromAuthentikGroups(
  userId,
  authentikGroups,
  isFirstUser = false,
) {
  try {
    // Mapping of Authentik groups to internal roles
    const groupRoleMapping = {
      "gg-requestz-admins": "admin",
      "gg-requestz-managers": "manager",
      "gg-requestz-users": "viewer",
    };

    // Check if user has admin group for direct is_admin flag
    const hasAdminGroup = authentikGroups.includes("gg-requestz-admins");

    console.log(
      `🔍 AUTH DEBUG: assignRolesFromAuthentikGroups - userId: ${userId}, groups: ${JSON.stringify(authentikGroups)}, hasAdminGroup: ${hasAdminGroup}, isFirstUser: ${isFirstUser}`,
    );

    // Update the direct is_admin flag based on group membership
    // Skip this for first user - they already have is_admin=true from INSERT
    if (!isFirstUser) {
      await query(
        "UPDATE ggr_users SET is_admin = $1, updated_at = NOW() WHERE id = $2",
        [hasAdminGroup, userId],
      );

      console.log(
        `✅ AUTH DEBUG: Updated is_admin to ${hasAdminGroup} for user ${userId}`,
      );
    } else {
      console.log(
        `ℹ️ AUTH DEBUG: Skipping is_admin update for first user ${userId}`,
      );
    }

    // Find which roles to assign
    const rolesToAssign = [];
    for (const group of authentikGroups) {
      if (groupRoleMapping[group]) {
        rolesToAssign.push(groupRoleMapping[group]);
      }
    }

    // If no specific roles found, assign default viewer role
    if (rolesToAssign.length === 0) {
      rolesToAssign.push("viewer");
    }

    // Remove existing roles for this user
    await query("DELETE FROM ggr_user_roles WHERE user_id = $1", [userId]);

    // Assign new roles
    for (const roleName of rolesToAssign) {
      try {
        await query(
          `
          INSERT INTO ggr_user_roles (user_id, role_id, assigned_at)
          SELECT $1, r.id, NOW()
          FROM ggr_roles r
          WHERE r.name = $2 AND r.is_active = TRUE
          ON CONFLICT (user_id, role_id) DO NOTHING
        `,
          [userId, roleName],
        );
      } catch (roleError) {
        console.warn(
          `⚠️ Failed to assign role '${roleName}':`,
          roleError.message,
        );
      }
    }
  } catch (error) {
    console.error("❌ Failed to assign roles from Authentik groups:", error);
    console.error("❌ Error details:", {
      message: error.message,
      code: error.code,
      stack: error.stack,
      userId,
      authentikGroups,
    });
  }
}

/**
 * Get user permissions
 * @param {number} userId - Local user ID
 * @returns {Promise<Array>} - Array of permission names
 */
export async function getUserPermissions(userId) {
  try {
    // First check if user is an admin
    const adminCheck = await query(
      "SELECT is_admin FROM ggr_users WHERE id = $1 AND is_admin = TRUE AND is_active = TRUE",
      [userId],
    );

    if (adminCheck.rows.length > 0) {
      // Admins have all permissions - return all available permissions
      const allPermsResult = await query(
        "SELECT name as permission_name FROM ggr_permissions WHERE is_active = TRUE",
      );
      return allPermsResult.rows.map((row) => row.permission_name);
    }

    // Get permissions through role assignments
    const result = await query(
      `
      SELECT DISTINCT p.name as permission_name
      FROM ggr_users u
      JOIN ggr_user_roles ur ON u.id = ur.user_id
      JOIN ggr_roles r ON ur.role_id = r.id
      JOIN ggr_role_permissions rp ON r.id = rp.role_id
      JOIN ggr_permissions p ON rp.permission_id = p.id
      WHERE u.id = $1
        AND u.is_active = TRUE
        AND ur.is_active = TRUE
        AND r.is_active = TRUE
        AND p.is_active = TRUE
    `,
      [userId],
    );

    return result.rows.map((row) => row.permission_name);
  } catch (error) {
    console.error("❌ Failed to get user permissions:", error);
    return [];
  }
}

/**
 * Check if user has specific permission
 * @param {number} userId - Local user ID
 * @param {string} permissionName - Permission to check
 * @returns {Promise<boolean>} - Whether user has permission
 */
export async function userHasPermission(userId, permissionName) {
  try {
    // First check if user is an admin (admins have all permissions)
    const adminCheck = await query(
      "SELECT is_admin FROM ggr_users WHERE id = $1 AND is_admin = TRUE AND is_active = TRUE",
      [userId],
    );

    if (adminCheck.rows.length > 0) {
      return true; // Admins have all permissions
    }

    // If not admin, check specific permission through role assignments
    const result = await query(
      `
      SELECT 1 FROM ggr_users u
      JOIN ggr_user_roles ur ON u.id = ur.user_id
      JOIN ggr_roles r ON ur.role_id = r.id
      JOIN ggr_role_permissions rp ON r.id = rp.role_id
      JOIN ggr_permissions p ON rp.permission_id = p.id
      WHERE u.id = $1
        AND u.is_active = TRUE
        AND ur.is_active = TRUE
        AND r.is_active = TRUE
        AND p.is_active = TRUE
        AND (p.name = $2 OR p.name = 'admin.*')
      LIMIT 1
    `,
      [userId, permissionName],
    );

    return result.rows.length > 0;
  } catch (error) {
    console.error("❌ Failed to check user permission:", error);
    return false;
  }
}

/**
 * Assign admin role to a user (for initial setup)
 * @param {number} userId - Local user ID
 * @returns {Promise<boolean>} - Success status
 */
export async function assignAdminRole(userId) {
  try {
    await query(
      `
      INSERT INTO ggr_user_roles (user_id, role_id, assigned_at)
      SELECT $1, r.id, NOW()
      FROM ggr_roles r
      WHERE r.name = 'admin' AND r.is_active = TRUE
      ON CONFLICT (user_id, role_id) DO UPDATE SET is_active = TRUE
    `,
      [userId],
    );

    return true;
  } catch (error) {
    console.error("❌ Failed to assign admin role:", error);
    return false;
  }
}

/**
 * Check if any admin users exist in the system
 * @returns {Promise<boolean>} - Whether admin users exist
 */
export async function hasAdminUsers() {
  try {
    // Check for admin users in the unified table
    const result = await query(`
      SELECT 1 FROM ggr_users
      WHERE is_admin = TRUE AND is_active = TRUE
      LIMIT 1
    `);

    return result.rows.length > 0;
  } catch (error) {
    console.error("❌ Failed to check for admin users:", error);
    return false;
  }
}

/**
 * Update user last login timestamp
 * @param {number} userId - Local user ID
 * @returns {Promise<boolean>} - Success status
 */
export async function updateLastLogin(userId) {
  try {
    await query("UPDATE ggr_users SET last_login = NOW() WHERE id = $1", [
      userId,
    ]);

    return true;
  } catch (error) {
    console.error("❌ Failed to update last login:", error);
    return false;
  }
}

/**
 * Get complete user profile by ID
 * @param {number} userId - Local user ID
 * @returns {Promise<Object|null>} - User profile or null
 */
export async function getUserProfile(userId) {
  try {
    const result = await query(
      "SELECT * FROM ggr_users WHERE id = $1 AND is_active = TRUE",
      [userId],
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error("❌ Failed to get user profile:", error);
    return null;
  }
}

/**
 * Get user profile by email
 * @param {string} email - User email
 * @returns {Promise<Object|null>} - User profile or null
 */
export async function getUserByEmail(email) {
  try {
    const result = await query(
      "SELECT * FROM ggr_users WHERE email = $1 AND is_active = TRUE",
      [email],
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error("❌ Failed to get user by email:", error);
    return null;
  }
}

/**
 * Create or update user profile from Authentik authentication
 * @param {Object} userInfo - User info from Authentik userinfo endpoint
 * @returns {Promise<Object|null>} - User profile (created or updated)
 */
export async function upsertUserFromAuthentik(userInfo) {
  try {
    // First try to find existing user by Authentik sub
    let user = await findUserByAuthentikSub(userInfo.sub);

    if (user) {
      // User exists with Authentik sub, update with latest info and last login
      user = await updateUserFromAuthentik(user.id, userInfo);
    } else {
      // Check if a user with the same email exists (e.g., from basic auth)
      const existingUser = await getUserByEmail(userInfo.email);

      if (existingUser && !existingUser.authentik_sub) {
        // Found a basic auth user with matching email - link the Authentik account
        console.log(
          `🔗 Linking Authentik account to existing user: ${existingUser.email} (ID: ${existingUser.id})`,
        );

        // Update the user with Authentik sub to link accounts
        await query(
          "UPDATE ggr_users SET authentik_sub = $1, updated_at = NOW() WHERE id = $2",
          [userInfo.sub, existingUser.id],
        );

        // Now update with latest Authentik info, but preserve existing roles
        user = await updateUserFromAuthentik(existingUser.id, userInfo, true);
      } else if (existingUser && existingUser.authentik_sub) {
        // Edge case: email exists but with different authentik_sub
        console.error(
          `❌ Email ${userInfo.email} already exists with different Authentik account`,
        );
        return null;
      } else {
        // No existing user found, create new profile
        user = await createUserFromAuthentik(userInfo);
      }
    }

    if (!user) {
      console.error(
        "❌ AUTH DEBUG: Failed to create or update user - user is null",
      );
      return null;
    }

    return user;
  } catch (error) {
    console.error(
      "❌ AUTH DEBUG: Failed to upsert user from Authentik:",
      error.message,
    );
    console.error("❌ AUTH DEBUG: Error stack:", error.stack);
    return null;
  }
}

/**
 * Get user's watchlist with game details
 * @param {number} userId - Local user ID
 * @returns {Promise<Array>} - Array of watchlist items with game details
 */
export async function getUserWatchlist(userId) {
  try {
    const result = await query(
      `
      SELECT 
        w.*,
        g.title, g.cover_url, g.platforms, g.genres, g.rating, g.release_date
      FROM ggr_user_watchlist w
      LEFT JOIN ggr_games_cache g ON w.igdb_id = g.igdb_id
      WHERE w.user_id = $1
      ORDER BY w.added_at DESC`,
      [userId.toString()],
    );

    return result.rows.map((row) => ({
      ...row,
      platforms: row.platforms || [],
      genres: row.genres || [],
    }));
  } catch (error) {
    console.error("❌ Failed to get user watchlist:", error);
    return [];
  }
}

/**
 * Check if game is in user's watchlist
 * @param {number} userId - Local user ID
 * @param {string} igdbId - IGDB game ID
 * @returns {Promise<boolean>} - True if in watchlist
 */
export async function isGameInWatchlist(userId, igdbId) {
  try {
    const result = await query(
      "SELECT 1 FROM ggr_user_watchlist WHERE user_id = $1 AND igdb_id = $2",
      [userId.toString(), igdbId],
    );

    return result.rows.length > 0;
  } catch (error) {
    console.error("❌ Failed to check watchlist:", error);
    return false;
  }
}

/**
 * Get user's game requests
 * @param {number} userId - Local user ID
 * @returns {Promise<Array>} - Array of user's game requests
 */
export async function getUserRequests(userId) {
  try {
    const result = await query(
      "SELECT * FROM ggr_game_requests WHERE user_id = $1 AND status != 'cancelled' ORDER BY created_at DESC",
      [userId.toString()],
    );

    return result.rows.map((row) => ({
      ...row,
      platforms: row.platforms || [],
    }));
  } catch (error) {
    console.error("❌ Failed to get user requests:", error);
    return [];
  }
}
