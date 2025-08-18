/**
 * Webhook Integration Provider
 * Handles user synchronization via webhooks from external systems
 */

import crypto from "crypto";
import { query } from "../../database.js";

/**
 * Handle webhook payload for user synchronization
 */
export async function handleWebhook(config, payload, signature = null) {
  try {
    // Validate webhook signature if enabled
    if (config.enableSignatureValidation && signature) {
      if (!validateSignature(config.secret, payload, signature)) {
        throw new Error("Invalid webhook signature");
      }
    }

    // Process webhook event
    const event = payload.event || payload.type;

    switch (event) {
      case "user.created":
        return await handleUserCreated(payload.data);
      case "user.updated":
        return await handleUserUpdated(payload.data);
      case "user.deleted":
        return await handleUserDeleted(payload.data);
      case "user.role_changed":
        return await handleUserRoleChanged(payload.data);
      case "user.bulk_sync":
        return await handleBulkSync(payload.data);
      default:
        return { success: false, error: "Unknown event type" };
    }
  } catch (error) {
    console.error("Webhook processing error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Validate webhook signature
 */
function validateSignature(secret, payload, signature) {
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(payload))
    .digest("hex");

  const providedSignature = signature.replace("sha256=", "");

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature, "hex"),
    Buffer.from(providedSignature, "hex"),
  );
}

/**
 * Handle user created webhook
 */
async function handleUserCreated(userData) {
  try {
    const userId = generateUserId();

    const result = await query(
      `
      INSERT INTO ggr_users (
        id, external_id, email, name, avatar, is_active, 
        last_synced_at, external_data, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (external_id) DO UPDATE SET
        email = EXCLUDED.email,
        name = EXCLUDED.name,
        avatar = EXCLUDED.avatar,
        is_active = EXCLUDED.is_active,
        last_synced_at = EXCLUDED.last_synced_at,
        external_data = EXCLUDED.external_data,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `,
      [
        userId,
        userData.id || userData.user_id,
        userData.email,
        userData.name || userData.display_name,
        userData.avatar || userData.profile_picture,
        userData.is_active !== false,
        new Date().toISOString(),
        JSON.stringify(userData.metadata || {}),
        userData.created_at || new Date().toISOString(),
      ],
    );

    // Handle roles if provided
    if (userData.roles) {
      await syncUserRoles(result.rows[0].id, userData.roles);
    }

    // Log activity
    await logWebhookActivity("user_created", userData.id, {
      user_id: result.rows[0].id,
      email: userData.email,
      name: userData.name,
    });

    return {
      success: true,
      action: "created",
      user: result.rows[0],
    };
  } catch (error) {
    console.error("Failed to create user from webhook:", error);
    throw error;
  }
}

/**
 * Handle user updated webhook
 */
async function handleUserUpdated(userData) {
  try {
    const result = await query(
      `
      UPDATE ggr_users 
      SET email = $2, name = $3, avatar = $4, is_active = $5,
          last_synced_at = $6, external_data = $7, updated_at = CURRENT_TIMESTAMP
      WHERE external_id = $1
      RETURNING *
    `,
      [
        userData.id || userData.user_id,
        userData.email,
        userData.name || userData.display_name,
        userData.avatar || userData.profile_picture,
        userData.is_active !== false,
        new Date().toISOString(),
        JSON.stringify(userData.metadata || {}),
      ],
    );

    if (result.rows.length === 0) {
      // User doesn't exist, create it
      return await handleUserCreated(userData);
    }

    // Handle role changes if provided
    if (userData.roles) {
      await syncUserRoles(result.rows[0].id, userData.roles);
    }

    // Log activity
    await logWebhookActivity("user_updated", userData.id, {
      user_id: result.rows[0].id,
      changes: userData.changed_fields || [],
    });

    return {
      success: true,
      action: "updated",
      user: result.rows[0],
    };
  } catch (error) {
    console.error("Failed to update user from webhook:", error);
    throw error;
  }
}

/**
 * Handle user deleted webhook
 */
