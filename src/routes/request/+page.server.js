/**
 * Request page data loader with cache-first strategy
 */

import { getGameById } from "$lib/gameCache.js";
import { getUserRequests } from "$lib/userProfile.js";
import { getUserIdFromAuth } from "$lib/getUserId.js";
import { query } from "$lib/database.js";

import { redirect } from "@sveltejs/kit";

export async function load({ url, parent, depends }) {
  depends("app:requests");
  const { user } = await parent();

  // Redirect unauthenticated users to login page
  if (!user) {
    throw redirect(302, "/login");
  }

  // Check if a specific game was pre-selected
  const gameId = url.searchParams.get("game");

  const [prefilledGame, userRequests] = await Promise.all([
    loadPrefilledGame(gameId),
    loadUserRequests(user),
  ]);

  return {
    prefilledGame,
    userRequests,
  };
}

async function loadPrefilledGame(gameId) {
  if (!gameId) return null;

  try {
    // Try to get game details using cache-first strategy
    const gameData = await getGameById(gameId);
    if (!gameData) return null;

    return {
      title: gameData.title,
      igdb_id: gameData.igdb_id,
      platforms: gameData.platforms || [],
      summary: gameData.summary,
    };
  } catch (error) {
    console.error("Failed to load game data for prefill:", error);
    return null;
  }
}

async function loadUserRequests(user) {
  try {
    const localUserId = await getUserIdFromAuth(user, query);
    return await getUserRequests(localUserId);
  } catch (error) {
    console.error("Failed to load user requests:", error);
    return [];
  }
}
