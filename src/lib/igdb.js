/**
 * IGDB API integration utilities
 * Unified implementation for both web app and Node.js scripts
 */

import { browser } from "$app/environment";
import { assessContentSafety, processIGDBAgeRatings } from "./contentRating.js";
import { buildGenreFilter, filterGamesByGenre } from "./genreFiltering.js";

// Only load environment variables on server-side
let IGDB_CLIENT_ID, IGDB_CLIENT_SECRET;

if (!browser) {
  // Try to load dotenv for development environments (server-side only)
  // Skip dotenv in Docker/production where env vars are injected directly
  if (process.env.NODE_ENV !== "production") {
    try {
      const { config } = await import("dotenv");
      // Use DOTENV_CONFIG_PATH if set (for development), otherwise default to .env
      const envPath = process.env.DOTENV_CONFIG_PATH || ".env";
      config({ path: envPath });
    } catch (error) {
      // Dotenv not available or already configured - continue
    }
  }

  // Use environment variables on server-side
  IGDB_CLIENT_ID = process.env.IGDB_CLIENT_ID;
  IGDB_CLIENT_SECRET = process.env.IGDB_CLIENT_SECRET;
}

const IGDB_BASE_URL = "https://api.igdb.com/v4";
let accessToken = null;
let tokenExpiry = null;

// Rate limiting: track last request time to avoid overwhelming the API
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 100; // 100ms between requests

/**
 * Get OAuth access token for IGDB API
 * @returns {Promise<string>} - Access token
 */
async function getAccessToken() {
  if (browser) {
    throw new Error(
      "IGDB functions cannot be used in browser - use API routes instead",
    );
  }

  // Return cached token if still valid
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    return accessToken;
  }

  if (!IGDB_CLIENT_ID || !IGDB_CLIENT_SECRET) {
    throw new Error(
      "IGDB API credentials not found. Please check IGDB_CLIENT_ID and IGDB_CLIENT_SECRET environment variables.",
    );
  }

  const tokenUrl = "https://id.twitch.tv/oauth2/token";
  const params = new URLSearchParams({
    client_id: IGDB_CLIENT_ID,
    client_secret: IGDB_CLIENT_SECRET,
    grant_type: "client_credentials",
  });

  try {
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to get IGDB access token: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();
    accessToken = data.access_token;
    tokenExpiry = Date.now() + data.expires_in * 1000 - 300000; // 5 minutes buffer

    return accessToken;
  } catch (error) {
    console.error("IGDB token error:", error);
    throw error;
  }
}

/**
 * Make authenticated request to IGDB API with rate limiting
 * @param {string} endpoint - API endpoint
 * @param {string} query - IGDB query string
 * @returns {Promise<Array>} - API response data
 */
