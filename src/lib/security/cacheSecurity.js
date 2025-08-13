/**
 * Cache security utilities to prevent cache poisoning and ensure data integrity
 */

import crypto from 'crypto';

// Configuration for cache security
const CACHE_CONFIG = {
  // Maximum key length to prevent DoS attacks
  MAX_KEY_LENGTH: 250,
  
  // Maximum value size (50MB)
  MAX_VALUE_SIZE: 50 * 1024 * 1024,
  
  // Key validation regex - only allow alphanumeric, hyphens, underscores, colons, and dots
  KEY_PATTERN: /^[a-zA-Z0-9\-_:.]+$/,
  
  // Sensitive data patterns to never cache
  SENSITIVE_PATTERNS: [
    /password/i,
    /\b(secret[-_]?key|api[-_]?secret|client[-_]?secret)\b/i, // Specific secret types, not just "secret"
    /\btoken\b/i, // Word boundary to avoid matching legitimate words containing "token"
    /\b(api[-_]?key|access[-_]?key|private[-_]?key)\b/i, // Specific key types only
    /\bauth(entication|orization)[-_]?(token|key|secret|header)\b/i, // Auth-related security fields only
    /session[-_]?(id|token|secret)/i, // Specific session-related fields
    /credit.*card/i,
    /\bssn\b/i,
    /social.*security/i,
    /\b(authorization|auth)[-_\s]*[:=]\s*(bearer|basic)\s+[a-zA-Z0-9]{8,}/i, // Authorization headers with context
    // Note: Removed generic hex pattern as it was blocking legitimate cache keys and user IDs
  ],
  
  // Allowed namespaces for cache keys
  ALLOWED_NAMESPACES: [
    'games',
    'users',
    'requests', 
    'search',
    'api',
    'session-meta', // Allow session metadata, not session data itself
    'system',
    'analytics',
    'rate_limit',
    // Game-related cache namespaces
    'popular-games',
    'recent-games',
    'game-requests',
    // ROMM integration cache namespaces
    'romm-availability',
    'romm-games'
  ],
  
  // Patterns for dynamic namespaces
  ALLOWED_NAMESPACE_PATTERNS: [
    /^romm-games-\d+$/, // romm-games-0, romm-games-1, etc.
    /^user-\d+-requests$/, // user-123-requests, etc.
    /^user-\d+-watchlist$/, // user-123-watchlist, etc.
    /^game-details-\d+$/, // game-details-19764, etc.
    /^watchlist-[a-f0-9]+-\d+$/, // watchlist-{hash}-{gameId}, etc.
  ]
};

/**
 * Validate cache key for security
 * @param {string} key - Cache key to validate
 * @returns {Object} - Validation result
 */
export function validateCacheKey(key) {
  if (typeof key !== 'string') {
    return { 
      valid: false, 
      reason: 'Key must be a string' 
    };
  }
  
  if (key.length === 0) {
    return { 
      valid: false, 
      reason: 'Key cannot be empty' 
    };
  }
  
  if (key.length > CACHE_CONFIG.MAX_KEY_LENGTH) {
    return { 
      valid: false, 
      reason: `Key too long (max ${CACHE_CONFIG.MAX_KEY_LENGTH} characters)` 
    };
  }
  
  if (!CACHE_CONFIG.KEY_PATTERN.test(key)) {
    return { 
      valid: false, 
      reason: 'Key contains invalid characters' 
    };
  }
  
  // Note: We don't check for sensitive patterns in cache keys
  // because keys are structural identifiers (like user hashes, game IDs)
  // Sensitive data filtering only applies to cache values
  
  // Validate namespace
  const namespace = key.split(':')[0] || '';
  
  // Check static namespaces first
  if (CACHE_CONFIG.ALLOWED_NAMESPACES.includes(namespace)) {
    return { valid: true };
  }
  
  // Check dynamic namespace patterns
  const isValidPattern = CACHE_CONFIG.ALLOWED_NAMESPACE_PATTERNS.some(pattern => 
    pattern.test(namespace)
  );
  
  if (!isValidPattern) {
    return { 
      valid: false, 
      reason: `Invalid namespace: ${namespace}` 
    };
  }
  
  return { valid: true };
}

/**
 * Validate cache value for security
 * @param {*} value - Value to cache
 * @returns {Object} - Validation result  
 */
export function validateCacheValue(value) {
  if (value === null || value === undefined) {
    return { valid: true };
  }
  
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch (error) {
    return { 
      valid: false, 
      reason: 'Value is not serializable' 
    };
  }
  
  if (serialized.length > CACHE_CONFIG.MAX_VALUE_SIZE) {
    return { 
      valid: false, 
      reason: `Value too large (max ${CACHE_CONFIG.MAX_VALUE_SIZE} bytes)` 
    };
  }
  
  // Check for sensitive data in the serialized value
  const lowerValue = serialized.toLowerCase();
  for (const pattern of CACHE_CONFIG.SENSITIVE_PATTERNS) {
    if (pattern.test(lowerValue)) {
      console.warn(`🚨 Attempt to cache sensitive data detected: ${pattern}`);
      return { 
        valid: false, 
        reason: 'Value appears to contain sensitive data' 
      };
    }
  }
  
  return { valid: true };
}

/**
 * Generate secure cache key with optional hash
 * @param {string} namespace - Cache namespace
 * @param {string} identifier - Unique identifier
 * @param {Object} options - Additional options
 * @returns {string} - Secure cache key
 */
