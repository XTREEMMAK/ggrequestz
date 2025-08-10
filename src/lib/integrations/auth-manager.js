/**
 * GameRequest Authentication Manager
 * Unified authentication system with provider registry and factory pattern
 */

import { browser } from '$app/environment';
import { providerRegistry, PROVIDER_CAPABILITIES } from './provider-registry.js';

/**
 * Available authentication providers (maintained for backward compatibility)
 */
export const AUTH_PROVIDERS = {
  AUTHENTIK: 'authentik',
  OIDC_GENERIC: 'oidc_generic', 
  API_INTEGRATION: 'api_integration',
  WEBHOOK_INTEGRATION: 'webhook_integration',
  LOCAL_AUTH: 'local_auth'
};

/**
 * Authentication Manager Class
 * Uses provider registry for dynamic provider loading and caching
 */
export class AuthManager {
  constructor() {
    this.currentProvider = null;
    this.providerConfig = {};
    this.userSyncEnabled = false;
    this.syncInterval = null;
    
    // Caching for performance
    this.sessionCache = new Map();
    this.validationCache = new Map();
  }

  /**
   * Initialize authentication manager
   * @param {Object} options - Configuration options
   */
  async initialize(options = {}) {
    // Determine provider from environment or options
    this.currentProvider = options.provider || 
                          process.env.AUTH_PROVIDER || 
                          AUTH_PROVIDERS.LOCAL_AUTH;

    // Get provider configuration from registry
    this.providerConfig = providerRegistry.getProviderConfig(this.currentProvider);
    
    // Override with provided options
    if (options.config) {
      this.providerConfig = { ...this.providerConfig, ...options.config };
    }

    // Initialize user sync for supporting providers
    const capabilities = providerRegistry.getProviderDefinition(this.currentProvider)?.capabilities;
    if (capabilities?.supportsSync && options.enableUserSync && !browser) {
      this.userSyncEnabled = true;
      const syncInterval = options.syncInterval || 300000; // 5 minutes
      this.startUserSync(syncInterval);
    }

    
    return this.validateConfiguration();
  }

  /**
   * Validate authentication configuration using registry
   */
  validateConfiguration() {
    const cacheKey = `${this.currentProvider}:${JSON.stringify(this.providerConfig)}`;
    
    // Return cached result if available
    if (this.validationCache.has(cacheKey)) {
      return this.validationCache.get(cacheKey);
    }

    // Validate using provider registry
    const result = providerRegistry.validateProvider(this.currentProvider, this.providerConfig);
    
    // Cache result for performance
    this.validationCache.set(cacheKey, result);
    
    return result;
  }

  /**
   * Get authorization URL for login
   * @param {string} redirectUri - Redirect URI after authentication
   * @param {string} state - State parameter for security
   */
  async getAuthorizationUrl(redirectUri, state) {
    // Check if provider supports callbacks
    const capabilities = providerRegistry.getProviderDefinition(this.currentProvider)?.capabilities;
    if (!capabilities?.supportsCallback) {
      if (this.currentProvider === AUTH_PROVIDERS.LOCAL_AUTH) {
        return `/login?redirect=${encodeURIComponent(redirectUri)}`;
      }
      throw new Error(`Provider ${this.currentProvider} does not support authorization URL`);
    }

    // Use registry to execute provider method
    return await providerRegistry.executeProviderMethod(
      this.currentProvider, 
      'getAuthorizationUrl',
      this.providerConfig,
      redirectUri, 
      state
    );
  }

  /**
   * Handle authentication callback
   * @param {string} code - Authorization code
   * @param {string} state - State parameter
   * @param {string} redirectUri - Redirect URI
   */
  async handleCallback(code, state, redirectUri) {
    const capabilities = providerRegistry.getProviderDefinition(this.currentProvider)?.capabilities;
    if (!capabilities?.supportsCallback) {
      throw new Error(`Provider ${this.currentProvider} does not support callbacks`);
    }

    return await providerRegistry.executeProviderMethod(
      this.currentProvider,
      'handleCallback',
      this.providerConfig,
      code,
      redirectUri
    );
  }

  /**
   * Authenticate user with credentials
   * @param {Object} credentials - User credentials
   */
  async authenticate(credentials) {
    const capabilities = providerRegistry.getProviderDefinition(this.currentProvider)?.capabilities;
    if (!capabilities?.supportsCredentials) {
      throw new Error(`Provider ${this.currentProvider} does not support credential authentication`);
    }

    return await providerRegistry.executeProviderMethod(
      this.currentProvider,
      'authenticate',
      credentials,
      this.providerConfig
    );
  }

