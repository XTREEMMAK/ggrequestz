/**
 * Global Content Filter Service
 * Manages system-wide content filtering that supersedes user preferences
 */

import { browser } from "$app/environment";
import { query } from "$lib/database.js";
import { withCache, invalidateCache } from "$lib/cache.js";

/**
 * Default global filter settings
 */
export const DEFAULT_GLOBAL_FILTERS = {
  enabled: false,
  max_esrb_rating: null,
  hide_mature_content: false,
  hide_nsfw_content: false,
  custom_content_blocks: [],
  excluded_genres: [],
  banned_games: [], // Array of IGDB IDs to ban globally
};

/**
 * Get global content filters from system settings
 * @returns {Promise<Object>} Global filter settings
 */
export async function getGlobalFilters() {
  if (browser) {
    throw new Error("Global filters cannot be retrieved in browser");
  }

  try {
    // Use caching to avoid repeated database queries
    return await withCache(
      "global-content-filters",
      async () => {
        // Fetch all content filter settings
        const result = await query(
          `
          SELECT key, value FROM ggr_system_settings
          WHERE category = 'content' AND key LIKE 'content.global%'
          ORDER BY key
        `,
        );

        // Parse settings into structured object
        const filters = { ...DEFAULT_GLOBAL_FILTERS };

        for (const row of result.rows) {
          const key = row.key.replace("content.global_", "");
          const value = row.value;

          switch (key) {
            case "filter_enabled":
              filters.enabled = value === "true";
              break;

            case "max_esrb_rating":
              filters.max_esrb_rating =
                value === "null" || !value ? null : value;
              break;

            case "hide_mature":
              filters.hide_mature_content = value === "true";
              break;

            case "hide_nsfw":
              filters.hide_nsfw_content = value === "true";
              break;

            case "custom_blocks":
              try {
                filters.custom_content_blocks = JSON.parse(value);
              } catch (e) {
                console.warn("Failed to parse global custom blocks:", e);
                filters.custom_content_blocks = [];
              }
              break;

            case "excluded_genres":
              try {
                filters.excluded_genres = JSON.parse(value);
              } catch (e) {
                console.warn("Failed to parse global excluded genres:", e);
                filters.excluded_genres = [];
              }
              break;

            case "banned_games":
              try {
                filters.banned_games = JSON.parse(value);
              } catch (e) {
                console.warn("Failed to parse global banned games:", e);
                filters.banned_games = [];
              }
              break;
          }
        }

        console.log("✅ Loaded global filters from DB:", filters);
        return filters;
      },
      5 * 60 * 1000, // 5 minute cache
    );
  } catch (error) {
    console.error("Error getting global filters:", error);
    return DEFAULT_GLOBAL_FILTERS;
  }
}

/**
 * Save global content filters to system settings
 * @param {Object} filters - Global filter settings to save
 * @param {number|null} userId - Optional user ID for tracking who made the change
 * @returns {Promise<boolean>} Success status
 */
export async function saveGlobalFilters(filters, userId = null) {
  if (browser) {
    throw new Error("Global filters cannot be saved in browser");
  }

  try {
    console.log(`💾 Saving global filters, userId: ${userId}`);

    // Validate and save each setting with descriptions
    const settings = [
      {
        key: "content.global_filter_enabled",
        value: filters.enabled ? "true" : "false",
        description:
          "Enable global content filtering (supersedes user preferences)",
      },
      {
        key: "content.global_max_esrb_rating",
        value: filters.max_esrb_rating || "null",
        description:
          "Maximum ESRB rating allowed globally (EC, E, E10+, T, M, AO, or null for no limit)",
      },
      {
        key: "content.global_hide_mature",
        value: filters.hide_mature_content ? "true" : "false",
        description: "Globally hide mature content",
      },
      {
        key: "content.global_hide_nsfw",
        value: filters.hide_nsfw_content ? "true" : "false",
        description: "Globally hide NSFW content",
      },
      {
        key: "content.global_custom_blocks",
        value: JSON.stringify(filters.custom_content_blocks || []),
        description:
          "Global list of custom content keywords to block (JSON array)",
      },
      {
        key: "content.global_excluded_genres",
        value: JSON.stringify(filters.excluded_genres || []),
        description: "Globally excluded genres (JSON array)",
      },
      {
        key: "content.global_banned_games",
        value: JSON.stringify(filters.banned_games || []),
        description: "List of banned game IGDB IDs (JSON array)",
      },
    ];

    // Update all settings (using UPSERT to handle missing rows)
    for (const setting of settings) {
      const params = userId
        ? [setting.key, setting.value, setting.description, userId]
        : [setting.key, setting.value, setting.description];

      const sql = userId
        ? `
        INSERT INTO ggr_system_settings (key, value, category, description, is_sensitive, updated_by, updated_at)
        VALUES ($1, $2, 'content', $3, false, $4, NOW())
        ON CONFLICT (key) DO UPDATE SET
          value = EXCLUDED.value,
          description = EXCLUDED.description,
          updated_by = EXCLUDED.updated_by,
          updated_at = EXCLUDED.updated_at
        RETURNING key, value
      `
        : `
        INSERT INTO ggr_system_settings (key, value, category, description, is_sensitive, updated_at)
        VALUES ($1, $2, 'content', $3, false, NOW())
        ON CONFLICT (key) DO UPDATE SET
          value = EXCLUDED.value,
          description = EXCLUDED.description,
          updated_at = EXCLUDED.updated_at
        RETURNING key, value
      `;

      const result = await query(sql, params);
      console.log(
        `✅ Saved setting: ${result.rows[0].key} = ${result.rows[0].value}`,
      );
    }

    // Invalidate all relevant caches
    await Promise.all([
      invalidateCache("global-content-filters"),
      invalidateCache("popular-games"),
      invalidateCache("recent-games"),
      // Invalidate all user-specific caches since global filters affect everyone
      query(`
        SELECT DISTINCT user_id FROM ggr_user_preferences
      `).then(async (result) => {
        for (const row of result.rows) {
          await invalidateCache(`popular-games-filtered-${row.user_id}`);
          await invalidateCache(`recent-games-filtered-${row.user_id}`);
        }
      }),
    ]);

    console.log("✅ Saved global content filters");
    return true;
  } catch (error) {
    console.error("Error saving global filters:", error);
    return false;
  }
}

