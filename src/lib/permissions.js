/**
 * Permission checking utilities for GG Requestz
 * Handles user permissions and role-based access control
 */

import { permissions, users } from "./database.js";
import { redirect, error } from "@sveltejs/kit";

/**
 * Permission levels for different actions
 */
export const PERMISSIONS = {
  // Request permissions
  REQUEST_CREATE: "request.create",
  REQUEST_EDIT: "request.edit",
  REQUEST_DELETE: "request.delete",
  REQUEST_APPROVE: "request.approve",
  REQUEST_VIEW_ALL: "request.view_all",

  // User management permissions
  USER_VIEW: "user.view",
  USER_EDIT: "user.edit",
  USER_BAN: "user.ban",
  USER_DELETE: "user.delete",

  // System permissions
  SYSTEM_SETTINGS: "system.settings",
  ADMIN_PANEL: "admin.panel",
  ANALYTICS_VIEW: "analytics.view",

  // ROMM-specific permissions (custom)
  ROMM_ACCESS: "romm.access",
  ROMM_ADMIN: "romm.admin",
};

/**
 * Get user permissions from session
 * @param {Object} session - User session object
 * @returns {Promise<Object>} - User with permissions
 */
export async function getUserWithPermissions(session) {
  if (!session || !session.user_id) {
    return null;
  }

  try {
    // Get user data
    const user = await users.getById(session.user_id);
    if (!user) {
      return null;
    }

    // Get user permissions and roles
    const [userPermissions, userRoles] = await Promise.all([
      permissions.getUserPermissions(session.user_id),
      permissions.getUserRoles(session.user_id),
    ]);

    return {
      ...user,
      permissions: userPermissions,
      roles: userRoles,
      // Helper methods
      hasPermission: (permission) =>
        userPermissions.some((p) => p.permission_name === permission),
      hasRole: (role) => userRoles.some((r) => r.name === role),
      isAdmin: () => userRoles.some((r) => r.name === "admin"),
      isManager: () => userRoles.some((r) => r.name === "manager"),
      isViewer: () => userRoles.some((r) => r.name === "viewer"),
    };
  } catch (error) {
    console.error("Failed to get user with permissions:", error);
    return null;
  }
}

/**
 * Check if user has specific permission
 * @param {Object} session - User session object
 * @param {string} permission - Permission to check
 * @returns {Promise<boolean>} - Whether user has permission
 */
export async function hasPermission(session, permission) {
  if (!session || !session.user_id) {
    return false;
  }

  try {
    return await permissions.hasPermission(session.user_id, permission);
  } catch (error) {
    console.error("Failed to check permission:", error);
    return false;
  }
}

/**
 * Check if user has any of the specified permissions
 * @param {Object} session - User session object
 * @param {Array} permissionList - Array of permissions to check
 * @returns {Promise<boolean>} - Whether user has any of the permissions
 */
export async function hasAnyPermission(session, permissionList) {
  if (!session || !session.user_id) {
    return false;
  }

  try {
    const userPermissions = await permissions.getUserPermissions(
      session.user_id,
    );
    const permissionNames = userPermissions.map((p) => p.permission_name);

    return permissionList.some((permission) =>
      permissionNames.includes(permission),
    );
  } catch (error) {
    console.error("Failed to check permissions:", error);
    return false;
  }
}

/**
 * Check if user has all of the specified permissions
 * @param {Object} session - User session object
 * @param {Array} permissionList - Array of permissions to check
 * @returns {Promise<boolean>} - Whether user has all of the permissions
 */
export async function hasAllPermissions(session, permissionList) {
  if (!session || !session.user_id) {
    return false;
  }

  try {
    const userPermissions = await permissions.getUserPermissions(
      session.user_id,
    );
    const permissionNames = userPermissions.map((p) => p.permission_name);

    return permissionList.every((permission) =>
      permissionNames.includes(permission),
    );
  } catch (error) {
    console.error("Failed to check permissions:", error);
    return false;
  }
}

/**
 * Middleware factory for protecting routes with permissions
 * @param {string|Array} requiredPermissions - Permission(s) required
 * @param {Object} options - Additional options
 * @returns {Function} - Middleware function
 */
