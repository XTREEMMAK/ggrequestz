/**
 * Client-safe authentication utilities
 * These functions work safely in both server and client environments
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
 * Get user display name (client-side)
 * @param {Object} user - User object from page data
 * @returns {string} - Display name
 */
export function getUserDisplayName(user) {
  return user?.name || user?.preferred_username || user?.email || "User";
}

/**
 * Get user initials for avatar (client-side)
 * @param {Object} user - User object from page data
 * @returns {string} - User initials
 */
export function getUserInitials(user) {
  const name = getUserDisplayName(user);
  return name.charAt(0).toUpperCase();
}

/**
 * Check if user has specific role (client-side)
 * @param {Object} user - User object from page data
 * @param {string} role - Role to check for
 * @returns {boolean} - Whether user has the role
 */
export function hasRole(user, role) {
  if (!user) return false;
  return user.role === role || user.roles?.includes(role);
}

/**
 * Check if user is admin (client-side)
 * @param {Object} user - User object from page data
 * @returns {boolean} - Whether user is admin
 */
export function isAdmin(user) {
  return hasRole(user, "admin");
}

/**
 * Check if user is moderator or admin (client-side)
 * @param {Object} user - User object from page data
 * @returns {boolean} - Whether user is moderator or admin
 */
export function isModerator(user) {
  return hasRole(user, "moderator") || isAdmin(user);
}

/**
 * Navigate to login page (client-safe)
 * @returns {string} - Login URL
 */
export function getLoginUrl() {
  return "/api/auth/login";
}

/**
 * Navigate to logout page (client-safe)
 * @returns {string} - Logout URL
 */
export function getLogoutUrl() {
  return "/api/auth/logout";
}