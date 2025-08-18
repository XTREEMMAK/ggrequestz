/**
 * Unified database access layer
 * Works in both SvelteKit and Node.js environments
 */

import { browser } from "$app/environment";

// Import environment variables based on context
let POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD;

// Helper function to get fresh environment variables
async function loadEnvironmentVariables() {
  if (browser) {
    // Browser context - this shouldn't happen for database operations
    throw new Error(
      "Database operations cannot be performed in browser context",
    );
  } else {
    // In development, try to load .env file if environment variables aren't available
    if (!process.env.POSTGRES_PASSWORD) {
      try {
        // Use dynamic import for dotenv in ESM context
        const { config } = await import("dotenv");
        config();
      } catch (error) {
        console.warn(
          "⚠️ Could not load dotenv via dynamic import:",
          error.message,
        );
      }
    }

    // Always use process.env directly - most reliable in Docker/server contexts
    const host = process.env.POSTGRES_HOST || "localhost";
    const port = process.env.POSTGRES_PORT || "5432";
    const db = process.env.POSTGRES_DB || "postgres";
    const user = process.env.POSTGRES_USER || "postgres";
    const password = process.env.POSTGRES_PASSWORD;

    return { host, port, db, user, password };
  }
}

// Initialize variables (but we'll reload them fresh in getPool)
// Note: This is now async, so we initialize with defaults and load properly in getPool
POSTGRES_HOST = "localhost";
POSTGRES_PORT = "5432";
POSTGRES_DB = "postgres";
POSTGRES_USER = "postgres";
POSTGRES_PASSWORD = undefined;

// PostgreSQL Pool will be loaded dynamically

let pool;

/**
 * Reset the database pool (for testing/debugging)
 */
export function resetPool() {
  if (pool) {
    pool.end();
  }
  pool = null;
}

/**
 * Get database connection pool
 * @returns {Promise<Object>} - PostgreSQL pool instance
 */
async function getPool() {
  if (browser) {
    throw new Error("Database operations cannot be performed in browser context");
  }
  
  if (!pool) {
    // Dynamically import PostgreSQL module to prevent client-side bundling
    const pkg = await import("pg");
    const { Pool } = pkg.default || pkg;
    
    // Load fresh environment variables every time we create a pool
    const env = await loadEnvironmentVariables();

    if (!env.password) {
      throw new Error(
        "POSTGRES_PASSWORD is required but not defined. Check your .env file.",
      );
    }

    pool = new Pool({
      host: env.host,
      port: parseInt(env.port),
      database: env.db,
      user: env.user,
      password: String(env.password), // Explicitly convert to string
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      // Force IPv4 to avoid IPv6 localhost issues in Docker
      family: 4,
    });

    pool.on("error", (err) => {
      console.error("Unexpected error on idle database client", err);
    });
  }
  return pool;
}

/**
 * Execute a database query with error handling and connection management
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} - Query result
 */