export function generateSecureCacheKey(namespace, identifier, options = {}) {
  const { 
    hash = false, 
    includeUser = false, 
    userContext = null,
    suffix = ''
  } = options;
  
  // Validate namespace - check both static and dynamic patterns
  const isStaticNamespace = CACHE_CONFIG.ALLOWED_NAMESPACES.includes(namespace);
  const isDynamicNamespace = CACHE_CONFIG.ALLOWED_NAMESPACE_PATTERNS.some(pattern => 
    pattern.test(namespace)
  );
  
  if (!isStaticNamespace && !isDynamicNamespace) {
    throw new Error(`Invalid cache namespace: ${namespace}`);
  }
  
  let key = `${namespace}:${identifier}`;
  
  // Add user context for user-specific caches
  if (includeUser && userContext) {
    const userHash = crypto
      .createHash('sha256')
      .update(userContext.toString())
      .digest('hex')
      .substring(0, 8);
    key += `:user-${userHash}`;
  }
  
  // Add suffix if provided
  if (suffix) {
    key += `:${suffix}`;
  }
  
  // Hash the key if requested (useful for very long keys)
  if (hash) {
    const hashedKey = crypto
      .createHash('sha256')
      .update(key)
      .digest('hex')
      .substring(0, 32);
    key = `${namespace}:hashed:${hashedKey}`;
  }
  
  // Final validation
  const validation = validateCacheKey(key);
  if (!validation.valid) {
    throw new Error(`Generated cache key is invalid: ${validation.reason}`);
  }
  
  return key;
}

/**
 * Create cache entry with security metadata
 * @param {*} data - Data to cache
 * @param {Object} options - Caching options
 * @returns {Object} - Secure cache entry
 */
export function createSecureCacheEntry(data, options = {}) {
  const { 
    ttl = 300, // 5 minutes default
    version = 1,
    sensitive = false 
  } = options;
  
  if (sensitive) {
    throw new Error('Sensitive data should not be cached');
  }
  
  // Validate the data
  const validation = validateCacheValue(data);
  if (!validation.valid) {
    throw new Error(`Cache value validation failed: ${validation.reason}`);
  }
  
  const now = Date.now();
  const entry = {
    data,
    metadata: {
      created: now,
      expires: now + (ttl * 1000),
      version,
      checksum: generateDataChecksum(data)
    }
  };
  
  return entry;
}

/**
 * Verify cache entry integrity
 * @param {Object} entry - Cache entry to verify
 * @returns {Object} - Verification result
 */
export function verifyCacheEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return { valid: false, reason: 'Invalid cache entry format' };
  }
  
  if (!entry.metadata) {
    return { valid: false, reason: 'Missing cache metadata' };
  }
  
  // Check expiration
  if (Date.now() > entry.metadata.expires) {
    return { valid: false, reason: 'Cache entry expired' };
  }
  
  // Verify checksum
  const currentChecksum = generateDataChecksum(entry.data);
  if (currentChecksum !== entry.metadata.checksum) {
    console.warn('🚨 Cache integrity violation detected - checksum mismatch');
    return { valid: false, reason: 'Cache entry corrupted' };
  }
  
  return { valid: true, data: entry.data };
}

/**
 * Generate checksum for data integrity
 * @param {*} data - Data to checksum
 * @returns {string} - SHA-256 checksum
 */
function generateDataChecksum(data) {
  const serialized = JSON.stringify(data, Object.keys(data).sort());
  return crypto
    .createHash('sha256')
    .update(serialized)
    .digest('hex')
    .substring(0, 16); // First 16 chars for efficiency
}

/**
 * Sanitize cache key to prevent injection attacks
 * @param {string} rawKey - Raw cache key
 * @returns {string} - Sanitized cache key
 */
export function sanitizeCacheKey(rawKey) {
  if (typeof rawKey !== 'string') {
    return '';
  }
  
  // Remove any potentially dangerous characters
  return rawKey
    .replace(/[^a-zA-Z0-9\-_:.]/g, '_') // Replace invalid chars with underscore
    .substring(0, CACHE_CONFIG.MAX_KEY_LENGTH) // Truncate if too long
    .toLowerCase(); // Normalize case
}

/**
 * Check if data should be cached based on security rules
 * @param {*} data - Data to evaluate
 * @param {string} key - Cache key
 * @returns {boolean} - Whether data is safe to cache
 */
export function shouldCacheData(data, key) {
  // Never cache null/undefined
  if (data === null || data === undefined) {
    return false;
  }
  
  // Validate key
  const keyValidation = validateCacheKey(key);
  if (!keyValidation.valid) {
    console.warn(`🚨 Unsafe cache key rejected: ${keyValidation.reason}`);
    return false;
  }
  
  // Validate data
  const valueValidation = validateCacheValue(data);
  if (!valueValidation.valid) {
    console.warn(`🚨 Unsafe cache value rejected: ${valueValidation.reason}`);
    return false;
  }
  
  return true;
}

/**
 * Get cache statistics and security metrics
 * @returns {Object} - Cache security statistics
 */
export function getCacheSecurityStats() {
  return {
    config: {
      maxKeyLength: CACHE_CONFIG.MAX_KEY_LENGTH,
      maxValueSize: CACHE_CONFIG.MAX_VALUE_SIZE,
      allowedNamespaces: CACHE_CONFIG.ALLOWED_NAMESPACES
    },
    validation: {
      sensitivePatterns: CACHE_CONFIG.SENSITIVE_PATTERNS.length,
      keyPattern: CACHE_CONFIG.KEY_PATTERN.toString()
    }
  };
}