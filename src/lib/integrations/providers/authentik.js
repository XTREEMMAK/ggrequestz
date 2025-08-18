/**
 * Authentik OIDC Provider
 * Enhanced wrapper around existing auth.js functionality
 */

import * as auth from "$lib/auth.server.js";

/**
 * Get authorization URL for Authentik
 */
export function getAuthorizationUrl(redirectUri, state) {
  return auth.getAuthorizationUrl(redirectUri, state);
}

/**
 * Handle Authentik callback
 */
export async function handleCallback(code, redirectUri) {
  try {
    // Exchange code for tokens
    const tokens = await auth.exchangeCodeForTokens(code, redirectUri);

    // Get user info
    const userInfo = await auth.getUserInfo(tokens.access_token);

    // Create session token
    const sessionToken = await auth.createSessionToken(
      userInfo,
      tokens.access_token,
    );

    return {
      success: true,
      user: userInfo,
      sessionToken,
      tokens,
    };
  } catch (error) {
    console.error("Authentik callback error:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Verify Authentik session
 */
export async function verifySession(token) {
  return await auth.verifySessionToken(token);
}

/**
 * Logout from Authentik
 */
export async function logout(token) {
  try {
    // Get session info to extract access token
    const session = await auth.verifySessionToken(token);
    if (!session || !session.access_token) {
      return { success: true, message: "Session already invalid" };
    }

    // Optional: Call Authentik logout endpoint
    // This depends on your Authentik configuration
    // For now, just invalidate local session

    return { success: true, message: "Logged out successfully" };
  } catch (error) {
    console.error("Authentik logout error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Create session cookie
 */
export function createSessionCookie(token) {
  return auth.createSessionCookie(token);
}

/**
 * Clear session cookie
 */
export function clearSessionCookie() {
  return auth.clearSessionCookie();
}

/**
 * Get user session from cookies
 */
export async function getSession(cookieHeader) {
  return await auth.getSession(cookieHeader);
}
