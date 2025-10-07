/**
 * Content Rating Service for ESRB/PEGI/Age Rating Management
 * Handles content filtering, age rating assessment, and content safety evaluation
 */

import { browser } from "$app/environment";
import { query } from "$lib/database.js";

/**
 * ESRB Rating Hierarchy (lower number = more restrictive)
 */
export const ESRB_RATINGS = {
  EC: { level: 1, name: "Early Childhood", description: "Ages 3+" },
  E: { level: 2, name: "Everyone", description: "Ages 6+" },
  "E10+": { level: 3, name: "Everyone 10+", description: "Ages 10+" },
  T: { level: 4, name: "Teen", description: "Ages 13+" },
  M: { level: 5, name: "Mature 17+", description: "Ages 17+" },
  AO: { level: 6, name: "Adults Only 18+", description: "Ages 18+" },
  RP: { level: 0, name: "Rating Pending", description: "Not yet rated" },
};

/**
 * Common content descriptors that indicate mature content
 */
export const MATURE_CONTENT_DESCRIPTORS = [
  "Blood and Gore",
  "Intense Violence",
  "Strong Language",
  "Sexual Content",
  "Partial Nudity",
  "Nudity",
  "Sexual Violence",
  "Use of Drugs and Alcohol",
  "Mature Humor",
  "Strong Sexual Content",
];

/**
 * Content descriptors that indicate NSFW content
 */
export const NSFW_CONTENT_DESCRIPTORS = [
  "Sexual Content",
  "Partial Nudity",
  "Nudity",
  "Sexual Violence",
  "Strong Sexual Content",
  "Suggestive Themes",
];

/**
 * Process IGDB age rating data into our standardized format
 * @param {Array} ageRatings - IGDB age ratings array
 * @returns {Object} Processed content rating data
 */
export function processIGDBAgeRatings(ageRatings) {
  // Only log if explicitly enabled for debugging
  const debugLogging =
    process.env.NODE_ENV === "development" &&
    process.env.DEBUG_AGE_RATINGS === "true";

  if (debugLogging) {
    console.log(
      "[processIGDBAgeRatings] Raw input:",
      JSON.stringify(ageRatings, null, 2),
    );
  }

  if (!ageRatings || !Array.isArray(ageRatings)) {
    if (debugLogging) {
      console.log("[processIGDBAgeRatings] No age ratings or invalid format");
    }
    return {
      esrb_rating: null,
      esrb_descriptors: [],
      pegi_rating: null,
      pegi_descriptors: [],
      content_warnings: [],
      is_mature: false,
      is_nsfw: false,
      has_violence: false,
      has_sexual_content: false,
      has_drug_use: false,
      has_gambling: false,
    };
  }

  let esrb_rating = null;
  let esrb_descriptors = [];
  let pegi_rating = null;
  let pegi_descriptors = [];
  let content_warnings = [];

  // Process each rating
  for (const rating of ageRatings) {
    if (!rating) continue;

    if (debugLogging) {
      console.log("[processIGDBAgeRatings] Processing rating:", rating);
    }

    // ESRB ratings (organization 1)
    // Only use current non-deprecated fields
    if (rating.organization === 1) {
      const ratingValue = rating.rating_category;
      esrb_rating = mapESRBRating(ratingValue);
      if (debugLogging) {
        console.log(
          "[processIGDBAgeRatings] Found ESRB rating, organization:",
          rating.organization,
          "rating_category:",
          ratingValue,
          "mapped to:",
          esrb_rating,
        );
      }

      if (rating.rating_content_descriptions) {
        esrb_descriptors = rating.rating_content_descriptions.map((desc) =>
          mapContentDescriptor(desc),
        );
      }
    }

    // PEGI ratings (organization 2)
    // Only use current non-deprecated fields
    if (rating.organization === 2) {
      const ratingValue = rating.rating_category;
      pegi_rating = mapPEGIRating(ratingValue);
      if (debugLogging) {
        console.log(
          "[processIGDBAgeRatings] Found PEGI rating, organization:",
          rating.organization,
          "rating_category:",
          ratingValue,
          "mapped to:",
          pegi_rating,
        );
      }

      if (rating.rating_content_descriptions) {
        pegi_descriptors = rating.rating_content_descriptions.map((desc) =>
          mapContentDescriptor(desc),
        );
      }
    }
  }

  // Combine all descriptors for analysis
  const allDescriptors = [...esrb_descriptors, ...pegi_descriptors];

  // Generate content warnings and flags
  const is_mature = checkIsMature(esrb_rating, allDescriptors);
  const is_nsfw = checkIsNSFW(allDescriptors);
  const has_violence = checkHasViolence(allDescriptors);
  const has_sexual_content = checkHasSexualContent(allDescriptors);
  const has_drug_use = checkHasDrugUse(allDescriptors);
  const has_gambling = checkHasGambling(allDescriptors);

  // Generate user-friendly content warnings
  if (is_mature) content_warnings.push("Mature Content");
  if (is_nsfw) content_warnings.push("Not Safe for Work");
  if (has_violence) content_warnings.push("Violence");
  if (has_sexual_content) content_warnings.push("Sexual Content");
  if (has_drug_use) content_warnings.push("Drug/Alcohol Use");
  if (has_gambling) content_warnings.push("Gambling");

  const result = {
    esrb_rating,
    esrb_descriptors,
    pegi_rating,
    pegi_descriptors,
    content_warnings,
    is_mature,
    is_nsfw,
    has_violence,
    has_sexual_content,
    has_drug_use,
    has_gambling,
  };

  if (debugLogging) {
    console.log("[processIGDBAgeRatings] Returning result:", result);
  }
  return result;
}

