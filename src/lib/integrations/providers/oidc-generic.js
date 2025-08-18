/**
 * Generic OIDC Provider
 * Refactored to use shared utilities and HTTP client
 */

import {
  createSessionToken,
  verifyJWT,
  extractUserFromPayload,
} from "../utils/jwt-utils.js";
import { createOidcClient } from "../utils/http-client.js";

/**
 * Get authorization URL for generic OIDC provider
 */
export function getAuthorizationUrl(config, redirectUri, state) {
  const client = createOidcClient(config);
  const authUrl = client.getAuthorizationUrl(
    redirectUri,
    state || crypto.randomUUID(),
  );

  return authUrl;
}

/**
 * Handle generic OIDC callback
 */
export async function handleCallback(config, code, redirectUri) {
  try {
    const client = createOidcClient(config);

    // Exchange code for tokens
    const tokens = await client.exchangeCodeForTokens(code, redirectUri);

    // Get user info
    const userInfo = await client.getUserInfo(tokens.access_token);

    // Create session token
    const sessionToken = await createSessionToken(userInfo, {
      provider: "oidc_generic",
      externalToken: tokens.access_token,
    });

    return {
      success: true,
      user: userInfo,
      sessionToken,
      tokens,
    };
  } catch (error) {
    console.error("Generic OIDC callback error:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Verify session token
 */
export async function verifySession(token) {
  const payload = await verifyJWT(token);
  return payload ? extractUserFromPayload(payload) : null;
}

/**
 * Logout from OIDC provider
 */
export async function logout(token, config) {
  try {
    const payload = await verifyJWT(token);
    if (!payload || !payload.external_token) {
      return { success: true, message: "Session already invalid" };
    }

    // Optional: Call provider logout endpoint if supported
    // This varies by OIDC provider

    return { success: true, message: "Logged out successfully" };
  } catch (error) {
    console.error("OIDC logout error:", error);
    return { success: false, error: error.message };
  }
}
