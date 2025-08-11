/**
 * Admin API endpoint for bulk updating requests
 */

import { json } from "@sveltejs/kit";
import { query } from "$lib/database.js";
import { verifySessionToken } from "$lib/auth.js";
import { userHasPermission } from "$lib/userProfile.js";
import { getBasicAuthUser } from "$lib/basicAuth.js";
import { invalidateCache } from "$lib/cache.js";

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

    // Check permissions
    const hasApprovePermission = await userHasPermission(
      localUserId,
      "request.approve",
    );
    const hasEditPermission = await userHasPermission(
      localUserId,
      "request.edit",
    );

    if (!hasApprovePermission && !hasEditPermission) {
      return json(
        { success: false, error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    // Parse request data
    const { request_ids, status, admin_notes } = await request.json();

    if (
      !request_ids ||
      !Array.isArray(request_ids) ||
      request_ids.length === 0
    ) {
      return json(
        {
          success: false,
          error: "Missing or invalid request_ids array",
        },
        { status: 400 },
      );
    }

    if (!status) {
      return json(
        {
          success: false,
          error: "Missing required field: status",
        },
        { status: 400 },
      );
    }

    // Validate status
    const validStatuses = [
      "pending",
      "approved",
      "rejected",
      "fulfilled",
      "cancelled",
    ];
    if (!validStatuses.includes(status)) {
      return json(
        {
          success: false,
          error: "Invalid status. Must be one of: " + validStatuses.join(", "),
        },
        { status: 400 },
      );
    }

    // Check if specific status changes require approve permission
    if (
      ["approved", "rejected", "fulfilled"].includes(status) &&
      !hasApprovePermission
    ) {
      return json(
        {
          success: false,
          error: "Approval permission required for this status change",
        },
        { status: 403 },
      );
    }

    // Limit bulk operations to prevent abuse
    if (request_ids.length > 100) {
      return json(
        {
          success: false,
          error: "Bulk operations limited to 100 requests at a time",
        },
        { status: 400 },
      );
    }

    // Build the update query with placeholders for all request IDs
    const placeholders = request_ids
      .map((_, index) => `$${index + 3}`)
      .join(",");
    const updateQuery = `
      UPDATE ggr_game_requests 
      SET 
        status = $1, 
        admin_notes = $2, 
        updated_at = NOW()
      WHERE id IN (${placeholders})
      RETURNING id, title, user_name, status
    `;

    const queryParams = [status, admin_notes || null, ...request_ids];
    const updateResult = await query(updateQuery, queryParams);

    const updatedRequests = updateResult.rows;
    const updatedCount = updatedRequests.length;

    if (updatedCount === 0) {
      return json(
        { success: false, error: "No requests were updated" },
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
          "admin_bulk_request_update",
          JSON.stringify({
            request_ids: request_ids,
            new_status: status,
            admin_notes: admin_notes,
            updated_count: updatedCount,
          }),
        ],
      );
    } catch (analyticsError) {
      console.warn("Failed to log analytics:", analyticsError);
    }

    // Send bulk notification if configured
    try {
      await sendBulkNotificationForRequests(updatedRequests, status, user);
    } catch (notificationError) {
      console.warn("Failed to send bulk notification:", notificationError);
    }
      console.log(
      `✅ Bulk updated ${updatedCount} requests to ${status} by admin ${user.name || user.email}`,
    );

    // Invalidate cache for all affected users and general request caches
    try {
      const cacheKeysToInvalidate = [
        'game-requests', // General request cache
        'recent-requests', // Recent requests
      ];
      
      // Add user-specific cache keys for each affected user
      const affectedUserIds = [...new Set(updatedRequests.map(req => req.user_id).filter(Boolean))];
      for (const userId of affectedUserIds) {
        cacheKeysToInvalidate.push(`user-${userId}-requests`);
        cacheKeysToInvalidate.push(`user-${userId}-watchlist`);
      }
      
      await invalidateCache(cacheKeysToInvalidate);
    } catch (cacheError) {
      console.warn("Failed to invalidate cache:", cacheError);
      // Don't fail the request if cache invalidation fails
    }

    return json({
      success: true,
      updated_count: updatedCount,
      updated_requests: updatedRequests.map((req) => ({
        id: req.id,
        title: req.title,
        status: req.status,
      })),
    });
  } catch (error) {
    console.error("❌ Bulk request update error:", error);
    return json(
      {
        success: false,
        error: "Failed to update requests",
      },
      { status: 500 },
    );
  }
}

/**
 * Send bulk notification for request status changes
 * @param {Array} requests - The updated requests
 * @param {string} status - New status
 * @param {Object} admin - Admin user who made the change
 */
async function sendBulkNotificationForRequests(requests, status, admin) {
  try {
    // Get Gotify settings
    const settingsResult = await query(
      "SELECT key, value FROM ggr_system_settings WHERE key IN ($1, $2)",
      ["gotify.url", "gotify.token"],
    );

    const settings = {};
    settingsResult.rows.forEach((row) => {
      settings[row.key] = row.value;
    });

    if (!settings["gotify.url"] || !settings["gotify.token"]) {
      return;
    }

    const statusMessages = {
      approved: "✅ Approved",
      rejected: "❌ Rejected",
      fulfilled: "🎮 Fulfilled",
      cancelled: "🚫 Cancelled",
    };

    const message = statusMessages[status] || `Status changed to ${status}`;
    const requestTitles = requests
      .slice(0, 5)
      .map((r) => `• ${r.title}`)
      .join("\n");
    const additionalCount =
      requests.length > 5 ? `\n...and ${requests.length - 5} more` : "";

    const notificationData = {
      title: `Bulk Request Update: ${message}`,
      message: `${requests.length} requests updated:\n\n${requestTitles}${additionalCount}`,
      priority: status === "approved" ? 5 : status === "rejected" ? 3 : 2,
      extras: {
        "client::display": {
          contentType: "text/markdown",
        },
      },
    };

    const response = await fetch(
      `${settings["gotify.url"]}/message?token=${settings["gotify.token"]}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(notificationData),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Gotify API error: ${response.status} ${response.statusText}`,
      );
    }

  } catch (error) {
    console.error("❌ Failed to send bulk notification:", error);
    throw error;
  }
}
