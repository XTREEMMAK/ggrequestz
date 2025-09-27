/**
 * User Preferences Service
 * Handles user preference CRUD operations and preference management
 */

import { browser } from "$app/environment";
import { query } from "$lib/database.js";

/**
 * Default user preferences
 */
export const DEFAULT_PREFERENCES = {
  content_filter_level: "none",
  hide_mature_content: false,
  hide_nsfw_content: false,
  max_esrb_rating: "M",
  custom_content_blocks: [],
  preferred_genres: [],
  excluded_genres: [],
  apply_to_homepage: false,
  apply_to_popular: false,
  apply_to_recent: false,
  apply_to_search: true,
  show_content_warnings: true,
  safe_mode_enabled: false,
  require_confirmation_for_mature: false,
};

/**
 * Get user preferences from database
 * @param {number} userId - User ID
 * @returns {Promise<Object>} User preferences object
 */
export async function getUserPreferences(userId) {
  if (browser) {
    throw new Error("User preferences cannot be retrieved in browser");
  }

  if (!userId) {
    return DEFAULT_PREFERENCES;
  }

  try {
    const result = await query(
      `
      SELECT * FROM ggr_user_preferences WHERE user_id = $1
    `,
      [userId],
    );

    if (result.rows.length === 0) {
      // No preferences found, create default preferences
      return await createDefaultPreferences(userId);
    }

    const prefs = result.rows[0];
    return {
      content_filter_level: prefs.content_filter_level || "none",
      hide_mature_content: prefs.hide_mature_content || false,
      hide_nsfw_content: prefs.hide_nsfw_content || false,
      max_esrb_rating: prefs.max_esrb_rating || "M",
      custom_content_blocks: prefs.custom_content_blocks || [],
      preferred_genres: prefs.preferred_genres || [],
      excluded_genres: prefs.excluded_genres || [],
      apply_to_homepage: prefs.apply_to_homepage || false,
      apply_to_popular: prefs.apply_to_popular || false,
      apply_to_recent: prefs.apply_to_recent || false,
      apply_to_search: prefs.apply_to_search !== false, // Default to true
      show_content_warnings: prefs.show_content_warnings !== false, // Default to true
      safe_mode_enabled: prefs.safe_mode_enabled || false,
      require_confirmation_for_mature:
        prefs.require_confirmation_for_mature || false,
      created_at: prefs.created_at,
      updated_at: prefs.updated_at,
    };
  } catch (error) {
    console.error("Error getting user preferences:", error);
    return DEFAULT_PREFERENCES;
  }
}

/**
 * Save user preferences to database
 * @param {number} userId - User ID
 * @param {Object} preferences - Preferences object
 * @returns {Promise<boolean>} Success status
 */
export async function saveUserPreferences(userId, preferences) {
  if (browser) {
    throw new Error("User preferences cannot be saved in browser");
  }

  if (!userId) {
    throw new Error("User ID is required");
  }

  try {
    await query(
      `
      INSERT INTO ggr_user_preferences (
        user_id, content_filter_level, hide_mature_content, hide_nsfw_content,
        max_esrb_rating, custom_content_blocks, preferred_genres, excluded_genres,
        apply_to_homepage, apply_to_popular, apply_to_recent, apply_to_search,
        show_content_warnings, safe_mode_enabled, require_confirmation_for_mature,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW()
      )
      ON CONFLICT (user_id) DO UPDATE SET
        content_filter_level = EXCLUDED.content_filter_level,
        hide_mature_content = EXCLUDED.hide_mature_content,
        hide_nsfw_content = EXCLUDED.hide_nsfw_content,
        max_esrb_rating = EXCLUDED.max_esrb_rating,
        custom_content_blocks = EXCLUDED.custom_content_blocks,
        preferred_genres = EXCLUDED.preferred_genres,
        excluded_genres = EXCLUDED.excluded_genres,
        apply_to_homepage = EXCLUDED.apply_to_homepage,
        apply_to_popular = EXCLUDED.apply_to_popular,
        apply_to_recent = EXCLUDED.apply_to_recent,
        apply_to_search = EXCLUDED.apply_to_search,
        show_content_warnings = EXCLUDED.show_content_warnings,
        safe_mode_enabled = EXCLUDED.safe_mode_enabled,
        require_confirmation_for_mature = EXCLUDED.require_confirmation_for_mature,
        updated_at = NOW()
    `,
      [
        userId,
        preferences.content_filter_level || "none",
        preferences.hide_mature_content || false,
        preferences.hide_nsfw_content || false,
        preferences.max_esrb_rating || "M",
        JSON.stringify(preferences.custom_content_blocks || []),
        JSON.stringify(preferences.preferred_genres || []),
        JSON.stringify(preferences.excluded_genres || []),
        preferences.apply_to_homepage || false,
        preferences.apply_to_popular || false,
        preferences.apply_to_recent || false,
        preferences.apply_to_search !== false, // Default to true
        preferences.show_content_warnings !== false, // Default to true
        preferences.safe_mode_enabled || false,
        preferences.require_confirmation_for_mature || false,
      ],
    );

    console.log(`✅ Saved preferences for user ${userId}`);
    return true;
  } catch (error) {
    console.error("Error saving user preferences:", error);
    return false;
  }
}

/**
 * Create default preferences for a new user
 * @param {number} userId - User ID
 * @returns {Promise<Object>} Default preferences object
 */
async function createDefaultPreferences(userId) {
  try {
    await saveUserPreferences(userId, DEFAULT_PREFERENCES);
    console.log(`✅ Created default preferences for user ${userId}`);
    return DEFAULT_PREFERENCES;
  } catch (error) {
    console.error("Error creating default preferences:", error);
    return DEFAULT_PREFERENCES;
  }
}

