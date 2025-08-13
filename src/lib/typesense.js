/**
 * Typesense search client configuration and utilities
 */

import Typesense from "typesense";
import { env } from "$env/dynamic/private";

let client;

/**
 * Initialize Typesense client
 * @returns {Typesense.Client} - Typesense client instance
 */
export function getTypesenseClient() {
  if (!client) {
    client = new Typesense.Client({
      nodes: [
        {
          host: env.TYPESENSE_HOST || process.env.TYPESENSE_HOST || "localhost",
          port: parseInt(env.TYPESENSE_PORT || process.env.TYPESENSE_PORT) || 8108,
          protocol: env.TYPESENSE_PROTOCOL || process.env.TYPESENSE_PROTOCOL || "http",
        },
      ],
      apiKey: env.TYPESENSE_API_KEY || process.env.TYPESENSE_API_KEY || "xyz",
      connectionTimeoutSeconds: 2,
    });
  }
  return client;
}

/**
 * Game collection schema for Typesense
 */
export const GAMES_COLLECTION_SCHEMA = {
  name: "games",
  fields: [
    { name: "title", type: "string" },
    { name: "normalized_title", type: "string" },
    { name: "platforms", type: "string[]", facet: true },
    { name: "genres", type: "string[]", facet: true },
    { name: "popularity", type: "int32", sort: true },
    { name: "release_date", type: "int64", sort: true },
    { name: "igdb_id", type: "string", index: false },
    { name: "cover_url", type: "string", index: false },
    { name: "summary", type: "string", index: false },
    { name: "rating", type: "float", sort: true, optional: true },
    { name: "status", type: "string", facet: true, optional: true },
  ],
  default_sorting_field: "popularity",
};

/**
 * Initialize games collection if it doesn't exist
 * @returns {Promise<void>}
 */
export async function initializeGamesCollection() {
  const client = getTypesenseClient();

  try {
    // Check if collection exists
    await client.collections("games").retrieve();
  } catch (error) {
    if (error.httpStatus === 404) {
      // Create collection
      try {
        await client.collections().create(GAMES_COLLECTION_SCHEMA);
      } catch (createError) {
        console.error("Failed to create games collection:", createError);
        throw createError;
      }
    } else {
      console.error("Error checking games collection:", error);
      throw error;
    }
  }
}

/**
 * Search games using Typesense
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @returns {Promise<Object>} - Search results
 */
export async function searchGames(query, options = {}) {
  const client = getTypesenseClient();

  const searchParams = {
    q: query || "*",
    query_by: "title,normalized_title",
    sort_by: options.sortBy || "popularity:desc",
    per_page: options.perPage || 20,
    page: options.page || 1,
    facet_by: "platforms,genres,status",
    max_facet_values: 20,
    typo_tokens_threshold: 1,
    drop_tokens_threshold: 2,
    ...(options.filters && { filter_by: options.filters }),
  };

  try {
    const results = await client
      .collections("games")
      .documents()
      .search(searchParams);
    return results;
  } catch (error) {
    console.error("Search error:", error);
    throw error;
  }
}

/**
 * Add or update a game document in Typesense
 * @param {Object} gameData - Game data to index
 * @returns {Promise<Object>} - Upsert result
 */
export async function upsertGame(gameData) {
  const client = getTypesenseClient();

  try {
    const result = await client
      .collections("games")
      .documents()
      .upsert(gameData);
    return result;
  } catch (error) {
    console.error("Failed to upsert game:", error);
    throw error;
  }
}

/**
 * Get autocomplete suggestions
 * @param {string} query - Partial query
 * @param {number} limit - Number of suggestions
 * @returns {Promise<string[]>} - Array of suggestions
 */
export async function getAutocompleteSuggestions(query, limit = 5) {
  if (!query || query.length < 2) return [];

  try {
    const results = await searchGames(query, {
      perPage: limit,
      facet_by: "",
      query_by: "title",
    });

    return results.hits.map((hit) => hit.document.title);
  } catch (error) {
    console.error("Autocomplete error:", error);
    return [];
  }
}

/**
 * Get popular games (trending)
 * @param {number} limit - Number of games to return
 * @returns {Promise<Array>} - Array of popular games
 */
export async function getPopularGames(limit = 12) {
  try {
    const results = await searchGames("*", {
      perPage: limit,
      sortBy: "popularity:desc",
      facet_by: "",
    });

    return results.hits.map((hit) => hit.document);
  } catch (error) {
    console.error("Failed to get popular games:", error);
    return [];
  }
}

/**
 * Get recently added games
 * @param {number} limit - Number of games to return
 * @returns {Promise<Array>} - Array of recent games
 */
export async function getRecentGames(limit = 12) {
  try {
    const results = await searchGames("*", {
      perPage: limit,
      sortBy: "release_date:desc",
      facet_by: "",
    });

    return results.hits.map((hit) => hit.document);
  } catch (error) {
    console.error("Failed to get recent games:", error);
    return [];
  }
}
