/**
 * Layout data loader - handles authentication and global data
 */

import { getSession } from "$lib/auth.server.js";
import { userHasPermission } from "$lib/userProfile.js";
import { isRommAvailable } from "$lib/romm.server.js";
import { query, customNavigation } from "$lib/database.js";
import {
  needsInitialSetup,
  isBasicAuthEnabled,
  getBasicAuthUser,
} from "$lib/basicAuth.js";

/**
 * Filter navigation items based on user roles and visibility settings
 * @param {Array} navItems - Array of navigation items
 * @param {Object} user - User object with roles
 * @returns {Promise<Array>} - Filtered navigation items
 */
async function filterNavigationByRole(navItems, user) {
  if (!user) return navItems.filter((item) => item.visible_to_guests);

  const filteredItems = [];

  // Get user's roles for role-based filtering
  let userRoles = [];
  try {
    if (user.auth_type === "basic") {
      // For basic auth users, get roles from database
      const userResult = await query(
        "SELECT id FROM ggr_users WHERE id = $1 AND password_hash IS NOT NULL",
        [user.id],
      );
      if (userResult.rows.length > 0) {
        const rolesResult = await query(
          `
          SELECT r.name 
          FROM ggr_roles r
          JOIN ggr_user_roles ur ON r.id = ur.role_id
          WHERE ur.user_id = $1 AND ur.is_active = true AND r.is_active = true
        `,
          [user.id],
        );
        userRoles = rolesResult.rows.map((row) => row.name);
      }
    } else {
      // For Authentik users, get roles from database
      const userResult = await query(
        "SELECT id FROM ggr_users WHERE authentik_sub = $1",
        [user.sub],
      );
      if (userResult.rows.length > 0) {
        const rolesResult = await query(
          `
          SELECT r.name 
          FROM ggr_roles r
          JOIN ggr_user_roles ur ON r.id = ur.role_id
          WHERE ur.user_id = $1 AND ur.is_active = true AND r.is_active = true
        `,
          [userResult.rows[0].id],
        );
        userRoles = rolesResult.rows.map((row) => row.name);
      }
    }
  } catch (error) {
    console.warn("Failed to get user roles for navigation filtering:", error);
    userRoles = [];
  }

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
        // For basic auth users, check permissions directly
        if (user.auth_type === "basic") {
          userPermissions.isAdmin = user.is_admin || false;
        } else {
          // For Authentik users, get user's local ID and check permissions
          try {
            const userResult = await query(
              "SELECT id, email, is_admin FROM ggr_users WHERE authentik_sub = $1",
              [user.sub],
            );

            if (userResult.rows.length > 0) {
              const localUserId = userResult.rows[0].id;
              const dbUser = userResult.rows[0];

              // Check if user has direct is_admin flag set
              if (dbUser.is_admin) {
                userPermissions.isAdmin = true;
              } else {
                // Check role-based permissions
                userPermissions.isAdmin = await userHasPermission(
                  localUserId,
                  "admin.panel",
                );
              }
            } else {
            }
          } catch (dbError) {
            console.error(
              `❌ AUTH DEBUG: Database error for Authentik user:`,
              dbError.message,
            );
            console.error(
              `❌ AUTH DEBUG: Database error stack:`,
              dbError.stack,
            );
            // Don't fail authentication, just set basic permissions
            userPermissions.isAdmin = false;
          }
        }
      } catch (permError) {
        console.warn("Failed to get user permissions:", permError);
      }
    }

    // Check ROMM availability and get server URL
    let rommServerUrl = null;
    try {
      rommAvailable = await isRommAvailable(cookieHeader);
      if (rommAvailable) {
        // Get ROMM server URL from environment
        const { ROMM_SERVER_URL } = process.env;
        rommServerUrl = ROMM_SERVER_URL || "http://localhost:8080";
      }
    } catch (rommError) {
      console.warn("Failed to check ROMM availability:", rommError);
    }

    // Get active custom navigation items (skip if database isn't working)
    let customNavItems = [];
    try {
      const allNavItems = await customNavigation.getActive();

      // Filter navigation items based on user roles and visibility settings
      customNavItems = await filterNavigationByRole(allNavItems, user);
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
