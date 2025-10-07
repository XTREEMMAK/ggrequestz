/**
 * Genre Filtering Service for User Preference Management
 * Handles genre ID mapping, preference filtering, and IGDB query building
 */

import { browser } from "$app/environment";
import { query } from "$lib/database.js";
import { igdbRequest } from "$lib/igdb.js";

/**
 * Genre ID cache for performance
 */
let genreIdCache = new Map();
let cacheExpiry = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get genre IDs from genre names, with caching
 * @param {string[]} genreNames - Array of genre names
 * @returns {Promise<number[]>} Array of IGDB genre IDs
 */
export async function getGenreIds(genreNames) {
  if (browser) {
    throw new Error("Genre ID mapping cannot be used in browser");
  }

  if (!genreNames || genreNames.length === 0) {
    return [];
  }

  // Check cache first
  const now = Date.now();
  if (now > cacheExpiry || genreIdCache.size === 0) {
    await refreshGenreCache();
  }

  const genreIds = [];
  for (const name of genreNames) {
    const id = genreIdCache.get(name.toLowerCase());
    if (id) {
      genreIds.push(id);
    }
  }

  return genreIds;
}

/**
 * Refresh the genre ID cache from database and IGDB
 */
async function refreshGenreCache() {
  try {
    // First try to load from database cache
    const result = await query(`
      SELECT igdb_id, name FROM ggr_genre_metadata
      WHERE cached_at > NOW() - INTERVAL '24 hours'
      ORDER BY name
    `);

    genreIdCache.clear();

    if (result.rows.length > 0) {
      // Load from database cache
      for (const row of result.rows) {
        genreIdCache.set(row.name.toLowerCase(), row.igdb_id);
      }
      cacheExpiry = Date.now() + CACHE_DURATION;
    } else {
      // Fetch fresh data from IGDB
      await syncGenresFromIGDB();
    }
  } catch (error) {
    console.error("Error refreshing genre cache:", error);
    // Continue with empty cache rather than failing
  }
}

/**
 * Sync genre data from IGDB and cache in database
 */
async function syncGenresFromIGDB() {
  try {
    const genreQuery = `
      fields id, name, slug;
      sort name asc;
      limit 100;
    `;

    const genres = await igdbRequest("genres", genreQuery);

    // Clear existing cache in database
    await query("DELETE FROM ggr_genre_metadata WHERE cached_at < NOW()");

    // Insert fresh genre data
    for (const genre of genres) {
      await query(
        `
        INSERT INTO ggr_genre_metadata (igdb_id, name, slug, cached_at, last_updated)
        VALUES ($1, $2, $3, NOW(), NOW())
        ON CONFLICT (igdb_id) DO UPDATE SET
          name = EXCLUDED.name,
          slug = EXCLUDED.slug,
          last_updated = NOW()
      `,
        [
          genre.id,
          genre.name,
          genre.slug || genre.name.toLowerCase().replace(/\s+/g, "-"),
        ],
      );

      // Add to memory cache
      genreIdCache.set(genre.name.toLowerCase(), genre.id);
    }

    cacheExpiry = Date.now() + CACHE_DURATION;
    console.log(`✅ Synced ${genres.length} genres from IGDB`);
  } catch (error) {
    console.error("Error syncing genres from IGDB:", error);
    throw error;
  }
}

/**
 * Build IGDB genre filter clause for user preferences
 * @param {Object} userPreferences - User's genre preferences
 * @returns {Promise<string>} IGDB query filter clause
 */
export async function buildGenreFilter(userPreferences) {
  if (!userPreferences) {
    return "";
  }

  // Handle preferred genres (include only these)
  if (
    userPreferences.preferred_genres &&
    userPreferences.preferred_genres.length > 0
  ) {
    const preferredIds = await getGenreIds(userPreferences.preferred_genres);
    if (preferredIds.length > 0) {
      // Use correct IGDB syntax: genres = ID
      return `genres = ${preferredIds[0]}`;
    }
  }

  return "";
}

/**
 * Filter games array based on user genre preferences (client-side filtering)
 * @param {Array} games - Array of game objects
 * @param {Object} userPreferences - User's genre preferences (should include global filters merged via mergeFiltersWithGlobal)
 * @returns {Array} Filtered games array
 */
export function filterGamesByGenre(games, userPreferences) {
  // Note: userPreferences should already include global excluded genres merged at the data loading level
  if (!userPreferences || !games || games.length === 0) {
    return games;
  }

  return games.filter((game) => {
    if (!game.genres || !Array.isArray(game.genres)) {
      return true; // Keep games without genre data
    }

    const gameGenres = game.genres.map((g) => g.toLowerCase());

    // Check excluded genres first (higher priority)
    if (
      userPreferences.excluded_genres &&
      userPreferences.excluded_genres.length > 0
    ) {
      const hasExcludedGenre = userPreferences.excluded_genres.some(
        (excluded) => gameGenres.includes(excluded.toLowerCase()),
      );
      if (hasExcludedGenre) {
        return false;
      }
    }

    // Check preferred genres (if specified, only include games with these)
    if (
      userPreferences.preferred_genres &&
      userPreferences.preferred_genres.length > 0
    ) {
      const hasPreferredGenre = userPreferences.preferred_genres.some(
        (preferred) => gameGenres.includes(preferred.toLowerCase()),
      );
      return hasPreferredGenre;
    }

    return true; // Keep game if no specific preferences
  });
}

