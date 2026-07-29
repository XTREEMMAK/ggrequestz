/**
 * Admin API endpoint for bulk updating requests
 */

import { json } from "@sveltejs/kit";
import { query } from "$lib/database.js";
import { verifySessionToken } from "$lib/auth.server.js";
import { userHasPermission } from "$lib/userProfile.js";
import { getBasicAuthUser } from "$lib/basicAuth.js";
import { applyRequestStatusChange } from "$lib/requestStatus.server.js";

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

    const results = [];
    for (const requestId of request_ids) {
      // admin_notes passed through as-is: absent from the request body it
      // is `undefined` (owner keeps the existing value per row); present --
      // including "" -- the owner writes it (and normalises "" to null).
      const outcome = await applyRequestStatusChange({
        id: requestId,
        to: status,
        actor: user.name || user.email,
        adminNotes: admin_notes,
      });
      if (outcome.row) results.push(outcome.row);
    }
    const updatedRequests = results;
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

    console.log(
      `✅ Bulk updated ${updatedCount} requests to ${status} by admin ${user.name || user.email}`,
    );

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
