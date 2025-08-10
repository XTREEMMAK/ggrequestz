/**
 * Admin API endpoint for updating individual requests
 */

import { json } from "@sveltejs/kit";
import { query } from "$lib/database.js";
import { verifySessionToken } from "$lib/auth.js";
import { userHasPermission } from "$lib/userProfile.js";
import { sendRequestStatusNotification } from "$lib/gotify.js";
import { invalidateCache } from "$lib/cache.js";

export async function POST({ request, cookies }) {
  try {
    // Verify authentication
    const sessionCookie = cookies.get("session");
    if (!sessionCookie) {
      return json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    const user = await verifySessionToken(sessionCookie);
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
    const { request_id, status, admin_notes } = await request.json();

    if (!request_id || !status) {
      return json(
        {
          success: false,
          error: "Missing required fields: request_id and status",
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

    // Get the old status before updating
    const oldStatusResult = await query(
      "SELECT status, title, user_name FROM ggr_game_requests WHERE id = $1",
      [request_id],
    );
    
    if (oldStatusResult.rows.length === 0) {
      return json(
        { success: false, error: "Request not found" },
        { status: 404 },
      );
    }
    
    const oldStatus = oldStatusResult.rows[0].status;
    const requestTitle = oldStatusResult.rows[0].title;
    const requestUserName = oldStatusResult.rows[0].user_name;

    // Update the request
    const updateResult = await query(
      `
      UPDATE ggr_game_requests 
      SET 
        status = $1, 
        admin_notes = $2, 
        updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `,
      [status, admin_notes || null, request_id],
    );

    if (updateResult.rows.length === 0) {
      return json(
        { success: false, error: "Request not found" },
        { status: 404 },
      );
    }

    const updatedRequest = updateResult.rows[0];

    // Log the action for analytics
    try {
      await query(
        `
        INSERT INTO ggr_user_analytics (user_id, action, metadata)
        VALUES ($1, $2, $3)
      `,
        [
          localUserId,
          "admin_request_updated",
          JSON.stringify({
            request_id: request_id,
            old_status: null, // Could be enhanced to track old status
            new_status: status,
            admin_notes: admin_notes,
          }),
        ],
      );
    } catch (analyticsError) {
      console.warn("Failed to log analytics:", analyticsError);
    }

    // Send Gotify notification for status change (asynchronously)
    if (oldStatus !== status) {
      sendRequestStatusNotification({
        id: updatedRequest.id,
        title: requestTitle,
        old_status: oldStatus,
        new_status: status,
        user_name: requestUserName,
        admin_notes: admin_notes,
      }).catch((error) => {
        console.warn('Failed to send Gotify status notification:', error);
        // Don't fail the request if notification fails
      });
    }

      `✅ Request ${request_id} updated to ${status} by admin ${user.name || user.email}`,
    );

    // Invalidate cache for the affected user and general request caches
    try {
      const cacheKeysToInvalidate = [
        'game-requests', // General request cache
        'recent-requests', // Recent requests
      ];
      
      // Add user-specific cache keys
      if (updatedRequest.user_id) {
        cacheKeysToInvalidate.push(`user-${updatedRequest.user_id}-requests`);
        cacheKeysToInvalidate.push(`user-${updatedRequest.user_id}-watchlist`);
      }
      
      await invalidateCache(cacheKeysToInvalidate);
    } catch (cacheError) {
      console.warn("Failed to invalidate cache:", cacheError);
      // Don't fail the request if cache invalidation fails
    }

    return json({
      success: true,
      request: {
        id: updatedRequest.id,
        status: updatedRequest.status,
        admin_notes: updatedRequest.admin_notes,
        updated_at: updatedRequest.updated_at,
      },
    });
  } catch (error) {
    console.error("❌ Request update error:", error);
    return json(
      {
        success: false,
        error: "Failed to update request",
      },
      { status: 500 },
    );
  }
}

