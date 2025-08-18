/**
 * ROMM API client for accessing local game library
 * Integrates with self-hosted ROMM instance for recently added games
 */

import { browser } from "$app/environment";
import { getGameById } from "./gameCache.js";

// Configuration variables
let ROMM_SERVER_URL, ROMM_USERNAME, ROMM_PASSWORD;

// Lazy load environment variables only when needed on server
async function loadEnvironmentVariables() {
  if (browser) {
    throw new Error("Environment variables cannot be loaded in browser");
  }
  
  if (ROMM_SERVER_URL !== undefined) {
    return; // Already loaded
  }
  
  const { env } = await import("$env/dynamic/private");
  ROMM_SERVER_URL = env.ROMM_SERVER_URL || process.env.ROMM_SERVER_URL;
  ROMM_USERNAME = env.ROMM_USERNAME || process.env.ROMM_USERNAME;
  ROMM_PASSWORD = env.ROMM_PASSWORD || process.env.ROMM_PASSWORD;
}

// Session token storage for authenticated requests
let sessionToken = null;

/**
 * Clear ROMM session token to force re-authentication
 */
export function clearRommSession() {
  if (browser) throw new Error("clearRommSession is server-only");
  sessionToken = null;
}

/**
 * Authenticate with ROMM API using token endpoint
 * @returns {Promise<string|null>} - Access token or null if failed
 */
