/**
 * Setup system check API endpoint
 * Tests various system connections and services
 */

import { json } from '@sveltejs/kit';
import { query } from '$lib/database.js';
import { getRedisClient } from '$lib/cache.js';

export async function POST({ request, cookies }) {
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
        result = await testROMM(cookies);
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

async function testROMM(cookies) {
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
    
    // Check if user is authenticated with basic auth
    let authHeaders = { 'Content-Type': 'application/json' };
    
    // Get basic auth session if available
    const basicAuthSession = cookies?.get('basic_auth_session');
    if (basicAuthSession) {
      // For basic auth users, we may need to pass additional headers
      // But for ROMM test, we use the configured ROMM credentials directly
    }
    
    // Test ROMM authentication using the correct OAuth2 token endpoint
    const tokenResponse = await fetch(`${rommUrl}/api/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'password',
        username: rommUsername,
        password: rommPassword,
        scope: 'roms.read',
      }),
    });
    
    if (tokenResponse.ok) {
      const data = await tokenResponse.json();
      if (data.access_token) {
        return { success: true };
      } else {
        return { success: false, error: 'ROMM authentication failed: No access token received' };
      }
    } else if (tokenResponse.status === 401 || tokenResponse.status === 403) {
      return { success: false, error: 'ROMM credentials are invalid' };
    } else {
      return { success: false, error: `ROMM connection failed: ${tokenResponse.status}` };
    }
  } catch (error) {
    return { success: true, warning: `ROMM connection test failed: ${error.message} (optional service)` };
  }
}