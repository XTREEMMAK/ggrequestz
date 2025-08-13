/**
 * Rate limiting middleware for API endpoints
 * Provides configurable rate limiting with memory and Redis backends
 */

import { json } from '@sveltejs/kit';

// In-memory store for rate limiting (fallback when Redis unavailable)
const memoryStore = new Map();

// Rate limit configurations for different endpoint types
export const RATE_LIMITS = {
  // Authentication endpoints - stricter limits (TEMPORARILY RELAXED FOR TESTING)
  auth: {
    windowMs: 1 * 60 * 1000, // 1 minute (was 15 minutes)
    max: 100, // 100 attempts per window (was 5)
    message: 'Too many authentication attempts, please try again later'
  },
  
  // API endpoints - moderate limits  
  api: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
    message: 'Too many API requests, please try again later'
  },
  
  // Search endpoints - higher limits for user experience
  search: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60, // 60 searches per minute
    message: 'Too many search requests, please slow down'
  },
  
  // Admin endpoints - moderate limits
  admin: {
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 200, // 200 admin actions per window
    message: 'Too many admin requests, please try again later'
  },
  
  // File upload endpoints - very strict
  upload: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 uploads per hour
    message: 'Upload limit exceeded, please try again later'
  },

  // Default for general endpoints
  default: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // 50 requests per window
    message: 'Too many requests, please try again later'
  }
};

/**
 * Get client IP address from request
 * @param {Request} request - SvelteKit request object
 * @param {Object} event - SvelteKit event object with getClientAddress
 * @returns {string} - Client IP address
 */
function getClientIP(request, event) {
  // Try to get real IP from various headers (for reverse proxy scenarios)
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    // X-Forwarded-For can contain multiple IPs, take the first one
    return forwarded.split(',')[0].trim();
  }
  
  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP.trim();
  }
  
  // Fallback to SvelteKit's getClientAddress
  if (event?.getClientAddress) {
    return event.getClientAddress();
  }
  
  // Last resort fallback
  return 'unknown';
}

/**
 * Generate rate limit key
 * @param {string} ip - Client IP
 * @param {string} endpoint - Endpoint identifier
 * @returns {string} - Rate limit key
 */
function getRateLimitKey(ip, endpoint) {
  return `rate_limit:${endpoint}:${ip}`;
}

/**
 * Clean expired entries from memory store
 * @param {number} now - Current timestamp
 */
function cleanExpiredEntries(now) {
  for (const [key, data] of memoryStore.entries()) {
    if (now > data.resetTime) {
      memoryStore.delete(key);
    }
  }
}

/**
 * Check rate limit using memory store
 * @param {string} key - Rate limit key
 * @param {Object} config - Rate limit configuration
 * @returns {Object} - Rate limit result
 */
async function checkMemoryRateLimit(key, config) {
  const now = Date.now();
  const resetTime = now + config.windowMs;
  
  // Clean expired entries periodically
  if (Math.random() < 0.01) { // 1% chance to clean on each check
    cleanExpiredEntries(now);
  }
  
  const existing = memoryStore.get(key);
  
  if (!existing || now > existing.resetTime) {
    // First request in window or window expired
    memoryStore.set(key, {
      count: 1,
      resetTime: resetTime
    });
    
    return {
      allowed: true,
      count: 1,
      remaining: config.max - 1,
      resetTime: resetTime
    };
  }
  
  // Increment counter
  existing.count++;
  memoryStore.set(key, existing);
  
  return {
    allowed: existing.count <= config.max,
    count: existing.count,
    remaining: Math.max(0, config.max - existing.count),
    resetTime: existing.resetTime
  };
}

/**
 * Check rate limit using Redis store (if available)
 * @param {string} key - Rate limit key  
 * @param {Object} config - Rate limit configuration
 * @returns {Object} - Rate limit result
 */
async function checkRedisRateLimit(key, config) {
  try {
    // Try to get Redis client from cache module
    const { getRedisClient } = await import('../cache.js');
    const redis = getRedisClient();
    
    if (!redis) {
      throw new Error('Redis not available');
    }
    
    const now = Date.now();
    const windowStart = now - config.windowMs;
    
    // Use Redis sorted sets for sliding window rate limiting
    const multi = redis.multi();
    
    // Remove expired entries
    multi.zRemRangeByScore(key, 0, windowStart);
    
    // Count current requests in window
    multi.zCard(key);
    
    // Add current request
    multi.zAdd(key, { score: now, value: `${now}-${Math.random()}` });
    
    // Set expiration
    multi.expire(key, Math.ceil(config.windowMs / 1000));
    
    const results = await multi.exec();
    const count = results[1]; // Count from zCard
    
    return {
      allowed: count < config.max,
      count: count + 1,
      remaining: Math.max(0, config.max - count - 1),
      resetTime: now + config.windowMs
    };
    
  } catch (error) {
    console.warn('Redis rate limiting failed, falling back to memory:', error.message);
    return checkMemoryRateLimit(key, config);
  }
}

