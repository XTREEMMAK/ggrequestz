/**
 * IGDB API integration utilities for Node.js scripts
 */

import { config } from "dotenv";

// Load environment variables
config();

const IGDB_BASE_URL = "https://api.igdb.com/v4";
let accessToken = null;
let tokenExpiry = null;

/**
 * Get OAuth access token for IGDB API
 * @returns {Promise<string>} - Access token
 */
async function getAccessToken() {
  // Return cached token if still valid
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    return accessToken;
  }

  const tokenUrl = "https://id.twitch.tv/oauth2/token";
  const params = new URLSearchParams({
    client_id: process.env.IGDB_CLIENT_ID,
    client_secret: process.env.IGDB_CLIENT_SECRET,
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
    tokenExpiry = Date.now() + data.expires_in * 1000;

    return accessToken;
  } catch (error) {
    console.error("IGDB token request failed:", error);
    throw error;
  }
}

/**
 * Make a request to the IGDB API
 * @param {string} endpoint - API endpoint
 * @param {string} query - IGDB query string
 * @returns {Promise<Array>} - API response data
 */
async function igdbRequest(endpoint, query) {
  const token = await getAccessToken();

  const response = await fetch(`${IGDB_BASE_URL}/${endpoint}`, {
    method: "POST",
    headers: {
      "Client-ID": process.env.IGDB_CLIENT_ID,
      Authorization: `Bearer ${token}`,
      "Content-Type": "text/plain",
    },
    body: query.trim(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("IGDB API error details:", errorText);
    throw new Error(
      `IGDB API error: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  return await response.json();
}

/**
 * Get popular games from IGDB (using a different approach since popscore endpoint doesn't exist)
 * @param {number} limit - Number of games to return
 * @returns {Promise<Array>} - Array of popular games
 */
export async function getPopularGames(limit = 20) {
  try {
    const query = `
      fields name, summary, cover.url, rating, first_release_date, platforms.name, genres.name, screenshots.url, videos.video_id, involved_companies.company.name, game_modes.name, total_rating_count;
      where total_rating_count >= 50;
      sort total_rating_count desc;
      limit ${limit};
    `;

    const games = await igdbRequest("games", query);
    return games.map(formatGameData);
  } catch (error) {
    console.error("IGDB popular games error:", error);
    return [];
  }
}

/**
 * Format IGDB game data for consistent structure
 * @param {Object} game - Raw IGDB game object
 * @returns {Object} - Formatted game data
 */
function formatGameData(game) {
  return {
    igdb_id: game.id?.toString(),
    title: game.name,
    summary: game.summary || "",
    cover_url: game.cover?.url ? `https:${game.cover.url}` : null,
    rating: game.rating,
    release_date: game.first_release_date
      ? new Date(game.first_release_date * 1000).toISOString()
      : null,
    platforms: game.platforms?.map((p) => p.name) || [],
    genres: game.genres?.map((g) => g.name) || [],
    screenshots: game.screenshots?.map((s) => `https:${s.url}`) || [],
    videos: game.videos?.map((v) => v.video_id) || [],
    companies:
      game.involved_companies?.map((ic) => ic.company?.name).filter(Boolean) ||
      [],
    game_modes: game.game_modes?.map((gm) => gm.name) || [],
    popularity_score: game.total_rating_count || 0,
  };
}