export function requirePermission(requiredPermissions, options = {}) {
  const {
    redirectTo = "/login",
    allowAny = false, // If true, user needs ANY of the permissions; if false, needs ALL
    onDenied = null, // Custom callback for permission denied
  } = options;

  const permissions = Array.isArray(requiredPermissions)
    ? requiredPermissions
    : [requiredPermissions];

  return async (event) => {
    const { request, locals } = event;

    // Get session from request
    const session =
      locals.session || (await getSession(request.headers.get("cookie")));

    if (!session) {
      if (onDenied) {
        return onDenied(event, "No session");
      }
      throw redirect(302, redirectTo);
    }

    // Check permissions
    const hasRequired = allowAny
      ? await hasAnyPermission(session, permissions)
      : await hasAllPermissions(session, permissions);

    if (!hasRequired) {
      if (onDenied) {
        return onDenied(event, "Insufficient permissions");
      }
      throw error(403, "Insufficient permissions");
    }

    // Store user with permissions in locals for use in route handlers
    locals.user = await getUserWithPermissions(session);

    return null; // Continue to route handler
  };
}

/**
 * Helper function to check ROMM access permissions
 * @param {Object} session - User session object
 * @returns {Promise<boolean>} - Whether user can access ROMM
 */
export async function canAccessROMM(session) {
  if (!session || !session.user_id) {
    return false;
  }

  // Check for explicit ROMM access permission or admin/manager roles
  return await hasAnyPermission(session, [
    PERMISSIONS.ROMM_ACCESS,
    PERMISSIONS.ROMM_ADMIN,
    PERMISSIONS.ADMIN_PANEL,
  ]);
}

/**
 * Helper function to check admin panel access
 * @param {Object} session - User session object
 * @returns {Promise<boolean>} - Whether user can access admin panel
 */
export async function canAccessAdminPanel(session) {
  return await hasPermission(session, PERMISSIONS.ADMIN_PANEL);
}

/**
 * Filter objects based on user permissions
 * @param {Array} items - Array of items to filter
 * @param {Object} session - User session object
 * @param {Function} permissionCheck - Function to check permission for each item
 * @returns {Promise<Array>} - Filtered array
 */
export async function filterByPermissions(items, session, permissionCheck) {
  if (!session || !Array.isArray(items)) {
    return [];
  }

  const user = await getUserWithPermissions(session);
  if (!user) {
    return [];
  }

  const filtered = [];
  for (const item of items) {
    if (await permissionCheck(item, user)) {
      filtered.push(item);
    }
  }

  return filtered;
}

/**
 * Create permission-based navigation menu
 * @param {Object} session - User session object
 * @returns {Promise<Array>} - Array of navigation items user can access
 */
export async function getNavigationMenu(session) {
  const user = await getUserWithPermissions(session);

  if (!user) {
    return [
      { name: "Browse Games", path: "/", icon: "heroicons:squares-plus" },
      { name: "Search", path: "/search", icon: "heroicons:magnifying-glass" },
    ];
  }

  const menu = [
    { name: "Browse Games", path: "/", icon: "heroicons:squares-plus" },
    { name: "Search", path: "/search", icon: "heroicons:magnifying-glass" },
    { name: "My Watchlist", path: "/watchlist", icon: "heroicons:heart" },
  ];

  if (user.hasPermission(PERMISSIONS.REQUEST_VIEW_ALL)) {
    menu.push({
      name: "All Requests",
      path: "/requests",
      icon: "heroicons:clipboard-document-list",
    });
  }

  if (user.hasPermission(PERMISSIONS.USER_VIEW)) {
    menu.push({ name: "Users", path: "/admin/users", icon: "heroicons:users" });
  }

  if (user.hasPermission(PERMISSIONS.ADMIN_PANEL)) {
    menu.push({
      name: "Admin Panel",
      path: "/admin",
      icon: "heroicons:cog-6-tooth",
    });
  }

  return menu;
}

// Re-export getSession for convenience
import { getSession } from "$lib/auth.server.js";
export { getSession };
