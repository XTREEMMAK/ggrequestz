/**
 * Genre browse page data loader
 */

import { error } from "@sveltejs/kit";
import { gamesCache, watchlist } from "$lib/database.js";

export async function load({ params, parent }) {
  const { user } = await parent();

  try {
    const genreSlug = params.slug;

    // Get genre info and games
    const [genre, games, userWatchlist] = await Promise.all([
      getGenreBySlug(genreSlug),
      getGamesByGenre(genreSlug, 24, 0),
      user ? (async () => {
        let userId;
        
        if (user.sub?.startsWith('basic_auth_')) {
          // For Basic Auth users, extract actual user ID from sub
          userId = user.sub.replace('basic_auth_', '');
        } else {
          // For Authentik users, look up database ID by authentik_sub
          const { query } = await import('$lib/database.js');
          const userResult = await query(
            "SELECT id FROM ggr_users WHERE authentik_sub = $1",
            [user.sub]
          );
          if (userResult.rows.length > 0) {
            userId = userResult.rows[0].id;
          }
        }
        
        return userId ? watchlist.get(userId).catch(() => []) : [];
      })() : Promise.resolve([]),
    ]);

    if (!genre) {
      throw error(404, "Genre not found");
    }

    return {
      genre,
      games,
      userWatchlist,
    };
  } catch (err) {
    console.error("Genre page load error:", err);
    if (err.status === 404) {
      throw err;
    }
    throw error(500, "Failed to load genre page");
  }
}

/**
 * Get genre information by slug
 * @param {string} slug - Genre slug
 * @returns {Promise<Object|null>} - Genre info
 */
async function getGenreBySlug(slug) {
  // Mock genre data - this would be replaced with database queries
  const genres = {
    action: {
      name: "Action",
      slug: "action",
      description: "Fast-paced games with combat, challenges, and excitement",
    },
    adventure: {
      name: "Adventure",
      slug: "adventure",
      description: "Story-driven games with exploration and puzzle-solving",
    },
    rpg: {
      name: "RPG",
      slug: "rpg",
      description:
        "Role-playing games with character progression and storytelling",
    },
    strategy: {
      name: "Strategy",
      slug: "strategy",
      description: "Games requiring tactical thinking and planning",
    },
    shooter: {
      name: "Shooter",
      slug: "shooter",
      description: "Games focused on ranged combat and precision aiming",
    },
    sports: {
      name: "Sports",
      slug: "sports",
      description: "Athletic competitions and sports simulations",
    },
    racing: {
      name: "Racing",
      slug: "racing",
      description: "High-speed vehicle racing and driving games",
    },
    simulation: {
      name: "Simulation",
      slug: "simulation",
      description: "Realistic simulations of real-world activities",
    },
    puzzle: {
      name: "Puzzle",
      slug: "puzzle",
      description: "Brain-teasing games with logical challenges",
    },
    fighting: {
      name: "Fighting",
      slug: "fighting",
      description: "Combat games with martial arts and fighting mechanics",
    },
    platform: {
      name: "Platform",
      slug: "platform",
      description: "Games with jumping and climbing challenges",
    },
    horror: {
      name: "Horror",
      slug: "horror",
      description: "Scary games designed to frighten and create suspense",
    },
  };

  return genres[slug] || null;
}

/**
 * Get games by genre
 * @param {string} genreSlug - Genre slug
 * @param {number} limit - Number of games to return
 * @param {number} offset - Offset for pagination
 * @returns {Promise<Array>} - Array of games
 */
async function getGamesByGenre(genreSlug, limit = 24, offset = 0) {
  try {
    // This would be replaced with proper JSONB array queries
    // For now, return mock data based on popular games
    const mockGames = [
      {
        id: "1",
        igdb_id: "1942",
        title: "The Witcher 3: Wild Hunt",
        summary:
          "A story-driven, next-generation open world role-playing game.",
        cover_url:
          "https://images.igdb.com/igdb/image/upload/t_cover_big/co1wyy.jpg",
        platforms: ["PC", "PlayStation 5", "Xbox Series X"],
        genres: ["RPG", "Adventure"],
        popularity: 95,
        rating: 93,
        release_date: new Date("2015-05-19").getTime(),
        status: "popular",
      },
      {
        id: "2",
        igdb_id: "1877",
        title: "Cyberpunk 2077",
        summary: "An open-world, action-adventure story set in Night City.",
        cover_url:
          "https://images.igdb.com/igdb/image/upload/t_cover_big/co2lbd.jpg",
        platforms: ["PC", "PlayStation 5", "Xbox Series X"],
        genres: ["Action", "RPG"],
        popularity: 88,
        rating: 86,
        release_date: new Date("2020-12-10").getTime(),
        status: "new",
      },
      {
        id: "3",
        igdb_id: "1905",
        title: "Baldur's Gate 3",
        summary: "A party-based RPG grounded in the D&D Fifth Edition ruleset.",
        cover_url:
          "https://images.igdb.com/igdb/image/upload/t_cover_big/co4jni.jpg",
        platforms: ["PC", "PlayStation 5"],
        genres: ["RPG", "Strategy"],
        popularity: 92,
        rating: 96,
        release_date: new Date("2023-08-03").getTime(),
        status: "popular",
      },
    ];

    // Filter mock games based on genre (very basic implementation)
    const filteredGames = mockGames.filter((game) =>
      game.genres.some((g) => g.toLowerCase() === genreSlug.replace("-", " ")),
    );

    return filteredGames.slice(offset, offset + limit);
  } catch (error) {
    console.error("Failed to get games by genre:", error);
    return [];
  }
}
