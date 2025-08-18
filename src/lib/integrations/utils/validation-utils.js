/**
 * Validation Utilities
 * Generic configuration validation with caching
 */

// Cache for validation results
const validationCache = new Map();

/**
 * Create cache key for validation results
 * @param {string} type - Validation type
 * @param {Object} config - Configuration to validate
 * @returns {string} - Cache key
 */
function createCacheKey(type, config) {
  return `${type}:${JSON.stringify(config)}`;
}

/**
 * Generic field validation
 * @param {Object} config - Configuration object
 * @param {Array} requiredFields - Required field names
 * @param {string} contextName - Context for error messages
 * @returns {Object} - Validation result
 */
export function validateRequiredFields(config, requiredFields, contextName) {
  const cacheKey = createCacheKey(`required:${contextName}`, {
    config,
    requiredFields,
  });

  if (validationCache.has(cacheKey)) {
    return validationCache.get(cacheKey);
  }

  if (!config || typeof config !== "object") {
    const result = {
      valid: false,
      message: `${contextName} configuration is required`,
    };
    validationCache.set(cacheKey, result);
    return result;
  }

  for (const field of requiredFields) {
    if (!config[field]) {
      const result = {
        valid: false,
        message: `Missing ${contextName} configuration: ${field}`,
      };
      validationCache.set(cacheKey, result);
      return result;
    }
  }

  const result = {
    valid: true,
    message: `${contextName} configuration valid`,
  };
  validationCache.set(cacheKey, result);
  return result;
}

/**
 * URL validation
 * @param {string} url - URL to validate
 * @param {Object} options - Validation options
 * @returns {boolean} - True if valid URL
 */
export function isValidUrl(url, options = {}) {
  const { requireHttps = false, allowLocalhost = true } = options;

  try {
    const urlObj = new URL(url);

    // Check protocol
    if (requireHttps && urlObj.protocol !== "https:") {
      return false;
    }

    if (!["http:", "https:"].includes(urlObj.protocol)) {
      return false;
    }

    // Check localhost restriction
    if (
      !allowLocalhost &&
      (urlObj.hostname === "localhost" || urlObj.hostname === "127.0.0.1")
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Validate OIDC configuration
 * @param {Object} config - OIDC configuration
 * @returns {Object} - Validation result
 */
export function validateOidcConfig(config) {
  const requiredFields = ["clientId", "clientSecret", "issuer"];
  const result = validateRequiredFields(config, requiredFields, "OIDC");

  if (!result.valid) {
    return result;
  }

  // Additional OIDC-specific validation
  if (
    !isValidUrl(config.issuer, {
      requireHttps: process.env.NODE_ENV === "production",
    })
  ) {
    return {
      valid: false,
      message: "OIDC issuer must be a valid HTTPS URL",
    };
  }

  if (config.redirectUri && !isValidUrl(config.redirectUri)) {
    return {
      valid: false,
      message: "OIDC redirect URI must be a valid URL",
    };
  }

  return result;
}

/**
 * Validate API integration configuration
 * @param {Object} config - API configuration
 * @returns {Object} - Validation result
 */
export function validateApiConfig(config) {
  const requiredFields = ["baseUrl", "apiKey"];
  const result = validateRequiredFields(config, requiredFields, "API");

  if (!result.valid) {
    return result;
  }

  // Additional API-specific validation
  if (
    !isValidUrl(config.baseUrl, {
      requireHttps: process.env.NODE_ENV === "production",
    })
  ) {
    return {
      valid: false,
      message: "API base URL must be a valid URL",
    };
  }

  if (config.timeout && (config.timeout < 1000 || config.timeout > 120000)) {
    return {
      valid: false,
      message: "API timeout must be between 1000ms and 120000ms",
    };
  }

  return result;
}

/**
 * Validate webhook configuration
 * @param {Object} config - Webhook configuration
 * @returns {Object} - Validation result
 */
export function validateWebhookConfig(config) {
  if (!config || typeof config !== "object") {
    return {
      valid: false,
      message: "Webhook configuration is required",
    };
  }

  if (config.enableSignatureValidation && !config.secret) {
    return {
      valid: false,
      message: "Webhook secret required when signature validation is enabled",
    };
  }

  if (config.secret && config.secret.length < 16) {
    return {
      valid: false,
      message: "Webhook secret must be at least 16 characters long",
    };
  }

  return {
    valid: true,
    message: "Webhook configuration valid",
  };
}

/**
 * Provider configuration validation registry
 */
export const VALIDATION_REGISTRY = {
  authentik: validateOidcConfig,
  oidc_generic: validateOidcConfig,
  api_integration: validateApiConfig,
  webhook_integration: validateWebhookConfig,
  local_auth: () => ({ valid: true, message: "Local authentication enabled" }),
};

/**
 * Validate provider configuration
 * @param {string} provider - Provider name
 * @param {Object} config - Configuration object
 * @returns {Object} - Validation result
 */
export function validateProviderConfig(provider, config) {
  const validator = VALIDATION_REGISTRY[provider];

  if (!validator) {
    return {
      valid: false,
      message: `Unknown provider: ${provider}`,
    };
  }

  return validator(config);
}

/**
 * Validate environment variables for provider
 * @param {string} provider - Provider name
 * @returns {Object} - Validation result
 */
export function validateEnvironment(provider) {
  const envChecks = {
    authentik: [
      "AUTHENTIK_CLIENT_ID",
      "AUTHENTIK_CLIENT_SECRET",
      "AUTHENTIK_ISSUER",
    ],
    oidc_generic: ["OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET", "OIDC_ISSUER"],
    api_integration: ["API_BASE_URL", "API_KEY"],
    webhook_integration: ["WEBHOOK_SECRET"],
    local_auth: [],
  };

  const requiredVars = envChecks[provider];
  if (!requiredVars) {
    return { valid: false, message: `Unknown provider: ${provider}` };
  }

  for (const envVar of requiredVars) {
    if (!process.env[envVar]) {
      return {
        valid: false,
        message: `Missing environment variable: ${envVar}`,
      };
    }
  }

  return { valid: true, message: "Environment variables valid" };
}

/**
 * Batch validate multiple configurations
 * @param {Array} validations - Array of validation objects
 * @returns {Object} - Combined validation result
 */
export function batchValidate(validations) {
  const results = validations.map(({ type, config, provider }) => {
    if (provider) {
      return validateProviderConfig(provider, config);
    } else {
      return validateRequiredFields(config.data, config.required, type);
    }
  });

  const failures = results.filter((r) => !r.valid);

  if (failures.length > 0) {
    return {
      valid: false,
      message: failures.map((f) => f.message).join("; "),
      details: results,
    };
  }

  return {
    valid: true,
    message: "All validations passed",
    details: results,
  };
}

/**
 * Clear validation cache (useful for testing)
 */
export function clearValidationCache() {
  validationCache.clear();
}
