/**
 * Login page data loader
 */

import { redirect } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";

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

  // Check if basic auth is enabled (by checking if initial admin exists)
  let isBasicAuthEnabled = false;
  if (authMethod === "basic") {
    try {
      const { needsInitialSetup } = await import("$lib/basicAuth.js");
      isBasicAuthEnabled = !(await needsInitialSetup());
    } catch (error) {
      console.error("Error checking basic auth status:", error);
      isBasicAuthEnabled = false;
    }
  } else if (authMethod === "authentik") {
    // If using Authentik as primary method, still allow basic auth as fallback if configured
    try {
      const { needsInitialSetup } = await import("$lib/basicAuth.js");
      isBasicAuthEnabled = !(await needsInitialSetup());
    } catch (error) {
      isBasicAuthEnabled = false;
    }
  }

  return {
    user: null,
    isAuthentikEnabled,
    isBasicAuthEnabled,
    hasAuthentikId: !!AUTHENTIK_CLIENT_ID,
    hasAuthentikSecret: !!AUTHENTIK_CLIENT_SECRET,
    hasAuthentikIssuer: !!AUTHENTIK_ISSUER,
  };
}
