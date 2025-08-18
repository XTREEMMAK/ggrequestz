/**
 * Admin individual user view page data loader
 */

import { error, redirect } from "@sveltejs/kit";
import { query } from "$lib/database.js";

export async function load({ params, parent }) {
  const { userPermissions } = await parent();

  // Check permission
  if (!userPermissions.includes("user.view")) {
    throw redirect(302, "/admin?error=permission_denied");
  }

  try {
    const userId = params.id;

    // Validate userId parameter
    if (!userId || userId === "undefined" || userId === "null") {
      console.error("Invalid user ID parameter:", userId);
      throw error(400, "Invalid user ID");
    }

    // Convert to integer and validate
    const userIdInt = parseInt(userId, 10);
    if (isNaN(userIdInt) || userIdInt <= 0) {
      console.error("User ID is not a valid positive integer:", userId);
      throw error(400, "User ID must be a valid number");
    }

    // Get user details with roles
    const userQuery = `
      SELECT 
        u.id, u.authentik_sub, u.email, u.name, u.preferred_username, 
        u.avatar_url, u.is_active, u.is_admin, u.created_at, u.updated_at, u.last_login,
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', r.id,
              'name', r.name,
              'display_name', r.display_name,
              'assigned_at', ur.assigned_at,
              'assigned_by', assigner.name
            )
          ) FILTER (WHERE r.id IS NOT NULL), 
          '[]'
        ) as roles
      FROM ggr_users u
      LEFT JOIN ggr_user_roles ur ON u.id = ur.user_id AND ur.is_active = true
      LEFT JOIN ggr_roles r ON ur.role_id = r.id AND r.is_active = true
      LEFT JOIN ggr_users assigner ON ur.assigned_by = assigner.id
      WHERE u.id = $1
      GROUP BY u.id, u.authentik_sub, u.email, u.name, u.preferred_username, 
               u.avatar_url, u.is_active, u.is_admin, u.created_at, u.updated_at, u.last_login
    `;

    const userResult = await query(userQuery, [userIdInt]);

    if (userResult.rows.length === 0) {
      throw error(404, "User not found");
    }

    const user = userResult.rows[0];

    // Filter out null roles
    if (user.roles) {
      user.roles = user.roles.filter((role) => role.id !== null);
    }

    // Get user's requests
    const requestsQuery = `
      SELECT 
        id, title, status, request_type, priority,
        created_at, updated_at
      FROM ggr_game_requests 
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 10
    `;

    const requestsResult = await query(requestsQuery, [userIdInt]);
    const requests = requestsResult.rows;

    // Get user analytics/activity summary
    const analyticsQuery = `
      SELECT 
        action,
        COUNT(*) as count,
        MAX(timestamp) as last_action
      FROM ggr_user_analytics 
      WHERE user_id = $1
      GROUP BY action
      ORDER BY count DESC
      LIMIT 10
    `;

    let analytics = [];
    try {
      // Try with integer user ID first, then string conversion if needed
      const analyticsResult = await query(analyticsQuery, [userIdInt]);
      analytics = analyticsResult.rows;
    } catch (e) {
      // Analytics table might not exist or user_id format mismatch
      console.warn("Analytics query failed:", e.message);

      // Try with string conversion if it was a data type issue
      try {
        const stringAnalyticsResult = await query(analyticsQuery, [
          userIdInt.toString(),
        ]);
        analytics = stringAnalyticsResult.rows;
      } catch (e2) {
        console.warn(
          "Analytics query with string conversion also failed:",
          e2.message,
        );
      }
    }

    // Get request statistics
    const statsQuery = `
      SELECT 
        COUNT(*) as total_requests,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_requests,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_requests,
        COUNT(CASE WHEN status = 'fulfilled' THEN 1 END) as fulfilled_requests,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_requests
      FROM ggr_game_requests 
      WHERE user_id = $1
    `;

    const statsResult = await query(statsQuery, [userIdInt]);
    const stats = statsResult.rows[0];

    return {
      user,
      requests,
      analytics,
      stats,
    };
  } catch (err) {
    console.error("User view page load error:", err);
    console.error("Error details:", {
      message: err.message,
      code: err.code,
      position: err.position,
      userId: userIdInt,
    });

    if (err.status) throw err;
    throw error(500, `Failed to load user details: ${err.message}`);
  }
}
