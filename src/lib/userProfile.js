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
    console.error("❌ AUTH DEBUG: Database error in findUserByAuthentikSub:", error.message);
    console.error("❌ AUTH DEBUG: Query was: SELECT * FROM ggr_users WHERE authentik_sub = $1 with param:", authentikSub);
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
    const result = await query(
      `
      INSERT INTO ggr_users (
        authentik_sub, email, name, preferred_username, avatar_url,
        created_at, updated_at, last_login
      ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), NOW())
      RETURNING *`,
      [
        userInfo.sub,
        userInfo.email,
        userInfo.name || null,
        userInfo.preferred_username || null,
        userInfo.picture || userInfo.avatar_url || null,
      ],
    );

    const user = result.rows[0];

    // Assign roles based on Authentik groups
    await assignRolesFromAuthentikGroups(user.id, userInfo.groups || []);

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
 * @returns {Promise<Object|null>} - Updated user profile or null
 */
export async function updateUserFromAuthentik(userId, userInfo) {
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
    await assignRolesFromAuthentikGroups(user.id, userInfo.groups || []);

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
 * @returns {Promise<void>}
 */
async function assignRolesFromAuthentikGroups(userId, authentikGroups) {
  try {
    // Mapping of Authentik groups to internal roles
    const groupRoleMapping = {
      "gg-requestz-admins": "admin",
      "gg-requestz-managers": "manager",
      "gg-requestz-users": "viewer",
    };

    // Check if user has admin group for direct is_admin flag
    const hasAdminGroup = authentikGroups.includes("gg-requestz-admins");

    // Update the direct is_admin flag based on group membership
    await query(
      "UPDATE ggr_users SET is_admin = $1, updated_at = NOW() WHERE id = $2",
      [hasAdminGroup, userId]
    );
    
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
  }
}

/**
 * Get user permissions
 * @param {number} userId - Local user ID
 * @returns {Promise<Array>} - Array of permission names
 */
export async function getUserPermissions(userId) {
  try {
    const result = await query(
      `
      SELECT DISTINCT permission_name as permission_name
  FROM ggr_user_permissions
  WHERE user_id = $1
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
    const result = await query(
      `
      SELECT 1 FROM ggr_user_permissions up
      WHERE up.user_id = $1 AND up.permission_name = $2
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
      // User exists, update with latest info and last login
      user = await updateUserFromAuthentik(user.id, userInfo);
    } else {
      // User doesn't exist, create new profile
      user = await createUserFromAuthentik(userInfo);
    }

    if (!user) {
      console.error("❌ AUTH DEBUG: Failed to create or update user - user is null");
      return null;
    }

    return user;
  } catch (error) {
    console.error("❌ AUTH DEBUG: Failed to upsert user from Authentik:", error.message);
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