async function authenticateROMM() {
  if (browser) throw new Error("authenticateROMM is server-only");
  
  await loadEnvironmentVariables();
  
  if (!ROMM_SERVER_URL || !ROMM_USERNAME || !ROMM_PASSWORD) {
    console.warn(
      "⚠️ ROMM server URL or credentials not configured - ROMM features disabled",
    );
    return null;
  }

  try {
    const response = await fetch(`${ROMM_SERVER_URL}/api/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "password",
        username: ROMM_USERNAME,
        password: ROMM_PASSWORD,
        scope: "roms.read",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `ROMM authentication failed: ${response.status} ${response.statusText} - ${errorText}`,
      );
      return null;
    }

    const data = await response.json();
    const token = data.access_token;

    if (!token) {
      console.error("No access token received from ROMM API");
      return null;
    }

    return token;
  } catch (error) {
    console.error("ROMM authentication error:", error);
    return null;
  }
}

/**
 * Make authenticated request to ROMM API using Bearer token with retry logic
 * @param {string} endpoint - API endpoint (without /api prefix)
 * @param {Object} options - Fetch options
 * @param {string} cookies - Optional cookies to forward (for same-domain auth)
 * @param {number} retryCount - Number of retries attempted (internal)
 * @returns {Promise<Object>} - API response
 */
async function rommRequest(endpoint, options = {}, cookies = null, retryCount = 0) {
  await loadEnvironmentVariables();
  
  if (!ROMM_SERVER_URL) {
    throw new Error("ROMM server URL not configured");
  }

  const maxRetries = 3;
  const isDocker = process.env.NODE_ENV === "production";
  const baseTimeout = isDocker ? 5000 : 3000; // Higher timeout in Docker
  
  let headers = {
    accept: "application/json",
    ...options.headers,
  };

  // Forward cookies if provided (for same-domain authentication)
  if (!sessionToken && cookies) {
    headers["Cookie"] = cookies;
  }

  // Get session token if we don't have one
  if (!sessionToken) {
    sessionToken = await authenticateROMM();
  }

  // Add Bearer token authentication
  if (sessionToken) {
    headers["Authorization"] = `Bearer ${sessionToken}`;
  }

  const fetchOptions = {
    ...options,
    headers,
    // Add timeout using AbortController
    signal: AbortSignal.timeout(baseTimeout * (retryCount + 1)),
  };

  try {
    const response = await fetch(
      `${ROMM_SERVER_URL}/api${endpoint}`,
      fetchOptions,
    );

    // Handle authentication issues with simple retry
    if (response.status === 401) {
      // Clear existing token and try to re-authenticate once
      sessionToken = null;
      sessionToken = await authenticateROMM();

      if (sessionToken) {
        // Retry the request with new token
        headers["Authorization"] = `Bearer ${sessionToken}`;
        const retryResponse = await fetch(`${ROMM_SERVER_URL}/api${endpoint}`, {
          ...fetchOptions,
          headers,
        });

        if (retryResponse.ok) {
          return await retryResponse.json();
        }
      }
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      
      // Retry on 5xx errors or network issues
      if (response.status >= 500 && retryCount < maxRetries) {
        console.warn(
          `ROMM API error (attempt ${retryCount + 1}/${maxRetries}): ${response.status}`,
        );
        // Exponential backoff
        await delay(1000 * Math.pow(2, retryCount));
        return rommRequest(endpoint, options, cookies, retryCount + 1);
      }
      
      console.error(
        `ROMM API error: ${response.status} ${response.statusText} - ${errorText}`,
      );
      throw new Error(
        `ROMM API error: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    return await response.json();
  } catch (error) {
    // Handle timeout and network errors with retry
    if (error.name === 'AbortError' || error.message.includes('fetch')) {
      if (retryCount < maxRetries) {
        console.warn(
          `ROMM request timeout/network error (attempt ${retryCount + 1}/${maxRetries})`,
        );
        // Exponential backoff
        await delay(1000 * Math.pow(2, retryCount));
        return rommRequest(endpoint, options, cookies, retryCount + 1);
      }
    }
    throw error;
  }
}

/**
 * Get recently added ROMs from ROMM library
 * @param {number} limit - Number of ROMs to return
 * @param {number} offset - Offset for pagination
 * @param {string} cookies - Optional cookies to forward
 * @returns {Promise<Array>} - Array of recently added ROMs
 */
export async function getRecentlyAddedROMs(
  limit = 16,
  offset = 0,
  cookies = null,
) {
  if (browser) throw new Error("getRecentlyAddedROMs is server-only");
  try {
    // Use ROMM API query format with group_by_meta_id=false
    // Add timestamp to ensure fresh data and prevent caching issues
    const timestamp = Date.now();
    const data = await rommRequest(
      `/roms?group_by_meta_id=false&order_by=created_at&order_dir=desc&limit=${limit}&offset=${offset}&_t=${timestamp}`,
      {},
      cookies,
    );

    if (!data.items) return [];

    // Use batched formatting to reduce IGDB API calls and respect rate limits
    return await batchFormatROMData(data.items);
  } catch (error) {
    console.error("Failed to get recently added ROMs:", error);
    return [];
  }
}

/**
 * Get ROM details by ID
 * @param {string} id - ROM ID
 * @returns {Promise<Object|null>} - ROM details
 */
export async function getROMById(id) {
  if (browser) throw new Error("getROMById is server-only");
  try {
    const data = await rommRequest(`/roms/${id}`);
    return await formatROMData(data);
  } catch (error) {
    console.error(`Failed to get ROM ${id}:`, error);
    return null;
  }
}

/**
 * Search ROMs in ROMM library
 * @param {string} query - Search query
 * @param {number} limit - Number of results
 * @param {number} offset - Offset for pagination
 * @returns {Promise<Array>} - Array of matching ROMs
 */
export async function searchROMs(query, limit = 20, offset = 0) {
  if (browser) throw new Error("searchROMs is server-only");
  try {
    const data = await rommRequest(
      `/roms?group_by_meta_id=false&search_term=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`,
    );

    if (!data.items) return [];

    // Use batched formatting to reduce IGDB API calls and respect rate limits
    return await batchFormatROMData(data.items);
  } catch (error) {
    console.error("Failed to search ROMs:", error);
    return [];
  }
}

/**
 * Get all platforms from ROMM
 * @returns {Promise<Array>} - Array of platforms
 */
export async function getPlatforms() {
  if (browser) throw new Error("getPlatforms is server-only");
  try {
    const data = await rommRequest("/platforms");
    return data || [];
  } catch (error) {
    console.error("Failed to get platforms:", error);
    return [];
  }
}

/**
 * Check if ROMM is properly configured
 * @returns {boolean} - Whether ROMM configuration is complete
 */
export async function isRommConfigured() {
  if (browser) throw new Error("isRommConfigured is server-only");
  
  await loadEnvironmentVariables();
  return !!(ROMM_SERVER_URL && ROMM_USERNAME && ROMM_PASSWORD);
}

/**
 * Check if ROMM is available and accessible
 * @param {string} cookies - Optional cookies to forward
 * @returns {Promise<boolean>} - Whether ROMM is available
 */
export async function isRommAvailable(cookies = null) {
  if (browser) throw new Error("isRommAvailable is server-only");
  if (!(await isRommConfigured())) {
    return false;
  }

  try {
    // Try a simple endpoint to test connectivity
    await rommRequest(
      "/roms?group_by_meta_id=false&limit=1&offset=0",
      {},
      cookies,
    );
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Add delay between requests to avoid rate limiting
 * @param {number} ms - Milliseconds to delay
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format multiple ROM data with batched IGDB lookups to avoid rate limiting
 * @param {Array} roms - Array of ROM data from ROMM API
 * @returns {Promise<Array>} - Array of formatted game data
 */
async function batchFormatROMData(roms) {
  if (!roms || roms.length === 0) return [];

  const results = [];

  // Process ROMs in smaller batches to avoid overwhelming IGDB API
  const batchSize = 3; // Reduced batch size to be more conservative

  for (let i = 0; i < roms.length; i += batchSize) {
    const batch = roms.slice(i, i + batchSize);

    // Process each ROM in the batch
    const batchPromises = batch.map(async (rom) => {
      if (!rom) return null;

      let cover_url = rom.url_cover
        ? `${ROMM_SERVER_URL}${rom.url_cover}`
        : null;

      // Try to get IGDB cover if IGDB ID is available
      if (rom.igdb_id) {
        try {
          const igdbGame = await getGameById(rom.igdb_id);
          if (igdbGame?.cover_url) {
            cover_url = igdbGame.cover_url;
          }
        } catch (error) {
          // Fall back to ROMM cover if IGDB lookup fails (rate limit or other error)
          // Don't log warnings for rate limit errors to reduce noise
          if (!error.message?.includes("Too Many Requests")) {
            console.warn(
              `Failed to get IGDB data for ROM ${rom.id}:`,
              error.message,
            );
          }
        }
      }

      return {
        id: rom.id,
        igdb_id: rom.igdb_id?.toString() || rom.id.toString(),
        title: rom.name || "Unknown Game",
        summary: rom.summary || "",
        cover_url,
        platforms: rom.platform ? [rom.platform.name] : [],
        genres: rom.genres || [],
        rating: rom.rating || null,
        release_date: rom.first_release_date || null,
        popularity_score: rom.rating || 0,
        status: "available", // All ROMM games are available to play
        romm_id: rom.id,
        romm_url: `${ROMM_SERVER_URL}/rom/${rom.id}`,
        platform_id: rom.platform?.id,
        platform_name: rom.platform?.name,
        created_at: rom.created_at,
        updated_at: rom.updated_at,
        file_name: rom.file_name,
        file_size: rom.file_size,
        // Flag to identify this as a ROMM game
        is_romm_game: true,
      };
    });

    // Wait for the batch to complete
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults.filter((result) => result !== null));

    // Add delay between batches to respect rate limits
    if (i + batchSize < roms.length) {
      await delay(200); // 200ms delay between batches
    }
  }

  return results;
}

/**
 * Format single ROM data (legacy function for compatibility)
 * @param {Object} rom - Raw ROM data from ROMM API
 * @returns {Promise<Object>} - Formatted game data
 */
async function formatROMData(rom) {
  if (!rom) return null;
  const results = await batchFormatROMData([rom]);
  return results[0] || null;
}

/**
 * Cross-reference IGDB games with ROMM library to check availability
 * @param {Array} igdbGames - Array of IGDB games
 * @param {string} cookies - Optional cookies to forward
 * @returns {Promise<Array>} - IGDB games with ROMM availability flags
 */
export async function crossReferenceWithROMM(igdbGames, cookies = null) {
  if (browser) throw new Error("crossReferenceWithROMM is server-only");
  if (!(await isRommConfigured()) || !(await isRommAvailable(cookies))) {
    return igdbGames;
  }

  try {
    // Get ROMs ordered by creation date (prioritize recently added)
    const allROMs = await rommRequest(
      "/roms?group_by_meta_id=false&order_by=created_at&order_dir=desc&limit=2000&offset=0",
      {},
      cookies,
    );
    const rommLookup = new Map();

    if (allROMs.items) {
      allROMs.items.forEach((rom) => {
        if (rom.igdb_id) {
          rommLookup.set(rom.igdb_id.toString(), rom);
        }
        // Also try matching by name (fuzzy matching)
        if (rom.name) {
          rommLookup.set(rom.name.toLowerCase().trim(), rom);
        }
      });
    }

    return igdbGames.map((game) => {
      const rommGame =
        rommLookup.get(game.igdb_id) ||
        rommLookup.get(game.title?.toLowerCase()?.trim());

      if (rommGame) {
        return {
          ...game,
          is_in_romm: true,
          romm_id: rommGame.id,
          romm_url: `${ROMM_SERVER_URL}/rom/${rommGame.id}`,
          platform_name: rommGame.platform?.name,
        };
      }

      return {
        ...game,
        is_in_romm: false,
      };
    });
  } catch (error) {
    console.error("Failed to cross-reference with ROMM:", error);
    return igdbGames;
  }
}
