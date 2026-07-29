/**
 * Layout data loader - handles authentication and global data
 */

import {
  getSession,
  getUserRoles,
  getUserPermissions,
} from "$lib/auth.server.js";
import { userHasPermission } from "$lib/userProfile.js";
import {
  isRommConfigured,
  getRommAvailabilitySnapshot,
} from "$lib/romm.server.js";
import { query, customNavigation } from "$lib/database.js";
import {
  needsInitialSetup,
  isBasicAuthEnabled,
  getBasicAuthUser,
} from "$lib/basicAuth.js";
import { withCache } from "$lib/cache.js";

// Short enough that toggling the setting feels immediate on the next
// navigation, long enough that it is not a query per page view.
const PREFERENCE_CACHE_TTL_MS = 60 * 1000;

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
        backgroundTheme: "none",
        uiTheme: "default",
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
    let uiTheme = "default";
    let backgroundTheme = "none";

    // Get additional data if user is authenticated
    if (user) {
      try {
        // getUserPermissions() already caches internally under exactly this
        // key, so wrapping it in another withCache() was pure duplication —
        // and with request coalescing it deadlocked: the outer call registered
        // the key as in-flight, then the inner call was handed the outer's own
        // promise and awaited itself forever.
        userPermissions = await getUserPermissions(user);
      } catch (permError) {
        console.warn("Failed to get user permissions:", permError);
        userPermissions = { isAdmin: false };
      }

      // Opt-in appearance preferences. Read here because they have to apply to
      // every authenticated page, and cached because this load runs on all of
      // them. Deliberately inside the `if (user)` branch: the unauthenticated
      // /login must not gain a database round-trip for decorative preferences.
      //
      // Both columns come from one query. They are separate preferences — the
      // chrome theme is independent of the background — but they are always
      // needed together, so a second round-trip would buy nothing.
      try {
        const { getUserIdFromAuth } = await import("$lib/getUserId.js");
        const { query } = await import("$lib/database.js");
        const userId = await getUserIdFromAuth(user, query);

        const appearance = await withCache(
          `appearance-${userId}`,
          async () => {
            const result = await query(
              "SELECT background_theme, ui_theme FROM ggr_user_preferences WHERE user_id = $1",
              [userId],
            );
            return {
              backgroundTheme: result.rows[0]?.background_theme || "none",
              uiTheme: result.rows[0]?.ui_theme || "default",
            };
          },
          PREFERENCE_CACHE_TTL_MS,
        );

        backgroundTheme = appearance.backgroundTheme;
        uiTheme = appearance.uiTheme;
      } catch (prefError) {
        // Never fatal — both are cosmetic. Log the reason so an upgrade that
        // skipped migration 008 or 009 is diagnosable rather than just silently
        // never showing the effect.
        console.warn(
          "Failed to read appearance preferences:",
          prefError?.message || prefError,
        );
      }
    }

    // ROMM availability is read from a background-refreshed snapshot, never
    // probed here. This load function runs on EVERY route including the
    // unauthenticated /login, so any awaited outbound HTTP blocks the first
    // byte of every page. A live probe here was the cause of the multi-second
    // cold-start hang.
    let rommServerUrl = null;
    try {
      const rommConfigured = await isRommConfigured();
      const snapshot = rommConfigured ? getRommAvailabilitySnapshot() : null;

      // Optimistic until proven otherwise: show the library link while the
      // first background probe is still in flight, and hide it only once a
      // probe has actually failed.
      rommAvailable = rommConfigured && snapshot.ok !== false;

      if (rommAvailable) {
        // Public base — this becomes an href in the nav, so it must be a URL
        // the browser can resolve, not an internal service address.
        const { ROMM_SERVER_URL_PUBLIC, ROMM_SERVER_URL } = process.env;
        rommServerUrl =
          ROMM_SERVER_URL_PUBLIC || ROMM_SERVER_URL || "http://localhost:8080";
      }
    } catch (rommError) {
      console.warn("Failed to read ROMM availability:", rommError);
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
      backgroundTheme,
      uiTheme,
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
      backgroundTheme: "none",
      uiTheme: "default",
      customNavItems: [],
      authMethod,
      needsSetup: authMethod === "basic" ? true : false, // Force setup for basic auth on errors
      basicAuthEnabled: false,
    };
  }
}
