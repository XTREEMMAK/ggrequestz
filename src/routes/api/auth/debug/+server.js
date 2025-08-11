/**
 * Debug endpoint to test Authentik connectivity and configuration
 */

import { json } from "@sveltejs/kit";
import {
  AUTHENTIK_CLIENT_ID as ENV_CLIENT_ID,
  AUTHENTIK_CLIENT_SECRET as ENV_CLIENT_SECRET,
  AUTHENTIK_ISSUER as ENV_ISSUER,
  SESSION_SECRET as ENV_SESSION_SECRET,
} from "$env/static/private";

// Hybrid approach: use SvelteKit env vars first, fall back to process.env for Docker
const AUTHENTIK_CLIENT_ID = ENV_CLIENT_ID || process.env.AUTHENTIK_CLIENT_ID;
const AUTHENTIK_CLIENT_SECRET = ENV_CLIENT_SECRET || process.env.AUTHENTIK_CLIENT_SECRET;
const AUTHENTIK_ISSUER = ENV_ISSUER || process.env.AUTHENTIK_ISSUER;
const SESSION_SECRET = ENV_SESSION_SECRET || process.env.SESSION_SECRET;

export async function GET() {
  const debug = {
    timestamp: new Date().toISOString(),
    environment: {
      hasClientId: !!AUTHENTIK_CLIENT_ID,
      hasClientSecret: !!AUTHENTIK_CLIENT_SECRET,
      hasIssuer: !!AUTHENTIK_ISSUER,
      hasSessionSecret: !!SESSION_SECRET,
      issuerUrl: AUTHENTIK_ISSUER,
      clientId: AUTHENTIK_CLIENT_ID,
    },
    connectivity: {},
  };

  // Test Authentik endpoints connectivity
  if (AUTHENTIK_ISSUER) {
    // Extract base URL from AUTHENTIK_ISSUER
    const baseUrl = AUTHENTIK_ISSUER.replace(/\/application\/o\/[^/]+$/, "");

    const endpoints = [
      `${baseUrl}/application/o/authorize/`,
      `${baseUrl}/application/o/token/`,
      `${baseUrl}/application/o/userinfo/`,
      `${AUTHENTIK_ISSUER}/.well-known/openid_configuration`,
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: "HEAD",
          timeout: 5000,
        });
        debug.connectivity[endpoint] = {
          status: response.status,
          accessible: response.status < 500,
        };
      } catch (error) {
        debug.connectivity[endpoint] = {
          error: error.message,
          accessible: false,
        };
      }
    }
  }

  // Validate environment
  const issues = [];
  if (!AUTHENTIK_CLIENT_ID) issues.push("Missing AUTHENTIK_CLIENT_ID");
  if (!AUTHENTIK_CLIENT_SECRET) issues.push("Missing AUTHENTIK_CLIENT_SECRET");
  if (!AUTHENTIK_ISSUER) issues.push("Missing AUTHENTIK_ISSUER");
  if (!SESSION_SECRET) issues.push("Missing SESSION_SECRET");

  if (AUTHENTIK_ISSUER && !AUTHENTIK_ISSUER.startsWith("https://")) {
    issues.push("AUTHENTIK_ISSUER must start with https://");
  }

  if (AUTHENTIK_ISSUER && AUTHENTIK_ISSUER.endsWith("/")) {
    issues.push("AUTHENTIK_ISSUER should not end with /");
  }

  debug.validation = {
    valid: issues.length === 0,
    issues,
  };

  return json(debug, { status: 200 });
}