/**
 * Get all available genres from cache/database
 * @returns {Promise<Array>} Array of genre objects with id, name, slug
 */
export async function getAvailableGenres() {
  if (browser) {
    throw new Error("Genre retrieval cannot be used in browser");
  }

  try {
    // Ensure cache is fresh
    const now = Date.now();
    if (now > cacheExpiry || genreIdCache.size === 0) {
      await refreshGenreCache();
    }

    // Get from database with additional metadata
    const result = await query(`
      SELECT igdb_id, name, slug, description, is_mature_genre, game_count
      FROM ggr_genre_metadata
      ORDER BY name ASC
    `);

    return result.rows.map((row) => ({
      id: row.igdb_id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      is_mature: row.is_mature_genre,
      game_count: row.game_count || 0,
    }));
  } catch (error) {
    console.error("Error getting available genres:", error);
    return [];
  }
}

/**
 * Update genre metadata with game counts and maturity flags
 * @param {Array} games - Array of games to analyze
 */
export async function updateGenreMetadata(games) {
  if (browser || !games || games.length === 0) {
    return;
  }

  try {
    // Count games per genre and detect mature genres
    const genreStats = new Map();

    for (const game of games) {
      if (!game.genres || !Array.isArray(game.genres)) continue;

      for (const genre of game.genres) {
        if (!genreStats.has(genre)) {
          genreStats.set(genre, {
            count: 0,
            matureCount: 0,
            totalRating: 0,
            ratingCount: 0,
          });
        }

        const stats = genreStats.get(genre);
        stats.count++;

        // Check if game is mature (rough heuristic)
        if (game.rating && game.rating > 0) {
          stats.totalRating += game.rating;
          stats.ratingCount++;
        }

        // Count mature games (games with M or AO rating, or certain keywords)
        const isMature = checkGameMaturity(game);
        if (isMature) {
          stats.matureCount++;
        }
      }
    }

    // Update database with stats
    for (const [genreName, stats] of genreStats) {
      const avgRating =
        stats.ratingCount > 0 ? stats.totalRating / stats.ratingCount : 0;
      const matureRatio = stats.count > 0 ? stats.matureCount / stats.count : 0;
      const isMatureGenre = matureRatio > 0.5; // More than 50% mature games

      await query(
        `
        UPDATE ggr_genre_metadata
        SET
          game_count = $2,
          is_mature_genre = $3,
          popularity_score = $4,
          last_updated = NOW()
        WHERE name = $1
      `,
        [genreName, stats.count, isMatureGenre, avgRating],
      );
    }
  } catch (error) {
    console.error("Error updating genre metadata:", error);
  }
}

/**
 * Check if a game should be considered mature content
 * @param {Object} game - Game object
 * @returns {boolean} True if game is likely mature
 */
function checkGameMaturity(game) {
  // Check rating threshold (games rated below 70 might indicate mature/controversial content)
  if (game.rating && game.rating < 30) {
    return true;
  }

  // Check title for mature keywords (basic heuristic)
  const matureKeywords = ["adult", "xxx", "sex", "erotic", "mature", "gore"];
  const title = (game.title || "").toLowerCase();

  return matureKeywords.some((keyword) => title.includes(keyword));
}

/**
 * Clear genre cache (useful for testing or forced refresh)
 */
export function clearGenreCache() {
  genreIdCache.clear();
  cacheExpiry = 0;
}

/**
 * Get genre suggestions based on user's current preferences and activity
 * @param {Object} userPreferences - Current user preferences
 * @param {Array} userWatchlist - User's watchlist games
 * @returns {Promise<Array>} Suggested genres
 */
export async function getGenreSuggestions(userPreferences, userWatchlist = []) {
  try {
    const allGenres = await getAvailableGenres();

    // Extract genres from user's watchlist
    const watchlistGenres = new Map();
    for (const game of userWatchlist) {
      if (game.genres && Array.isArray(game.genres)) {
        for (const genre of game.genres) {
          watchlistGenres.set(genre, (watchlistGenres.get(genre) || 0) + 1);
        }
      }
    }

    // Get currently preferred genres
    const currentPreferred = userPreferences?.preferred_genres || [];
    const currentExcluded = userPreferences?.excluded_genres || [];

    // Suggest genres that:
    // 1. Appear frequently in watchlist but aren't in preferences
    // 2. Are popular overall but not excluded
    // 3. Are related to current preferences

    const suggestions = allGenres
      .filter(
        (genre) =>
          !currentPreferred.includes(genre.name) &&
          !currentExcluded.includes(genre.name),
      )
      .map((genre) => ({
        ...genre,
        watchlistCount: watchlistGenres.get(genre.name) || 0,
        score: calculateGenreScore(genre, watchlistGenres, currentPreferred),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    return suggestions;
  } catch (error) {
    console.error("Error getting genre suggestions:", error);
    return [];
  }
}

/**
 * Calculate relevance score for genre suggestions
 */
function calculateGenreScore(genre, watchlistGenres, currentPreferred) {
  let score = 0;

  // Points for appearing in watchlist
  score += (watchlistGenres.get(genre.name) || 0) * 10;

  // Points for popularity
  score += Math.min(genre.game_count / 100, 5);

  // Points for average rating
  score += genre.popularity_score / 20;

  // Bonus for non-mature genres (safer suggestions)
  if (!genre.is_mature) {
    score += 2;
  }

  return score;
}
