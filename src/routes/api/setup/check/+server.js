/**
 * Setup system check API endpoint
 * Tests various system connections and services
 */

import { json } from '@sveltejs/kit';
import { query } from '$lib/database.js';
import { getRedisClient } from '$lib/cache.js';

export async function POST({ request }) {
  try {
    const { service } = await request.json();
    
    let result = { success: false, error: null };
    
    switch (service) {
      case 'database_connection':
        result = await testDatabase();
        break;
      case 'redis_cache':
        result = await testRedis();
        break;
      case 'igdb_api':
        result = await testIGDB();
        break;
      case 'romm_library':
        result = await testROMM();
        break;
      default:
        result = { success: false, error: 'Unknown service' };
    }
    
    return json(result);
  } catch (error) {
    console.error('Setup check error:', error);
    return json({ success: false, error: error.message }, { status: 500 });
  }
}

async function testDatabase() {
  try {
    // Test basic connection with a simple query
    const result = await query('SELECT 1 as test');
    
    if (result.rows && result.rows.length > 0) {
      return { success: true };
    } else {
      return { success: false, error: 'Database query returned no results' };
    }
  } catch (error) {
    return { success: false, error: `Database connection failed: ${error.message}` };
  }
}

async function testRedis() {
  try {
    const redis = await getRedisClient();
    if (!redis) {
      // Redis is optional, so this is not a failure
      return { success: true, warning: 'Redis not configured, using memory cache fallback' };
    }
    
    // Test Redis connection with a ping
    const pingResult = await redis.ping();
    if (pingResult === 'PONG') {
      return { success: true };
    } else {
      return { success: false, error: 'Redis ping failed' };
    }
  } catch (error) {
    // Redis failure is not critical as we have memory fallback
    return { success: true, warning: `Redis connection failed: ${error.message}. Using memory cache.` };
  }
}

async function testIGDB() {
  try {
    const clientId = process.env.IGDB_CLIENT_ID;
    const clientSecret = process.env.IGDB_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      return { success: false, error: 'IGDB API credentials not configured' };
    }
    
    // Get access token
    const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`
    });
    
    if (!tokenResponse.ok) {
      return { success: false, error: 'Failed to authenticate with IGDB API' };
    }
    
    const tokenData = await tokenResponse.json();
    
    // Test API access with a simple games query
    const apiResponse = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Client-ID': clientId,
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json'
      },
      body: 'fields id,name; limit 1;'
    });
    
    if (apiResponse.ok) {
      return { success: true };
    } else {
      return { success: false, error: `IGDB API test failed: ${apiResponse.status}` };
    }
  } catch (error) {
    return { success: false, error: `IGDB API connection failed: ${error.message}` };
  }
}

async function testROMM() {
  try {
    const rommUrl = process.env.ROMM_SERVER_URL;
    const rommUsername = process.env.ROMM_USERNAME;
    const rommPassword = process.env.ROMM_PASSWORD;
    
    if (!rommUrl) {
      return { success: true, warning: 'ROMM not configured (optional)' };
    }
    
    if (!rommUsername || !rommPassword) {
      return { success: false, error: 'ROMM credentials not configured' };
    }
    
    // Test ROMM connection
    const loginResponse = await fetch(`${rommUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: rommUsername,
        password: rommPassword
      })
    });
    
    if (loginResponse.ok) {
      return { success: true };
    } else {
      return { success: false, error: `ROMM connection failed: ${loginResponse.status}` };
    }
  } catch (error) {
    return { success: true, warning: `ROMM connection failed: ${error.message} (optional service)` };
  }
}