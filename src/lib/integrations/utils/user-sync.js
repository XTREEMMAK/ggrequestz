/**
 * User Synchronization Utilities
 * Common user synchronization logic across providers
 */

import { query } from "../../database.js";

/**
 * Generate unique user ID with provider prefix
 * @param {string} provider - Provider name
 * @returns {string} - Unique user ID
 */
export function generateUserId(provider = "unknown") {
  return `${provider}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Normalize user data from external systems
 * @param {Object} userData - Raw user data from provider
 * @param {string} provider - Provider name
 * @returns {Object} - Normalized user data
 */
export function normalizeUserData(userData, provider) {
  // Extract consistent user fields from different provider formats
  const normalized = {
    external_id:
      userData.id || userData.user_id || userData.external_id || userData.sub,
    email: userData.email,
    name:
      userData.name ||
      userData.display_name ||
      userData.preferred_username ||
      userData.username,
    avatar: userData.avatar || userData.profile_picture || userData.picture,
    is_active: userData.is_active !== false && userData.active !== false,
    provider,

    // Store original data for reference
    external_data: {
      username: userData.username,
      roles: userData.roles || [],
      permissions: userData.permissions || [],
      groups: userData.groups || [],
      metadata: userData.metadata || {},
      created_at: userData.created_at,
      updated_at: userData.updated_at,
    },
  };

  // Validate required fields
  if (!normalized.external_id) {
    throw new Error("User data missing required ID field");
  }

  if (!normalized.email) {
    throw new Error("User data missing required email field");
  }

  return normalized;
}

/**
 * Sync user to local database with upsert logic
 * @param {Object} userData - Normalized user data
 * @returns {Promise<Object>} - Database user record
 */
export async function syncUserToDatabase(userData) {
  try {
    // Check if user exists by external_id or email
    const existingUser = await query(
      "SELECT * FROM ggr_users WHERE external_id = $1 OR email = $2",
      [userData.external_id, userData.email],
    );

    const payload = {
      external_id: userData.external_id,
      email: userData.email.toLowerCase(),
      name: userData.name || "",
      avatar: userData.avatar,
      is_active: userData.is_active,
      last_synced_at: new Date().toISOString(),
      external_data: JSON.stringify(userData.external_data),
    };

    let result;

    if (existingUser.rows.length > 0) {
      // Update existing user
      const userId = existingUser.rows[0].id;
      result = await query(
        `
        UPDATE ggr_users 
        SET external_id = $2, email = $3, name = $4, avatar = $5, 
            is_active = $6, last_synced_at = $7, external_data = $8, 
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `,
        [
          userId,
          payload.external_id,
          payload.email,
          payload.name,
          payload.avatar,
          payload.is_active,
          payload.last_synced_at,
          payload.external_data,
        ],
      );
    } else {
      // Create new user
      const newUserId = generateUserId(userData.provider);
      result = await query(
        `
        INSERT INTO ggr_users (
          id, external_id, email, name, avatar, is_active, 
          last_synced_at, external_data, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
        RETURNING *
      `,
        [
          newUserId,
          payload.external_id,
          payload.email,
          payload.name,
          payload.avatar,
          payload.is_active,
          payload.last_synced_at,
          payload.external_data,
        ],
      );
    }

    const user = result.rows[0];

    // Sync roles if provided
    if (
      userData.external_data.roles &&
      userData.external_data.roles.length > 0
    ) {
      await syncUserRoles(user.id, userData.external_data.roles);
    }

    return user;
  } catch (error) {
    console.error("Failed to sync user to database:", error);
    throw error;
  }
}

/**
 * Sync user roles from external system
 * @param {string} userId - Local user ID
 * @param {Array} externalRoles - Role names from external system
 * @returns {Promise<void>}
 */
export async function syncUserRoles(userId, externalRoles) {
  try {
    // Remove existing external roles (keep admin/system roles)
    await query(
      `DELETE FROM ggr_user_roles 
       WHERE user_id = $1 
       AND role_id IN (
         SELECT id FROM ggr_roles WHERE is_system = false
       )`,
      [userId],
    );

    // Add new roles
    for (const roleName of externalRoles) {
      // Find or create role
      let roleResult = await query("SELECT id FROM ggr_roles WHERE name = $1", [
        roleName.toLowerCase(),
      ]);

      let roleId;
      if (roleResult.rows.length > 0) {
        roleId = roleResult.rows[0].id;
      } else {
        // Create role if it doesn't exist
        const displayName =
          roleName.charAt(0).toUpperCase() + roleName.slice(1);
        const newRole = await query(
          `
          INSERT INTO ggr_roles (name, display_name, description, is_system, is_active)
          VALUES ($1, $2, $3, false, true)
          ON CONFLICT (name) DO UPDATE SET 
            display_name = EXCLUDED.display_name,
            is_active = true
          RETURNING id
        `,
          [
            roleName.toLowerCase(),
            displayName,
            `External role: ${displayName}`,
          ],
        );
        roleId = newRole.rows[0].id;
      }

      // Assign role to user
      await query(
        `
        INSERT INTO ggr_user_roles (user_id, role_id, assigned_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id, role_id) DO UPDATE SET
          is_active = true,
          assigned_at = CURRENT_TIMESTAMP
      `,
        [userId, roleId],
      );
    }
  } catch (error) {
    console.error("Failed to sync user roles:", error);
    throw error;
  }
}

/**
 * Batch sync multiple users
 * @param {Array} usersData - Array of user data objects
 * @param {string} provider - Provider name
 * @returns {Promise<Object>} - Sync statistics
 */
export async function batchSyncUsers(usersData, provider) {
  let synced = 0;
  let errors = 0;
  const errorDetails = [];

  for (const userData of usersData) {
    try {
      const normalized = normalizeUserData(userData, provider);
      await syncUserToDatabase(normalized);
      synced++;
    } catch (error) {
      console.error(
        `Failed to sync user ${userData.id || userData.email}:`,
        error,
      );
      errors++;
      errorDetails.push({
        user: userData.id || userData.email,
        error: error.message,
      });
    }
  }

  // Log sync activity
  await logSyncActivity("batch_sync", provider, {
    total: usersData.length,
    synced,
    errors,
    errorDetails: errors > 0 ? errorDetails : undefined,
  });

  return { total: usersData.length, synced, errors, errorDetails };
}

/**
 * Log synchronization activity
 * @param {string} action - Sync action type
 * @param {string} provider - Provider name
 * @param {Object} details - Activity details
 * @returns {Promise<void>}
 */
export async function logSyncActivity(action, provider, details = {}) {
  try {
    await query(
      `
      INSERT INTO ggr_activity_log (
        user_id, action, entity_type, entity_id, details, created_at
      )
      VALUES (null, $1, $2, $3, $4, CURRENT_TIMESTAMP)
    `,
      [`sync_${action}`, "user_sync", provider, JSON.stringify(details)],
    );
  } catch (error) {
    console.error("Failed to log sync activity:", error);
  }
}

/**
 * Get user by external ID
 * @param {string} externalId - External user ID
 * @returns {Promise<Object|null>} - User record or null
 */
export async function getUserByExternalId(externalId) {
  try {
    const result = await query(
      "SELECT * FROM ggr_users WHERE external_id = $1",
      [externalId],
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error("Failed to get user by external ID:", error);
    return null;
  }
}

/**
 * Get sync statistics for provider
 * @param {string} provider - Provider name
 * @param {number} days - Number of days to look back
 * @returns {Promise<Object>} - Sync statistics
 */
export async function getSyncStats(provider, days = 7) {
  try {
    const result = await query(
      `
      SELECT 
        action,
        DATE(created_at) as date,
        COUNT(*) as count,
        SUM(CASE WHEN details::json->>'errors' IS NOT NULL THEN (details::json->>'errors')::int ELSE 0 END) as total_errors
      FROM ggr_activity_log 
      WHERE entity_type = 'user_sync' 
        AND entity_id = $1
        AND created_at >= CURRENT_DATE - INTERVAL '$2 days'
      GROUP BY action, DATE(created_at)
      ORDER BY date DESC, action
    `,
      [provider, days],
    );

    return result.rows;
  } catch (error) {
    console.error("Failed to get sync statistics:", error);
    return [];
  }
}

/**
 * Cleanup old sync logs
 * @param {number} daysToKeep - Number of days to keep logs
 * @returns {Promise<number>} - Number of deleted records
 */
export async function cleanupSyncLogs(daysToKeep = 90) {
  try {
    const result = await query(
      `
      DELETE FROM ggr_activity_log 
      WHERE entity_type = 'user_sync'
        AND created_at < CURRENT_DATE - INTERVAL '$1 days'
    `,
      [daysToKeep],
    );

    return result.rowCount;
  } catch (error) {
    console.error("Failed to cleanup sync logs:", error);
    return 0;
  }
}
