/**
 * JWT Utilities
 * Centralized JWT operations with caching and performance optimizations
 */

import { SignJWT, jwtVerify } from 'jose';

// Cache for JWT secrets to avoid repeated TextEncoder operations
const secretCache = new Map();

/**
 * Get or create cached JWT secret
 * @param {string} secretKey - The secret key string
 * @returns {Uint8Array} - Encoded secret
 */
function getSecret(secretKey = null) {
  const key = secretKey || process.env.SESSION_SECRET || 'fallback-secret-key';
  
  if (!secretCache.has(key)) {
    secretCache.set(key, new TextEncoder().encode(key));
  }
  
  return secretCache.get(key);
}

/**
 * Create JWT with standardized payload structure
 * @param {Object} payload - JWT payload
 * @param {Object} options - JWT options
 * @returns {Promise<string>} - JWT token
 */
export async function createJWT(payload, options = {}) {
  const {
    expiresIn = 24 * 60 * 60, // 24 hours default
    issuer = 'gamerequest',
    secretKey = null
  } = options;
  
  const now = Math.floor(Date.now() / 1000);
  const secret = getSecret(secretKey);

  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(issuer)
    .setIssuedAt(now)
    .setExpirationTime(now + expiresIn)
    .sign(secret);
}

/**
 * Verify and decode JWT
 * @param {string} token - JWT token
 * @param {Object} options - Verification options
 * @returns {Promise<Object|null>} - Decoded payload or null
 */
export async function verifyJWT(token, options = {}) {
  const { secretKey = null } = options;
  
  try {
    const secret = getSecret(secretKey);
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch (error) {
    console.error('JWT verification failed:', error.message);
    return null;
  }
}

/**
 * Create session token with user data
 * @param {Object} user - User information
 * @param {Object} options - Additional options
 * @returns {Promise<string>} - Session JWT
 */
export async function createSessionToken(user, options = {}) {
  const {
    provider = 'unknown',
    localUserId = null,
    externalToken = null,
    customClaims = {}
  } = options;

  const payload = {
    sub: user.sub || user.id,
    user_id: localUserId || user.id,
    email: user.email,
    name: user.name || user.preferred_username,
    provider,
    ...customClaims
  };

  // Add external token if provided (for API integrations)
  if (externalToken) {
    payload.external_token = externalToken;
  }

  // Add admin flag if present
  if (user.is_admin !== undefined) {
    payload.is_admin = user.is_admin;
  }

  return await createJWT(payload, options);
}

/**
 * Extract user info from JWT payload
 * @param {Object} payload - JWT payload
 * @returns {Object} - User information
 */
export function extractUserFromPayload(payload) {
  if (!payload) return null;

  return {
    id: payload.user_id || payload.sub,
    email: payload.email,
    name: payload.name,
    provider: payload.provider,
    is_admin: payload.is_admin || false,
    external_id: payload.sub !== payload.user_id ? payload.sub : null,
    external_token: payload.external_token || null
  };
}

/**
 * Check if JWT is expired
 * @param {Object} payload - JWT payload
 * @returns {boolean} - True if expired
 */
export function isTokenExpired(payload) {
  if (!payload || !payload.exp) return true;
  
  const now = Math.floor(Date.now() / 1000);
  return payload.exp <= now;
}

/**
 * Clear JWT secret cache (useful for testing)
 */
export function clearSecretCache() {
  secretCache.clear();
}