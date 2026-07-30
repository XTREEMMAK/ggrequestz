/**
 * Rescind (withdraw) a game request
 * Allows users to withdraw their own pending or approved requests
 */

import { json, error } from "@sveltejs/kit";
import { getAuthenticatedUser } from "$lib/auth.server.js";
import { getUserIdFromAuth } from "$lib/getUserId.js";
import { query } from "$lib/database.js";
import { applyRequestStatusChange } from "$lib/requestStatus.server.js";

export async function POST({ request, cookies }) {
  try {
    // Verify authentication (supports session, basic auth, and API keys)
    const user = await getAuthenticatedUser(cookies, request);
    if (!user) {
      throw error(401, "Authentication required");
    }

    // Get user's database ID
    const localUserId = await getUserIdFromAuth(user, query);

    // Parse request data
    const { request_id } = await request.json();

    if (!request_id) {
      console.error("Rescind request error: Missing request_id");
      throw error(400, "Missing request_id");
    }

    // First, check if the request exists and belongs to the user
    const requestCheck = await query(
      "SELECT id, status, title, user_id FROM ggr_game_requests WHERE id = $1 AND user_id = $2",
      [request_id, localUserId],
    );

    if (requestCheck.rows.length === 0) {
      console.error(
        `Rescind request error: Request ${request_id} not found for user ${localUserId}`,
      );
      return json(
        {
          success: false,
          error: "Request not found or you don't have permission to rescind it",
        },
        { status: 404 },
      );
    }

    const gameRequest = requestCheck.rows[0];

    // Check if request can be rescinded (only pending and approved requests)
    if (!["pending", "approved"].includes(gameRequest.status)) {
      return json(
        {
          success: false,
          error: `Cannot rescind ${gameRequest.status} requests. Only pending or approved requests can be rescinded.`,
        },
        { status: 400 },
      );
    }

    // Routed through the status owner rather than writing `cancelled` here.
    // This route was the fourth writer of the column and the only one that did
    // no side effects, so a user withdrawing their own request produced no
    // Gotify cancellation notification and invalidated no cache -- the request
    // went on showing as open until something else happened to it.
    //
    // Ownership is already established by the SELECT above; the owner writes by
    // id alone. No conflict branch is needed: `cancelled` leaves the open set
    // rather than entering it, so it cannot violate the duplicate-guard
    // indexes, which cover only `pending` and `approved`.
    const { row: updatedRequest } = await applyRequestStatusChange({
      id: request_id,
      to: "cancelled",
      actor: user.name || user.email || gameRequest.user_name,
    });

    if (!updatedRequest) {
      return json(
        {
          success: false,
          error: "Failed to rescind request",
        },
        { status: 500 },
      );
    }

    return json({
      success: true,
      message: "Request successfully cancelled",
      request: {
        id: updatedRequest.id,
        status: updatedRequest.status,
        updated_at: updatedRequest.updated_at,
      },
    });
  } catch (err) {
    console.error("Rescind request error:", err);

    if (err.status) {
      throw err; // Re-throw SvelteKit errors
    }

    throw error(500, "Failed to rescind request");
  }
}
