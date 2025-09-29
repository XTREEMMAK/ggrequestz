/**
 * Layout data loader - handles authentication and global data
 */

import {
  getSession,
  getUserRoles,
  getUserPermissions,
} from "$lib/auth.server.js";
import { userHasPermission } from "$lib/userProfile.js";
import { isRommAvailable } from "$lib/romm.server.js";
import { query, customNavigation } from "$lib/database.js";
import {
  needsInitialSetup,
  isBasicAuthEnabled,
  getBasicAuthUser,
} from "$lib/basicAuth.js";
import { withCache } from "$lib/cache.js";

/**
 * Filter navigation items based on user roles and visibility settings (with caching)
 * @param {Array} navItems - Array of navigation items
 * @param {Object} user - User object with roles
 * @returns {Promise<Array>} - Filtered navigation items
 */
async function filterNavigationByRole(navItems, user) {
  if (!user) return navItems.filter((item) => item.visible_to_guests);

  const filteredItems = [];

  // Get user's roles using cached function
  const userRoles = await getUserRoles(user);

  // Role hierarchy (highest to lowest)
  const roleHierarchy = ["admin", "manager", "moderator", "user", "viewer"];

  for (const item of navItems) {
    // If visible to all users, include it
    if (item.visible_to_all) {
      filteredItems.push(item);
      continue;
    }

    // Check hierarchical role access
    if (item.minimum_role) {
      const minimumIndex = roleHierarchy.findIndex(
        (role) => role === item.minimum_role,
      );
      const hasAccess = userRoles.some((userRole) => {
        const userRoleIndex = roleHierarchy.findIndex(
          (role) => role === userRole,
        );
        return userRoleIndex !== -1 && userRoleIndex <= minimumIndex;
      });

      if (hasAccess) {
        filteredItems.push(item);
      }
    } else if (item.allowed_roles && Array.isArray(item.allowed_roles)) {
      // Fallback to old allowed_roles system
      const hasAccess = userRoles.some((userRole) =>
        item.allowed_roles.includes(userRole),
      );
      if (hasAccess) {
        filteredItems.push(item);
      }
    }
  }

  return filteredItems;
}

export async function load({ request, cookies }) {
  try {
    // CRITICAL: Check setup requirements FIRST, before any authentication
    const authMethod = process.env.AUTH_METHOD || "authentik";
    let needsSetup = false;
    let basicAuthEnabled = false;

    // Check setup status - for Authentik, we assume database is ready
    if (authMethod === "authentik") {
      needsSetup = false;
      basicAuthEnabled = false;
    } else {
      // For basic auth, we need to check database and setup status
      try {
        // Check if database is accessible by trying a basic query
        await query("SELECT 1");

        needsSetup = await needsInitialSetup();
        basicAuthEnabled = await isBasicAuthEnabled();
      } catch (dbError) {
        console.error(
          "🚨 CRITICAL: Database connection failed:",
          dbError.message,
        );
        console.error(
          "🚨 This usually means database is unreachable or tables don't exist",
        );
        // If database isn't accessible, force setup for basic auth
        needsSetup = true;
        basicAuthEnabled = false;
      }
    }

    // If setup is needed, skip authentication entirely and return setup state
    if (needsSetup) {
      return {
        user: null,
        userPermissions: { isAdmin: false },
        rommAvailable: false,
        rommServerUrl: null,
        customNavItems: [],
        authMethod,
        needsSetup: true,
        basicAuthEnabled: false,
      };
    }

    // Only do authentication checks if setup is NOT needed
    let user = null;

    // First try Authentik session
    const sessionCookie = cookies.get("session");
    let cookieHeader = "";
    if (sessionCookie) {
      cookieHeader = `session=${sessionCookie}`;
      user = await getSession(cookieHeader);
    }

    // If no Authentik session, try basic auth session
    if (!user) {
      const basicAuthSession = cookies.get("basic_auth_session");
      if (basicAuthSession) {
        user = getBasicAuthUser(basicAuthSession);
        if (user) {
          user.auth_type = "basic"; // Mark as basic auth user
        }
      }
    }

    let userPermissions = {
      isAdmin: false,
    };

    let rommAvailable = false;

    // Get additional data if user is authenticated
    if (user) {
      try {
        // Use cached permission lookup with extended cache for better navigation performance
        const permissionsCacheKey = `user-permissions-${user.auth_type}-${user.id || user.sub}`;
        userPermissions = await withCache(
          permissionsCacheKey,
          () => getUserPermissions(user),
          10 * 60 * 1000, // 10 minute cache for permissions
        );
      } catch (permError) {
        console.warn("Failed to get user permissions:", permError);
        userPermissions = { isAdmin: false };
      }
    }

    // Check ROMM availability and get server URL (with extended caching for performance)
    let rommServerUrl = null;
    try {
      rommAvailable = await withCache(
        `romm-availability-${cookieHeader ? "authenticated" : "anonymous"}`,
        () => isRommAvailable(cookieHeader),
        15 * 60 * 1000, // Extended to 15 minute cache for better navigation performance
      );
      if (rommAvailable) {
        // Get ROMM server URL from environment
        const { ROMM_SERVER_URL } = process.env;
        rommServerUrl = ROMM_SERVER_URL || "http://localhost:8080";
      }
    } catch (rommError) {
      console.warn("Failed to check ROMM availability:", rommError);
    }

    // Get active custom navigation items with caching
    let customNavItems = [];
    try {
      const cacheKey = user
        ? `nav-items-${user.auth_type}-${user.id || user.sub}`
        : "nav-items-anonymous";

      customNavItems = await withCache(
        cacheKey,
        async () => {
          const allNavItems = await customNavigation.getActive();
          // Filter navigation items based on user roles and visibility settings
          return await filterNavigationByRole(allNavItems, user);
        },
        15 * 60 * 1000, // Extended to 15 minute cache for better navigation performance
      );
    } catch (navError) {
      console.warn("Failed to load custom navigation:", navError);
      customNavItems = []; // Fallback to empty array
    }

    // Authentication successful, setup not needed - proceed with full app loading

    return {
      user: user || null,
      userPermissions,
      rommAvailable,
      rommServerUrl,
      customNavItems,
      authMethod,
      needsSetup,
      basicAuthEnabled,
    };
  } catch (error) {
    console.error("Layout load error:", error);
    const authMethod = process.env.AUTH_METHOD || "authentik";
    return {
      user: null,
      userPermissions: { isAdmin: false },
      rommAvailable: false,
      rommServerUrl: null,
      customNavItems: [],
      authMethod,
      needsSetup: authMethod === "basic" ? true : false, // Force setup for basic auth on errors
      basicAuthEnabled: false,
    };
  }
}
