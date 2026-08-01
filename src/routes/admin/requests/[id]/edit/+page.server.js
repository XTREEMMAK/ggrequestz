/**
 * Admin request edit page data loader and form handler
 */

import { error, fail, redirect } from "@sveltejs/kit";
import { query, withTransaction } from "$lib/database.js";
import { verifySessionToken } from "$lib/auth.server.js";
import { userHasPermission } from "$lib/userProfile.js";
import {
  applyRequestStatusChange,
  describeRequestConflict,
  isDuplicateRequestViolation,
  RequestConflictError,
} from "$lib/requestStatus.server.js";

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
      // Verify authentication - support both auth types
      const sessionCookie = cookies.get("session");
      const basicAuthSessionCookie = cookies.get("basic_auth_session");

      if (!sessionCookie && !basicAuthSessionCookie) {
        return { success: false, error: "Authentication required" };
      }

      let user = null;
      if (sessionCookie) {
        user = await verifySessionToken(sessionCookie);
      } else if (basicAuthSessionCookie) {
        const { getBasicAuthUser } = await import("$lib/basicAuth.js");
        user = getBasicAuthUser(basicAuthSessionCookie);
      }

      if (!user) {
        return { success: false, error: "Invalid session" };
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

      // Update the request. Status is excluded here and routed through the
      // owner below, so this query only ever touches the non-status fields.
      const updateQuery = `
        UPDATE ggr_game_requests
        SET
          title = $1,
          description = $2,
          reason = $3,
          priority = COALESCE($4, priority),
          platforms = $5,
          admin_notes = $6,
          updated_at = NOW()
        WHERE id = $7
        RETURNING *
      `;

      // The field edits and the status transition are two statements, so they
      // run in one transaction: this form used to be a single atomic UPDATE,
      // and splitting the status out meant a failing status change left the
      // field edits committed while the admin was told the whole save failed.
      //
      // Nothing is dispatched inside the transaction -- a webhook cannot be
      // rolled back -- so the status change's side effects come back deferred
      // and run below, after commit.
      let saved;
      try {
        saved = await withTransaction(async (tx) => {
          let updateResult;
          try {
            updateResult = await tx(updateQuery, [
              title,
              description || null,
              reason || null,
              priority || null,
              JSON.stringify(platforms),
              adminNotes || null,
              requestId,
            ]);
          } catch (updateError) {
            // `title` is itself part of the open-title unique index for rows
            // with no igdb_id, so renaming such a request onto a title another
            // open request already holds raises 23505 on this statement.
            if (!isDuplicateRequestViolation(updateError)) throw updateError;
            throw new RequestConflictError(
              await describeRequestConflict({ id: requestId, title }),
              "renaming this request",
            );
          }

          if (updateResult.rows.length === 0) return { notFound: true };

          // Captured before any status change below, since this query never
          // touches the status column.
          const previousStatus = updateResult.rows[0].status;

          // Status is routed through the owner so this path notifies and
          // invalidates cache like the others. It previously did neither.
          // admin_notes is deliberately omitted here (left undefined): this
          // form's own UPDATE above already owns title/priority/notes, so the
          // owner must not write admin_notes a second time on this path.
          let statusChange = null;
          if (status) {
            statusChange = await applyRequestStatusChange({
              id: requestId,
              to: status,
              actor: user.name || user.email,
              tx,
              deferSideEffects: true,
            });

            // Throwing is what rolls the field edits back with it.
            if (statusChange.conflict) {
              throw new RequestConflictError(
                statusChange.conflict,
                `moving this request to ${status}`,
              );
            }
          }

          return { row: updateResult.rows[0], previousStatus, statusChange };
        });
      } catch (transactionError) {
        if (transactionError instanceof RequestConflictError) {
          return fail(409, {
            success: false,
            error: transactionError.message,
            existing_request_id: transactionError.conflict.existing_request_id,
          });
        }
        throw transactionError;
      }

      if (saved.notFound) {
        return { success: false, error: "Request not found" };
      }

      const { row: updatedRow, previousStatus } = saved;

      // Committed. Notify, invalidate cache, and dispatch if this approved it.
      saved.statusChange?.runSideEffects();

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
                title: title !== updatedRow.title,
                status: status && status !== previousStatus,
                priority: priority && priority !== updatedRow.priority,
              },
            }),
          ],
        );
      } catch (analyticsError) {
        console.warn("Failed to log analytics:", analyticsError);
      }
      console.log(
        `✅ Request ${requestId} updated by admin ${user.name || user.email}`,
      );

      return { success: true, message: "Request updated successfully" };
    } catch (err) {
      console.error("❌ Request edit error:", err);
      return { success: false, error: "Failed to update request" };
    }
  },
};
