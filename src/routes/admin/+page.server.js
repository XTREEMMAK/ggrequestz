/**
 * Admin dashboard data loader
 */

import { query } from "$lib/database.js";

export async function load({ parent }) {
  const { userPermissions } = await parent();

  try {
    // Initialize stats object
    const stats = {};

    // Get request statistics if user has permission
    if (userPermissions.includes("request.view_all")) {
      try {
        // Total requests
        const totalRequestsResult = await query(
          "SELECT COUNT(*) as count FROM ggr_game_requests",
        );
        stats.totalRequests = parseInt(totalRequestsResult.rows[0].count) || 0;

        // Pending requests
        const pendingRequestsResult = await query(
          "SELECT COUNT(*) as count FROM ggr_game_requests WHERE status = $1",
          ["pending"],
        );
        stats.pendingRequests =
          parseInt(pendingRequestsResult.rows[0].count) || 0;

        // Requests change (last 30 days vs previous 30 days)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

        const [recentRequests, previousRequests] = await Promise.all([
          query(
            "SELECT COUNT(*) as count FROM ggr_game_requests WHERE created_at >= $1",
            [thirtyDaysAgo],
          ),
          query(
            "SELECT COUNT(*) as count FROM ggr_game_requests WHERE created_at >= $1 AND created_at < $2",
            [sixtyDaysAgo, thirtyDaysAgo],
          ),
        ]);

        const recent = parseInt(recentRequests.rows[0].count) || 0;
        const previous = parseInt(previousRequests.rows[0].count) || 1; // Avoid division by zero
        stats.requestsChange = Math.round(
          ((recent - previous) / previous) * 100,
        );
      } catch (error) {
        console.warn("Failed to load request stats:", error);
      }
    }

    // Get user statistics if user has permission
    if (userPermissions.includes("user.view")) {
      try {
        // Active users (logged in within last 30 days)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const activeUsersResult = await query(
          "SELECT COUNT(*) as count FROM ggr_users WHERE last_login >= $1 AND is_active = TRUE",
          [thirtyDaysAgo],
        );
        stats.activeUsers = parseInt(activeUsersResult.rows[0].count) || 0;

        // Users change (similar to requests)
        const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
        const [recentUsers, previousUsers] = await Promise.all([
          query(
            "SELECT COUNT(*) as count FROM ggr_users WHERE created_at >= $1",
            [thirtyDaysAgo],
          ),
          query(
            "SELECT COUNT(*) as count FROM ggr_users WHERE created_at >= $1 AND created_at < $2",
            [sixtyDaysAgo, thirtyDaysAgo],
          ),
        ]);

        const recent = parseInt(recentUsers.rows[0].count) || 0;
        const previous = parseInt(previousUsers.rows[0].count) || 1;
        stats.usersChange = Math.round(((recent - previous) / previous) * 100);
      } catch (error) {
        console.warn("Failed to load user stats:", error);
      }
    }

    // System health check
    stats.systemHealth = "Good"; // Default - could be enhanced with actual health checks

    // Get recent requests for dashboard
    let recentRequests = [];
    if (userPermissions.includes("request.view_all")) {
      try {
        const recentRequestsResult = await query(
          "SELECT id, title, user_name, status, request_type, created_at FROM ggr_game_requests ORDER BY created_at DESC LIMIT 5",
        );
        recentRequests = recentRequestsResult.rows;
      } catch (error) {
        console.warn("Failed to load recent requests:", error);
      }
    }

    // Get recent users for dashboard
    let recentUsers = [];
    if (userPermissions.includes("user.view")) {
      try {
        const recentUsersResult = await query(
          "SELECT id, name, preferred_username, email, created_at FROM ggr_users WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 5",
        );
        recentUsers = recentUsersResult.rows;
      } catch (error) {
        console.warn("Failed to load recent users:", error);
      }
    }

    return {
      stats,
      recentRequests,
      recentUsers,
    };
  } catch (error) {
    console.error("Dashboard load error:", error);
    return {
      stats: {},
      recentRequests: [],
      recentUsers: [],
    };
  }
}
