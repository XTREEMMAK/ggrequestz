/**
 * Rescind (withdraw) a game request
 * Allows users to withdraw their own pending or approved requests
 */

import { json, error } from "@sveltejs/kit";
import { requireAuth } from "$lib/auth.js";
import { query } from "$lib/database.js";

export async function POST({ request }) {
  try {
    // Verify authentication
    const user = await requireAuth(request);
    if (!user) {
      throw error(401, "Authentication required");
    }

    // Get user's local database ID 
    let userResult;
    let localUserId;
    
    if (user.sub?.startsWith('basic_auth_')) {
      // For basic auth, extract ID from the user.sub format: basic_auth_123
      const basicAuthId = user.sub.replace('basic_auth_', '');
      userResult = await query(
        "SELECT id FROM ggr_users WHERE id = $1 AND password_hash IS NOT NULL",
        [parseInt(basicAuthId)]
      );
    } else {
      // For Authentik users
      userResult = await query(
        "SELECT id FROM ggr_users WHERE authentik_sub = $1",
        [user.sub]
      );
    }

    if (userResult.rows.length === 0) {
      throw error(404, "User not found in database");
    }
    
    localUserId = userResult.rows[0].id;

    // Parse request data
    const { request_id } = await request.json();

    if (!request_id) {
      throw error(400, "Missing request_id");
    }

    // First, check if the request exists and belongs to the user
    const requestCheck = await query(
      "SELECT id, status, title, user_id FROM ggr_game_requests WHERE id = $1 AND user_id = $2",
      [request_id, localUserId]
    );

    if (requestCheck.rows.length === 0) {
      return json(
        {
          success: false,
          error: "Request not found or you don't have permission to rescind it"
        },
        { status: 404 }
      );
    }

    const gameRequest = requestCheck.rows[0];

    // Check if request can be rescinded (only pending and approved requests)
    if (!['pending', 'approved'].includes(gameRequest.status)) {
      return json(
        {
          success: false,
          error: `Cannot rescind ${gameRequest.status} requests. Only pending or approved requests can be rescinded.`,
        },
        { status: 400 }
      );
    }

    // Update the request status to 'cancelled'
    const updateResult = await query(
      "UPDATE ggr_game_requests SET status = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING id, status, updated_at",
      ['cancelled', request_id, localUserId]
    );

    if (updateResult.rows.length === 0) {
      return json(
        {
          success: false,
          error: "Failed to rescind request"
        },
        { status: 500 }
      );
    }

    const updatedRequest = updateResult.rows[0];

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