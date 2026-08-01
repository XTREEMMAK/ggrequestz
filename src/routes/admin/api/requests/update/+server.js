/**
 * Admin API endpoint for updating individual requests
 */

import { json } from "@sveltejs/kit";
import { query } from "$lib/database.js";
import { verifySessionToken } from "$lib/auth.server.js";
import { userHasPermission } from "$lib/userProfile.js";
import { getBasicAuthUser } from "$lib/basicAuth.js";
import {
  applyRequestStatusChange,
  requestConflictMessage,
} from "$lib/requestStatus.server.js";

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

    // admin_notes is passed through as-is: absent from the request body it
    // is `undefined` (owner keeps the existing value); present -- including
    // "" -- the owner writes it (and normalises "" to null).
    const { row: updatedRequest, conflict } = await applyRequestStatusChange({
      id: request_id,
      to: status,
      actor: user.name || user.email,
      adminNotes: admin_notes,
    });

    // Re-opening a rejected, cancelled or fulfilled request can collide with
    // another request that is already open for the same game. Answering 409
    // with the blocking id -- the same field the submission 409 uses -- is what
    // makes that recoverable: a bare 500 left the row permanently unable to
    // return to pending or approved with no in-app way to find out why.
    if (conflict) {
      return json(
        {
          success: false,
          error: requestConflictMessage(
            conflict,
            `moving this request to ${status}`,
          ),
          existing_request_id: conflict.existing_request_id,
        },
        { status: 409 },
      );
    }

    if (!updatedRequest) {
      return json(
        { success: false, error: "Request not found" },
        { status: 404 },
      );
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

    console.log(
      `✅ Request ${request_id} updated to ${status} by admin ${user.name || user.email}`,
    );

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
