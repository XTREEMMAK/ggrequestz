/**
 * Provider Registry System
 * Manages authentication providers with lazy loading and dynamic resolution
 */

import {
  validateProviderConfig,
  validateEnvironment,
} from "./utils/validation-utils.js";

/**
 * Provider definitions with metadata and lazy loading
 */
const PROVIDER_DEFINITIONS = {
  authentik: {
    name: "Authentik OIDC",
    description: "Direct integration with Authentik identity provider",
    category: "oidc",
    capabilities: {
      supportsCallback: true,
      supportsCredentials: false,
      supportsSync: false,
      requiresRedirect: true,
    },
    configFields: ["clientId", "clientSecret", "issuer"],
    envPrefix: "AUTHENTIK_",
    loader: () => import("./providers/authentik.js"),
  },

  oidc_generic: {
    name: "Generic OIDC",
    description:
      "Support for any OIDC-compliant provider (Keycloak, Auth0, etc.)",
    category: "oidc",
    capabilities: {
      supportsCallback: true,
      supportsCredentials: false,
      supportsSync: false,
      requiresRedirect: true,
    },
    configFields: ["clientId", "clientSecret", "issuer"],
    envPrefix: "OIDC_",
    loader: () => import("./providers/oidc-generic.js"),
  },

  api_integration: {
    name: "API Integration",
    description: "Sync users via REST API calls",
    category: "api",
    capabilities: {
      supportsCallback: false,
      supportsCredentials: true,
      supportsSync: true,
      requiresRedirect: false,
    },
    configFields: ["baseUrl", "apiKey"],
    envPrefix: "API_",
    loader: () => import("./providers/api-integration.js"),
  },

  webhook_integration: {
    name: "Webhook Integration",
    description: "Receive real-time user updates via webhooks",
    category: "webhook",
    capabilities: {
      supportsCallback: false,
      supportsCredentials: false,
      supportsSync: true,
      requiresRedirect: false,
    },
    configFields: ["secret"],
    envPrefix: "WEBHOOK_",
    loader: () => import("./providers/webhook-integration.js"),
  },

  local_auth: {
    name: "Local Authentication",
    description: "Traditional username/password authentication",
    category: "local",
    capabilities: {
      supportsCallback: false,
      supportsCredentials: true,
      supportsSync: false,
      requiresRedirect: false,
    },
    configFields: [],
    envPrefix: null,
    loader: () => import("./providers/local-auth.js"),
  },
};

/**
 * Provider Registry Class
 * Manages provider loading, validation, and execution
 */
export class ProviderRegistry {
  constructor() {
    this.loadedProviders = new Map();
    this.configCache = new Map();
  }

  /**
   * Get provider definition
   * @param {string} providerId - Provider identifier
   * @returns {Object|null} - Provider definition
   */
  getProviderDefinition(providerId) {
    return PROVIDER_DEFINITIONS[providerId] || null;
  }

  /**
   * Get all provider definitions
   * @returns {Object} - All provider definitions
   */
  getAllProviderDefinitions() {
    return { ...PROVIDER_DEFINITIONS };
  }

  /**
   * Lazy load provider module
   * @param {string} providerId - Provider identifier
   * @returns {Promise<Object>} - Loaded provider module
   */
  async loadProvider(providerId) {
    // Return cached provider if already loaded
    if (this.loadedProviders.has(providerId)) {
      return this.loadedProviders.get(providerId);
    }

    const definition = PROVIDER_DEFINITIONS[providerId];
    if (!definition) {
      throw new Error(`Unknown provider: ${providerId}`);
    }

    try {
      // Dynamically import provider module
      const module = await definition.loader();

      // Cache the loaded provider
      this.loadedProviders.set(providerId, module);

      return module;
    } catch (error) {
      console.error(`❌ Failed to load provider ${providerId}:`, error);
      throw new Error(`Failed to load provider: ${providerId}`);
    }
  }

  /**
   * Get provider configuration from environment
   * @param {string} providerId - Provider identifier
   * @returns {Object} - Provider configuration
   */
  getProviderConfig(providerId) {
    // Return cached config if available
    if (this.configCache.has(providerId)) {
      return this.configCache.get(providerId);
    }

    const definition = PROVIDER_DEFINITIONS[providerId];
    if (!definition) {
      throw new Error(`Unknown provider: ${providerId}`);
    }

    // Build configuration from environment variables
    const config = {};

    if (definition.envPrefix) {
      // Map common configuration fields
      const fieldMap = {
        clientId: `${definition.envPrefix}CLIENT_ID`,
        clientSecret: `${definition.envPrefix}CLIENT_SECRET`,
        issuer: `${definition.envPrefix}ISSUER`,
        redirectUri: `${definition.envPrefix}REDIRECT_URI`,
        baseUrl: `${definition.envPrefix}BASE_URL`,
        apiKey: `${definition.envPrefix}API_KEY`,
        secret: `${definition.envPrefix}SECRET`,
        scope: `${definition.envPrefix}SCOPE`,
      };

      for (const [field, envVar] of Object.entries(fieldMap)) {
        if (process.env[envVar]) {
          config[field] = process.env[envVar];
        }
      }

      // Provider-specific configuration
      if (providerId === "api_integration") {
        config.userEndpoint = process.env.API_USER_ENDPOINT || "/api/users";
        config.syncEndpoint =
          process.env.API_SYNC_ENDPOINT || "/api/users/sync";
        config.timeout = parseInt(process.env.API_TIMEOUT || "5000");
        config.enableUserSync = process.env.ENABLE_AUTO_SYNC === "true";
        config.syncInterval = parseInt(process.env.SYNC_INTERVAL || "300000");
      } else if (providerId === "webhook_integration") {
        config.enableSignatureValidation =
          process.env.WEBHOOK_VALIDATE_SIGNATURE !== "false";
        config.verifyToken = process.env.WEBHOOK_VERIFY_TOKEN;
      } else if (providerId.includes("oidc")) {
        config.scope = config.scope || "openid profile email";
      }
    }

    // Cache configuration
    this.configCache.set(providerId, config);

    return config;
  }

