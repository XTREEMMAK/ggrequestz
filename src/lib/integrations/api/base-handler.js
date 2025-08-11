/**
 * Base API Handler
 * Common functionality for integration API endpoints
 */

import { json } from '@sveltejs/kit';
import { requireAuth } from '../../auth.js';

/**
 * Base API Handler Class
 * Provides common functionality for all integration endpoints
 */
export class BaseApiHandler {
  constructor() {
    this.requiredPermissions = [];
  }

  /**
   * Authenticate request and check permissions
   * @param {Request} request - Request object
   * @param {Array} requiredPermissions - Required permissions
   * @returns {Promise<Object|Response>} - User object or error response
   */
  async authenticateRequest(request, requiredPermissions = ['admin']) {
    try {
      const user = await requireAuth(request);
      
      if (!user) {
        return json({
          success: false,
          error: 'Authentication required'
        }, { status: 401 });
      }

      // Check if user has required permissions
      if (requiredPermissions.includes('admin') && !user.is_admin) {
        return json({
          success: false,
          error: 'Admin access required'
        }, { status: 403 });
      }

      return user;
    } catch (error) {
      console.error('Authentication error:', error);
      return json({
        success: false,
        error: 'Authentication failed'
      }, { status: 500 });
    }
  }

  /**
   * Parse and validate request body
   * @param {Request} request - Request object
   * @param {Object} schema - Validation schema
   * @returns {Promise<Object|Response>} - Parsed data or error response
   */
  async parseRequestBody(request, schema = {}) {
    try {
      const data = await request.json();
      
      // Basic validation
      for (const [key, config] of Object.entries(schema)) {
        if (config.required && !data[key]) {
          return json({
            success: false,
            error: `Missing required field: ${key}`
          }, { status: 400 });
        }

        if (config.type && data[key] !== undefined) {
          const actualType = typeof data[key];
          if (actualType !== config.type) {
            return json({
              success: false,
              error: `Invalid type for ${key}: expected ${config.type}, got ${actualType}`
            }, { status: 400 });
          }
        }

        if (config.enum && data[key] && !config.enum.includes(data[key])) {
          return json({
            success: false,
            error: `Invalid value for ${key}: must be one of ${config.enum.join(', ')}`
          }, { status: 400 });
        }
      }

      return data;
    } catch (error) {
      return json({
        success: false,
        error: 'Invalid JSON body'
      }, { status: 400 });
    }
  }

  /**
   * Create success response
   * @param {any} data - Response data
   * @param {string} message - Success message
   * @returns {Response} - JSON response
   */
  success(data = null, message = null) {
    const response = { success: true };
    
    if (data !== null) response.data = data;
    if (message) response.message = message;
    
    return json(response);
  }

  /**
   * Create error response
   * @param {string} error - Error message
   * @param {number} status - HTTP status code
   * @param {any} details - Additional error details
   * @returns {Response} - JSON error response
   */
  error(error, status = 400, details = null) {
    const response = { success: false, error };
    
    if (details) response.details = details;
    
    return json(response, { status });
  }

  /**
   * Handle async operations with error catching
   * @param {Function} operation - Async operation to execute
   * @returns {Promise<Response>} - Response object
   */
  async handleAsync(operation) {
    try {
      return await operation();
    } catch (error) {
      console.error('API operation error:', error);
      return this.error(
        process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
        500
      );
    }
  }

  /**
   * Validate query parameters
   * @param {URLSearchParams} searchParams - Query parameters
   * @param {Object} schema - Parameter schema
   * @returns {Object|Response} - Validated params or error response
   */
  validateQueryParams(searchParams, schema = {}) {
    const params = {};
    
    for (const [key, config] of Object.entries(schema)) {
      const value = searchParams.get(key);
      
      if (config.required && !value) {
        return this.error(`Missing required parameter: ${key}`, 400);
      }

      if (value !== null) {
        if (config.type === 'number') {
          const numValue = parseInt(value);
          if (isNaN(numValue)) {
            return this.error(`Invalid number for parameter: ${key}`, 400);
          }
          params[key] = numValue;
        } else if (config.type === 'boolean') {
          params[key] = value.toLowerCase() === 'true';
        } else {
          params[key] = value;
        }

        if (config.enum && !config.enum.includes(params[key])) {
          return this.error(`Invalid value for ${key}: must be one of ${config.enum.join(', ')}`, 400);
        }
      } else if (config.default !== undefined) {
        params[key] = config.default;
      }
    }
    
    return params;
  }

  /**
   * Log API activity
   * @param {string} action - Action performed
   * @param {Object} user - User object
   * @param {Object} details - Additional details
   */
  async logActivity(action, user = null, details = {}) {
  try {
    // This would integrate with the activity logging system
    const activity = {
      action,
      user_id: user?.id,
      user_email: user?.email,
      details,
      timestamp: new Date().toISOString(),
    };

    console.log("Activity:", activity);
    // You could replace the above with a DB insert or API call
    // await activityLogger.save(activity);

  } catch (error) {
    console.error("Failed to log activity:", error);
  }
}


  /**
   * Rate limiting check (placeholder for future implementation)
   * @param {Request} request - Request object
   * @param {string} key - Rate limit key
   * @returns {boolean} - Whether request should be allowed
   */
  async checkRateLimit(request, key) {
    // TODO: Implement rate limiting
    return true;
  }

  /**
   * Create paginated response
   * @param {Array} data - Data array
   * @param {number} page - Current page
   * @param {number} limit - Items per page
   * @param {number} total - Total items
   * @returns {Object} - Paginated response
   */
  createPaginatedResponse(data, page, limit, total) {
    const totalPages = Math.ceil(total / limit);
    
    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };
  }
}