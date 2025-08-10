/**
 * User Synchronization API
 * Manual and automatic user sync from external systems
 */

import { BaseApiHandler } from '$lib/integrations/api/base-handler.js';
import { authManager } from '$lib/integrations/auth-manager.js';

class SyncHandler extends BaseApiHandler {
  /** @type {import('./$types').RequestHandler} */
  async POST({ request }) {
    return await this.handleAsync(async () => {
      // Authenticate admin user
      const user = await this.authenticateRequest(request);
      if (user.error) return user;

      // Parse and validate request body
      const data = await this.parseRequestBody(request, {
        action: { required: true, type: 'string', enum: ['sync_user', 'sync_all'] },
        user_id: { required: false, type: 'string' }
      });
      if (data.error) return data;

      // Handle different sync actions
      switch (data.action) {
        case 'sync_user':
          if (!data.user_id) {
            return this.error('user_id is required for sync_user action');
          }

          const userResult = await authManager.syncUser(data.user_id);
          await this.logActivity('user_synced', user, { user_id: data.user_id });
          
          return this.success({
            action: 'sync_user',
            user: userResult
          });

        case 'sync_all':
          const syncResult = await authManager.syncAllUsers();
          await this.logActivity('bulk_sync', user, { stats: syncResult });
          
          return this.success({
            action: 'sync_all',
            stats: syncResult
          });
      }
    });
  }

  /** @type {import('./$types').RequestHandler} */
  async GET({ request, url }) {
    return await this.handleAsync(async () => {
      // Authenticate admin user
      const user = await this.authenticateRequest(request);
      if (user.error) return user;

      // Get sync status and configuration
      const providerInfo = authManager.getProviderInfo();

      return this.success({
        provider: providerInfo.provider,
        sync_enabled: providerInfo.supportsSync,
        user_sync_enabled: authManager.userSyncEnabled,
        config: {
          provider: providerInfo.provider,
          supports_callback: providerInfo.supportsCallback,
          supports_credentials: providerInfo.supportsCredentials,
          supports_sync: providerInfo.supportsSync
        }
      });
    });
  }
}

const handler = new SyncHandler();

/** @type {import('./$types').RequestHandler} */
export async function GET(event) {
  return await handler.GET(event);
}

/** @type {import('./$types').RequestHandler} */
export async function POST(event) {
  return await handler.POST(event);
}