/**
 * Authentication helper functions for handling multiple auth types
 */

import { verifySessionToken } from './auth.js';
import { getBasicAuthUser } from './basicAuth.js';

/**
 * Get authenticated user from any session type
 * @param {object} cookies - SvelteKit cookies object
 * @returns {Promise<object|null>} - User object or null if not authenticated
 */
export async function getAuthenticatedUser(cookies) {
  let user = null;
  
  // Try Authentik session first
  const sessionCookie = cookies.get("session");
  if (sessionCookie) {
    user = await verifySessionToken(sessionCookie);
    if (user) {
      user.auth_type = 'authentik';
      // Use email as consistent user ID for database operations
      user.user_id = user.email || user.sub;
      return user;
    }
  }
  
  // Try basic auth session if Authentik session not found
  const basicAuthSession = cookies.get("basic_auth_session");
  if (basicAuthSession) {
    user = getBasicAuthUser(basicAuthSession);
    if (user) {
      user.auth_type = 'basic';
      // Use email as consistent user ID for database operations  
      user.user_id = user.email;
      return user;
    }
  }
  
  return null;
}

/**
 * Require authentication middleware
 * Returns user if authenticated, returns null if not
 * @param {object} cookies - SvelteKit cookies object
 * @returns {Promise<object|null>} - Authenticated user object or null
 */
export async function requireAuth(cookies) {
  return await getAuthenticatedUser(cookies);
}