/**
 * Rate limiting middleware factory
 * @param {string} limitType - Type of rate limit to apply
 * @param {Object} customConfig - Custom rate limit configuration
 * @returns {Function} - SvelteKit handle function
 */
export function rateLimit(limitType = 'default', customConfig = {}) {
  const config = { ...RATE_LIMITS[limitType] || RATE_LIMITS.default, ...customConfig };
  
  return async (event) => {
    const { request } = event;
    
    // Skip rate limiting for OPTIONS requests
    if (request.method === 'OPTIONS') {
      return null;
    }
    
    try {
      const ip = getClientIP(request, event);
      const key = getRateLimitKey(ip, limitType);
      
      // Check rate limit (try Redis first, fallback to memory)
      const result = await checkRedisRateLimit(key, config);
      
      // Add rate limit headers to response
      const headers = {
        'X-RateLimit-Limit': config.max.toString(),
        'X-RateLimit-Remaining': result.remaining.toString(),
        'X-RateLimit-Reset': Math.ceil(result.resetTime / 1000).toString()
      };
      
      // If rate limit exceeded, return 429
      if (!result.allowed) {
        console.warn(`Rate limit exceeded for ${ip} on ${limitType}: ${result.count}/${config.max}`);
        
        return json(
          {
            error: 'Rate limit exceeded',
            message: config.message,
            retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000)
          },
          { 
            status: 429,
            headers: {
              ...headers,
              'Retry-After': Math.ceil((result.resetTime - Date.now()) / 1000).toString()
            }
          }
        );
      }
      
      // Add headers to response for successful requests
      event.locals.rateLimitHeaders = headers;
      
      return null; // Continue to next handler
      
    } catch (error) {
      console.error('Rate limiting error:', error);
      // On error, allow request to continue (fail open)
      return null;
    }
  };
}

/**
 * Apply rate limit headers to response
 * Used in hooks.server.js to add headers to all responses
 * @param {Response} response - Response object
 * @param {Object} locals - SvelteKit locals object
 * @returns {Response} - Response with rate limit headers
 */
export function addRateLimitHeaders(response, locals) {
  if (locals.rateLimitHeaders) {
    const headers = new Headers(response.headers);
    
    for (const [key, value] of Object.entries(locals.rateLimitHeaders)) {
      headers.set(key, value);
    }
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
  
  return response;
}

/**
 * Check if IP is whitelisted (for admin IPs, health checks, etc.)
 * @param {string} ip - IP address to check
 * @returns {boolean} - Whether IP is whitelisted
 */
export function isWhitelistedIP(ip) {
  const whitelist = [
    '127.0.0.1',
    '::1',
    'localhost',
    // Add your admin IPs here if needed
    // '192.168.1.100'
  ];
  
  return whitelist.includes(ip);
}

/**
 * Get rate limit status for an IP and endpoint
 * @param {string} ip - Client IP
 * @param {string} limitType - Rate limit type
 * @returns {Object} - Current rate limit status
 */
export async function getRateLimitStatus(ip, limitType = 'default') {
  const config = RATE_LIMITS[limitType] || RATE_LIMITS.default;
  const key = getRateLimitKey(ip, limitType);
  
  try {
    return await checkRedisRateLimit(key, config);
  } catch (error) {
    return checkMemoryRateLimit(key, config);
  }
}

/**
 * Clear rate limit for specific IP and endpoint (for testing/admin purposes)
 * @param {string} ip - Client IP
 * @param {string} limitType - Rate limit type
 * @returns {boolean} - Success status
 */
export async function clearRateLimit(ip, limitType = 'default') {
  const key = getRateLimitKey(ip, limitType);
  
  try {
    // Try Redis first
    const { getRedisClient } = await import('../cache.js');
    const redis = getRedisClient();
    
    if (redis) {
      await redis.del(key);
      console.log(`Cleared Redis rate limit for ${key}`);
      return true;
    }
  } catch (error) {
    console.warn('Redis clear failed, clearing memory:', error.message);
  }
  
  // Clear from memory store
  const deleted = memoryStore.delete(key);
  console.log(`Cleared memory rate limit for ${key}: ${deleted}`);
  return deleted;
}