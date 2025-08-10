/**
 * Client-side authentication utilities (no server env variables)
 */

/**
 * Check if user is authenticated (client-side)
 * @param {Object} user - User object from page data
 * @returns {boolean} - Whether user is authenticated
 */
export function isAuthenticated(user) {
  return !!(user && user.sub);
}

/**
 * Get user display name
 * @param {Object} user - User object
 * @returns {string} - Display name
 */
export function getUserDisplayName(user) {
  return user?.name || user?.preferred_username || user?.email || "User";
}

/**
 * Get user initials for avatar
 * @param {Object} user - User object
 * @returns {string} - User initials
 */
export function getUserInitials(user) {
  const name = getUserDisplayName(user);
  return name.charAt(0).toUpperCase();
}

/**
 * Navigate to login page
 * @returns {string} - Login URL
 */
export function getLoginUrl() {
  return "/api/auth/login";
}

/**
 * Navigate to logout page
 * @returns {string} - Logout URL
 */
export function getLogoutUrl() {
  return "/api/auth/logout";
}