async function query(text, params) {
  const poolInstance = await getPool();
  const client = await poolInstance.connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

/**
 * Helper function to format game data from database rows
 * @param {Array} rows - Database rows
 * @returns {Array} - Formatted game data
 */
function formatGameRows(rows) {
  return rows.map((row) => ({
    ...row,
    platforms: row.platforms || [],
    genres: row.genres || [],
    screenshots: row.screenshots || [],
    videos: row.videos || [],
    companies: row.companies || [],
    game_modes: row.game_modes || [],
  }));
}

/**
 * Games cache operations
 */
export const gamesCache = {
  /**
   * Get game from cache by IGDB ID
   * @param {string} igdbId - IGDB game ID
   * @returns {Promise<Object|null>} - Cached game data or null
   */
  async get(igdbId) {
    try {
      const result = await query(
        "SELECT * FROM ggr_games_cache WHERE igdb_id = $1",
        [igdbId],
      );

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      return {
        ...row,
        // JSONB fields are already parsed
        platforms: row.platforms || [],
        genres: row.genres || [],
        screenshots: row.screenshots || [],
        videos: row.videos || [],
        companies: row.companies || [],
        game_modes: row.game_modes || [],
      };
    } catch (error) {
      console.error("Failed to get cached game:", error);
      return null;
    }
  },

  /**
   * Get popular games from cache
   * @param {number} limit - Number of games to return
   * @returns {Promise<Array>} - Array of popular games
   */
  async getPopular(limit = 20) {
    try {
      const result = await query(
        "SELECT * FROM ggr_games_cache ORDER BY popularity_score DESC, last_updated DESC LIMIT $1",
        [limit],
      );

      return formatGameRows(result.rows);
    } catch (error) {
      console.error("Failed to get popular cached games:", error);
      return [];
    }
  },

  /**
   * Get recent games from cache
   * @param {number} limit - Number of games to return
   * @returns {Promise<Array>} - Array of recent games
   */
  async getRecent(limit = 20) {
    try {
      const result = await query(
        "SELECT * FROM ggr_games_cache WHERE release_date IS NOT NULL ORDER BY release_date DESC, last_updated DESC LIMIT $1",
        [limit],
      );

      return formatGameRows(result.rows);
    } catch (error) {
      console.error("Failed to get recent cached games:", error);
      return [];
    }
  },

  /**
   * Upsert game data into cache
   * @param {Object} gameData - Game data to cache
   * @returns {Promise<boolean>} - Success status
   */
  async upsert(gameData) {
    try {
      const upsertData = {
        igdb_id: gameData.igdb_id,
        title: gameData.title,
        summary: gameData.summary || "",
        cover_url: gameData.cover_url,
        rating: gameData.rating,
        release_date: gameData.release_date
          ? new Date(gameData.release_date).toISOString()
          : null,
        platforms: JSON.stringify(gameData.platforms || []),
        genres: JSON.stringify(gameData.genres || []),
        screenshots: JSON.stringify(gameData.screenshots || []),
        videos: JSON.stringify(gameData.videos || []),
        companies: JSON.stringify(gameData.companies || []),
        game_modes: JSON.stringify(gameData.game_modes || []),
        popularity_score: gameData.popularity_score || 0,
        last_updated: new Date().toISOString(),
        needs_refresh: false,
      };

      const result = await query(
        `
        INSERT INTO ggr_games_cache (
          igdb_id, title, summary, cover_url, rating, release_date,
          platforms, genres, screenshots, videos, companies, game_modes,
          popularity_score, last_updated, needs_refresh
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
        )
        ON CONFLICT (igdb_id) DO UPDATE SET
          title = EXCLUDED.title,
          summary = EXCLUDED.summary,
          cover_url = EXCLUDED.cover_url,
          rating = EXCLUDED.rating,
          release_date = EXCLUDED.release_date,
          platforms = EXCLUDED.platforms,
          genres = EXCLUDED.genres,
          screenshots = EXCLUDED.screenshots,
          videos = EXCLUDED.videos,
          companies = EXCLUDED.companies,
          game_modes = EXCLUDED.game_modes,
          popularity_score = EXCLUDED.popularity_score,
          last_updated = EXCLUDED.last_updated,
          needs_refresh = EXCLUDED.needs_refresh
        RETURNING igdb_id`,
        [
          upsertData.igdb_id,
          upsertData.title,
          upsertData.summary,
          upsertData.cover_url,
          upsertData.rating,
          upsertData.release_date,
          upsertData.platforms,
          upsertData.genres,
          upsertData.screenshots,
          upsertData.videos,
          upsertData.companies,
          upsertData.game_modes,
          upsertData.popularity_score,
          upsertData.last_updated,
          upsertData.needs_refresh,
        ],
      );

      // TODO: Add to search index via API endpoint (non-blocking)

      return result.rows.length > 0;
    } catch (error) {
      console.error("Failed to upsert game cache:", error);
      return false;
    }
  },

  /**
   * Search games in cache
   * @param {string} searchQuery - Search query
   * @param {number} limit - Number of results
   * @returns {Promise<Array>} - Array of matching games
   */
  async search(searchQuery, limit = 20) {
    try {
      const result = await query(
        "SELECT * FROM ggr_games_cache WHERE title ILIKE $1 OR summary ILIKE $1 ORDER BY popularity_score DESC LIMIT $2",
        [`%${searchQuery}%`, limit],
      );

      return formatGameRows(result.rows);
    } catch (error) {
      console.error("Failed to search cached games:", error);
      return [];
    }
  },

  /**
   * Get games that need refresh
   * @param {number} limit - Number of games to return
   * @returns {Promise<Array>} - Array of games needing refresh
   */
  async getNeedingRefresh(limit = 50) {
    try {
      const oneDayAgo = new Date(
        Date.now() - 24 * 60 * 60 * 1000,
      ).toISOString();

      const result = await query(
        "SELECT * FROM ggr_games_cache WHERE needs_refresh = true OR last_updated < $1 LIMIT $2",
        [oneDayAgo, limit],
      );

      return formatGameRows(result.rows);
    } catch (error) {
      console.error("Failed to get games needing refresh:", error);
      return [];
    }
  },

  /**
   * Mark games for refresh
   * @param {Array} igdbIds - Array of IGDB IDs to mark for refresh
   * @returns {Promise<boolean>} - Success status
   */
  async markForRefresh(igdbIds) {
    try {
      if (igdbIds.length === 0) return true;

      const placeholders = igdbIds.map((_, i) => `$${i + 1}`).join(",");
      await query(
        `UPDATE ggr_games_cache SET needs_refresh = true WHERE igdb_id IN (${placeholders})`,
        igdbIds,
      );

      return true;
    } catch (error) {
      console.error("Failed to mark games for refresh:", error);
      return false;
    }
  },

  /**
   * Clean up stale cache entries
   * @param {number} maxAge - Maximum age in milliseconds
   * @returns {Promise<number>} - Number of entries cleaned up
   */
  async cleanup(maxAge = 7 * 24 * 60 * 60 * 1000) {
    try {
      const cutoffDate = new Date(Date.now() - maxAge).toISOString();

      const result = await query(
        "DELETE FROM ggr_games_cache WHERE last_updated < $1",
        [cutoffDate],
      );

      return result.rowCount || 0;
    } catch (error) {
      console.error("Failed to cleanup stale cache:", error);
      return 0;
    }
  },

  /**
   * Clear all cache data
   * @returns {Promise<boolean>} - Success status
   */
  async clear() {
    try {
      // First, remove foreign key references from game requests (set to null)
      await query(
        "UPDATE ggr_game_requests SET igdb_id = NULL WHERE igdb_id IS NOT NULL",
      );

      // Clear the watchlist entries (they have ON DELETE CASCADE, but let's be explicit)
      await query("DELETE FROM ggr_user_watchlist");

      // Now we can safely clear the games cache
      await query("DELETE FROM ggr_games_cache");

      return true;
    } catch (error) {
      console.error("Failed to clear cache:", error);
      return false;
    }
  },
};

/**
 * Game requests operations
 */
export const gameRequests = {
  /**
   * Create a new game request
   * @param {Object} requestData - Request data
   * @returns {Promise<Object|null>} - Created request or null
   */
  async create(requestData) {
    try {
      const result = await query(
        `
        INSERT INTO ggr_game_requests (
          title, igdb_id, user_id, user_name, platforms, priority,
          reason, description, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
        [
          requestData.title,
          requestData.igdb_id,
          requestData.user_id,
          requestData.user_name,
          JSON.stringify(requestData.platforms || []),
          requestData.priority || "medium",
          requestData.reason || "",
          requestData.description || "",
          "pending",
          new Date().toISOString(),
          new Date().toISOString(),
        ],
      );

      const row = result.rows[0];
      return {
        ...row,
        platforms: row.platforms || [],
      };
    } catch (error) {
      console.error("Failed to create game request:", error);
      return null;
    }
  },

  /**
   * Get recent requests
   * @param {number} limit - Number of requests to return
   * @returns {Promise<Array>} - Array of recent requests
   */
  async getRecent(limit = 10) {
    try {
      const result = await query(
        "SELECT * FROM ggr_game_requests ORDER BY created_at DESC LIMIT $1",
        [limit],
      );

      return result.rows.map((row) => ({
        ...row,
        platforms:
          typeof row.platforms === "string"
            ? JSON.parse(row.platforms)
            : row.platforms || [],
      }));
    } catch (error) {
      console.error("Failed to get recent requests:", error);
      return [];
    }
  },

  /**
   * Get all requests for a user
   * @param {Object} options - Query options
   * @param {string} options.user_id - User ID to filter by
   * @param {number} options.limit - Number of requests to return
   * @param {number} options.offset - Offset for pagination
   * @returns {Promise<Array>} - Array of user requests
   */
  async getAll(options = {}) {
    try {
      const { user_id, limit = 50, offset = 0, status } = options;

      let queryText = "SELECT * FROM ggr_game_requests";
      const params = [];

      if (user_id) {
        queryText += " WHERE user_id = $1";
        params.push(user_id);
      }

      if (status && user_id) {
        queryText += " AND status = $2";
        params.push(status);
      } else if (status && !user_id) {
        queryText += " WHERE status = $1";
        params.push(status);
      }

      queryText +=
        " ORDER BY created_at DESC LIMIT $" +
        (params.length + 1) +
        " OFFSET $" +
        (params.length + 2);
      params.push(limit, offset);

      const result = await query(queryText, params);

      return result.rows.map((row) => ({
        ...row,
        platforms:
          typeof row.platforms === "string"
            ? JSON.parse(row.platforms)
            : row.platforms || [],
      }));
    } catch (error) {
      console.error("Failed to get requests:", error);
      return [];
    }
  },
};

/**
 * Watchlist operations
 */
export const watchlist = {
  /**
   * Get user's watchlist with full game data
   * @param {string} userId - User ID
   * @returns {Promise<Array>} - Array of watchlist items with game data
   */
  async get(userId) {
    try {
      const result = await query(
        `
        SELECT 
          w.id,
          w.user_id,
          w.igdb_id,
          w.added_at,
          g.title,
          g.summary,
          g.cover_url,
          g.rating,
          g.release_date,
          g.platforms,
          g.genres,
          g.screenshots,
          g.videos,
          g.companies,
          g.game_modes,
          g.popularity_score
        FROM ggr_user_watchlist w
        LEFT JOIN ggr_games_cache g ON w.igdb_id = g.igdb_id
        WHERE w.user_id = $1
        ORDER BY w.added_at DESC
      `,
        [userId],
      );

      return result.rows.map((row) => ({
        // Watchlist fields
        id: row.id,
        user_id: row.user_id,
        igdb_id: row.igdb_id,
        added_at: row.added_at,
        // Game fields (if found in cache)
        title: row.title || `Game ${row.igdb_id}`,
        summary: row.summary || "",
        cover_url: row.cover_url,
        rating: row.rating,
        release_date: row.release_date,
        platforms:
          typeof row.platforms === "string"
            ? JSON.parse(row.platforms)
            : row.platforms || [],
        genres:
          typeof row.genres === "string"
            ? JSON.parse(row.genres)
            : row.genres || [],
        screenshots:
          typeof row.screenshots === "string"
            ? JSON.parse(row.screenshots)
            : row.screenshots || [],
        videos:
          typeof row.videos === "string"
            ? JSON.parse(row.videos)
            : row.videos || [],
        companies:
          typeof row.companies === "string"
            ? JSON.parse(row.companies)
            : row.companies || [],
        game_modes:
          typeof row.game_modes === "string"
            ? JSON.parse(row.game_modes)
            : row.game_modes || [],
        popularity_score: row.popularity_score || 0,
        // Flag to identify this as a watchlist item
        is_watchlist_item: true,
      }));
    } catch (error) {
      console.error("Failed to get watchlist:", error);
      return [];
    }
  },

  /**
   * Check if game is in user's watchlist
   * @param {string} userId - User ID
   * @param {string} igdbId - IGDB game ID
   * @returns {Promise<boolean>} - Whether game is in watchlist
   */
  async contains(userId, igdbId) {
    try {
      const result = await query(
        "SELECT 1 FROM ggr_user_watchlist WHERE user_id = $1 AND igdb_id = $2",
        [userId, igdbId],
      );

      return result.rows.length > 0;
    } catch (error) {
      console.error("Failed to check watchlist:", error);
      return false;
    }
  },

  /**
   * Add game to user's watchlist
   * @param {string} userId - User ID
   * @param {string} igdbId - IGDB game ID
   * @returns {Promise<Object|null>} - Created watchlist item or null
   */
  async add(userId, igdbId) {
    try {
      const result = await query(
        "INSERT INTO ggr_user_watchlist (user_id, igdb_id) VALUES ($1, $2) RETURNING *",
        [userId, igdbId],
      );

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      console.error("Failed to add to watchlist:", error);
      return null;
    }
  },

  /**
   * Remove game from user's watchlist
   * @param {string} userId - User ID
   * @param {string} igdbId - IGDB game ID
   * @returns {Promise<boolean>} - Success status
   */
  async remove(userId, igdbId) {
    try {
      const result = await query(
        "DELETE FROM ggr_user_watchlist WHERE user_id = $1 AND igdb_id = $2",
        [userId, igdbId],
      );

      return result.rowCount > 0;
    } catch (error) {
      console.error("Failed to remove from watchlist:", error);
      return false;
    }
  },
};

/**
 * Users operations
 */
export const users = {
  /**
   * Get user by local ID
   * @param {number} userId - Local user ID
   * @returns {Promise<Object|null>} - User profile or null
   */
  async getById(userId) {
    try {
      const result = await query(
        "SELECT * FROM ggr_users WHERE id = $1 AND is_active = TRUE",
        [userId],
      );

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      console.error("Failed to get user by ID:", error);
      return null;
    }
  },

  /**
   * Get user by Authentik sub
   * @param {string} authentikSub - Authentik subject ID
   * @returns {Promise<Object|null>} - User profile or null
   */
  async getByAuthentikSub(authentikSub) {
    try {
      const result = await query(
        "SELECT * FROM ggr_users WHERE authentik_sub = $1 AND is_active = TRUE",
        [authentikSub],
      );

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      console.error("Failed to get user by Authentik sub:", error);
      return null;
    }
  },
};

/**
 * Permissions operations
 */
export const permissions = {
  /**
   * Get user permissions by user ID
   * @param {number} userId - Local user ID
   * @returns {Promise<Array>} - Array of user permissions
   */
  async getUserPermissions(userId) {
    try {
      const result = await query(
        "SELECT * FROM ggr_user_permissions WHERE user_id = $1",
        [userId],
      );

      return result.rows;
    } catch (error) {
      console.error("Failed to get user permissions:", error);
      return [];
    }
  },

  /**
   * Check if user has specific permission
   * @param {number} userId - Local user ID
   * @param {string} permissionName - Permission name to check
   * @returns {Promise<boolean>} - Whether user has permission
   */
  async hasPermission(userId, permissionName) {
    try {
      const result = await query(
        "SELECT 1 FROM ggr_user_permissions WHERE user_id = $1 AND permission_name = $2 LIMIT 1",
        [userId, permissionName],
      );

      return result.rows.length > 0;
    } catch (error) {
      console.error("Failed to check user permission:", error);
      return false;
    }
  },

  /**
   * Get user roles
   * @param {number} userId - Local user ID
   * @returns {Promise<Array>} - Array of user roles
   */
  async getUserRoles(userId) {
    try {
      const result = await query(
        `
        SELECT r.name, r.display_name, r.description, ur.assigned_at, ur.expires_at
        FROM ggr_user_roles ur
        JOIN ggr_roles r ON ur.role_id = r.id
        WHERE ur.user_id = $1 
        AND ur.is_active = TRUE 
        AND r.is_active = TRUE
        AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
        ORDER BY r.name
      `,
        [userId],
      );

      return result.rows;
    } catch (error) {
      console.error("Failed to get user roles:", error);
      return [];
    }
  },
};

/**
 * Custom navigation operations
 */
export const customNavigation = {
  /**
   * Get all active custom navigation items
   * @returns {Promise<Array>} - Array of navigation items
   */
  async getActive() {
    try {
      const result = await query(`
        SELECT id, name, href, icon, position, is_external, 
               visible_to_all, visible_to_guests, allowed_roles, minimum_role
        FROM ggr_custom_navigation
        WHERE is_active = TRUE
        ORDER BY position ASC, name ASC
      `);

      return result.rows;
    } catch (error) {
      console.error("Failed to get active custom navigation:", error);
      return [];
    }
  },

  /**
   * Get all custom navigation items (for admin management)
   * @returns {Promise<Array>} - Array of all navigation items
   */
  async getAll() {
    try {
      const result = await query(`
        SELECT cn.*, u.name as created_by_name
        FROM ggr_custom_navigation cn
        LEFT JOIN ggr_users u ON cn.created_by = u.id
        ORDER BY cn.position ASC, cn.name ASC
      `);

      return result.rows;
    } catch (error) {
      console.error("Failed to get all custom navigation:", error);
      return [];
    }
  },

  /**
   * Create a new custom navigation item
   * @param {Object} navData - Navigation item data
   * @returns {Promise<Object|null>} - Created navigation item
   */
  async create(navData) {
    try {
      // First try to insert with the new role-based visibility fields
      let result;
      try {
        result = await query(
          `
          INSERT INTO ggr_custom_navigation (
            name, href, icon, position, is_external, is_active, created_by,
            visible_to_all, visible_to_guests, allowed_roles, minimum_role
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING *
        `,
          [
            navData.name,
            navData.href,
            navData.icon || "heroicons:link",
            navData.position || 100,
            navData.is_external || false,
            navData.is_active !== false, // Default to true unless explicitly false
            navData.created_by,
            navData.visible_to_all !== false, // Default to true
            navData.visible_to_guests !== false, // Default to true
            JSON.stringify(navData.allowed_roles || []),
            navData.minimum_role || "viewer", // Default to viewer
          ],
        );
      } catch (columnError) {
        // If the new columns don't exist, fall back to the old schema
        result = await query(
          `
          INSERT INTO ggr_custom_navigation (
            name, href, icon, position, is_external, is_active, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
        `,
          [
            navData.name,
            navData.href,
            navData.icon || "heroicons:link",
            navData.position || 100,
            navData.is_external || false,
            navData.is_active !== false, // Default to true unless explicitly false
            navData.created_by,
          ],
        );
      }

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      console.error("Failed to create custom navigation:", error);
      return null;
    }
  },

  /**
   * Update a custom navigation item
   * @param {number} id - Navigation item ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<boolean>} - Success status
   */
  async update(id, updates) {
    try {
      const allowedFields = [
        "name",
        "href",
        "icon",
        "position",
        "is_external",
        "is_active",
        "visible_to_all",
        "visible_to_guests",
        "allowed_roles",
      ];

      const setClause = [];
      const values = [];
      let paramCount = 1;

      for (const [field, value] of Object.entries(updates)) {
        if (allowedFields.includes(field)) {
          if (field === "allowed_roles") {
            // Convert array to JSON string for storage
            setClause.push(`${field} = $${paramCount}`);
            values.push(JSON.stringify(value || []));
          } else {
            setClause.push(`${field} = $${paramCount}`);
            values.push(value);
          }
          paramCount++;
        }
      }

      if (setClause.length === 0) {
        return false;
      }

      values.push(id);

      // First try to update with role-based visibility fields
      let result;
      try {
        result = await query(
          `UPDATE ggr_custom_navigation SET ${setClause.join(", ")}, updated_at = NOW() WHERE id = $${paramCount}`,
          values,
        );
      } catch (columnError) {
        // If the new columns don't exist, fall back to basic fields only
        const basicFields = [
          "name",
          "href",
          "icon",
          "position",
          "is_external",
          "is_active",
        ];
        const basicSetClause = [];
        const basicValues = [];
        let basicParamCount = 1;

        for (const [field, value] of Object.entries(updates)) {
          if (basicFields.includes(field)) {
            basicSetClause.push(`${field} = $${basicParamCount}`);
            basicValues.push(value);
            basicParamCount++;
          }
        }

        if (basicSetClause.length === 0) {
          return false;
        }

        basicValues.push(id);
        result = await query(
          `UPDATE ggr_custom_navigation SET ${basicSetClause.join(", ")}, updated_at = NOW() WHERE id = $${basicParamCount}`,
          basicValues,
        );
      }

      return result.rowCount > 0;
    } catch (error) {
      console.error("Failed to update custom navigation:", error);
      return false;
    }
  },

  /**
   * Delete a custom navigation item
   * @param {number} id - Navigation item ID
   * @returns {Promise<boolean>} - Success status
   */
  async delete(id) {
    try {
      const result = await query(
        "DELETE FROM ggr_custom_navigation WHERE id = $1",
        [id],
      );

      return result.rowCount > 0;
    } catch (error) {
      console.error("Failed to delete custom navigation:", error);
      return false;
    }
  },
};

// Export direct query function for advanced usage
export { query };