/**
 * Check if global filtering is enabled
 * @returns {Promise<boolean>} True if global filtering is enabled
 */
export async function isGlobalFilteringEnabled() {
  const filters = await getGlobalFilters();
  return filters.enabled;
}

/**
 * Merge global filters with user preferences
 * Global filters take precedence - user can only be MORE restrictive, not less
 * @param {Object} userPreferences - User's content preferences
 * @param {Object} globalFilters - Global filter settings
 * @returns {Object} Merged preferences with global filters enforced
 */
export function mergeFiltersWithGlobal(userPreferences, globalFilters) {
  // If global filtering is disabled, return user preferences as-is
  if (!globalFilters || !globalFilters.enabled) {
    return userPreferences || {};
  }

  const merged = { ...(userPreferences || {}) };

  // Global ESRB rating limit (use most restrictive)
  if (globalFilters.max_esrb_rating) {
    const ESRB_LEVELS = { EC: 1, E: 2, "E10+": 3, T: 4, M: 5, AO: 6 };
    const globalLevel = ESRB_LEVELS[globalFilters.max_esrb_rating] || 999;
    const userLevel = ESRB_LEVELS[merged.max_esrb_rating] || 999;

    // Use the more restrictive rating
    merged.max_esrb_rating =
      globalLevel < userLevel
        ? globalFilters.max_esrb_rating
        : merged.max_esrb_rating || globalFilters.max_esrb_rating;
  }

  // Global mature content filters (OR logic - if either is true, hide it)
  merged.hide_mature_content =
    globalFilters.hide_mature_content || merged.hide_mature_content || false;
  merged.hide_nsfw_content =
    globalFilters.hide_nsfw_content || merged.hide_nsfw_content || false;

  // Global custom content blocks (merge both lists)
  const userBlocks = Array.isArray(merged.custom_content_blocks)
    ? merged.custom_content_blocks
    : [];
  const globalBlocks = Array.isArray(globalFilters.custom_content_blocks)
    ? globalFilters.custom_content_blocks
    : [];
  merged.custom_content_blocks = [...new Set([...userBlocks, ...globalBlocks])];

  // Global excluded genres (merge both lists)
  const userExcluded = Array.isArray(merged.excluded_genres)
    ? merged.excluded_genres
    : [];
  const globalExcluded = Array.isArray(globalFilters.excluded_genres)
    ? globalFilters.excluded_genres
    : [];
  merged.excluded_genres = [...new Set([...userExcluded, ...globalExcluded])];

  // Global banned games (always enforced - no user override)
  merged.banned_games = Array.isArray(globalFilters.banned_games)
    ? globalFilters.banned_games
    : [];

  return merged;
}

/**
 * Get a summary of active global filters for display
 * @returns {Promise<Object>} Summary object
 */
export async function getGlobalFilterSummary() {
  const filters = await getGlobalFilters();

  if (!filters.enabled) {
    return {
      enabled: false,
      summary: "No global content filtering active",
      filters: [],
    };
  }

  const activeFilters = [];

  if (filters.max_esrb_rating) {
    activeFilters.push(`Max rating: ${filters.max_esrb_rating}`);
  }

  if (filters.hide_mature_content) {
    activeFilters.push("Mature content hidden");
  }

  if (filters.hide_nsfw_content) {
    activeFilters.push("NSFW content hidden");
  }

  if (
    filters.custom_content_blocks &&
    filters.custom_content_blocks.length > 0
  ) {
    activeFilters.push(
      `${filters.custom_content_blocks.length} blocked keywords`,
    );
  }

  if (filters.excluded_genres && filters.excluded_genres.length > 0) {
    activeFilters.push(`${filters.excluded_genres.length} excluded genres`);
  }

  if (filters.banned_games && filters.banned_games.length > 0) {
    activeFilters.push(`${filters.banned_games.length} banned games`);
  }

  return {
    enabled: true,
    summary:
      activeFilters.length > 0
        ? activeFilters.join(", ")
        : "Global filtering enabled (no restrictions)",
    filters: activeFilters,
  };
}

/**
 * Filter games array to remove globally banned games
 * @param {Array} games - Array of game objects
 * @param {Object} globalFilters - Global filter settings
 * @returns {Array} Filtered games array
 */
export function filterBannedGames(games, globalFilters) {
  if (
    !globalFilters ||
    !globalFilters.enabled ||
    !globalFilters.banned_games ||
    !Array.isArray(globalFilters.banned_games) ||
    globalFilters.banned_games.length === 0
  ) {
    return games;
  }

  const bannedIds = new Set(
    globalFilters.banned_games.map((id) => parseInt(id)),
  );

  const filtered = games.filter((game) => {
    const gameId = game.igdb_id || game.id;
    const gameIdInt = parseInt(gameId);
    const isBanned = bannedIds.has(gameIdInt);

    if (isBanned) {
      console.log(
        `🚫 Filtered banned game: ${game.title || game.name} (ID: ${gameIdInt})`,
      );
    }
    return !isBanned;
  });

  return filtered;
}
