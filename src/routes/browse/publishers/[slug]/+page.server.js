/**
 * Publisher browse page data loader
 */

import { error } from "@sveltejs/kit";
import { gamesCache, watchlist } from "$lib/database.js";

export async function load({ params, parent }) {
  const { user } = await parent();

  try {
    const publisherSlug = params.slug;

    // Get publisher info and games
    const [publisher, games, userWatchlist] = await Promise.all([
      getPublisherBySlug(publisherSlug),
      getGamesByPublisher(publisherSlug, 24, 0),
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

    if (!publisher) {
      throw error(404, "Publisher not found");
    }

    return {
      publisher,
      games,
      userWatchlist,
    };
  } catch (err) {
    console.error("Publisher page load error:", err);
    if (err.status === 404) {
      throw err;
    }
    throw error(500, "Failed to load publisher page");
  }
}

/**
 * Get publisher information by slug
 * @param {string} slug - Publisher slug
 * @returns {Promise<Object|null>} - Publisher info
 */
async function getPublisherBySlug(slug) {
  // Mock publisher data - this would be replaced with database queries
  const publishers = {
    "electronic-arts": {
      name: "Electronic Arts",
      slug: "electronic-arts",
      description:
        "Major video game publisher known for sports games, action titles, and AAA productions",
    },
    ubisoft: {
      name: "Ubisoft",
      slug: "ubisoft",
      description:
        "French video game publisher famous for open-world games and innovative gameplay",
    },
    activision: {
      name: "Activision",
      slug: "activision",
      description:
        "American video game publisher known for Call of Duty and other blockbuster titles",
    },
    "sony-interactive-entertainment": {
      name: "Sony Interactive Entertainment",
      slug: "sony-interactive-entertainment",
      description:
        "PlayStation publisher creating exclusive games for PlayStation consoles",
    },
    "microsoft-studios": {
      name: "Microsoft Studios",
      slug: "microsoft-studios",
      description:
        "Xbox Game Studios developing exclusive titles for Xbox and PC",
    },
    nintendo: {
      name: "Nintendo",
      slug: "nintendo",
      description:
        "Japanese video game company famous for Mario, Zelda, and innovative gaming experiences",
    },
    "take-two-interactive": {
      name: "Take-Two Interactive",
      slug: "take-two-interactive",
      description:
        "Publisher of Grand Theft Auto, Red Dead Redemption, and other premium games",
    },
    "square-enix": {
      name: "Square Enix",
      slug: "square-enix",
      description:
        "Japanese publisher known for Final Fantasy, Dragon Quest, and other JRPGs",
    },
    "bandai-namco": {
      name: "Bandai Namco",
      slug: "bandai-namco",
      description:
        "Japanese entertainment company publishing games across multiple genres",
    },
    capcom: {
      name: "Capcom",
      slug: "capcom",
      description:
        "Japanese developer and publisher of Resident Evil, Street Fighter, and Monster Hunter",
    },
    sega: {
      name: "SEGA",
      slug: "sega",
      description:
        "Japanese gaming company known for Sonic, Total War, and innovative arcade games",
    },
    "warner-bros-games": {
      name: "Warner Bros. Games",
      slug: "warner-bros-games",
      description:
        "Publisher of games based on popular movie and TV franchises",
    },
  };

  return publishers[slug] || null;
}

/**
 * Get games by publisher
 * @param {string} publisherSlug - Publisher slug
 * @param {number} limit - Number of games to return
 * @param {number} offset - Offset for pagination
 * @returns {Promise<Array>} - Array of games
 */
async function getGamesByPublisher(publisherSlug, limit = 24, offset = 0) {
  try {
    // This would be replaced with proper JSONB array queries
    // For now, return mock data based on popular games
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
      {
        id: "5",
        igdb_id: "5679",
        title: "God of War Ragnarök",
        summary: "Kratos and Atreus embark on a mythic journey for answers.",
        cover_url:
          "https://images.igdb.com/igdb/image/upload/t_cover_big/co4jni.jpg",
        platforms: ["PlayStation 5", "PlayStation 4"],
        genres: ["Action", "Adventure"],
        popularity: 91,
        rating: 94,
        release_date: new Date("2022-11-09").getTime(),
        status: "popular",
      },
      {
        id: "6",
        igdb_id: "6789",
        title: "Horizon Forbidden West",
        summary: "Aloy's journey continues in a post-apocalyptic world.",
        cover_url:
          "https://images.igdb.com/igdb/image/upload/t_cover_big/co4jni.jpg",
        platforms: ["PlayStation 5", "PlayStation 4", "PC"],
        genres: ["Action", "Adventure"],
        popularity: 89,
        rating: 88,
        release_date: new Date("2022-02-18").getTime(),
        status: "popular",
      },
    ];

    return mockGames.slice(offset, offset + limit);
  } catch (error) {
    console.error("Failed to get games by publisher:", error);
    return [];
  }
}
