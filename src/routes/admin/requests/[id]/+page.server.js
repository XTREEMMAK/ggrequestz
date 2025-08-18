/**
 * Admin individual request view page data loader
 */

import { error, redirect } from "@sveltejs/kit";
import { query } from "$lib/database.js";

export async function load({ params, parent }) {
  const { userPermissions } = await parent();

  // Check permission
  if (!userPermissions.includes("request.view_all")) {
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

    // Get user details - handle both legacy (authentik_sub/email) and new (integer id) user_id formats
    let requestUser = null;

    // Try to get user by integer ID first (new format)
    if (!isNaN(request.user_id)) {
      const userByIdResult = await query(
        `
        SELECT 
          u.id,
          u.name,
          u.email,
          u.preferred_username,
          u.created_at,
          u.last_login,
          u.authentik_sub,
          COALESCE(
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'id', r.id,
                'name', r.name,
                'display_name', r.display_name
              )
            ) FILTER (WHERE r.id IS NOT NULL), 
            '[]'
          ) as roles
        FROM ggr_users u
        LEFT JOIN ggr_user_roles ur ON u.id = ur.user_id AND ur.is_active = true
        LEFT JOIN ggr_roles r ON ur.role_id = r.id AND r.is_active = true
        WHERE u.id = $1
        GROUP BY u.id, u.name, u.email, u.preferred_username, u.created_at, u.last_login, u.authentik_sub
      `,
        [parseInt(request.user_id)],
      );

      requestUser = userByIdResult.rows[0] || null;
    }

    // If not found by ID, try by authentik_sub (legacy format)
    if (!requestUser) {
      const userBySubResult = await query(
        `
        SELECT 
          u.id,
          u.name,
          u.email,
          u.preferred_username,
          u.created_at,
          u.last_login,
          u.authentik_sub,
          COALESCE(
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'id', r.id,
                'name', r.name,
                'display_name', r.display_name
              )
            ) FILTER (WHERE r.id IS NOT NULL), 
            '[]'
          ) as roles
        FROM ggr_users u
        LEFT JOIN ggr_user_roles ur ON u.id = ur.user_id AND ur.is_active = true
        LEFT JOIN ggr_roles r ON ur.role_id = r.id AND r.is_active = true
        WHERE u.authentik_sub = $1 OR u.email = $1
        GROUP BY u.id, u.name, u.email, u.preferred_username, u.created_at, u.last_login, u.authentik_sub
      `,
        [request.user_id],
      );

      requestUser = userBySubResult.rows[0] || null;
    }

    if (requestUser && requestUser.roles) {
      requestUser.roles = requestUser.roles.filter((role) => role.id !== null);
    }

    // If user not found in ggr_users table, create a fallback user object
    // This can happen for basic auth users or users who were deleted
    if (!requestUser) {
      const fallbackUser = {
        id: null,
        name: request.user_name || "Unknown User",
        email: null,
        preferred_username: request.user_name,
        authentik_sub: request.user_id,
        created_at: null,
        last_login: null,
        roles: [],
        is_fallback: true,
      };

      console.warn(
        `User not found for request ${requestId}, user_id: ${request.user_id}, using fallback`,
      );

      return {
        request,
        requestUser: fallbackUser,
      };
    }

    return {
      request,
      requestUser,
    };
  } catch (err) {
    console.error("Request view page load error:", err);
    if (err.status) throw err;
    throw error(500, "Failed to load request details");
  }
}
