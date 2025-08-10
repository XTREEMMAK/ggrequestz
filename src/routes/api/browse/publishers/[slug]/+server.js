/**
 * API endpoint for paginated games by publisher
 */

import { json, error } from "@sveltejs/kit";

export async function GET({ params, url }) {
  try {
    const publisherSlug = params.slug;
    const searchParams = url.searchParams;
    const page = parseInt(searchParams.get("page")) || 1;
    const limit = parseInt(searchParams.get("limit")) || 24;

    // Calculate offset for pagination
    const offset = (page - 1) * limit;

    // Get games by publisher with pagination
    const games = await getGamesByPublisher(publisherSlug, limit, offset);

    return json({
      success: true,
      games,
      page,
      limit,
      hasMore: games.length === limit,
    });
  } catch (err) {
    console.error("Publisher games API error:", err);
    throw error(500, "Failed to fetch games by publisher");
  }
}

/**
 * Get games by publisher (mock implementation)
 * @param {string} publisherSlug - Publisher slug
 * @param {number} limit - Number of games to return
 * @param {number} offset - Offset for pagination
 * @returns {Promise<Array>} - Array of games
 */
async function getGamesByPublisher(publisherSlug, limit, offset) {
  // This is mock data - in a real implementation, this would query the database
  // using JSONB array operations to filter games by publisher
  const mockGames = [
    {
      id: "4",
      igdb_id: "1234",
      title: "Elden Ring",
      summary:
        "A fantasy action-RPG adventure set within a world created by Hidetaka Miyazaki and George R.R. Martin.",
      cover_url:
        "https://images.igdb.com/igdb/image/upload/t_cover_big/co4jni.jpg",
      platforms: ["PC", "PlayStation 5", "Xbox Series X"],
      genres: ["Action", "RPG"],
      popularity: 94,
      rating: 96,
      release_date: new Date("2022-02-25").getTime(),
      status: "popular",
    },
  ];

  return mockGames.slice(offset, offset + limit);
}
