/**
 * Base HTTP client with unified error handling, retries, and intelligent caching
 * Consolidates all API patterns for optimal performance
 */

import { browser } from "$app/environment";
import { withCache } from "../cache.js";
// Remove direct import to avoid circular dependencies
// Performance tracking will be handled asynchronously when available

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

class ApiClient {
  constructor(baseURL = "") {
    this.baseURL = baseURL;
    this.defaultOptions = {
      headers: {
        "Content-Type": "application/json",
      },
    };
    // Request deduplication map
    this.pendingRequests = new Map();
    // Default cache TTL
    this.defaultCacheTTL = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Make HTTP request with error handling, retries, caching, and deduplication
   * @param {string} url - Request URL
   * @param {Object} options - Fetch options
   * @param {number} retries - Number of retries (default: 1)
   * @param {number|null} cacheTTL - Cache TTL in milliseconds (null to disable caching)
   * @returns {Promise<any>} - Response data
   */
  async request(url, options = {}, retries = 1, cacheTTL = null) {
    if (!browser) {
      throw new Error("API client can only be used in browser environment");
    }

    const fullURL = this.baseURL + url;
    const requestOptions = {
      ...this.defaultOptions,
      ...options,
      headers: {
        ...this.defaultOptions.headers,
        ...options.headers,
      },
    };

    // Create request signature for deduplication and caching
    const requestSignature = `${requestOptions.method || "GET"}:${fullURL}:${JSON.stringify(requestOptions.body || "")}`;

    // Request deduplication - return existing promise if same request is pending
    if (this.pendingRequests.has(requestSignature)) {
      return this.pendingRequests.get(requestSignature);
    }

    // For GET requests with caching enabled, try cache first
    if (
      cacheTTL &&
      (!requestOptions.method || requestOptions.method === "GET")
    ) {
      try {
        const cachedResult = await withCache(
          `api:${requestSignature}`,
          () => this._executeRequest(fullURL, requestOptions, retries),
          cacheTTL,
        );
        return cachedResult;
      } catch (error) {
        // If caching fails, fall back to direct request
        console.warn(
          "API cache failed, falling back to direct request:",
          error,
        );
      }
    }

    // Execute request with deduplication
    const requestPromise = this._executeRequest(
      fullURL,
      requestOptions,
      retries,
    );
    this.pendingRequests.set(requestSignature, requestPromise);

    try {
      const result = await requestPromise;
      return result;
    } finally {
      // Clean up pending request
      this.pendingRequests.delete(requestSignature);
    }
  }

  /**
   * Internal method to execute the actual HTTP request
   * @private
   */
  async _executeRequest(fullURL, requestOptions, retries) {
    const startTime = performance.now();
    let lastError;
    let finalResponse;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(fullURL, requestOptions);
        finalResponse = response;

        if (!response.ok) {
          let errorData;
          try {
            errorData = await response.json();
          } catch {
            errorData = { error: response.statusText };
          }

          throw new ApiError(
            errorData.error ||
              `HTTP ${response.status}: ${response.statusText}`,
            response.status,
            errorData,
          );
        }

        // Handle empty responses
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const result = await response.json();

          // Track successful API request (async to avoid circular dependencies)
          const duration = performance.now() - startTime;
          this.trackApiRequestAsync(
            fullURL,
            requestOptions.method || "GET",
            duration,
            response.status,
            false,
          );

          return result;
        }

        // Track successful API request for non-JSON responses (async to avoid circular dependencies)
        const duration = performance.now() - startTime;
        this.trackApiRequestAsync(
          fullURL,
          requestOptions.method || "GET",
          duration,
          response.status,
          false,
        );

        return response;
      } catch (error) {
        lastError = error;

        // Track failed API request (async to avoid circular dependencies)
        if (error.status) {
          const duration = performance.now() - startTime;
          this.trackApiRequestAsync(
            fullURL,
            requestOptions.method || "GET",
            duration,
            error.status,
            false,
          );
        }

        // Don't retry on client errors (4xx) or specific server errors
        if (error.status && (error.status < 500 || error.status === 404)) {
          throw error;
        }

        // Add exponential backoff for retries
        if (attempt < retries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000); // Max 10 seconds
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  /**
   * GET request with optional caching
   * @param {string} url - Request URL
   * @param {Object} options - Fetch options
   * @param {number|null} cacheTTL - Cache TTL in milliseconds (null to disable)
   * @returns {Promise<any>} - Response data
   */
  async get(url, options = {}, cacheTTL = this.defaultCacheTTL) {
    return this.request(url, { ...options, method: "GET" }, 1, cacheTTL);
  }

  /**
   * POST request (no caching by default)
   * @param {string} url - Request URL
   * @param {Object} data - Request body data
   * @param {Object} options - Fetch options
   * @returns {Promise<any>} - Response data
   */
  async post(url, data, options = {}) {
    return this.request(
      url,
      {
        ...options,
        method: "POST",
        body: JSON.stringify(data),
      },
      1,
      null,
    );
  }

  /**
   * PUT request (no caching by default)
   * @param {string} url - Request URL
   * @param {Object} data - Request body data
   * @param {Object} options - Fetch options
   * @returns {Promise<any>} - Response data
   */
  async put(url, data, options = {}) {
    return this.request(
      url,
      {
        ...options,
        method: "PUT",
        body: JSON.stringify(data),
      },
      1,
      null,
    );
  }

  /**
   * DELETE request (no caching by default)
   * @param {string} url - Request URL
   * @param {Object} options - Fetch options
   * @returns {Promise<any>} - Response data
   */
  async delete(url, options = {}) {
    return this.request(url, { ...options, method: "DELETE" }, 1, null);
  }

  /**
   * Batch request helper for multiple endpoints
   * @param {Array} requests - Array of {url, options} objects
   * @param {number} cacheTTL - Cache TTL for GET requests
   * @returns {Promise<Array>} - Array of response data
   */
  async batch(requests, cacheTTL = this.defaultCacheTTL) {
    const promises = requests.map(({ url, options = {} }) => {
      const method = options.method || "GET";
      const ttl = method === "GET" ? cacheTTL : null;
      return this.request(url, options, 1, ttl);
    });

    return Promise.allSettled(promises);
  }

  /**
   * Async performance tracking to avoid circular dependencies
   * @private
   */
  async trackApiRequestAsync(url, method, duration, status, cached) {
    try {
      if (browser) {
        // Dynamic import to avoid circular dependencies
        const { trackApiRequest } = await import("../performance/metrics.js");
        trackApiRequest(url, method, duration, status, cached);
      }
    } catch (error) {
      // Silent fail for performance tracking
    }
  }
}

// Default API client instance
export const apiClient = new ApiClient();

// Named exports for convenience
export { ApiClient, ApiError };