/**
 * Map IGDB ESRB rating enum to our string format
 * Based on current IGDB API rating category values (as of 2024)
 */
function mapESRBRating(ratingEnum) {
  const ratingMap = {
    1: "RP", // Rating Pending
    2: "EC", // Early Childhood
    3: "E10+", // Everyone 10+ (Game 115289 with rating_category 3)
    4: "E", // Everyone
    5: "T", // Teen
    6: "M", // Mature 17+
    7: "AO", // Adults Only
  };

  if (!ratingMap[ratingEnum]) {
    // Return null for unknown values instead of causing errors
    return null;
  }

  return ratingMap[ratingEnum];
}

/**
 * Map IGDB PEGI rating enum to our string format
 * Based on current IGDB API rating category values (as of 2024)
 */
function mapPEGIRating(ratingEnum) {
  const ratingMap = {
    8: "3", // PEGI 3
    9: "7", // PEGI 7
    11: "16", // PEGI 16
    12: "18", // PEGI 18
    // Note: Missing PEGI 12 in current IGDB data
  };
  return ratingMap[ratingEnum] || null;
}

/**
 * Map IGDB content descriptor enum to readable string
 */
function mapContentDescriptor(descriptorEnum) {
  // This would need to be populated with actual IGDB content descriptor mappings
  // For now, return the enum value as a fallback
  const descriptorMap = {
    1: "Violence",
    2: "Sexual Content",
    3: "Language",
    4: "Drug Use",
    5: "Gambling",
    // Add more mappings based on IGDB documentation
  };
  return (
    descriptorMap[descriptorEnum] || `Content Descriptor ${descriptorEnum}`
  );
}

/**
 * Check if content is considered mature based on rating and descriptors
 */
function checkIsMature(esrbRating, descriptors) {
  // M or AO ratings are automatically mature
  if (esrbRating === "M" || esrbRating === "AO") return true;

  // Check for mature content descriptors
  return descriptors.some((desc) =>
    MATURE_CONTENT_DESCRIPTORS.some((mature) =>
      desc.toLowerCase().includes(mature.toLowerCase()),
    ),
  );
}

/**
 * Check if content is NSFW based on descriptors
 */
function checkIsNSFW(descriptors) {
  return descriptors.some((desc) =>
    NSFW_CONTENT_DESCRIPTORS.some((nsfw) =>
      desc.toLowerCase().includes(nsfw.toLowerCase()),
    ),
  );
}

/**
 * Check if content contains violence
 */
function checkHasViolence(descriptors) {
  const violenceKeywords = ["violence", "blood", "gore", "combat", "fighting"];
  return descriptors.some((desc) =>
    violenceKeywords.some((keyword) => desc.toLowerCase().includes(keyword)),
  );
}

/**
 * Check if content has sexual content
 */
function checkHasSexualContent(descriptors) {
  const sexualKeywords = ["sexual", "nudity", "suggestive"];
  return descriptors.some((desc) =>
    sexualKeywords.some((keyword) => desc.toLowerCase().includes(keyword)),
  );
}

/**
 * Check if content has drug/alcohol use
 */
function checkHasDrugUse(descriptors) {
  const drugKeywords = ["drug", "alcohol", "substance", "tobacco"];
  return descriptors.some((desc) =>
    drugKeywords.some((keyword) => desc.toLowerCase().includes(keyword)),
  );
}

/**
 * Check if content has gambling
 */