/**
 * Update specific preference setting
 * @param {number} userId - User ID
 * @param {string} key - Preference key
 * @param {any} value - Preference value
 * @returns {Promise<boolean>} Success status
 */
export async function updatePreference(userId, key, value) {
  if (browser) {
    throw new Error("User preferences cannot be updated in browser");
  }

  try {
    const currentPrefs = await getUserPreferences(userId);
    currentPrefs[key] = value;
    return await saveUserPreferences(userId, currentPrefs);
  } catch (error) {
    console.error("Error updating preference:", error);
    return false;
  }
}

/**
 * Reset user preferences to defaults
 * @param {number} userId - User ID
 * @returns {Promise<boolean>} Success status
 */
export async function resetUserPreferences(userId) {
  if (browser) {
    throw new Error("User preferences cannot be reset in browser");
  }

  try {
    await query("DELETE FROM ggr_user_preferences WHERE user_id = $1", [
      userId,
    ]);
    await createDefaultPreferences(userId);
    console.log(`✅ Reset preferences for user ${userId}`);
    return true;
  } catch (error) {
    console.error("Error resetting user preferences:", error);
    return false;
  }
}

/**
 * Check if user has content filtering enabled
 * @param {Object} preferences - User preferences
 * @returns {boolean} True if any content filtering is enabled
 */
export function hasContentFiltering(preferences) {
  if (!preferences) return false;

  return (
    preferences.content_filter_level !== "none" ||
    preferences.hide_mature_content ||
    preferences.hide_nsfw_content ||
    preferences.max_esrb_rating !== "AO" ||
    (preferences.custom_content_blocks &&
      preferences.custom_content_blocks.length > 0)
  );
}

/**
 * Check if user has genre filtering enabled
 * @param {Object} preferences - User preferences
 * @returns {boolean} True if genre filtering is enabled
 */
export function hasGenreFiltering(preferences) {
  if (!preferences) return false;

  return (
    (preferences.preferred_genres && preferences.preferred_genres.length > 0) ||
    (preferences.excluded_genres && preferences.excluded_genres.length > 0)
  );
}

/**
 * Get preference summary for display
 * @param {Object} preferences - User preferences
 * @returns {Object} Preference summary
 */
export function getPreferenceSummary(preferences) {
  if (!preferences) {
    return {
      contentFiltering: false,
      genreFiltering: false,
      homepageFiltering: false,
      description: "No filters applied",
    };
  }

  const contentFiltering = hasContentFiltering(preferences);
  const genreFiltering = hasGenreFiltering(preferences);
  const homepageFiltering =
    preferences.apply_to_homepage ||
    preferences.apply_to_popular ||
    preferences.apply_to_recent;

  let description = "No filters applied";
  const filters = [];

  if (contentFiltering) {
    if (preferences.max_esrb_rating !== "AO") {
      filters.push(`Max rating: ${preferences.max_esrb_rating}`);
    }
    if (preferences.hide_mature_content) {
      filters.push("Hide mature content");
    }
    if (preferences.hide_nsfw_content) {
      filters.push("Hide NSFW content");
    }
  }

  if (genreFiltering) {
    if (
      preferences.preferred_genres &&
      preferences.preferred_genres.length > 0
    ) {
      filters.push(`Preferred: ${preferences.preferred_genres.join(", ")}`);
    }
    if (preferences.excluded_genres && preferences.excluded_genres.length > 0) {
      filters.push(`Excluded: ${preferences.excluded_genres.join(", ")}`);
    }
  }

  if (filters.length > 0) {
    description = filters.join(" | ");
  }

  return {
    contentFiltering,
    genreFiltering,
    homepageFiltering,
    description,
  };
}

/**
 * Log preference change for analytics
 * @param {number} userId - User ID
 * @param {string} action - Action taken
 * @param {Object} metadata - Additional metadata
 */
export async function logPreferenceChange(userId, action, metadata = {}) {
  if (browser) return;

  try {
    await query(
      `
      INSERT INTO ggr_user_filter_history (user_id, action, metadata)
      VALUES ($1, $2, $3)
    `,
      [userId, action, JSON.stringify(metadata)],
    );
  } catch (error) {
    console.warn("Failed to log preference change:", error);
    // Don't throw error - logging is not critical
  }
}

/**
 * Get preference usage statistics
 * @param {number} userId - User ID (optional, for user-specific stats)
 * @returns {Promise<Object>} Preference statistics
 */
export async function getPreferenceStats(userId = null) {
  if (browser) {
    throw new Error("Preference stats cannot be retrieved in browser");
  }

  try {
    const whereClause = userId ? "WHERE user_id = $1" : "";
    const params = userId ? [userId] : [];

    const result = await query(
      `
      SELECT
        COUNT(*) as total_users,
        COUNT(CASE WHEN content_filter_level != 'none' THEN 1 END) as content_filter_users,
        COUNT(CASE WHEN apply_to_homepage = true THEN 1 END) as homepage_filter_users,
        COUNT(CASE WHEN preferred_genres != '[]' THEN 1 END) as genre_preference_users,
        COUNT(CASE WHEN hide_mature_content = true THEN 1 END) as mature_filter_users
      FROM ggr_user_preferences
      ${whereClause}
    `,
      params,
    );

    return (
      result.rows[0] || {
        total_users: 0,
        content_filter_users: 0,
        homepage_filter_users: 0,
        genre_preference_users: 0,
        mature_filter_users: 0,
      }
    );
  } catch (error) {
    console.error("Error getting preference stats:", error);
    return {
      total_users: 0,
      content_filter_users: 0,
      homepage_filter_users: 0,
      genre_preference_users: 0,
      mature_filter_users: 0,
    };
  }
}