  /**
   * Validate provider configuration
   * @param {string} providerId - Provider identifier
   * @param {Object} config - Optional custom configuration
   * @returns {Object} - Validation result
   */
  validateProvider(providerId, config = null) {
    const definition = PROVIDER_DEFINITIONS[providerId];
    if (!definition) {
      return { valid: false, message: `Unknown provider: ${providerId}` };
    }

    // Use provided config or get from environment
    const providerConfig = config || this.getProviderConfig(providerId);

    // Validate configuration
    const configResult = validateProviderConfig(providerId, providerConfig);
    if (!configResult.valid) {
      return configResult;
    }

    // Validate environment variables
    const envResult = validateEnvironment(providerId);
    if (!envResult.valid) {
      return envResult;
    }

    return {
      valid: true,
      message: `${definition.name} configuration valid`,
      config: providerConfig,
      capabilities: definition.capabilities,
    };
  }

  /**
   * Execute provider method with error handling
   * @param {string} providerId - Provider identifier
   * @param {string} method - Method name to execute
   * @param {...any} args - Method arguments
   * @returns {Promise<any>} - Method result
   */
  async executeProviderMethod(providerId, method, ...args) {
    try {
      // Load provider if not already loaded
      const provider = await this.loadProvider(providerId);

      // Check if method exists
      if (!provider[method] || typeof provider[method] !== "function") {
        throw new Error(
          `Method ${method} not available for provider ${providerId}`,
        );
      }

      // Execute method
      return await provider[method](...args);
    } catch (error) {
      console.error(
        `Provider method execution failed (${providerId}.${method}):`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get providers by capability
   * @param {string} capability - Capability name
   * @returns {Array} - Provider IDs that support the capability
   */
  getProvidersByCapability(capability) {
    return Object.entries(PROVIDER_DEFINITIONS)
      .filter(([_, definition]) => definition.capabilities[capability])
      .map(([providerId, _]) => providerId);
  }

  /**
   * Get providers by category
   * @param {string} category - Category name
   * @returns {Array} - Provider IDs in the category
   */
  getProvidersByCategory(category) {
    return Object.entries(PROVIDER_DEFINITIONS)
      .filter(([_, definition]) => definition.category === category)
      .map(([providerId, _]) => providerId);
  }

  /**
   * Clear caches (useful for testing or config changes)
   */
  clearCaches() {
    this.loadedProviders.clear();
    this.configCache.clear();
  }

  /**
   * Pre-load providers (for performance optimization)
   * @param {Array} providerIds - Provider IDs to pre-load
   */
  async preloadProviders(providerIds = []) {
    const promises = providerIds.map((id) =>
      this.loadProvider(id).catch(() => null),
    );
    await Promise.all(promises);
  }

  /**
   * Get provider statistics
   * @returns {Object} - Registry statistics
   */
  getStats() {
    return {
      totalProviders: Object.keys(PROVIDER_DEFINITIONS).length,
      loadedProviders: this.loadedProviders.size,
      cachedConfigs: this.configCache.size,
      categories: [
        ...new Set(Object.values(PROVIDER_DEFINITIONS).map((d) => d.category)),
      ],
      capabilities: {
        callback: this.getProvidersByCapability("supportsCallback").length,
        credentials: this.getProvidersByCapability("supportsCredentials")
          .length,
        sync: this.getProvidersByCapability("supportsSync").length,
      },
    };
  }
}

// Create singleton instance
export const providerRegistry = new ProviderRegistry();

// Export provider definitions for external use
export { PROVIDER_DEFINITIONS };

// Export commonly used capabilities
export const PROVIDER_CAPABILITIES = {
  CALLBACK: "supportsCallback",
  CREDENTIALS: "supportsCredentials",
  SYNC: "supportsSync",
  REDIRECT: "requiresRedirect",
};

// Export provider categories
export const PROVIDER_CATEGORIES = {
  OIDC: "oidc",
  API: "api",
  WEBHOOK: "webhook",
  LOCAL: "local",
};
