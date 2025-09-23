/**
 * IGDB API integration utilities
 * Unified implementation for both web app and Node.js scripts
 */

import { browser } from "$app/environment";

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
async function igdbRequest(endpoint, query) {
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
    fields id, name, slug, summary, first_release_date, rating, cover.url, platforms.name, genres.name, websites.category, websites.url, total_rating_count;
    search "${title}";
    limit ${limit};
  `;

  try {
    const games = await igdbRequest("games", query);
    return games.map(formatGameData);
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
    fields id, name, slug, summary, first_release_date, rating, cover.url, platforms.name, genres.name, screenshots.url, videos.video_id, involved_companies.company.name, game_modes.name, websites.category, websites.url, total_rating_count;
    where id = ${igdbId};
  `;

  try {
    const games = await igdbRequest("games", query);
    return games.length > 0 ? formatGameData(games[0], true) : null;
  } catch (error) {
    console.error("IGDB get game error:", error);
    return null;
  }
}

/**
 * Get popular/trending games using IGDB popularity primitives
 * @param {number} limit - Number of games to return
 * @param {number} offset - Offset for pagination
 * @returns {Promise<Array>} - Array of popular games
 */
export async function getPopularGames(limit = 20, offset = 0) {
  if (browser) {
    throw new Error(
      "IGDB functions cannot be used in browser - use API routes instead",
    );
  }
  try {
    console.log(
      `🎯 getPopularGames called with limit=${limit}, offset=${offset}`,
    );

    // Request more than needed to account for games without covers
    // For larger offsets, request even more to ensure we get enough games
    const multiplier = offset > 100 ? 3 : 2; // Request 3x for high offsets, 2x for low
    const fetchLimit = Math.min(limit * multiplier, 500); // Increase cap to 500

    // Use IGDB popularity_primitives endpoint for true popularity
    const popularityQuery = `fields game_id,value,popularity_type;
sort value desc;
offset ${offset};
limit ${fetchLimit};
where popularity_type = 1;`;

    const popularityData = await igdbRequest(
      "popularity_primitives",
      popularityQuery,
    );
    console.log(`📊 Got ${popularityData.length} popularity entries`);

    if (popularityData.length === 0) {
      console.log("No popularity data found, falling back to high rated games");
      return await getHighRatedGames(limit, offset);
    }

    // If we're requesting beyond available popularity data, mix strategies
    if (offset >= popularityData.length) {
      console.log(
        `Offset ${offset} beyond popularity data (${popularityData.length}), using high-rated games`,
      );
      return await getHighRatedGames(limit, offset - popularityData.length);
    }

    // Extract game IDs from popularity data
    const gameIds = popularityData.map((item) => item.game_id);
    console.log(`🎯 Top 5 game IDs by popularity:`, gameIds.slice(0, 5));

    // Get game details for these IDs
    const gameQuery = `fields id,name,slug,summary,first_release_date,rating,cover.url,platforms.name,genres.name,websites.category,websites.url,total_rating_count;
where id = (${gameIds.join(",")}) & cover != null;
limit ${fetchLimit};`;

    const games = await igdbRequest("games", gameQuery);
    console.log(`📊 Got ${games.length} game details`);

    // Sort games by their popularity order
    const sortedGames = gameIds
      .map((id) => games.find((game) => game.id === id))
      .filter(Boolean)
      .slice(0, limit); // Only return requested amount

    console.log(
      `🎯 Final sorted games:`,
      sortedGames.slice(0, 3).map((g) => `${g.name} (${g.id})`),
    );

    // If we still don't have enough games, supplement with high-rated games
    if (sortedGames.length < limit) {
      console.log(
        `⚠️ Only got ${sortedGames.length} popular games, supplementing with high-rated games`,
      );
      // Calculate offset for high-rated games (account for popular games already fetched)
      const highRatedOffset = Math.max(0, offset - 50); // Assume ~50 popular games available
      const additionalGames = await getHighRatedGames(
        limit - sortedGames.length,
        highRatedOffset,
      );
      return [...sortedGames.map(formatGameData), ...additionalGames];
    }

    return sortedGames.map(formatGameData);
  } catch (error) {
    console.error("IGDB popularity games error:", error);
    // Fallback to rating-based query if popularity endpoint fails
    console.log("Falling back to high rated games due to error");
    return await getHighRatedGames(limit, offset);
  }
}

/**
 * Fallback function to get highly rated games
 * @param {number} limit - Number of games to return
 * @returns {Promise<Array>} - Array of highly rated games
 */
async function getHighRatedGames(limit = 20, offset = 0) {
  const oneYearAgo = Math.floor(Date.now() / 1000) - 365 * 24 * 60 * 60;

  const query = `fields id,name,slug,summary,first_release_date,rating,cover.url,platforms.name,genres.name,websites.category,websites.url,total_rating_count;
where rating >= 80 & first_release_date > ${oneYearAgo} & cover != null;
sort rating desc;
offset ${offset};
limit ${limit};`;

  try {
    const games = await igdbRequest("games", query);
    return games.map(formatGameData);
  } catch (error) {
    console.error("IGDB high rated games error:", error);
    return [];
  }
}

/**
 * Get recently released games
 * @param {number} limit - Number of games to return
 * @param {number} offset - Offset for pagination
 * @returns {Promise<Array>} - Array of recent games
 */
export async function getRecentGames(limit = 20, offset = 0) {
  if (browser) {
    throw new Error(
      "IGDB functions cannot be used in browser - use API routes instead",
    );
  }
  // Get recently released games (past releases only, no future games)
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const query = `fields id,name,slug,summary,first_release_date,rating,cover.url,platforms.name,genres.name,websites.category,websites.url,total_rating_count;
where first_release_date != null & first_release_date < ${currentTimestamp} & version_parent = null & cover != null;
sort first_release_date desc;
offset ${offset};
limit ${limit};`;

  try {
    const games = await igdbRequest("games", query);
    return games.map(formatGameData);
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
      fields id, name, slug, summary, cover.url, rating, first_release_date, platforms.name, genres.name, screenshots.url, videos.video_id, involved_companies.company.name, game_modes.name, total_rating_count, websites.category, websites.url;
      where total_rating_count >= 50;
      sort total_rating_count desc;
      limit ${limit};
    `;

    const games = await igdbRequest("games", query);
    return games.map((game) => formatGameData(game, true));
  } catch (error) {
    console.error("IGDB popular games by rating error:", error);
    return [];
  }
}
