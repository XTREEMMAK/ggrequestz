/**
 * API Integration Provider
 * Refactored to use shared utilities and HTTP client
 */

import { createSessionToken, verifyJWT, extractUserFromPayload } from '../utils/jwt-utils.js';
import { createApiClient } from '../utils/http-client.js';
import { normalizeUserData, syncUserToDatabase, batchSyncUsers } from '../utils/user-sync.js';

/**
 * Authenticate user via external API
 */
export async function authenticate(credentials, config) {
  try {
    const client = createApiClient(config.baseUrl, {
      apiKey: config.apiKey,
      timeout: config.timeout
    });

    const response = await client.post('/api/auth/login', credentials);

    if (!response.success) {
      return {
        success: false,
        error: response.data?.message || 'Authentication failed'
      };
    }

    const result = response.data;
    
    // Normalize and sync user to local database
    const normalized = normalizeUserData(result.user, 'api_integration');
    const localUser = await syncUserToDatabase(normalized);
    
    // Create session token
    const sessionToken = await createSessionToken(result.user, {
      provider: 'api_integration',
      localUserId: localUser.id,
      externalToken: result.access_token
    });
    
    return {
      success: true,
      user: result.user,
      localUser,
      sessionToken
    };
  } catch (error) {
    console.error('API authentication error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Verify session with external API
 */
export async function verifySession(token, config) {
  try {
    const payload = await verifyJWT(token);
    if (!payload) return null;
    
    // Optional: Verify with external API for active session
    if (config.verifyEndpoint) {
      const client = createApiClient(config.baseUrl, {
        apiKey: config.apiKey,
        timeout: config.timeout
      });
      
      const response = await client.get(config.verifyEndpoint, {
        headers: {
          'Authorization': `Bearer ${payload.external_token}`
        }
      });
      
      if (!response.success) {
        return null; // Session invalid on external system
      }
    }
    
    return extractUserFromPayload(payload);
  } catch (error) {
    console.error('API session verification error:', error);
    return null;
  }
}

/**
 * Sync single user from external API
 */
export async function syncUser(config, userId) {
  try {
    const client = createApiClient(config.baseUrl, {
      apiKey: config.apiKey,
      timeout: config.timeout
    });

    const response = await client.get(`${config.userEndpoint}/${userId}`);

    if (!response.success) {
      throw new Error(`Failed to fetch user ${userId}: ${response.status}`);
    }

    const normalized = normalizeUserData(response.data, 'api_integration');
    return await syncUserToDatabase(normalized);
  } catch (error) {
    console.error(`Failed to sync user ${userId}:`, error);
    throw error;
  }
}

/**
 * Sync all users from external API
 */
export async function syncAllUsers(config) {
  try {
    const client = createApiClient(config.baseUrl, {
      apiKey: config.apiKey,
      timeout: config.timeout * 5 // Longer timeout for bulk sync
    });

    const response = await client.get(config.syncEndpoint);

    if (!response.success) {
      throw new Error(`Failed to sync users: ${response.status}`);
    }

    const { users } = response.data;
    return await batchSyncUsers(users, 'api_integration');
  } catch (error) {
    console.error('Failed to sync all users:', error);
    throw error;
  }
}

/**
 * Logout via API
 */
export async function logout(token, config) {
  try {
    const payload = await verifyJWT(token);
    if (!payload) {
      return { success: true, message: 'Session already invalid' };
    }

    // Optional: Call external logout endpoint
    if (config.logoutEndpoint) {
      const client = createApiClient(config.baseUrl, {
        apiKey: config.apiKey,
        timeout: config.timeout
      });
      
      await client.post(config.logoutEndpoint, null, {
        headers: {
          'Authorization': `Bearer ${payload.external_token}`
        }
      });
    }

    return { success: true, message: 'Logged out successfully' };
  } catch (error) {
    console.error('API logout error:', error);
    return { success: false, error: error.message };
  }
}