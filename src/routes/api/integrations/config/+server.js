/**
 * Integration Configuration API
 * Manage authentication provider settings
 */

import { BaseApiHandler } from '$lib/integrations/api/base-handler.js';
import { authManager } from '$lib/integrations/auth-manager.js';

class ConfigurationHandler extends BaseApiHandler {
  /** @type {import('./$types').RequestHandler} */
  async GET({ request }) {
    return await this.handleAsync(async () => {
      // Authenticate admin user
      const user = await this.authenticateRequest(request);
      if (user.error) return user; // Return error response if auth failed

      // Get current configuration and available providers
      const providerInfo = authManager.getProviderInfo();
      const availableProviders = authManager.getAvailableProviders();

      await this.logActivity('config_viewed', user);

      return this.success({
        provider: providerInfo.provider,
        configuration: {
          provider: providerInfo.provider,
          user_sync_enabled: providerInfo.userSyncEnabled,
          supports_callback: providerInfo.supportsCallback,
          supports_credentials: providerInfo.supportsCredentials,
          supports_sync: providerInfo.supportsSync,
          validation: providerInfo.validation
        },
        available_providers: availableProviders
      });
    });
  }

  /** @type {import('./$types').RequestHandler} */
  async POST({ request }) {
    return await this.handleAsync(async () => {
      // Authenticate admin user
      const user = await this.authenticateRequest(request);
      if (user.error) return user;

      // Parse and validate request body
      const data = await this.parseRequestBody(request, {
        provider: { required: true, type: 'string', enum: ['authentik', 'oidc_generic', 'api_integration', 'webhook_integration', 'local_auth'] },
        config: { required: false, type: 'object' }
      });
      if (data.error) return data;

      // Switch to new provider
      const result = await authManager.switchProvider(data.provider, data.config || {});

      if (!result.valid) {
        return this.error(result.message, 400);
      }

      await this.logActivity('provider_changed', user, { 
        new_provider: data.provider,
        previous_provider: authManager.currentProvider 
      });

      return this.success({
        provider: data.provider,
        validation: result
      }, `Authentication provider changed to ${data.provider}`);
    });
  }
}

const handler = new ConfigurationHandler();

/** @type {import('./$types').RequestHandler} */
export async function GET(event) {
  return await handler.GET(event);
}

/** @type {import('./$types').RequestHandler} */
export async function POST(event) {
  return await handler.POST(event);
}