export async function igdbRequest(endpoint, query) {
  // Rate limiting: ensure minimum interval between requests
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise((resolve) =>
      setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest),
    );
  }

  lastRequestTime = Date.now();

  const token = await getAccessToken();

  // Debug: Log the exact query being sent to IGDB
  console.log(`🔍 IGDB ${endpoint} query:`, query);

  const response = await fetch(`${IGDB_BASE_URL}/${endpoint}`, {
    method: "POST",
    headers: {
      "Client-ID": IGDB_CLIENT_ID,
      Authorization: `Bearer ${token}`,
      "Content-Type": "text/plain",
    },
    body: query.trim(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("IGDB API error details:", errorText);
    throw new Error(`IGDB API error: ${response.statusText} - ${errorText}`);
  }

  return response.json();
}

/**
 * Search for games by title
 * @param {string} title - Game title to search
 * @param {number} limit - Number of results to return
 * @returns {Promise<Array>} - Array of game objects
 */
export async function searchGamesByTitle(title, limit = 10) {
  if (browser) {
    throw new Error(
      "IGDB functions cannot be used in browser - use API routes instead",
    );
  }
  const query = `
    fields id, name, slug, summary, first_release_date, rating, cover.url, platforms.name, genres.name, websites.category, websites.url, total_rating_count, age_ratings.organization, age_ratings.rating_category.rating, age_ratings.rating_content_descriptions;
    search "${title}";
    limit ${limit};
  `;

  try {
    const games = await igdbRequest("games", query);
    const gamesWithResolvedRatings = await resolveGamesAgeRatings(games);
    return gamesWithResolvedRatings.map(formatGameData);
  } catch (error) {
    console.error("IGDB search error:", error);
    return [];
  }
}

/**
 * Get game details by IGDB ID
 * @param {number} igdbId - IGDB game ID
 * @returns {Promise<Object|null>} - Game object or null
 */
export async function getGameById(igdbId) {
  if (browser) {
    throw new Error(
      "IGDB functions cannot be used in browser - use API routes instead",
    );
  }
  const query = `
    fields id, name, slug, summary, first_release_date, rating, cover.url, platforms.name, genres.name, screenshots.url, videos.video_id, involved_companies.company.name, game_modes.name, websites.category, websites.url, total_rating_count, age_ratings.organization, age_ratings.rating_category.rating, age_ratings.rating_content_descriptions, age_ratings.checksum;
    where id = ${igdbId};
  `;

  try {
    const games = await igdbRequest("games", query);
    if (games.length > 0) {
      const gameWithResolvedRatings = await resolveGameAgeRatings(games[0]);
      return formatGameData(gameWithResolvedRatings, true);
    }
    return null;
  } catch (error) {
    console.error("IGDB get game error:", error);
    return null;
  }
}

/**
 * Get popular/trending games using IGDB popularity primitives
 * @param {number} limit - Number of games to return
 * @param {number} offset - Offset for pagination
 * @param {Object} userPreferences - User's filtering preferences (optional)
 * @returns {Promise<Array>} - Array of popular games
 */
export async function getPopularGames(
  limit = 20,
  offset = 0,
  userPreferences = null,
  skipESRB = false,
) {
  if (browser) {
    throw new Error(
      "IGDB functions cannot be used in browser - use API routes instead",
    );
  }

  // If user has genre preferences, use a different strategy that prioritizes genre filtering
  // Temporarily disabled to debug - will use original approach with better filtering
  if (
    false &&
    userPreferences &&
    userPreferences.preferred_genres &&
    userPreferences.preferred_genres.length > 0
  ) {
    return await getPopularGamesByGenre(
      limit,
      offset,
      userPreferences,
      skipESRB,
    );
  }

  // SIMPLIFIED: Use direct query approach like getRecentGames
  // Build genre filter if user preferences exist
  let genreFilter = "";
  if (userPreferences) {
    genreFilter = await buildGenreFilter(userPreferences);
  }

  // Request more games than needed to account for filtering
  const fetchLimit = userPreferences ? Math.min(limit * 2, 500) : limit;

  // Direct query for popular games - remove restrictive criteria
  const query = `fields id,name,slug,summary,first_release_date,rating,cover.url,platforms.name,genres.name,websites.category,websites.url,total_rating_count;
where cover != null${genreFilter ? ` & ${genreFilter}` : ""};
sort total_rating_count desc;
offset ${offset};
limit ${fetchLimit};`;

  try {
    const games = await igdbRequest("games", query);
    console.log(`🔍 Popular games query returned ${games.length} results`);

    if (games.length === 0) {
      return [];
    }

    // Simple formatting - just return essential fields
    let formattedGames = games.map((game) => ({
      id: game.id,
      title: game.name || "Unknown",
      slug: game.slug || "",
      summary: game.summary || "",
      release_date: game.first_release_date
        ? new Date(game.first_release_date * 1000).toISOString()
        : null,
      rating: game.rating || 0,
      total_rating_count: game.total_rating_count || 0,
      cover_url: game.cover?.url ? getHighQualityCover(game.cover.url) : null,
      platforms: game.platforms?.map((p) => p.name) || [],
      genres: game.genres?.map((g) => g.name) || [],
      websites: game.websites || [],
      is_in_library: false,
    }));

    // Apply genre filtering if user preferences exist
    if (userPreferences && userPreferences.preferred_genres?.length > 0) {
      formattedGames = formattedGames.filter((game) => {
        if (!game.genres || game.genres.length === 0) return false;
        const gameGenres = game.genres.map((g) => g.toLowerCase());
        return userPreferences.preferred_genres.some((preferred) =>
          gameGenres.includes(preferred.toLowerCase()),
        );
      });
    }

    const finalGames = formattedGames.slice(0, limit);
    return finalGames;
  } catch (error) {
    console.error("IGDB popular games error:", error);
    return [];
  }
}

/**
 * Get popular games filtered by preferred genres
 * This function prioritizes genre filtering over pure popularity
 * @param {number} limit - Number of games to return
 * @param {number} offset - Offset for pagination
 * @param {Object} userPreferences - User's filtering preferences (must have preferred_genres)
 * @param {boolean} skipESRB - Skip ESRB rating processing
 * @returns {Promise<Array>} - Array of popular games within preferred genres
 */
async function getPopularGamesByGenre(
  limit = 20,
  offset = 0,
  userPreferences,
  skipESRB = false,
) {
  // Build genre filter
  const genreFilter = await buildGenreFilter(userPreferences);

  // Request more games than needed to account for filtering
  const fetchLimit = Math.min(limit * 3, 500);

  // Query for games in preferred genres, sorted by popularity metrics
  // Use more lenient criteria to ensure we get results
  const query = `fields id,name,slug,summary,first_release_date,rating,cover.url,platforms.name,genres.name,websites.category,websites.url,total_rating_count,age_ratings.organization,age_ratings.rating_category.rating,age_ratings.rating_content_descriptions; where cover != null${genreFilter ? ` & ${genreFilter}` : ""}; sort total_rating_count desc, rating desc; offset ${offset}; limit ${fetchLimit};`;

  try {
    const games = await igdbRequest("games", query);
    const gamesWithResolvedRatings = skipESRB
      ? games
      : await resolveGamesAgeRatings(games);
    let formattedGames = gamesWithResolvedRatings.map(formatGameData);

    // Apply content filtering if user preferences exist
    if (userPreferences) {
      formattedGames = formattedGames.filter((game) => {
        const assessment = assessContentSafety(
          game.content_rating,
          userPreferences,
          game.title,
        );
        return assessment.allowed;
      });

      // Apply genre filtering (client-side backup)
      formattedGames = filterGamesByGenre(formattedGames, userPreferences);
    }

    // Take only the requested amount
    formattedGames = formattedGames.slice(0, limit);

    return formattedGames;
  } catch (error) {
    console.error("IGDB popular games by genre error:", error);
    // Fallback to general high-rated games if genre-specific query fails
    return await getHighRatedGames(limit, offset, userPreferences, skipESRB);
  }
}

/**
 * Fallback function to get highly rated games
 * @param {number} limit - Number of games to return
 * @param {number} offset - Offset for pagination
 * @param {Object} userPreferences - User's filtering preferences (optional)
 * @returns {Promise<Array>} - Array of highly rated games
 */
async function getHighRatedGames(
  limit = 20,
  offset = 0,
  userPreferences = null,
  skipESRB = false,
) {
  // Build genre filter if user preferences exist
  let genreFilter = "";
  if (userPreferences) {
    genreFilter = await buildGenreFilter(userPreferences);
  }

  // Request more games than needed to account for filtering
  const fetchLimit = userPreferences ? Math.min(limit * 3, 500) : limit;

  // Build where clause conditionally - try simplified version for debugging
  const baseWhere = genreFilter
    ? "cover != null"
    : "rating >= 75 & total_rating_count >= 20 & cover != null";
  const whereClause = genreFilter
    ? `where ${baseWhere} & ${genreFilter}`
    : `where ${baseWhere}`;

  const query = `fields id,name,slug,summary,first_release_date,rating,cover.url,platforms.name,genres.name,websites.category,websites.url,total_rating_count,age_ratings.organization,age_ratings.rating_category.rating,age_ratings.rating_content_descriptions; ${whereClause}; sort rating desc, total_rating_count desc; offset ${offset}; limit ${fetchLimit};`;

  try {
    const games = await igdbRequest("games", query);
    const gamesWithResolvedRatings = skipESRB
      ? games
      : await resolveGamesAgeRatings(games);
    let formattedGames = gamesWithResolvedRatings.map(formatGameData);

    // Apply content filtering if user preferences exist
    if (userPreferences) {
      formattedGames = formattedGames.filter((game) => {
        const assessment = assessContentSafety(
          game.content_rating,
          userPreferences,
          game.title,
        );
        return assessment.allowed;
      });

      // Apply genre filtering (client-side backup)
      formattedGames = filterGamesByGenre(formattedGames, userPreferences);
    }

    const finalGames = formattedGames.slice(0, limit);
    return finalGames;
  } catch (error) {
    console.error("IGDB high rated games error:", error);
    return [];
  }
}

/**
 * Get recently released games
 * @param {number} limit - Number of games to return
 * @param {number} offset - Offset for pagination
 * @param {Object} userPreferences - User's filtering preferences (optional)
 * @returns {Promise<Array>} - Array of recent games
 */
export async function getRecentGames(
  limit = 20,
  offset = 0,
  userPreferences = null,
  skipESRB = false,
) {
  if (browser) {
    throw new Error(
      "IGDB functions cannot be used in browser - use API routes instead",
    );
  }

  // Build genre filter if user preferences exist
  let genreFilter = "";
  if (userPreferences) {
    genreFilter = await buildGenreFilter(userPreferences);
  }

  // Request more games than needed to account for filtering
  const fetchLimit = userPreferences ? Math.min(limit * 2, 500) : limit;

  // Get recently released games (past releases only, no future games)
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const query = `fields id,name,slug,summary,first_release_date,rating,cover.url,platforms.name,genres.name,websites.category,websites.url,total_rating_count,age_ratings.organization,age_ratings.rating_category.rating,age_ratings.rating_content_descriptions;
where first_release_date != null & first_release_date < ${currentTimestamp} & version_parent = null & cover != null${genreFilter ? ` & ${genreFilter}` : ""};
sort first_release_date desc;
offset ${offset};
limit ${fetchLimit};`;

  try {
    const games = await igdbRequest("games", query);
    const gamesWithResolvedRatings = skipESRB
      ? games
      : await resolveGamesAgeRatings(games);
    let formattedGames = gamesWithResolvedRatings.map(formatGameData);

    // Apply content filtering if user preferences exist
    if (userPreferences) {
      formattedGames = formattedGames.filter((game) => {
        const assessment = assessContentSafety(
          game.content_rating,
          userPreferences,
          game.title,
        );
        return assessment.allowed;
      });

      // Apply genre filtering (client-side backup)
      formattedGames = filterGamesByGenre(formattedGames, userPreferences);
    }

    return formattedGames.slice(0, limit);
  } catch (error) {
    console.error("IGDB recent games error:", error);
    return [];
  }
}

/**
 * Get game platforms
 * @returns {Promise<Array>} - Array of platform objects
 */
export async function getPlatforms() {
  if (browser) {
    throw new Error(
      "IGDB functions cannot be used in browser - use API routes instead",
    );
  }
  const query = `
    fields id, name, abbreviation;
    sort name asc;
    limit 100;
  `;

  try {
    return await igdbRequest("platforms", query);
  } catch (error) {
    console.error("IGDB platforms error:", error);
    return [];
  }
}

/**
 * Get game genres
 * @returns {Promise<Array>} - Array of genre objects
 */
export async function getGenres() {
  if (browser) {
    throw new Error(
      "IGDB functions cannot be used in browser - use API routes instead",
    );
  }
  const query = `
    fields id, name;
    sort name asc;
    limit 50;
  `;

  try {
    return await igdbRequest("genres", query);
  } catch (error) {
    console.error("IGDB genres error:", error);
    return [];
  }
}

/**
 * Process IGDB websites data into our platform links format
 * @param {Array} websites - IGDB websites array
 * @returns {Object} - Processed platform URLs keyed by platform type
 */
function processWebsites(websites) {
  const platformUrls = {};

  // Website category mapping from IGDB
  const categoryMap = {
    1: "official", // Official website
    13: "steam", // Steam
    16: "epic", // Epic Games Store
    17: "gog", // GOG
    10: "ios", // iPhone App Store
    11: "ios", // iPad App Store (treat as iOS)
    12: "android", // Android
  };

  websites.forEach((website) => {
    const platformType = categoryMap[website.category];
    if (platformType && website.url) {
      platformUrls[platformType] = website.url;
    }
  });

  return platformUrls;
}

/**
 * Get high quality cover image URL
 * @param {string} coverUrl - Original cover URL
 * @returns {string} - High quality cover URL
 */
export function getHighQualityCover(coverUrl) {
  if (!coverUrl) return null;

  // Handle both protocol-relative URLs (//images.igdb.com) and full URLs
  let processedUrl = coverUrl
    .replace("t_thumb", "t_cover_big")
    .replace(/,f_webp/g, ""); // Remove format specifiers like ,f_webp

  // If URL starts with //, add https: prefix
  if (processedUrl.startsWith("//")) {
    processedUrl = `https:${processedUrl}`;
  }

  // Use image proxy for better caching and performance
  if (processedUrl.includes("igdb.com")) {
    return `/api/images/proxy?url=${encodeURIComponent(processedUrl)}`;
  }

  return processedUrl;
}

/**
 * Format IGDB game data to our standard format
 * @param {Object} game - Raw IGDB game object
 * @param {boolean} detailed - Whether to include detailed information
 * @returns {Object} - Formatted game object
 */
export function formatGameData(game, detailed = false) {
  // Use resolved age ratings if available, otherwise use empty ratings
  const contentRatings = game.resolved_age_ratings || {
    esrb_rating: null,
    esrb_descriptors: [],
    pegi_rating: null,
    pegi_descriptors: [],
    content_warnings: [],
    is_mature: false,
    is_nsfw: false,
    has_violence: false,
    has_sexual_content: false,
    has_drug_use: false,
    has_gambling: false,
  };

  const formatted = {
    id: game.id,
    igdb_id: game.id.toString(),
    title: game.name,
    slug: game.slug || null,
    summary: game.summary || "",
    release_date: game.first_release_date
      ? game.first_release_date * 1000
      : null,
    rating: game.rating || null,
    cover_url: game.cover?.url ? getHighQualityCover(game.cover.url) : null,
    platforms: game.platforms?.map((p) => p.name) || [],
    genres: game.genres?.map((g) => g.name) || [],
    websites: processWebsites(game.websites || []),
    // Add popularity score for node.js scripts compatibility
    popularity_score: game.total_rating_count || 0,
    // Add content rating information
    content_rating: contentRatings,
    esrb_rating: contentRatings.esrb_rating,
    is_mature: contentRatings.is_mature,
    is_nsfw: contentRatings.is_nsfw,
  };

  if (detailed) {
    formatted.screenshots =
      game.screenshots?.map((s) => {
        const screenshotUrl = `https:${s.url.replace("t_thumb", "t_screenshot_med")}`;
        return `/api/images/proxy?url=${encodeURIComponent(screenshotUrl)}`;
      }) || [];
    formatted.videos = game.videos?.map((v) => v.video_id) || [];
    formatted.companies =
      game.involved_companies?.map((ic) => ic.company.name) || [];
    formatted.game_modes = game.game_modes?.map((gm) => gm.name) || [];
  }

  return formatted;
}

/**
 * Convert IGDB timestamp to JavaScript Date
 * @param {number} timestamp - IGDB timestamp (seconds)
 * @returns {Date|null} - Date object or null
 */
export function igdbTimestampToDate(timestamp) {
  return timestamp ? new Date(timestamp * 1000) : null;
}

/**
 * Alternative method to get popular games using total rating count
 * Useful for node.js scripts when popularity_primitives endpoint is unavailable
 * @param {number} limit - Number of games to return
 * @returns {Promise<Array>} - Array of popular games
 */
export async function getPopularGamesByRating(limit = 20) {
  if (browser) {
    throw new Error(
      "IGDB functions cannot be used in browser - use API routes instead",
    );
  }
  try {
    const query = `
      fields id, name, slug, summary, cover.url, rating, first_release_date, platforms.name, genres.name, screenshots.url, videos.video_id, involved_companies.company.name, game_modes.name, total_rating_count, websites.category, websites.url, age_ratings.organization, age_ratings.rating_category.rating, age_ratings.rating_content_descriptions;
      where total_rating_count >= 50;
      sort total_rating_count desc;
      limit ${limit};
    `;

    const games = await igdbRequest("games", query);
    const gamesWithResolvedRatings = await resolveGamesAgeRatings(games);
    return gamesWithResolvedRatings.map((game) => formatGameData(game, true));
  } catch (error) {
    console.error("IGDB popular games by rating error:", error);
    return [];
  }
}

/**
 * Resolve IGDB age rating data using static reference tables
 * @param {Array} ageRatings - Raw IGDB age ratings data
 * @returns {Object} - Resolved age rating data
 */
// Use processIGDBAgeRatings from contentRating.js to avoid duplication
export const resolveAgeRatings = processIGDBAgeRatings;

/**
 * Helper function to resolve age ratings for a game and attach them
 * @param {Object} game - Raw IGDB game object
 * @returns {Promise<Object>} - Game object with resolved age ratings
 */
async function resolveGameAgeRatings(game) {
  try {
    const resolvedRatings = await resolveAgeRatings(game.age_ratings);
    return {
      ...game,
      resolved_age_ratings: resolvedRatings,
    };
  } catch (error) {
    console.error(
      `[resolveGameAgeRatings] Error resolving ratings for game ${game.name}:`,
      error,
    );
    // Return game with empty ratings on error
    return {
      ...game,
      resolved_age_ratings: {
        esrb_rating: null,
        esrb_descriptors: [],
        pegi_rating: null,
        pegi_descriptors: [],
        content_warnings: [],
        is_mature: false,
        is_nsfw: false,
        has_violence: false,
        has_sexual_content: false,
        has_drug_use: false,
        has_gambling: false,
      },
    };
  }
}

/**
 * Helper function to resolve age ratings for multiple games
 * @param {Array} games - Array of raw IGDB game objects
 * @returns {Array} - Array of games with resolved age ratings
 */
async function resolveGamesAgeRatings(games) {
  return await Promise.all(games.map(resolveGameAgeRatings));
}
