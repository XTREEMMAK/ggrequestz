#!/usr/bin/env node

/**
 * Update existing cached games with generated slugs
 * Run this after implementing slug generation to update existing data
 */

import { gamesCache } from "../src/lib/database.js";
import { generateSlug } from "../src/lib/utils.js";

async function updateGameSlugs() {
  console.log("🔄 Updating game slugs in cache...");
  
  try {
    // Get all cached games
    const games = await gamesCache.getAll();
    console.log(`📊 Found ${games.length} games in cache`);
    
    let updatedCount = 0;
    
    for (const game of games) {
      // Check if game is missing a slug or has a numeric slug (game ID)
      if (!game.slug || /^\d+$/.test(game.slug)) {
        const newSlug = generateSlug(game.title);
        
        if (newSlug && newSlug !== game.slug) {
          // Update the game with new slug
          await gamesCache.set(game.igdb_id, {
            ...game,
            slug: newSlug,
            last_updated: new Date().toISOString()
          });
          
          console.log(`✅ Updated "${game.title}" -> "${newSlug}"`);
          updatedCount++;
        }
      }
    }
    
    console.log(`🎉 Successfully updated ${updatedCount} game slugs`);
    
  } catch (error) {
    console.error("❌ Error updating game slugs:", error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  updateGameSlugs().then(() => {
    console.log("✨ Slug update complete!");
    process.exit(0);
  });
}

export { updateGameSlugs };