/**
 * Server-only authentication utilities
 * This file should never be imported by client-side code
 */

import { browser } from "$app/environment";

// Throw error if accidentally imported in browser
if (browser) {
  throw new Error("auth.server.js cannot be imported in browser - use auth.js for client-safe functions");
}

// Import server-only modules
import { SignJWT, jwtVerify } from "jose";
import { serialize, parse } from "cookie";
import crypto from "crypto";
import { env } from "$env/dynamic/private";

// Use dynamic environment variables for runtime configuration
const AUTHENTIK_CLIENT_ID = env.AUTHENTIK_CLIENT_ID || process.env.AUTHENTIK_CLIENT_ID;
const AUTHENTIK_CLIENT_SECRET = env.AUTHENTIK_CLIENT_SECRET || process.env.AUTHENTIK_CLIENT_SECRET;
const AUTHENTIK_ISSUER = env.AUTHENTIK_ISSUER || process.env.AUTHENTIK_ISSUER;
const SESSION_SECRET = env.SESSION_SECRET || process.env.SESSION_SECRET;

// JWT Secret
const JWT_SECRET = SESSION_SECRET || "your-secret-key";
const secret = new TextEncoder().encode(JWT_SECRET);

/**
 * Get the base URL for Authentik OAuth endpoints
 * @returns {string} - Base URL for OAuth endpoints
 */
function getBaseUrl() {
  if (!AUTHENTIK_ISSUER) {
    throw new Error("AUTHENTIK_ISSUER is not configured");
  }
  
  // Extract the base domain from the issuer URL
  // AUTHENTIK_ISSUER might be like "https://auth.keyjaycompound.com/application/o/gg-requestz"
  // We need to get "https://auth.keyjaycompound.com"
  const url = new URL(AUTHENTIK_ISSUER);
  return `${url.protocol}//${url.host}`;
}

/**
 * Get Authentik OAuth2 authorization URL
 * @param {string} redirectUri - Redirect URI
 * @param {string} state - State parameter for CSRF protection
 * @returns {string} - Authorization URL
 */
export function getAuthorizationUrl(redirectUri, state) {
  if (!AUTHENTIK_CLIENT_ID) {
    throw new Error("AUTHENTIK_CLIENT_ID is not configured in environment variables");
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: AUTHENTIK_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: "openid email profile",
    state: state,
  });

  const baseUrl = getBaseUrl();
  const authUrl = `${baseUrl}/application/o/authorize/?${params.toString()}`;

  return authUrl;
}

/**
 * Exchange authorization code for tokens
 * @param {string} code - Authorization code
 * @param {string} redirectUri - Redirect URI
 * @returns {Promise<Object>} - Token response
 */
export async function exchangeCodeForTokens(code, redirectUri) {
  const baseUrl = getBaseUrl();
  const tokenEndpoint = `${baseUrl}/application/o/token/`;

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: AUTHENTIK_CLIENT_ID,
    client_secret: AUTHENTIK_CLIENT_SECRET,
    code: code,
    redirect_uri: redirectUri,
  });

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("❌ Token exchange failed:", response.status, errorText);
    throw new Error(`Token exchange failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Get user info from Authentik using access token
 * @param {string} accessToken - Access token
 * @returns {Promise<Object>} - User info
 */
export async function getUserInfo(accessToken) {
  const baseUrl = getBaseUrl();
  const userinfoEndpoint = `${baseUrl}/application/o/userinfo/`;

  const response = await fetch(userinfoEndpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get user info: ${response.status}`);
  }

  return response.json();
}

/**
 * Create a session cookie for the user
 * @param {Object} userInfo - User information from Authentik
 * @param {string} localUserId - Optional local user ID to include
 * @returns {string} - Serialized cookie
 */
export function createSessionCookie(userInfo, localUserId = null) {
  const token = createSessionToken(userInfo, localUserId);

  return serialize("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 60 * 60 * 24, // 24 hours
    path: "/",
  });
}

/**
 * Create logout cookie (clears session)
 * @returns {string} - Serialized logout cookie
 */
export function createLogoutCookie() {
  return serialize("session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 0,
    path: "/",
  });
}

