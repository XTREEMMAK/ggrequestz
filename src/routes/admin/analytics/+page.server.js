/**
 * Admin analytics page data loader
 */

import { redirect } from "@sveltejs/kit";
import { query } from "$lib/database.js";

export async function load({ parent }) {
  const { userPermissions } = await parent();

  // Check permission
  if (!userPermissions.includes("analytics.view")) {
    throw redirect(302, "/admin?error=permission_denied");
  }

  try {
    // Get overview statistics
    const statsQueries = await Promise.allSettled([
      // Total requests by status
      query(`
        SELECT 
          status,
          COUNT(*) as count
        FROM ggr_game_requests 
        GROUP BY status
        ORDER BY count DESC
      `),

      // Requests over time (last 30 days)
      query(`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as count
        FROM ggr_game_requests 
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(created_at)
        ORDER BY date DESC
        LIMIT 30
      `),

      // Top requesting users
      query(`
        SELECT 
          user_name,
          user_id,
          COUNT(*) as request_count
        FROM ggr_game_requests 
        GROUP BY user_name, user_id
        ORDER BY request_count DESC
        LIMIT 10
      `),

      // User registrations over time (last 30 days)
      query(`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as count
        FROM ggr_users 
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(created_at)
        ORDER BY date DESC
        LIMIT 30
      `),

      // Popular platforms
      query(`
        SELECT 
          platform,
          COUNT(*) as count
        FROM (
          SELECT jsonb_array_elements_text(
            CASE 
              WHEN jsonb_typeof(platforms::jsonb) = 'array' THEN platforms::jsonb
              ELSE '[]'::jsonb
            END
          ) as platform
          FROM ggr_game_requests
          WHERE platforms IS NOT NULL AND platforms != 'null'
        ) platform_data
        GROUP BY platform
        ORDER BY count DESC
        LIMIT 10
      `),

      // System health metrics
      query(`
        SELECT 
          COUNT(*) as total_users,
          COUNT(CASE WHEN is_active = true THEN 1 END) as active_users,
          COUNT(CASE WHEN last_login >= NOW() - INTERVAL '7 days' THEN 1 END) as recent_users
        FROM ggr_users
      `),
    ]);

    // Process results safely
    const [
      statusStatsResult,
      timelineResult,
      topUsersResult,
      userRegistrationsResult,
      platformsResult,
      systemHealthResult,
    ] = statsQueries;

    const statusStats =
      statusStatsResult.status === "fulfilled"
        ? statusStatsResult.value.rows
        : [];
    const requestTimeline =
      timelineResult.status === "fulfilled" ? timelineResult.value.rows : [];
    const topUsers =
      topUsersResult.status === "fulfilled" ? topUsersResult.value.rows : [];
    const userRegistrations =
      userRegistrationsResult.status === "fulfilled"
        ? userRegistrationsResult.value.rows
        : [];
    const popularPlatforms =
      platformsResult.status === "fulfilled" ? platformsResult.value.rows : [];
    const systemHealth =
      systemHealthResult.status === "fulfilled"
        ? systemHealthResult.value.rows[0]
        : { total_users: 0, active_users: 0, recent_users: 0 };

    // Calculate some derived metrics
    const totalRequests = statusStats.reduce(
      (sum, stat) => sum + parseInt(stat.count),
      0,
    );
    const pendingRequests =
      statusStats.find((s) => s.status === "pending")?.count || 0;
    const approvedRequests =
      statusStats.find((s) => s.status === "approved")?.count || 0;
    const fulfilledRequests =
      statusStats.find((s) => s.status === "fulfilled")?.count || 0;

    // Calculate approval rate
    const approvalRate =
      totalRequests > 0
        ? Math.round(
            ((parseInt(approvedRequests) + parseInt(fulfilledRequests)) /
              totalRequests) *
              100,
          )
        : 0;

    // Process timeline data for charts (fill missing dates with 0)
    const last30Days = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];

      const requestCount =
        requestTimeline.find((r) => r.date === dateStr)?.count || 0;
      const userCount =
        userRegistrations.find((r) => r.date === dateStr)?.count || 0;

      last30Days.push({
        date: dateStr,
        requests: parseInt(requestCount),
        users: parseInt(userCount),
      });
    }

    return {
      overview: {
        totalRequests,
        pendingRequests: parseInt(pendingRequests),
        approvedRequests: parseInt(approvedRequests),
        fulfilledRequests: parseInt(fulfilledRequests),
        approvalRate,
        totalUsers: parseInt(systemHealth.total_users),
        activeUsers: parseInt(systemHealth.active_users),
        recentUsers: parseInt(systemHealth.recent_users),
      },
      charts: {
        statusDistribution: statusStats.map((s) => ({
          status: s.status,
          count: parseInt(s.count),
        })),
        timeline: last30Days,
        topUsers: topUsers.map((u) => ({
          name: u.user_name,
          id: u.user_id,
          requests: parseInt(u.request_count),
        })),
        popularPlatforms: popularPlatforms.map((p) => ({
          platform: p.platform,
          count: parseInt(p.count),
        })),
      },
    };
  } catch (error) {
    console.error("Analytics page load error:", error);
    return {
      overview: {
        totalRequests: 0,
        pendingRequests: 0,
        approvedRequests: 0,
        fulfilledRequests: 0,
        approvalRate: 0,
        totalUsers: 0,
        activeUsers: 0,
        recentUsers: 0,
      },
      charts: {
        statusDistribution: [],
        timeline: [],
        topUsers: [],
        popularPlatforms: [],
      },
    };
  }
}
