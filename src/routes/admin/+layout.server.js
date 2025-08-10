/**
 * Admin layout server loader - loads user permissions and admin data
 */

import { redirect } from "@sveltejs/kit";
import {
  getUserPermissions,
  userHasPermission,
  hasAdminUsers,
  assignAdminRole,
} from "$lib/userProfile.js";
import { query } from "$lib/database.js";

export async function load({ parent }) {
  const { user } = await parent();

  if (!user) {
    throw redirect(302, "/api/auth/login");
  }

  try {
    let localUserId;
    let userResult;
    
    // Handle basic auth users vs Authentik users - both now in unified ggr_users table
    if (user.sub?.startsWith('basic_auth_')) {
      const basicAuthId = user.sub.replace('basic_auth_', '');
      
      // Query the unified users table for basic auth users
      userResult = await query(
        "SELECT id, is_admin FROM ggr_users WHERE id = $1 AND is_active = TRUE AND password_hash IS NOT NULL",
        [parseInt(basicAuthId)],
      );
      
      if (userResult.rows.length === 0) {
        throw redirect(302, "/api/auth/login");
      }
      
      localUserId = userResult.rows[0].id;
      
      const isBasicAdmin = userResult.rows[0].is_admin;
      
      if (!isBasicAdmin) {
        throw redirect(302, "/?error=unauthorized");
      }
      
      let pendingRequestsCount = 0;
      try {
        const pendingResult = await query(
          "SELECT COUNT(*) as count FROM ggr_game_requests WHERE status = $1",
          ["pending"],
        );
        pendingRequestsCount = parseInt(pendingResult.rows[0].count) || 0;
      } catch (error) {
        console.warn("Failed to get pending requests count for basic auth:", error);
      }
      
      return {
        userPermissions: [
          'admin.panel',
          'request.view_all', 
          'user.view',
          'user.manage',
          'user.edit',
          'user.create',
          'user.delete',
          'system.settings',
          'analytics.view',
          'navigation.manage',
          'request.manage',
          'request.edit',
          'request.approve',
          'request.reject'
        ], // Grant full admin permissions for basic auth admins
        localUserId,
        pendingRequestsCount,
      };
      
    } else {
      
      // Handle Authentik users - query the ggr_users table including is_admin flag
      userResult = await query(
        "SELECT id, is_admin FROM ggr_users WHERE authentik_sub = $1 AND is_active = TRUE",
        [user.sub],
      );

      if (userResult.rows.length === 0) {
        throw redirect(302, "/api/auth/login");
      }

      localUserId = userResult.rows[0].id;
      
      const isAuthentikDirectAdmin = userResult.rows[0].is_admin;
      
      let hasCurrentAdminGroup = false;
      if (user.groups && Array.isArray(user.groups)) {
        hasCurrentAdminGroup = user.groups.includes("gg-requestz-admins");
      }
      
      const hasAdminAccess = isAuthentikDirectAdmin || hasCurrentAdminGroup;
      
      // If user has admin access through either method, grant full admin access
      if (hasAdminAccess) {
        
        let pendingRequestsCount = 0;
        try {
          const pendingResult = await query(
            "SELECT COUNT(*) as count FROM ggr_game_requests WHERE status = $1",
            ["pending"],
          );
          pendingRequestsCount = parseInt(pendingResult.rows[0].count) || 0;
        } catch (error) {
          console.warn("Failed to get pending requests count for Authentik admin:", error);
        }
        
        return {
          userPermissions: [
            'admin.panel',
            'request.view_all', 
            'user.view',
            'user.manage',
            'user.edit',
            'user.create',
            'user.delete',
            'system.settings',
            'analytics.view',
            'navigation.manage',
            'request.manage',
            'request.edit',
            'request.approve',
            'request.reject'
          ], // Grant full admin permissions for direct admin flag
          localUserId,
          pendingRequestsCount,
        };
      }
    }

    let hasAdminAccess = await userHasPermission(localUserId, "admin.panel");

    // If no admin access, check if any admin users exist in the system
    if (!hasAdminAccess) {
      const adminExists = await hasAdminUsers();

      // If no admin users exist, make the first user an admin (initial setup)
      if (!adminExists) {
        const adminAssigned = await assignAdminRole(localUserId);
        if (adminAssigned) {
          hasAdminAccess = true;
        }
      }
    }

    if (!hasAdminAccess) {
      throw redirect(302, "/?error=unauthorized");
    }

    const userPermissions = await getUserPermissions(localUserId);

    // Get pending requests count for admin dashboard
    let pendingRequestsCount = 0;
    try {
      if (userPermissions.includes("request.view_all")) {
        const pendingResult = await query(
          "SELECT COUNT(*) as count FROM ggr_game_requests WHERE status = $1",
          ["pending"],
        );
        pendingRequestsCount = parseInt(pendingResult.rows[0].count) || 0;
      }
    } catch (error) {
      console.warn("Failed to get pending requests count:", error);
    }

    return {
      userPermissions,
      localUserId,
      pendingRequestsCount,
    };
  } catch (error) {
    console.error("Admin layout load error:", error);

    // If it's already a redirect, re-throw it
    if (error.status === 302) {
      throw error;
    }

    // Otherwise redirect to unauthorized
    throw redirect(302, "/?error=unauthorized");
  }
}
