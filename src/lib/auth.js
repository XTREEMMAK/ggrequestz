/**
 * Authentik OIDC authentication utilities
 */

import { SignJWT, jwtVerify } from "jose";
import { serialize, parse } from "cookie";
import crypto from "crypto";
import { env } from "$env/dynamic/private";

// Use dynamic environment variables for runtime configuration
const AUTHENTIK_CLIENT_ID = env.AUTHENTIK_CLIENT_ID || process.env.AUTHENTIK_CLIENT_ID;
const AUTHENTIK_CLIENT_SECRET = env.AUTHENTIK_CLIENT_SECRET || process.env.AUTHENTIK_CLIENT_SECRET;
const AUTHENTIK_ISSUER = env.AUTHENTIK_ISSUER || process.env.AUTHENTIK_ISSUER;
const SESSION_SECRET = env.SESSION_SECRET || process.env.SESSION_SECRET;

// Validate required environment variables
function validateEnvironment() {
  const required = {
    AUTHENTIK_CLIENT_ID,
    AUTHENTIK_CLIENT_SECRET,
    AUTHENTIK_ISSUER,
    SESSION_SECRET,
  };

  for (const [key, value] of Object.entries(required)) {
    if (!value) {
      console.error(`❌ Missing required environment variable: ${key}`);
      return false;
    }
  }

  // Validate AUTHENTIK_ISSUER format
  if (!AUTHENTIK_ISSUER.startsWith("https://")) {
    console.error(
      `❌ AUTHENTIK_ISSUER must start with https://. Got: ${AUTHENTIK_ISSUER}`,
    );
    return false;
  }

  if (AUTHENTIK_ISSUER.endsWith("/")) {
    console.error(
      `❌ AUTHENTIK_ISSUER should not end with /. Got: ${AUTHENTIK_ISSUER}`,
    );
    return false;
  }

  if (process.env.NODE_ENV === 'development') {
  }

  return true;
}

// Validate on module load
const isEnvironmentValid = validateEnvironment();

// Extract base URL from AUTHENTIK_ISSUER
function getBaseUrl() {
  if (!AUTHENTIK_ISSUER) return "";
  // Remove /application/o/slug from the end to get base URL
  return AUTHENTIK_ISSUER.replace(/\/application\/o\/[^/]+$/, "");
}

const secret = new TextEncoder().encode(
  SESSION_SECRET || "fallback-secret-key",
);

/**
 * Generate OIDC authorization URL
 * @param {string} redirectUri - Redirect URI after authentication
 * @param {string} state - State parameter for security
 * @returns {string} - Authorization URL
 */
export function getAuthorizationUrl(redirectUri, state) {
  if (!isEnvironmentValid) {
    throw new Error(
      "Authentication environment variables are not properly configured",
    );
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: AUTHENTIK_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: "openid profile email",
    state: state,
  });

  // Authentik authorization endpoint format: /application/o/authorize/ (no slug in path)
  const baseUrl = getBaseUrl();
  const authUrl = `${baseUrl}/application/o/authorize/?${params.toString()}`;
  if (process.env.NODE_ENV === 'development') {
  }

  return authUrl;
}

/**
 * Exchange authorization code for tokens
 * @param {string} code - Authorization code
 * @param {string} redirectUri - Redirect URI
 * @returns {Promise<Object>} - Token response
 */
export async function exchangeCodeForTokens(code, redirectUri) {
  // Authentik token endpoint format: /application/o/token/ (no slug in path)
  const baseUrl = getBaseUrl();
  const tokenEndpoint = `${baseUrl}/application/o/token/`;

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: AUTHENTIK_CLIENT_ID,
    client_secret: AUTHENTIK_CLIENT_SECRET,
    code: code,
    redirect_uri: redirectUri,
  });

  if (process.env.NODE_ENV === 'development') {
  }

  try {
    const response = await fetch(tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const responseText = await response.text();
    if (process.env.NODE_ENV === 'development') {
    }

    if (!response.ok) {
      console.error(
        `❌ Token exchange failed: ${response.status} ${response.statusText}`,
      );
      console.error(`❌ Response body: ${responseText}`);
      throw new Error(
        `Token exchange failed: ${response.status} ${response.statusText}`,
      );
    }

    const tokens = JSON.parse(responseText);
    if (process.env.NODE_ENV === 'development') {
    }

    return tokens;
  } catch (error) {
    console.error(`❌ Token exchange error:`, error);
    throw error;
  }
}

/**
 * Get user info from access token
 * @param {string} accessToken - Access token
 * @returns {Promise<Object>} - User information
 */
export async function getUserInfo(accessToken) {
  // Authentik userinfo endpoint format: /application/o/userinfo/ (no slug in path)
  const baseUrl = getBaseUrl();
  const userInfoEndpoint = `${baseUrl}/application/o/userinfo/`;

  if (process.env.NODE_ENV === 'development') {
  }

  try {
    const response = await fetch(userInfoEndpoint, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const responseText = await response.text();
    if (process.env.NODE_ENV === 'development') {
    }

    if (!response.ok) {
      console.error(
        `❌ Failed to get user info: ${response.status} ${response.statusText}`,
      );
      console.error(`❌ Response body: ${responseText}`);
      throw new Error(
        `Failed to get user info: ${response.status} ${response.statusText}`,
      );
    }

    const userInfo = JSON.parse(responseText);
    if (process.env.NODE_ENV === 'development') {
    }

    return userInfo;
  } catch (error) {
    console.error(`❌ UserInfo error:`, error);
    throw error;
  }
}

/**
 * Create a session token (JWT) with enhanced security
 * @param {Object} user - User information from Authentik
 * @param {string} accessToken - Access token from Authentik
 * @param {number} localUserId - Local user ID from database
 * @returns {Promise<string>} - Session JWT
 */
export async function createSessionToken(
  user,
  accessToken,
  localUserId = null
) {
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    sub: user.sub,
    name: user.name,
    email: user.email,
    preferred_username: user.preferred_username,
    access_token: accessToken,
    sessionId: crypto.randomUUID(),
    createdAt: now * 1000
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
    console.error("❌ AUTH DEBUG: Token details:", {
      tokenStart: token.substring(0, 30),
      tokenLength: token.length,
      secretLength: SESSION_SECRET?.length,
      error: error.code || error.name || 'Unknown error'
    });
    return null;
  }
}

/**
 * Create session cookie
 * @param {string} token - Session token
 * @returns {string} - Cookie string
 */
export function createSessionCookie(token) {
  return serialize("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 24 * 60 * 60, // 24 hours
    path: "/",
  });
}

/**
 * Clear session cookie
 * @returns {string} - Cookie string to clear session
 */
export function clearSessionCookie() {
  return serialize("session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}

/**
 * Get session from request cookies
 * @param {string} cookieHeader - Cookie header value
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
    const { verifyBasicAuthToken } = await import('./basicAuth.js');
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
