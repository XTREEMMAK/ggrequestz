/**
 * Request page data loader with cache-first strategy
 */

import { getGameById } from "$lib/gameCache.js";

import { redirect } from "@sveltejs/kit";

export async function load({ url, parent }) {
  const { user } = await parent();
  
  // Redirect unauthenticated users to login page
  if (!user) {
    throw redirect(302, "/login");
  }

  // Check if a specific game was pre-selected
  const gameId = url.searchParams.get("game");
  let prefilledGame = null;

  if (gameId) {
    try {
      // Try to get game details using cache-first strategy
      const gameData = await getGameById(gameId);
      if (gameData) {
        prefilledGame = {
          title: gameData.title,
          igdb_id: gameData.igdb_id,
          platforms: gameData.platforms || [],
          summary: gameData.summary,
        };
      }
    } catch (error) {
      console.error("Failed to load game data for prefill:", error);
      // Continue without prefilled data
    }
  }

  return {
    prefilledGame,
  };
}
