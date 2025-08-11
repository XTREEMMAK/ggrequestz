/**
 * Admin requests page data loader
 */

import { redirect } from "@sveltejs/kit";
import { query } from "$lib/database.js";

export async function load({ url, parent }) {
  const { userPermissions } = await parent();

  // Check permission
  if (!userPermissions.includes("request.view_all")) {
    throw redirect(302, "/admin?error=permission_denied");
  }

  try {
    // Get query parameters
    const status = url.searchParams.get("status") || "all";
    const search = url.searchParams.get("search") || "";
    const sortBy = url.searchParams.get("sort") || "created_at";
    const sortDir = url.searchParams.get("dir") || "desc";
    const page = parseInt(url.searchParams.get("page")) || 1;
    const limit = 20;
    const offset = (page - 1) * limit;

    // Build query conditions
    let whereConditions = [];
    let queryParams = [];
    let paramIndex = 1;

    if (status !== "all") {
      whereConditions.push(`status = $${paramIndex}`);
      queryParams.push(status);
      paramIndex++;
    }

    if (search) {
      whereConditions.push(
        `(title ILIKE $${paramIndex} OR user_name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`,
      );
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(" AND ")}`
        : "";

    // Validate sort parameters
    const validSortColumns = [
      "title",
      "user_name",
      "status",
      "priority",
      "request_type",
      "created_at",
      "updated_at",
    ];
    const finalSortBy = validSortColumns.includes(sortBy)
      ? sortBy
      : "created_at";
    const finalSortDir = ["asc", "desc"].includes(sortDir.toLowerCase())
      ? sortDir.toLowerCase()
      : "desc";

    // Get total count
    const countQuery = `SELECT COUNT(*) as count FROM ggr_game_requests ${whereClause}`;
    const countResult = await query(countQuery, queryParams);
    const totalRequests = parseInt(countResult.rows[0].count) || 0;
    const totalPages = Math.ceil(totalRequests / limit);

    // Build ORDER BY clause
    let orderByClause = "";
    if (finalSortBy === "priority") {
      // Custom priority sorting (urgent > high > medium > low)
      orderByClause = `ORDER BY 
        CASE priority 
          WHEN 'urgent' THEN 1 
          WHEN 'high' THEN 2 
          WHEN 'medium' THEN 3 
          WHEN 'low' THEN 4 
          ELSE 5 
        END ${finalSortDir === "desc" ? "DESC" : "ASC"}`;
    } else if (finalSortBy === "status") {
      // Custom status sorting (pending first, then others)
      orderByClause = `ORDER BY 
        CASE WHEN status = 'pending' THEN 1 ELSE 2 END ${finalSortDir === "desc" ? "DESC" : "ASC"},
        ${finalSortBy} ${finalSortDir === "desc" ? "DESC" : "ASC"}`;
    } else {
      orderByClause = `ORDER BY ${finalSortBy} ${finalSortDir === "desc" ? "DESC" : "ASC"}`;
    }

    // Get requests
    const requestsQuery = `
      SELECT 
        id, title, user_id, user_name, status, request_type, priority,
        description, reason, platforms, admin_notes, igdb_id,
        created_at, updated_at
      FROM ggr_game_requests 
      ${whereClause}
      ${orderByClause}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    queryParams.push(limit, offset);
    const requestsResult = await query(requestsQuery, queryParams);

    // Fetch cover URLs from games cache for requests with igdb_id
    const igdbIds = requestsResult.rows
      .filter(row => row.igdb_id)
      .map(row => row.igdb_id);
    
    let gameCovers = {};
    if (igdbIds.length > 0) {
      try {
        const coverQuery = `
          SELECT igdb_id, cover_url 
          FROM ggr_games_cache 
          WHERE igdb_id = ANY($1)
        `;
        const coverResult = await query(coverQuery, [igdbIds]);
        gameCovers = coverResult.rows.reduce((acc, row) => {
          acc[row.igdb_id] = row.cover_url;
          return acc;
        }, {});
      } catch (error) {
        console.error('Error fetching game covers:', error);
      }
    }

    const requests = requestsResult.rows.map((row) => ({
      ...row,
      platforms:
        typeof row.platforms === "string"
          ? JSON.parse(row.platforms)
          : row.platforms || [],
      cover_url: row.igdb_id ? gameCovers[row.igdb_id] : null,
    }));

    return {
      requests,
      currentPage: page,
      totalPages,
      totalRequests,
      filters: {
        status,
        search,
      },
      sorting: {
        sortBy: finalSortBy,
        sortDir: finalSortDir,
      },
    };
  } catch (error) {
    console.error("Requests page load error:", error);
    return {
      requests: [],
      currentPage: 1,
      totalPages: 1,
      totalRequests: 0,
      filters: {
        status: "all",
        search: "",
      },
      sorting: {
        sortBy: "created_at",
        sortDir: "desc",
      },
    };
  }
}
