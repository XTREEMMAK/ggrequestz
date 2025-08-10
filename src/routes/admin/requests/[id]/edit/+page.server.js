/**
 * Admin request edit page data loader and form handler
 */

import { error, redirect } from "@sveltejs/kit";
import { query } from "$lib/database.js";
import { verifySessionToken } from "$lib/auth.js";
import { userHasPermission } from "$lib/userProfile.js";

export async function load({ params, parent }) {
  const { userPermissions } = await parent();

  // Check permission
  if (
    !userPermissions.includes("request.edit") &&
    !userPermissions.includes("request.approve")
  ) {
    throw redirect(302, "/admin?error=permission_denied");
  }

  try {
    const requestId = params.id;

    // Get request details
    const requestQuery = `
      SELECT 
        id, title, user_id, user_name, status, request_type, priority,
        description, reason, platforms, admin_notes,
        created_at, updated_at
      FROM ggr_game_requests 
      WHERE id = $1
    `;

    const requestResult = await query(requestQuery, [requestId]);

    if (requestResult.rows.length === 0) {
      throw error(404, "Request not found");
    }

    const request = requestResult.rows[0];

    // Parse platforms if it's a JSON string
    if (typeof request.platforms === "string") {
      try {
        request.platforms = JSON.parse(request.platforms);
      } catch (e) {
        request.platforms = [];
      }
    }

    return {
      request,
    };
  } catch (err) {
    console.error("Request edit page load error:", err);
    if (err.status) throw err;
    throw error(500, "Failed to load request details");
  }
}

export const actions = {
  default: async ({ request, cookies, params }) => {
    try {
      // Verify authentication
      const sessionCookie = cookies.get("session");
      if (!sessionCookie) {
        return { success: false, error: "Authentication required" };
      }

      const user = await verifySessionToken(sessionCookie);
      if (!user) {
        return { success: false, error: "Invalid session" };
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
        return { success: false, error: "User not found" };
      }

      const localUserId = userResult.rows[0].id;

      // Check permissions
      const hasEditPermission = await userHasPermission(
        localUserId,
        "request.edit",
      );
      const hasApprovePermission = await userHasPermission(
        localUserId,
        "request.approve",
      );

      if (!hasEditPermission && !hasApprovePermission) {
        return { success: false, error: "Insufficient permissions" };
      }

      // Parse form data
      const formData = await request.formData();
      const requestId = params.id;
      const title = formData.get("title")?.toString().trim();
      const description = formData.get("description")?.toString().trim();
      const reason = formData.get("reason")?.toString().trim();
      const priority = formData.get("priority")?.toString();
      const status = formData.get("status")?.toString();
      const adminNotes = formData.get("admin_notes")?.toString().trim();
      const platformsRaw = formData.get("platforms")?.toString().trim();

      // Validate required fields
      if (!title) {
        return { success: false, error: "Title is required" };
      }

      // Parse platforms
      let platforms = [];
      if (platformsRaw) {
        try {
          // Try to parse as JSON first, then split by comma if that fails
          platforms = JSON.parse(platformsRaw);
        } catch (e) {
          platforms = platformsRaw
            .split(",")
            .map((p) => p.trim())
            .filter((p) => p.length > 0);
        }
      }

      // Validate status
      const validStatuses = [
        "pending",
        "approved",
        "rejected",
        "fulfilled",
        "cancelled",
      ];
      if (status && !validStatuses.includes(status)) {
        return { success: false, error: "Invalid status" };
      }

      // Validate priority
      const validPriorities = ["low", "medium", "high", "urgent"];
      if (priority && !validPriorities.includes(priority)) {
        return { success: false, error: "Invalid priority" };
      }

      // Check if status change requires approve permission
      if (
        status &&
        ["approved", "rejected", "fulfilled"].includes(status) &&
        !hasApprovePermission
      ) {
        return {
          success: false,
          error: "Approval permission required for this status change",
        };
      }

      // Update the request
      const updateQuery = `
        UPDATE ggr_game_requests 
        SET 
          title = $1,
          description = $2,
          reason = $3,
          priority = COALESCE($4, priority),
          status = COALESCE($5, status),
          platforms = $6,
          admin_notes = $7,
          updated_at = NOW()
        WHERE id = $8
        RETURNING *
      `;

      const updateResult = await query(updateQuery, [
        title,
        description || null,
        reason || null,
        priority || null,
        status || null,
        JSON.stringify(platforms),
        adminNotes || null,
        requestId,
      ]);

      if (updateResult.rows.length === 0) {
        return { success: false, error: "Request not found" };
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
            "admin_request_edited",
            JSON.stringify({
              request_id: requestId,
              changes: {
                title: title !== updateResult.rows[0].title,
                status: status && status !== updateResult.rows[0].status,
                priority:
                  priority && priority !== updateResult.rows[0].priority,
              },
            }),
          ],
        );
      } catch (analyticsError) {
        console.warn("Failed to log analytics:", analyticsError);
      }

        `✅ Request ${requestId} updated by admin ${user.name || user.email}`,
      );

      return { success: true, message: "Request updated successfully" };
    } catch (err) {
      console.error("❌ Request edit error:", err);
      return { success: false, error: "Failed to update request" };
    }
  },
};