/**
 * Create a session JWT token
 * @param {Object} userInfo - User information
 * @param {string} localUserId - Optional local user ID
 * @returns {Promise<string>} - JWT token
 */
export async function createSessionToken(userInfo, localUserId = null) {
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    ...userInfo,
    sessionId: crypto.randomUUID(),
    createdAt: now * 1000,
  };

  // Add local user ID if provided
  if (localUserId) {
    payload.user_id = localUserId;
  }

  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + 24 * 60 * 60) // 24 hours
    .sign(secret);
}

/**
 * Verify and decode session token
 * @param {string} token - Session JWT
 * @returns {Promise<Object|null>} - Decoded token or null if invalid
 */
export async function verifySessionToken(token) {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch (error) {
    console.error("❌ AUTH DEBUG: Session token verification failed:", error.message);
    return null;
  }
}

/**
 * Get session from cookie header
 * @param {string} cookieHeader - Cookie header string
 * @returns {Promise<Object|null>} - User session or null
 */
export async function getSession(cookieHeader) {
  if (!cookieHeader) {
    return null;
  }

  const cookies = parse(cookieHeader);
  const sessionToken = cookies.session;

  if (!sessionToken) {
    return null;
  }

  // First try to verify as JWT (Authentik session)
  const jwtUser = await verifySessionToken(sessionToken);
  if (jwtUser) {
    return jwtUser;
  }

  // If JWT fails, try basic auth token
  try {
    const { verifyBasicAuthToken } = await import("./basicAuth.js");
    const basicUser = verifyBasicAuthToken(sessionToken);
    if (basicUser) {
      return basicUser;
    }
  } catch (error) {
    console.error(`❌ AUTH DEBUG: Error during basic auth verification:`, error);
  }

  return null;
}

/**
 * Check if user is authenticated
 * @param {Request} request - Request object with cookies
 * @returns {Promise<Object|null>} - User object or null
 */
export async function requireAuth(request) {
  const cookieHeader = request.headers.get("cookie");
  return await getSession(cookieHeader);
}

/**
 * Get authenticated user from request (handles multiple auth types)
 * @param {Object} cookies - Cookies object
 * @returns {Promise<Object|null>} - User object or null
 */
export async function getAuthenticatedUser(cookies) {
  const sessionCookie = cookies.get("session");

  if (!sessionCookie) {
    return null;
  }

  // First try to verify as JWT (Authentik/OIDC session)
  try {
    const jwtUser = await verifySessionToken(sessionCookie);
    if (jwtUser) {
      return jwtUser;
    }
  } catch (error) {
    console.error("JWT verification failed:", error);
  }

  // If JWT fails, try basic auth token
  try {
    const { verifyBasicAuthToken } = await import("./basicAuth.js");
    const basicUser = verifyBasicAuthToken(sessionCookie);
    if (basicUser) {
      return basicUser;
    }
  } catch (error) {
    console.error("Basic auth verification failed:", error);
  }

  return null;
}

/**
 * Check if setup is required (no admins exist)
 * @returns {Promise<boolean>} - Whether setup is required
 */
export async function isSetupRequired() {
  try {
    const { query } = await import("./database.js");
    const result = await query(`
      SELECT COUNT(*) as admin_count 
      FROM users 
      WHERE role = 'admin'
    `);

    return parseInt(result.rows[0].admin_count) === 0;
  } catch (error) {
    console.error("Error checking setup status:", error);
    return true; // If we can't check, assume setup is required
  }
}

/**
 * Revoke/logout current session
 * @param {Object} cookies - Cookies object
 * @returns {Promise<void>}
 */
export async function revokeSession(cookies) {
  // For now, we just clear the session cookie
  // In the future, we could maintain a revoked tokens list
  cookies.delete("session", { path: "/" });
}

/**
 * Clear session cookie helper (for logout)
 * @param {Object} sessionStatus - Object with session status flags
 * @returns {void}
 */
export function clearSessionCookie(sessionStatus) {
  // This is a helper function that doesn't directly interact with cookies
  // The actual cookie clearing is handled by the calling function
  // This function can be used for any cleanup logic needed during logout

  if (sessionStatus?.session) {
    console.log("Clearing JWT session");
  }

  if (sessionStatus?.basic_auth_session) {
    console.log("Clearing basic auth session");
  }
}