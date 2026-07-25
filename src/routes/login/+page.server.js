/**
 * Login page data loader
 */

import { redirect } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import { query } from "$lib/database.js";
import { withCache } from "$lib/cache.js";

// Short enough that toggling registration or completing setup shows up
// promptly, long enough to keep the login page off the database.
const LOGIN_SETTINGS_TTL = 60 * 1000;

export async function load({ parent }) {
  const { user, needsSetup, authMethod } = await parent();

  // If setup is needed, redirect to setup page
  if (needsSetup) {
    throw redirect(302, "/setup");
  }

  // If user is already authenticated, redirect to homepage
  if (user) {
    throw redirect(302, "/");
  }

  // Check what authentication methods are available - hybrid approach for npm and Docker compatibility
  const AUTHENTIK_CLIENT_ID =
    env.AUTHENTIK_CLIENT_ID || process.env.AUTHENTIK_CLIENT_ID;
  const AUTHENTIK_CLIENT_SECRET =
    env.AUTHENTIK_CLIENT_SECRET || process.env.AUTHENTIK_CLIENT_SECRET;
  const AUTHENTIK_ISSUER = env.AUTHENTIK_ISSUER || process.env.AUTHENTIK_ISSUER;

  // Only enable Authentik if credentials are present AND auth method is not set to 'basic' only
  const isAuthentikEnabled = !!(
    AUTHENTIK_CLIENT_ID &&
    AUTHENTIK_CLIENT_SECRET &&
    AUTHENTIK_ISSUER &&
    authMethod !== "basic"
  );

  // Both lookups below hit the database and both used to run uncached on every
  // single render of this public page. They change rarely, so a short cache
  // keeps the login page responsive without making setup changes feel stuck.
  // They are also independent, so run them concurrently.
  const [isBasicAuthEnabled, registrationEnabled] = await Promise.all([
    (async () => {
      // Basic auth is offered as a fallback under Authentik too, so this is
      // not exclusive to AUTH_METHOD=basic.
      try {
        return await withCache(
          "login-basic-auth-enabled",
          async () => {
            const { needsInitialSetup } = await import("$lib/basicAuth.js");
            return !(await needsInitialSetup());
          },
          LOGIN_SETTINGS_TTL,
        );
      } catch (error) {
        console.error("Error checking basic auth status:", error);
        return false;
      }
    })(),

    (async () => {
      try {
        return await withCache(
          "login-registration-enabled",
          async () => {
            const settingResult = await query(
              "SELECT value FROM ggr_system_settings WHERE key = 'system.registration_enabled'",
            );
            return (
              settingResult.rows.length > 0 &&
              settingResult.rows[0].value === "true"
            );
          },
          LOGIN_SETTINGS_TTL,
        );
      } catch (error) {
        console.warn("Could not check registration setting:", error);
        return false;
      }
    })(),
  ]);

  return {
    user: null,
    isAuthentikEnabled,
    isBasicAuthEnabled,
    registrationEnabled,
    hasAuthentikId: !!AUTHENTIK_CLIENT_ID,
    hasAuthentikSecret: !!AUTHENTIK_CLIENT_SECRET,
    hasAuthentikIssuer: !!AUTHENTIK_ISSUER,
  };
}
