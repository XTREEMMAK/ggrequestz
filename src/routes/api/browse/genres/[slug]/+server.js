/**
 * API endpoint for paginated games by genre
 */

import { json, error } from "@sveltejs/kit";

export async function GET({ params, url }) {
  try {
    const genreSlug = params.slug;
    const searchParams = url.searchParams;
    const page = parseInt(searchParams.get("page")) || 1;
    const limit = parseInt(searchParams.get("limit")) || 24;

    // Calculate offset for pagination
    const offset = (page - 1) * limit;

    // Get games by genre with pagination
    const games = await getGamesByGenre(genreSlug, limit, offset);

    return json({
      success: true,
      games,
      page,
      limit,
      hasMore: games.length === limit,
    });
  } catch (err) {
    console.error("Genre games API error:", err);
    throw error(500, "Failed to fetch games by genre");
  }
}

/**
 * Get games by genre (mock implementation)
 * @param {string} genreSlug - Genre slug
 * @param {number} limit - Number of games to return
 * @param {number} offset - Offset for pagination
 * @returns {Promise<Array>} - Array of games
 */
async function getGamesByGenre(genreSlug, limit, offset) {
  // This is mock data - in a real implementation, this would query the database
  // using JSONB array operations to filter games by genre
  const mockGames = [
    {
      id: "1",
      igdb_id: "1942",
      title: "The Witcher 3: Wild Hunt",
      summary: "A story-driven, next-generation open world role-playing game.",
      cover_url:
        "https://images.igdb.com/igdb/image/upload/t_cover_big/co1wyy.jpg",
      platforms: ["PC", "PlayStation 5", "Xbox Series X"],
      genres: ["RPG", "Adventure"],
      popularity: 95,
      rating: 93,
      release_date: new Date("2015-05-19").getTime(),
      status: "popular",
    },
  ];

  return mockGames.slice(offset, offset + limit);
}