function checkHasGambling(descriptors) {
  const gamblingKeywords = ["gambling", "betting", "casino"];
  return descriptors.some((desc) =>
    gamblingKeywords.some((keyword) => desc.toLowerCase().includes(keyword)),
  );
}

/**
 * Cache content ratings in database
 * @param {string} igdbId - IGDB game ID
 * @param {Object} ratingData - Processed rating data
 */
export async function cacheContentRatings(igdbId, ratingData) {
  if (browser) {
    throw new Error("Content rating caching cannot be used in browser");
  }

  try {
    await query(
      `
      INSERT INTO ggr_content_ratings (
        igdb_id, esrb_rating, esrb_descriptors, pegi_rating, pegi_descriptors,
        content_warnings, is_mature, is_nsfw, has_violence, has_sexual_content,
        has_drug_use, has_gambling, cached_at, last_updated
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
      ON CONFLICT (igdb_id) DO UPDATE SET
        esrb_rating = EXCLUDED.esrb_rating,
        esrb_descriptors = EXCLUDED.esrb_descriptors,
        pegi_rating = EXCLUDED.pegi_rating,
        pegi_descriptors = EXCLUDED.pegi_descriptors,
        content_warnings = EXCLUDED.content_warnings,
        is_mature = EXCLUDED.is_mature,
        is_nsfw = EXCLUDED.is_nsfw,
        has_violence = EXCLUDED.has_violence,
        has_sexual_content = EXCLUDED.has_sexual_content,
        has_drug_use = EXCLUDED.has_drug_use,
        has_gambling = EXCLUDED.has_gambling,
        last_updated = NOW(),
        needs_refresh = false
    `,
      [
        igdbId,
        ratingData.esrb_rating,
        JSON.stringify(ratingData.esrb_descriptors),
        ratingData.pegi_rating,
        JSON.stringify(ratingData.pegi_descriptors),
        JSON.stringify(ratingData.content_warnings),
        ratingData.is_mature,
        ratingData.is_nsfw,
        ratingData.has_violence,
        ratingData.has_sexual_content,
        ratingData.has_drug_use,
        ratingData.has_gambling,
      ],
    );
  } catch (error) {
    console.error("Error caching content ratings:", error);
    throw error;
  }
}

/**
 * Get cached content ratings from database
 * @param {string} igdbId - IGDB game ID
 * @returns {Object|null} Cached rating data or null if not found
 */
