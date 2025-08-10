/**
 * Admin users page data loader
 */

import { redirect } from "@sveltejs/kit";
import { query } from "$lib/database.js";

export async function load({ url, parent, depends }) {
  // Ensure page data is refetched when URL parameters change
  depends('admin:users:filters');
  
  const { userPermissions } = await parent();

  // Check permission
  if (!userPermissions.includes("user.view")) {
    throw redirect(302, "/admin?error=permission_denied");
  }

  try {
    // Get query parameters
    const status = url.searchParams.get("status") || "all";
    const role = url.searchParams.get("role") || "all";
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

    // Status filter
    if (status === "active") {
      whereConditions.push(`u.is_active = true`);
    } else if (status === "inactive") {
      whereConditions.push(`u.is_active = false`);
    } else if (status === "banned") {
      // For now, banned users are inactive users - could be extended with a separate banned flag
      whereConditions.push(`u.is_active = false`);
    }

    // Role filter
    if (role !== "all") {
      if (role === "admin") {
        // For admin role, check both role-based system (Authentik users) and is_admin flag (basic auth users)
        whereConditions.push(`(
          EXISTS (
            SELECT 1 FROM ggr_user_roles ur 
            JOIN ggr_roles r ON ur.role_id = r.id 
            WHERE ur.user_id = u.id AND r.name = $${paramIndex} AND ur.is_active = true
          ) OR u.is_admin = true
        )`);
      } else {
        // For other roles, only check role-based system
        whereConditions.push(`EXISTS (
          SELECT 1 FROM ggr_user_roles ur 
          JOIN ggr_roles r ON ur.role_id = r.id 
          WHERE ur.user_id = u.id AND r.name = $${paramIndex} AND ur.is_active = true
        )`);
      }
      queryParams.push(role);
      paramIndex++;
    }

    // Search filter
    if (search) {
      whereConditions.push(`(
        u.name ILIKE $${paramIndex} OR 
        u.email ILIKE $${paramIndex} OR 
        u.preferred_username ILIKE $${paramIndex}
      )`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(" AND ")}`
        : "";

    // Validate sort parameters
    const validSortColumns = [
      "name",
      "email",
      "preferred_username",
      "is_active",
      "created_at",
      "updated_at",
      "last_login",
    ];
    const finalSortBy = validSortColumns.includes(sortBy)
      ? sortBy
      : "created_at";
    const finalSortDir = ["asc", "desc"].includes(sortDir.toLowerCase())
      ? sortDir.toLowerCase()
      : "desc";

    // Get total count from unified ggr_users table
    const countQuery = `
      SELECT COUNT(*) as count 
      FROM ggr_users u 
      ${whereClause}
    `;
    const countResult = await query(countQuery, queryParams);
    const totalUsers = parseInt(countResult.rows[0].count) || 0;
    const totalPages = Math.ceil(totalUsers / limit);

    // Build ORDER BY clause
    let orderByClause = `ORDER BY ${finalSortBy} ${finalSortDir === "desc" ? "DESC" : "ASC"}`;

    // Get users from unified ggr_users table
    const usersQuery = `
      SELECT 
        CASE 
          WHEN u.authentik_sub IS NOT NULL THEN 'authentik'
          WHEN u.password_hash IS NOT NULL THEN 'basic'
          ELSE 'unknown'
        END as auth_type,
        u.id::text as user_id, 
        COALESCE(u.authentik_sub, ('basic_auth_' || u.id)) as auth_sub, 
        u.email, 
        u.name, 
        u.preferred_username, 
        u.avatar_url, 
        u.is_active, 
        u.is_admin, 
        u.created_at, 
        u.updated_at, 
        u.last_login,
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
      ${whereClause}
      GROUP BY u.id, u.authentik_sub, u.email, u.name, u.preferred_username, 
               u.avatar_url, u.is_active, u.is_admin, u.created_at, u.updated_at, u.last_login
      ${orderByClause}
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;

    const finalParams = [...queryParams, limit, offset];
    const usersResult = await query(usersQuery, finalParams);

    const users = usersResult.rows.map((row) => ({
      ...row,
      id: parseInt(row.user_id), // Add id field for easier access in templates
      roles: Array.isArray(row.roles)
        ? row.roles.filter((role) => role.id !== null)
        : [],
    }));

    // Get all roles for filters
    const rolesResult = await query(
      "SELECT id, name, display_name FROM ggr_roles WHERE is_active = true ORDER BY display_name",
    );
    const roles = rolesResult.rows;

    return {
      users,
      roles,
      currentPage: page,
      totalPages,
      totalUsers,
      filters: {
        status,
        role,
        search,
      },
      sorting: {
        sortBy: finalSortBy,
        sortDir: finalSortDir,
      },
    };
  } catch (error) {
    console.error("Users page load error:", error);
    return {
      users: [],
      roles: [],
      currentPage: 1,
      totalPages: 1,
      totalUsers: 0,
      filters: {
        status: "all",
        role: "all",
        search: "",
      },
      sorting: {
        sortBy: "created_at",
        sortDir: "desc",
      },
    };
  }
}
