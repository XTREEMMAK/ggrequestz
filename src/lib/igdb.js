/**
 * IGDB API integration utilities
 */

// Use runtime environment variables instead of build-time static imports
// to support Docker containers with runtime configuration
let IGDB_CLIENT_ID = process.env.IGDB_CLIENT_ID;
let IGDB_CLIENT_SECRET = process.env.IGDB_CLIENT_SECRET;

// Helper function to ensure environment variables are loaded
async function loadEnvironmentVariables() {
  // In development, try to load .env file if environment variables aren't available
  if (!IGDB_CLIENT_ID || !IGDB_CLIENT_SECRET) {
    try {
      // Use dynamic import for dotenv in ESM context
      const { config } = await import('dotenv');
      config();
      
      // Reload variables after dotenv config
      IGDB_CLIENT_ID = process.env.IGDB_CLIENT_ID;
      IGDB_CLIENT_SECRET = process.env.IGDB_CLIENT_SECRET;
    } catch (error) {
      console.warn('⚠️ Could not load dotenv for IGDB credentials:', error.message);
    }
  }
  
  return {
    client_id: IGDB_CLIENT_ID,
    client_secret: IGDB_CLIENT_SECRET
  };
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
  // Return cached token if still valid
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    return accessToken;
  }

  // Ensure environment variables are loaded
  const credentials = await loadEnvironmentVariables();
  
  if (!credentials.client_id || !credentials.client_secret) {
    throw new Error('IGDB API credentials not found. Please check IGDB_CLIENT_ID and IGDB_CLIENT_SECRET environment variables.');
  }

  const tokenUrl = "https://id.twitch.tv/oauth2/token";
  const params = new URLSearchParams({
    client_id: credentials.client_id,
    client_secret: credentials.client_secret,
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
        `Failed to get IGDB access token: ${response.statusText}`,
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
  const query = `
    fields id, name, slug, summary, first_release_date, rating, cover.url, platforms.name, genres.name, websites.category, websites.url;
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
  const query = `
    fields id, name, slug, summary, first_release_date, rating, cover.url, platforms.name, genres.name, screenshots.url, videos.video_id, involved_companies.company.name, game_modes.name, websites.category, websites.url;
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
  try {
    console.log(`🎯 getPopularGames called with limit=${limit}, offset=${offset}`);
    
    // Use IGDB popularity_primitives endpoint for true popularity
    const popularityQuery = `fields game_id,value,popularity_type;
sort value desc;
offset ${offset};
limit ${limit};
where popularity_type = 1;`;

    const popularityData = await igdbRequest("popularity_primitives", popularityQuery);
    console.log(`📊 Got ${popularityData.length} popularity entries`);

    if (popularityData.length === 0) {
      console.log("No popularity data found, falling back to high rated games");
      return await getHighRatedGames(limit, offset);
    }

    // Extract game IDs from popularity data
    const gameIds = popularityData.map((item) => item.game_id);
    console.log(`🎯 Top 5 game IDs by popularity:`, gameIds.slice(0, 5));

    // Get game details for these IDs
    const gameQuery = `fields id,name,slug,summary,first_release_date,rating,cover.url,platforms.name,genres.name,websites.category,websites.url;
where id = (${gameIds.join(",")}) & cover != null;
limit ${limit};`;

    const games = await igdbRequest("games", gameQuery);
    console.log(`📊 Got ${games.length} game details`);

    // Sort games by their popularity order
    const sortedGames = gameIds
      .map((id) => games.find((game) => game.id === id))
      .filter(Boolean);

    console.log(`🎯 Final sorted games:`, sortedGames.slice(0, 3).map(g => `${g.name} (${g.id})`));

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

  const query = `fields id,name,slug,summary,first_release_date,rating,cover.url,platforms.name,genres.name,websites.category,websites.url;
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
  // Get recently released games (past releases only, no future games)
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const query = `fields id,name,slug,summary,first_release_date,rating,cover.url,platforms.name,genres.name,websites.category,websites.url;
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
 * Format IGDB game data to our standard format
 * @param {Object} game - Raw IGDB game object
 * @param {boolean} detailed - Whether to include detailed information
 * @returns {Object} - Formatted game object
 */
function formatGameData(game, detailed = false) {
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
    cover_url: game.cover?.url
      ? `https:${game.cover.url.replace("t_thumb", "t_cover_big")}`
      : null,
    platforms: game.platforms?.map((p) => p.name) || [],
    genres: game.genres?.map((g) => g.name) || [],
    websites: processWebsites(game.websites || []),
  };

  if (detailed) {
    formatted.screenshots =
      game.screenshots?.map(
        (s) => `https:${s.url.replace("t_thumb", "t_screenshot_med")}`,
      ) || [];
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
 * Get high quality cover image URL
 * @param {string} coverUrl - Original cover URL
 * @returns {string} - High quality cover URL
 */
export function getHighQualityCover(coverUrl) {
  if (!coverUrl) return null;
  return coverUrl.replace("t_thumb", "t_cover_big");
}