export async function getCachedContentRatings(igdbId) {
  if (browser) {
    throw new Error("Content rating retrieval cannot be used in browser");
  }

  try {
    const result = await query(
      `
      SELECT * FROM ggr_content_ratings
      WHERE igdb_id = $1 AND needs_refresh = false
    `,
      [igdbId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      esrb_rating: row.esrb_rating,
      esrb_descriptors: row.esrb_descriptors || [],
      pegi_rating: row.pegi_rating,
      pegi_descriptors: row.pegi_descriptors || [],
      content_warnings: row.content_warnings || [],
      is_mature: row.is_mature,
      is_nsfw: row.is_nsfw,
      has_violence: row.has_violence,
      has_sexual_content: row.has_sexual_content,
      has_drug_use: row.has_drug_use,
      has_gambling: row.has_gambling,
      cached_at: row.cached_at,
    };
  } catch (error) {
    console.error("Error retrieving cached content ratings:", error);
    return null;
  }
}

/**
 * Keywords that indicate mature/adult content in game titles
 */
const MATURE_TITLE_KEYWORDS = [
  "adult",
  "xxx",
  "sex",
  "erotic",
  "mature",
  "gore",
  "hentai",
  "nsfw",
  "rule34",
  "futa",
  "femboy",
  "yaoi",
  "yuri",
  "ecchi",
  "lewd",
  "ntr",
  "milf",
  "loli",
  "shota",
  "doujin",
  "h-game",
  "dating sim",
  "romance sim",
  "visual novel",
  "strip",
  "nude",
  "naked",
  "brothel",
  "prostitute",
  "fetish",
  "bdsm",
  "kinky",
  "perverted",
  "pervert",
];

/**
 * Check if game title contains mature/adult content keywords
 * @param {string} title - Game title
 * @param {Array} customKeywords - Additional user-defined keywords to check
 * @returns {boolean} True if title suggests mature content
 */
function checkTitleForMatureContent(title, customKeywords = []) {
  if (!title) return false;

  const lowerTitle = title.toLowerCase();

  // Check against predefined mature keywords
  const hasPredefinedKeyword = MATURE_TITLE_KEYWORDS.some((keyword) =>
    lowerTitle.includes(keyword),
  );

  // Check against user's custom keywords
  const hasCustomKeyword = customKeywords.some((keyword) =>
    lowerTitle.includes(keyword.toLowerCase()),
  );

  return hasPredefinedKeyword || hasCustomKeyword;
}

/**
 * Assess if game content passes user's filtering preferences
 * @param {Object} gameRating - Game's content rating data
 * @param {Object} userPreferences - User's content filtering preferences (should have global filters merged via mergeFiltersWithGlobal)
 * @param {string} gameTitle - Game title for title-based filtering
 * @returns {Object} Assessment result with allowed status and warnings
 */
export function assessContentSafety(
  gameRating,
  userPreferences,
  gameTitle = "",
) {
  // Note: userPreferences should already include global filters merged at the data loading level
  // This ensures global filters are automatically enforced without separate logic
  if (!userPreferences) {
    return { allowed: true, warnings: [] };
  }

  const warnings = [];
  let allowed = true;

  // Check ESRB rating level
  if (gameRating.esrb_rating && userPreferences.max_esrb_rating) {
    const gameLevel = ESRB_RATINGS[gameRating.esrb_rating]?.level || 999;
    const userMaxLevel =
      ESRB_RATINGS[userPreferences.max_esrb_rating]?.level || 999;

    if (gameLevel > userMaxLevel) {
      allowed = false;
      warnings.push(
        `Rating ${gameRating.esrb_rating} exceeds your maximum of ${userPreferences.max_esrb_rating}`,
      );
    }
  }

  // Title-based mature content detection (includes user's custom keywords)
  const customKeywords = userPreferences.custom_content_blocks || [];
  const hasMatureTitle = checkTitleForMatureContent(gameTitle, customKeywords);

  // Check mature content filter (both from rating data and title-based detection)
  if (
    userPreferences.hide_mature_content &&
    (gameRating.is_mature || hasMatureTitle)
  ) {
    allowed = false;
    if (hasMatureTitle) {
      warnings.push("Contains mature content (detected from title)");
    } else {
      warnings.push("Contains mature content");
    }
  }

  // Check NSFW content filter (include title-based detection)
  if (
    userPreferences.hide_nsfw_content &&
    (gameRating.is_nsfw || hasMatureTitle)
  ) {
    allowed = false;
    if (hasMatureTitle) {
      warnings.push("Contains NSFW content (detected from title)");
    } else {
      warnings.push("Contains NSFW content");
    }
  }

  // For strict ESRB preferences, also filter games with mature titles that lack official ratings
  if (
    userPreferences.max_esrb_rating &&
    hasMatureTitle &&
    !gameRating.esrb_rating
  ) {
    const userMaxLevel =
      ESRB_RATINGS[userPreferences.max_esrb_rating]?.level || 999;

    // If user wants E or E10+ only, block games with mature titles even if they lack ratings
    if (userMaxLevel <= 3) {
      // E10+ and below
      allowed = false;
      warnings.push(
        "Title suggests mature content beyond your rating preference",
      );
    }
  }

  // Check custom content blocks (works on both content warnings AND game titles)
  if (
    userPreferences.custom_content_blocks &&
    userPreferences.custom_content_blocks.length > 0
  ) {
    const blockedContent = [];

    // Check against official content warnings
    if (gameRating.content_warnings) {
      const warningMatches = userPreferences.custom_content_blocks.filter(
        (blocked) =>
          gameRating.content_warnings.some((warning) =>
            warning.toLowerCase().includes(blocked.toLowerCase()),
          ),
      );
      blockedContent.push(...warningMatches);
    }

    // Check against game title
    if (gameTitle) {
      const titleMatches = userPreferences.custom_content_blocks.filter(
        (blocked) => gameTitle.toLowerCase().includes(blocked.toLowerCase()),
      );
      blockedContent.push(...titleMatches);
    }

    // Remove duplicates
    const uniqueBlockedContent = [...new Set(blockedContent)];

    if (uniqueBlockedContent.length > 0) {
      allowed = false;
      warnings.push(
        `Contains blocked content: ${uniqueBlockedContent.join(", ")}`,
      );
    }
  }

  return { allowed, warnings };
}

/**
 * Get ESRB rating level for comparison
 * @param {string} rating - ESRB rating (e.g., 'T', 'M')
 * @returns {number} Rating level (lower = more restrictive)
 */
export function getESRBLevel(rating) {
  return ESRB_RATINGS[rating]?.level || 999;
}

/**
 * Check if rating indicates mature content
 * @param {string} rating - ESRB rating
 * @returns {boolean} True if mature rating
 */
export function isMatureRating(rating) {
  return rating === "M" || rating === "AO";
}
