/**
 * Browse page data loader - fetches genres and publishers
 */

import { gamesCache } from "$lib/database.js";

import { redirect } from "@sveltejs/kit";

export async function load({ parent }) {
  const { user } = await parent();
  
  // Redirect unauthenticated users to login page
  if (!user) {
    throw redirect(302, "/login");
  }
  try {
    // Get genres and publishers with game counts
    const [genres, publishers] = await Promise.all([
      getGenresWithCounts(),
      getPublishersWithCounts(),
    ]);

    return {
      genres,
      publishers,
    };
  } catch (error) {
    console.error("Browse page load error:", error);
    return {
      genres: [],
      publishers: [],
    };
  }
}

/**
 * Get genres with game counts
 * @returns {Promise<Array>} - Array of genres with counts
 */
async function getGenresWithCounts() {
  try {
    // This would require a custom SQL query to aggregate genres from JSONB arrays
    // For now, return mock data - this would be replaced with proper database queries
    return [
      { name: "Action", slug: "action", count: 125 },
      { name: "Adventure", slug: "adventure", count: 98 },
      { name: "RPG", slug: "rpg", count: 87 },
      { name: "Strategy", slug: "strategy", count: 76 },
      { name: "Shooter", slug: "shooter", count: 65 },
      { name: "Sports", slug: "sports", count: 54 },
      { name: "Racing", slug: "racing", count: 43 },
      { name: "Simulation", slug: "simulation", count: 38 },
      { name: "Puzzle", slug: "puzzle", count: 32 },
      { name: "Fighting", slug: "fighting", count: 28 },
      { name: "Platform", slug: "platform", count: 25 },
      { name: "Horror", slug: "horror", count: 22 },
    ];
  } catch (error) {
    console.error("Failed to get genres:", error);
    return [];
  }
}

/**
 * Get publishers with game counts
 * @returns {Promise<Array>} - Array of publishers with counts
 */
async function getPublishersWithCounts() {
  try {
    // This would require a custom SQL query to aggregate publishers from JSONB arrays
    // For now, return mock data - this would be replaced with proper database queries
    return [
      { name: "Electronic Arts", slug: "electronic-arts", count: 45 },
      { name: "Ubisoft", slug: "ubisoft", count: 38 },
      { name: "Activision", slug: "activision", count: 35 },
      {
        name: "Sony Interactive Entertainment",
        slug: "sony-interactive-entertainment",
        count: 32,
      },
      { name: "Microsoft Studios", slug: "microsoft-studios", count: 28 },
      { name: "Nintendo", slug: "nintendo", count: 25 },
      { name: "Take-Two Interactive", slug: "take-two-interactive", count: 22 },
      { name: "Square Enix", slug: "square-enix", count: 20 },
      { name: "Bandai Namco", slug: "bandai-namco", count: 18 },
      { name: "Capcom", slug: "capcom", count: 16 },
      { name: "SEGA", slug: "sega", count: 14 },
      { name: "Warner Bros. Games", slug: "warner-bros-games", count: 12 },
    ];
  } catch (error) {
    console.error("Failed to get publishers:", error);
    return [];
  }
}
