/**
 * HTTP Client Utilities
 * Reusable HTTP client with connection pooling and error handling
 */

// Connection pool for reusing HTTP connections
const connectionPool = new Map();

/**
 * Get or create HTTP client for base URL
 * @param {string} baseUrl - Base URL for requests
 * @returns {Object} - HTTP client configuration
 */
function getHttpClient(baseUrl) {
  if (!connectionPool.has(baseUrl)) {
    connectionPool.set(baseUrl, {
      baseUrl,
      keepAlive: true,
      timeout: 30000,
    });
  }

  return connectionPool.get(baseUrl);
}

/**
 * Make HTTP request with standardized error handling
 * @param {string} url - Request URL
 * @param {Object} options - Request options
 * @returns {Promise<Object>} - Response object
 */
export async function makeRequest(url, options = {}) {
  const {
    method = "GET",
    headers = {},
    body = null,
    timeout = 30000,
    validateStatus = (status) => status >= 200 && status < 300,
  } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: body ? JSON.stringify(body) : null,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const responseData = {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      data: null,
      success: validateStatus(response.status),
    };

    // Parse response body
    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      responseData.data = await response.json();
    } else {
      responseData.data = await response.text();
    }

    return responseData;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error.name === "AbortError") {
      throw new Error(`Request timeout after ${timeout}ms`);
    }

    throw new Error(`Request failed: ${error.message}`);
  }
}

/**
 * API client for external service integration
 */
export class ApiClient {
  constructor(baseUrl, options = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.defaultHeaders = options.headers || {};
    this.timeout = options.timeout || 30000;
    this.apiKey = options.apiKey;
  }

  /**
   * Make authenticated API request
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Request options
   * @returns {Promise<Object>} - API response
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint.startsWith("/") ? endpoint : "/" + endpoint}`;

    const headers = {
      ...this.defaultHeaders,
      ...options.headers,
    };

    // Add API key authentication
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
      headers["X-API-Key"] = this.apiKey;
    }

    return await makeRequest(url, {
      ...options,
      headers,
      timeout: options.timeout || this.timeout,
    });
  }

  /**
   * GET request
   */
  async get(endpoint, options = {}) {
    return await this.request(endpoint, { ...options, method: "GET" });
  }

  /**
   * POST request
   */
  async post(endpoint, body, options = {}) {
    return await this.request(endpoint, {
      ...options,
      method: "POST",
      body,
    });
  }

  /**
   * PUT request
   */
  async put(endpoint, body, options = {}) {
    return await this.request(endpoint, {
      ...options,
      method: "PUT",
      body,
    });
  }

  /**
   * DELETE request
   */
  async delete(endpoint, options = {}) {
    return await this.request(endpoint, { ...options, method: "DELETE" });
  }
}

/**
 * OIDC-specific HTTP client
 */
export class OidcClient extends ApiClient {
  constructor(config) {
    super(config.issuer);
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.scope = config.scope || "openid profile email";
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code, redirectUri) {
    const response = await this.post(
      "/token",
      {
        grant_type: "authorization_code",
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: redirectUri,
      },
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        // Convert JSON body to form data for OIDC token endpoint
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code,
          redirect_uri: redirectUri,
        }).toString(),
      },
    );

    if (!response.success) {
      throw new Error(
        `Token exchange failed: ${response.status} ${response.data?.error || response.statusText}`,
      );
    }

    return response.data;
  }

  /**
   * Get user info from access token
   */
  async getUserInfo(accessToken) {
    const response = await this.get("/userinfo", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.success) {
      throw new Error(
        `Failed to get user info: ${response.status} ${response.data?.error || response.statusText}`,
      );
    }

    return response.data;
  }

  /**
   * Build authorization URL
   */
  getAuthorizationUrl(redirectUri, state) {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.clientId,
      redirect_uri: redirectUri,
      scope: this.scope,
      state: state || crypto.randomUUID(),
    });

    return `${this.baseUrl}/auth?${params.toString()}`;
  }
}

/**
 * Create API client instance
 * @param {string} baseUrl - Base URL
 * @param {Object} options - Client options
 * @returns {ApiClient} - API client instance
 */
export function createApiClient(baseUrl, options = {}) {
  return new ApiClient(baseUrl, options);
}

/**
 * Create OIDC client instance
 * @param {Object} config - OIDC configuration
 * @returns {OidcClient} - OIDC client instance
 */
export function createOidcClient(config) {
  return new OidcClient(config);
}

/**
 * Clear connection pool (useful for testing)
 */
export function clearConnectionPool() {
  connectionPool.clear();
}
