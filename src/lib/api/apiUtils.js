/**
 * Common utilities for API endpoints
 * Consolidates duplicated logic for pagination, user preferences, and error handling
 */

import { error } from "@sveltejs/kit";
import { getUserPreferences } from "$lib/userPreferences.js";
import {
  getGlobalFilters,
  mergeFiltersWithGlobal,
} from "$lib/globalFilters.js";

/**
 * Parse pagination parameters from URL search params
 * @param {URLSearchParams} searchParams - URL search parameters
 * @returns {Object} Parsed pagination parameters
 */
export function parsePaginationParams(searchParams) {
  const page = parseInt(searchParams.get("page")) || 1;
  const limit = parseInt(searchParams.get("limit")) || 12;
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

/**
 * Load user preferences with optional filtering check and merge with global filters
 * @param {string|null} userId - User ID from search params
 * @param {string} filterType - Type of filter to check (e.g., 'apply_to_popular', 'apply_to_recent')
 * @returns {Promise<Object|null>} User preferences merged with global filters, or null
 */
export async function loadUserPreferences(userId, filterType) {
  try {
    // Always load global filters
    const globalFilters = await getGlobalFilters();

    // Load user preferences if userId provided
    let userPreferences = null;
    if (userId) {
      userPreferences = await getUserPreferences(parseInt(userId));

      // Check if user wants to apply filtering to this type of content
      // Also check for apply_to_homepage which acts as a master switch for all homepage sections
      if (
        filterType &&
        !userPreferences[filterType] &&
        !userPreferences.apply_to_homepage
      ) {
        userPreferences = null;
      }
    }

    // Merge global filters with user preferences
    // Global filters take precedence
    const mergedPreferences = mergeFiltersWithGlobal(
      userPreferences,
      globalFilters,
    );

    // If global filtering is disabled and user has no preferences, return null
    if (!globalFilters.enabled && !userPreferences) {
      return null;
    }

    return mergedPreferences;
  } catch (error) {
    console.warn("Failed to load user preferences:", error);
    // Continue without preferences rather than failing
    return null;
  }
}

/**
 * Standardized error handler for API endpoints
 * @param {Error} err - The error to handle
 * @param {string} message - Custom error message
 * @param {string} logPrefix - Prefix for console logging
 */
export function handleApiError(err, message, logPrefix) {
  console.error(`${logPrefix}:`, err);
  throw error(500, message);
}

/**
 * Build standard API response with pagination metadata
 * @param {Array} items - Array of items to return
 * @param {number} page - Current page number
 * @param {number} limit - Items per page
 * @returns {Object} Formatted API response
 */
export function buildPaginatedResponse(items, page, limit) {
  return {
    success: true,
    [Array.isArray(items) && items.length > 0 && items[0].title
      ? "games"
      : "items"]: items,
    page,
    limit,
    hasMore: items.length === limit,
  };
}

/**
 * Check for browser environment and throw error if detected
 * @param {string} functionName - Name of the function being guarded
 */
export function guardAgainstBrowser(functionName) {
  if (typeof window !== "undefined") {
    throw new Error(
      `${functionName} cannot be used in browser - use API routes instead`,
    );
  }
}
