/**
 * Admin API endpoint for deleting game requests
 * Supports both single and bulk delete operations
 */

import { json } from "@sveltejs/kit";
import { query } from "$lib/database.js";
import { verifySessionToken } from "$lib/auth.js";
import { userHasPermission } from "$lib/userProfile.js";
import { getBasicAuthUser } from "$lib/basicAuth.js";
import { sendRequestCancelledDeletedNotification } from "$lib/gotify.js";
import { invalidateCache } from "$lib/cache.js";

export async function DELETE({ request, cookies }) {
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
    const hasPermission = await userHasPermission(localUserId, "request.delete");
    if (!hasPermission) {
      return json(
        { success: false, error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    // Parse request data
    const { requestIds, reason = "" } = await request.json();

    if (!requestIds || !Array.isArray(requestIds) || requestIds.length === 0) {
      return json(
        {
          success: false,
          error: "Missing or invalid requestIds array",
        },
        { status: 400 },
      );
    }


    // Get request details for logging before deletion
    const requestsToDelete = await query(
      `SELECT id, title, user_name, status, request_type 
       FROM ggr_game_requests 
       WHERE id = ANY($1)`,
      [requestIds]
    );

    if (requestsToDelete.rows.length === 0) {
      return json(
        { success: false, error: "No requests found to delete" },
        { status: 404 },
      );
    }

    // Delete the requests
    const deleteResult = await query(
      `DELETE FROM ggr_game_requests 
       WHERE id = ANY($1) 
       RETURNING id, title`,
      [requestIds]
    );

    const deletedCount = deleteResult.rows.length;
    const deletedRequests = deleteResult.rows;

    // Log the deletion for analytics
    try {
      if (localUserId) {
        await query(
          `INSERT INTO ggr_user_analytics (user_id, action, metadata)
           VALUES ($1, $2, $3)`,
          [
            localUserId,
            "admin_requests_deleted",
            JSON.stringify({
              deleted_count: deletedCount,
              deleted_requests: deletedRequests,
              reason: reason || "No reason provided",
              user_name: user.name || user.email,
            }),
          ],
        );
      }
    } catch (analyticsError) {
      console.warn("Failed to log deletion analytics:", analyticsError);
    }
console.log(
      `✅ Successfully deleted ${deletedCount} request(s) by ${user.name || user.email}`,
    );

    // Send Gotify notifications for deleted requests (asynchronously)
    requestsToDelete.rows.forEach((req) => {
      sendRequestCancelledDeletedNotification({
        id: req.id,
        title: req.title,
        user_name: req.user_name,
        action: 'deleted',
        reason: reason || '',
        admin_name: user.name || user.email,
      }).catch((error) => {
        console.warn(`Failed to send Gotify deletion notification for request ${req.id}:`, error);
        // Don't fail the request if notification fails
      });
    });

    // Invalidate cache for affected users and general request caches
    try {
      const cacheKeysToInvalidate = [
        'game-requests', // General request cache
        'recent-requests', // Recent requests
      ];
      
      // Add user-specific cache keys for each affected user
      // user_id in requests table is actually the authentik_sub (or user identifier)
      const affectedUserIds = [...new Set(requestsToDelete.rows.map(req => req.user_id).filter(Boolean))];
      for (const userId of affectedUserIds) {
        cacheKeysToInvalidate.push(`user-${userId}-requests`);
        cacheKeysToInvalidate.push(`user-${userId}-watchlist`); // Also clear watchlist cache in case
      }
      
      await invalidateCache(cacheKeysToInvalidate);
    } catch (cacheError) {
      console.warn("Failed to invalidate cache:", cacheError);
      // Don't fail the request if cache invalidation fails
    }

    return json({
      success: true,
      message: `Successfully deleted ${deletedCount} request${deletedCount > 1 ? 's' : ''}`,
      deleted_count: deletedCount,
      deleted_requests: deletedRequests,
    });

  } catch (error) {
    console.error("❌ Request deletion error:", error);

    // Handle specific database errors
    if (error.code === "23503") {
      return json(
        {
          success: false,
          error: "Cannot delete requests that are referenced by other records",
        },
        { status: 400 },
      );
    }

    return json(
      {
        success: false,
        error: "Failed to delete requests. Please try again.",
      },
      { status: 500 },
    );
  }
}