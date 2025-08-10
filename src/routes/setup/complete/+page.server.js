/**
 * Setup completion page - triggers initial game cache seeding
 */

import { warmUpCache } from '$lib/gameCache.js';

export async function load() {
  try {
    
    // Start cache warming in the background (don't wait for it)
    warmUpCache().catch(error => {
      console.error('❌ Failed to warm up cache:', error);
    });
    
    return {
      success: true
    };
  } catch (error) {
    console.error('Setup completion page error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}