  /**
   * Get current user session with caching
   * @param {string} token - Session token
   */
  async getSession(token) {
    if (!token) return null;

    // Check session cache first (short-term caching)
    const cacheKey = `${this.currentProvider}:${token.substring(0, 20)}`;
    const cachedSession = this.sessionCache.get(cacheKey);
    if (cachedSession && Date.now() - cachedSession.timestamp < 60000) { // 1 minute cache
      return cachedSession.session;
    }

    try {
      const session = await providerRegistry.executeProviderMethod(
        this.currentProvider,
        'verifySession',
        token,
        this.providerConfig
      );

      // Cache successful session verification
      if (session) {
        this.sessionCache.set(cacheKey, {
          session,
          timestamp: Date.now()
        });
      }

      return session;
    } catch (error) {
      console.error('Session verification failed:', error);
      return null;
    }
  }

  /**
   * Sync user data from external system
   * @param {string} userId - User ID to sync
   */
  async syncUser(userId) {
    const capabilities = providerRegistry.getProviderDefinition(this.currentProvider)?.capabilities;
    if (!capabilities?.supportsSync) {
      return null;
    }

    if (this.currentProvider === AUTH_PROVIDERS.WEBHOOK_INTEGRATION) {
      // Webhook sync is passive - triggered by external system
      return null;
    }

    return await providerRegistry.executeProviderMethod(
      this.currentProvider,
      'syncUser',
      this.providerConfig,
      userId
    );
  }

  /**
   * Handle webhook payload for user synchronization
   * @param {Object} payload - Webhook payload
   * @param {string} signature - Webhook signature for validation
   */
  async handleWebhook(payload, signature = null) {
    if (this.currentProvider !== AUTH_PROVIDERS.WEBHOOK_INTEGRATION) {
      throw new Error('Webhook handling is only available for webhook integration');
    }

    return await providerRegistry.executeProviderMethod(
      this.currentProvider,
      'handleWebhook',
      this.providerConfig,
      payload,
      signature
    );
  }

  /**
   * Logout user
   * @param {string} token - Session token
   */
  async logout(token) {
    try {
      return await providerRegistry.executeProviderMethod(
        this.currentProvider,
        'logout',
        token,
        this.providerConfig
      );
    } catch (error) {
      console.error('Logout failed:', error);
      return { success: true }; // Default success for providers without logout
    }
  }

  /**
   * Start periodic user synchronization
   */
  startUserSync(interval) {
    if (!this.userSyncEnabled || browser) return;

    // Clear existing interval if any
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = setInterval(async () => {
      try {
        await this.syncAllUsers();
      } catch (error) {
        console.error('User sync error:', error);
      }
    }, interval);

  }

  /**
   * Sync all users (for periodic sync)
   */
  async syncAllUsers() {
    const capabilities = providerRegistry.getProviderDefinition(this.currentProvider)?.capabilities;
    if (!capabilities?.supportsSync || this.currentProvider !== AUTH_PROVIDERS.API_INTEGRATION) {
      return null;
    }

    try {
      const result = await providerRegistry.executeProviderMethod(
        this.currentProvider,
        'syncAllUsers',
        this.providerConfig
      );
      
      return result;
    } catch (error) {
      console.error('Failed to sync all users:', error);
      throw error;
    }
  }

  /**
   * Stop user synchronization
   */
  stopUserSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /**
   * Clear all caches
   */
  clearCaches() {
    this.sessionCache.clear();
    this.validationCache.clear();
  }

  /**
   * Get current provider information with enhanced metadata
   */
  getProviderInfo() {
    const definition = providerRegistry.getProviderDefinition(this.currentProvider);
    const validation = this.validateConfiguration();
    
    return {
      provider: this.currentProvider,
      name: definition?.name || this.currentProvider,
      description: definition?.description || 'Unknown provider',
      category: definition?.category || 'unknown',
      config: this.providerConfig,
      userSyncEnabled: this.userSyncEnabled,
      capabilities: definition?.capabilities || {},
      validation,
      
      // Backward compatibility
      supportsCallback: definition?.capabilities?.supportsCallback || false,
      supportsCredentials: definition?.capabilities?.supportsCredentials || false,
      supportsSync: definition?.capabilities?.supportsSync || false
    };
  }

  /**
   * Get all available providers with metadata
   */
  getAvailableProviders() {
    return providerRegistry.getAllProviderDefinitions();
  }

  /**
   * Switch to a different provider
   */
  async switchProvider(providerId, config = {}) {
    this.stopUserSync(); // Stop current sync if active
    this.clearCaches(); // Clear all caches
    
    return await this.initialize({ 
      provider: providerId, 
      config,
      enableUserSync: config.enableUserSync,
      syncInterval: config.syncInterval
    });
  }
}

// Create singleton instance
export const authManager = new AuthManager();

// Auto-initialize if not in browser
if (!browser) {
  authManager.initialize().catch(error => {
    console.error('Failed to initialize AuthManager:', error);
  });
}