async function handleUserDeleted(userData) {
  try {
    const userId = userData.id || userData.user_id;

    // Soft delete or hard delete based on configuration
    const result = await query(
      `
      UPDATE ggr_users 
      SET is_active = false, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE external_id = $1
      RETURNING *
    `,
      [userId],
    );

    if (result.rows.length === 0) {
      return { success: true, action: "not_found", user_id: userId };
    }

    // Log activity
    await logWebhookActivity("user_deleted", userId, {
      user_id: result.rows[0].id,
      soft_delete: true,
    });

    return {
      success: true,
      action: "deleted",
      user: result.rows[0],
    };
  } catch (error) {
    console.error("Failed to delete user from webhook:", error);
    throw error;
  }
}

/**
 * Handle user role changed webhook
 */
async function handleUserRoleChanged(userData) {
  try {
    const userId = userData.id || userData.user_id;

    // Find local user
    const userResult = await query(
      "SELECT id FROM ggr_users WHERE external_id = $1",
      [userId],
    );

    if (userResult.rows.length === 0) {
      return { success: false, error: "User not found" };
    }

    const localUserId = userResult.rows[0].id;

    // Update roles
    await syncUserRoles(localUserId, userData.roles || []);

    // Log activity
    await logWebhookActivity("user_role_changed", userId, {
      user_id: localUserId,
      new_roles: userData.roles,
      old_roles: userData.previous_roles,
    });

    return {
      success: true,
      action: "role_changed",
      user_id: localUserId,
      roles: userData.roles,
    };
  } catch (error) {
    console.error("Failed to update user roles from webhook:", error);
    throw error;
  }
}

/**
 * Handle bulk user sync webhook
 */
async function handleBulkSync(data) {
  const users = data.users || [];
  let created = 0;
  let updated = 0;
  let errors = 0;

  for (const userData of users) {
    try {
      const result = await handleUserUpdated(userData);
      if (result.action === "created") {
        created++;
      } else if (result.action === "updated") {
        updated++;
      }
    } catch (error) {
      console.error(`Failed to sync user ${userData.id}:`, error);
      errors++;
    }
  }

  // Log bulk sync activity
  await logWebhookActivity("bulk_sync", "system", {
    total_users: users.length,
    created,
    updated,
    errors,
  });

  return {
    success: true,
    action: "bulk_sync",
    stats: { total: users.length, created, updated, errors },
  };
}

/**
 * Sync user roles
 */
async function syncUserRoles(userId, externalRoles) {
  try {
    // Remove existing roles
    await query("DELETE FROM ggr_user_roles WHERE user_id = $1", [userId]);

    // Add new roles
    for (const roleName of externalRoles) {
      // Find or create role
      let roleResult = await query("SELECT id FROM ggr_roles WHERE name = $1", [
        roleName,
      ]);

      let roleId;
      if (roleResult.rows.length > 0) {
        roleId = roleResult.rows[0].id;
      } else {
        // Create role if it doesn't exist
        const newRole = await query(
          `
          INSERT INTO ggr_roles (name, display_name, description, is_system)
          VALUES ($1, $2, $3, false)
          RETURNING id
        `,
          [
            roleName,
            roleName.charAt(0).toUpperCase() + roleName.slice(1),
            `External role from webhook: ${roleName}`,
          ],
        );
        roleId = newRole.rows[0].id;
      }

      // Assign role to user
      await query(
        `
        INSERT INTO ggr_user_roles (user_id, role_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id, role_id) DO NOTHING
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
 * Log webhook activity
 */
async function logWebhookActivity(action, externalUserId, details) {
  try {
    await query(
      `
      INSERT INTO ggr_activity_log (
        user_id, action, entity_type, entity_id, details, created_at
      )
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
    `,
      [
        null, // No authenticated user for webhook
        `webhook_${action}`,
        "user",
        externalUserId,
        JSON.stringify(details),
      ],
    );
  } catch (error) {
    console.error("Failed to log webhook activity:", error);
  }
}

/**
 * Generate unique user ID
 */
function generateUserId() {
  return (
    "webhook_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9)
  );
}
