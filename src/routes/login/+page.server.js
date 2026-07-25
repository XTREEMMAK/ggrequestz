/**
 * Login page data loader
 */

import { redirect } from "@sveltejs/kit";
import { query } from "$lib/database.js";
import { withCache } from "$lib/cache.js";
import { getOidcConfig, isOidcConfigured } from "$lib/server/oidc.js";

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

  // Which SSO provider is configured, under either the OIDC_* names or the
  // legacy AUTHENTIK_* ones.
  //
  // This gate is the bug behind issues #4 and #7: it required AUTHENTIK_*
  // specifically, so AUTH_METHOD=oidc_generic with OIDC_* variables satisfied
  // neither this branch nor the basic-auth branch, and the page rendered
  // "No authentication methods are configured".
  const oidcConfig = getOidcConfig();
  const isOidcEnabled = isOidcConfigured() && authMethod !== "basic";
  // Retained for the existing template binding.
  const isAuthentikEnabled = isOidcEnabled;

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
    isOidcEnabled,
    // Legacy alias, kept so nothing referencing the old name breaks.
    isAuthentikEnabled,
    // Label for the SSO button. Defaults to "SSO" rather than the previously
    // hardcoded "Authentik"; override with OIDC_PROVIDER_NAME.
    oidcProviderName: oidcConfig.providerName,
    isBasicAuthEnabled,
    registrationEnabled,
    hasOidcClientId: !!oidcConfig.clientId,
    hasOidcClientSecret: !!oidcConfig.clientSecret,
    hasOidcIssuer: !!oidcConfig.issuer,
  };
}
