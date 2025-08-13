/**
 * Environment variable validation for security
 * Ensures production secrets are properly configured and secure
 */

import crypto from 'crypto';

// Security requirements for different types of environment variables
const ENV_VALIDATION_RULES = {
  // JWT/Session secrets
  secrets: {
    minLength: 32,
    entropyThreshold: 3.5, // bits per character
    forbiddenValues: [
      'secret',
      'password',
      'changeme',
      'fallback-secret-key',
      '123456',
      'admin',
      'test'
    ],
    pattern: /^[A-Za-z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+$/
  },
  
  // Database passwords
  dbPasswords: {
    minLength: 12,
    entropyThreshold: 3.0,
    forbiddenValues: [
      'password',
      'changeme',
      '123456',
      'admin',
      'postgres',
      'root'
    ],
    requireMixedCase: true,
    requireNumbers: true,
    requireSpecialChars: true
  },
  
  // API keys
  apiKeys: {
    minLength: 16,
    entropyThreshold: 4.0,
    forbiddenValues: [
      'your-api-key',
      'changeme',
      'test-key',
      '123456'
    ]
  },
  
  // URLs - basic validation
  urls: {
    protocol: ['http:', 'https:'],
    forbiddenValues: [
      'http://localhost',
      'http://example.com',
      'https://example.com'
    ]
  }
};

/**
 * Calculate entropy of a string (Shannon entropy)
 * @param {string} str - String to analyze
 * @returns {number} - Entropy in bits per character
 */
function calculateEntropy(str) {
  if (!str) return 0;
  
  const frequency = {};
  for (const char of str) {
    frequency[char] = (frequency[char] || 0) + 1;
  }
  
  let entropy = 0;
  const len = str.length;
  
  for (const count of Object.values(frequency)) {
    const probability = count / len;
    entropy -= probability * Math.log2(probability);
  }
  
  return entropy;
}

/**
 * Validate a secret (JWT secret, session secret, etc.)
 * @param {string} value - Secret value to validate
 * @param {string} name - Name of the environment variable
 * @returns {Object} - Validation result
 */
export function validateSecret(value, name) {
  if (!value || typeof value !== 'string') {
    return {
      valid: false,
      severity: 'critical',
      message: `${name} is missing or not a string`
    };
  }
  
  const rules = ENV_VALIDATION_RULES.secrets;
  
  // Check length
  if (value.length < rules.minLength) {
    return {
      valid: false,
      severity: 'critical',
      message: `${name} too short (minimum ${rules.minLength} characters)`
    };
  }
  
  // Check for forbidden values
  const lowerValue = value.toLowerCase();
  for (const forbidden of rules.forbiddenValues) {
    if (lowerValue.includes(forbidden.toLowerCase())) {
      return {
        valid: false,
        severity: 'critical',
        message: `${name} contains insecure pattern: ${forbidden}`
      };
    }
  }
  
  // Check entropy
  const entropy = calculateEntropy(value);
  if (entropy < rules.entropyThreshold) {
    return {
      valid: false,
      severity: 'high',
      message: `${name} has low entropy (${entropy.toFixed(2)} bits/char, minimum ${rules.entropyThreshold})`
    };
  }
  
  // Check pattern
  if (!rules.pattern.test(value)) {
    return {
      valid: false,
      severity: 'medium',
      message: `${name} contains invalid characters`
    };
  }
  
  return { valid: true, message: `${name} validation passed` };
}

/**
 * Validate database password
 * @param {string} value - Password to validate
 * @param {string} name - Name of the environment variable
 * @returns {Object} - Validation result
 */
export function validateDbPassword(value, name) {
  if (!value || typeof value !== 'string') {
    return {
      valid: false,
      severity: 'critical',
      message: `${name} is missing or not a string`
    };
  }
  
  const rules = ENV_VALIDATION_RULES.dbPasswords;
  
  // Check length
  if (value.length < rules.minLength) {
    return {
      valid: false,
      severity: 'critical',
      message: `${name} too short (minimum ${rules.minLength} characters)`
    };
  }
  
  // Check for forbidden values
  const lowerValue = value.toLowerCase();
  for (const forbidden of rules.forbiddenValues) {
    if (lowerValue.includes(forbidden.toLowerCase())) {
      return {
        valid: false,
        severity: 'critical',
        message: `${name} contains insecure pattern: ${forbidden}`
      };
    }
  }
  
  // Check complexity requirements
  if (rules.requireMixedCase) {
    if (!/[a-z]/.test(value) || !/[A-Z]/.test(value)) {
      return {
        valid: false,
        severity: 'high',
        message: `${name} must contain both uppercase and lowercase letters`
      };
    }
  }
  
  if (rules.requireNumbers && !/\d/.test(value)) {
    return {
      valid: false,
      severity: 'high',
      message: `${name} must contain at least one number`
    };
  }
  
  if (rules.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(value)) {
    return {
      valid: false,
      severity: 'high',
      message: `${name} must contain at least one special character`
    };
  }
  
  // Check entropy
  const entropy = calculateEntropy(value);
  if (entropy < rules.entropyThreshold) {
    return {
      valid: false,
      severity: 'medium',
      message: `${name} has low entropy (${entropy.toFixed(2)} bits/char)`
    };
  }
  
  return { valid: true, message: `${name} validation passed` };
}

/**
 * Validate API key
 * @param {string} value - API key to validate
 * @param {string} name - Name of the environment variable
 * @returns {Object} - Validation result
 */
export function validateApiKey(value, name) {
  if (!value || typeof value !== 'string') {
    return {
      valid: false,
      severity: 'critical',
      message: `${name} is missing or not a string`
    };
  }
  
  const rules = ENV_VALIDATION_RULES.apiKeys;
  
  // Check length
  if (value.length < rules.minLength) {
    return {
      valid: false,
      severity: 'critical',
      message: `${name} too short (minimum ${rules.minLength} characters)`
    };
  }
  
  // Check for forbidden values
  const lowerValue = value.toLowerCase();
  for (const forbidden of rules.forbiddenValues) {
    if (lowerValue.includes(forbidden.toLowerCase())) {
      return {
        valid: false,
        severity: 'critical',
        message: `${name} contains insecure pattern: ${forbidden}`
      };
    }
  }
  
  // Check entropy
  const entropy = calculateEntropy(value);
  if (entropy < rules.entropyThreshold) {
    return {
      valid: false,
      severity: 'high',
      message: `${name} has low entropy (${entropy.toFixed(2)} bits/char)`
    };
  }
  
  return { valid: true, message: `${name} validation passed` };
}

/**
 * Validate URL
 * @param {string} value - URL to validate
 * @param {string} name - Name of the environment variable
 * @returns {Object} - Validation result
 */
export function validateUrl(value, name) {
  if (!value || typeof value !== 'string') {
    return {
      valid: false,
      severity: 'medium',
      message: `${name} is missing or not a string`
    };
  }
  
  try {
    const url = new URL(value);
    const rules = ENV_VALIDATION_RULES.urls;
    
    // Check protocol
    if (!rules.protocol.includes(url.protocol)) {
      return {
        valid: false,
        severity: 'high',
        message: `${name} uses invalid protocol: ${url.protocol}`
      };
    }
    
    // Check for forbidden values
    for (const forbidden of rules.forbiddenValues) {
      if (value.toLowerCase().includes(forbidden.toLowerCase())) {
        return {
          valid: false,
          severity: 'medium',
          message: `${name} contains placeholder URL: ${forbidden}`
        };
      }
    }
    
    return { valid: true, message: `${name} validation passed` };
  } catch (error) {
    return {
      valid: false,
      severity: 'high',
      message: `${name} is not a valid URL: ${error.message}`
    };
  }
}

/**
 * Validate all environment variables for security
 * @returns {Object} - Overall validation result
 */
export function validateEnvironment() {
  const results = [];
  const criticalIssues = [];
  const highIssues = [];
  const mediumIssues = [];
  
  // Define environment variables to check
  const envChecks = [
    // Secrets
    { name: 'SESSION_SECRET', value: process.env.SESSION_SECRET, type: 'secret' },
    
    // Database
    { name: 'POSTGRES_PASSWORD', value: process.env.POSTGRES_PASSWORD, type: 'dbPassword' },
    
    // API Keys
    { name: 'IGDB_CLIENT_SECRET', value: process.env.IGDB_CLIENT_SECRET, type: 'apiKey' },
    { name: 'AUTHENTIK_CLIENT_SECRET', value: process.env.AUTHENTIK_CLIENT_SECRET, type: 'apiKey' },
    { name: 'TYPESENSE_API_KEY', value: process.env.TYPESENSE_API_KEY, type: 'apiKey' },
    { name: 'GOTIFY_TOKEN', value: process.env.GOTIFY_TOKEN, type: 'apiKey', optional: true },
    
    // URLs
    { name: 'AUTHENTIK_ISSUER', value: process.env.AUTHENTIK_ISSUER, type: 'url' },
    { name: 'GOTIFY_URL', value: process.env.GOTIFY_URL, type: 'url', optional: true },
    { name: 'ROMM_SERVER_URL', value: process.env.ROMM_SERVER_URL, type: 'url', optional: true },
  ];
  
  for (const check of envChecks) {
    let result;
    
    // Skip optional variables that are empty
    if (check.optional && !check.value) {
      continue;
    }
    
    switch (check.type) {
      case 'secret':
        result = validateSecret(check.value, check.name);
        break;
      case 'dbPassword':
        result = validateDbPassword(check.value, check.name);
        break;
      case 'apiKey':
        result = validateApiKey(check.value, check.name);
        break;
      case 'url':
        result = validateUrl(check.value, check.name);
        break;
      default:
        result = { valid: true, message: `${check.name} - unknown type` };
    }
    
    results.push({ name: check.name, ...result });
    
    if (!result.valid) {
      switch (result.severity) {
        case 'critical':
          criticalIssues.push(result);
          break;
        case 'high':
          highIssues.push(result);
          break;
        case 'medium':
          mediumIssues.push(result);
          break;
      }
    }
  }
  
  const hasIssues = criticalIssues.length > 0 || highIssues.length > 0 || mediumIssues.length > 0;
  
  return {
    valid: !hasIssues,
    results,
    summary: {
      total: results.length,
      critical: criticalIssues.length,
      high: highIssues.length,
      medium: mediumIssues.length,
      passed: results.filter(r => r.valid).length
    },
    issues: {
      critical: criticalIssues,
      high: highIssues,
      medium: mediumIssues
    }
  };
}

/**
 * Log environment validation results
 * @param {Object} validation - Validation results
 */
export function logEnvironmentValidation(validation) {
  if (validation.valid) {
    console.log('✅ Environment validation passed');
    return;
  }
  
  console.log('\n🔒 ENVIRONMENT SECURITY VALIDATION RESULTS');
  console.log('==========================================');
  
  if (validation.issues.critical.length > 0) {
    console.log('\n🚨 CRITICAL ISSUES (Must be fixed):');
    validation.issues.critical.forEach(issue => {
      console.log(`   ❌ ${issue.message}`);
    });
  }
  
  if (validation.issues.high.length > 0) {
    console.log('\n⚠️  HIGH PRIORITY ISSUES:');
    validation.issues.high.forEach(issue => {
      console.log(`   🔶 ${issue.message}`);
    });
  }
  
  if (validation.issues.medium.length > 0) {
    console.log('\n📋 MEDIUM PRIORITY ISSUES:');
    validation.issues.medium.forEach(issue => {
      console.log(`   🔸 ${issue.message}`);
    });
  }
  
  console.log(`\n📊 Summary: ${validation.summary.passed}/${validation.summary.total} passed`);
  
  if (validation.issues.critical.length > 0) {
    console.log('\n💀 CRITICAL: Application may be vulnerable to attacks!');
    console.log('   Please update your environment variables before deploying to production.');
  }
  
  console.log('\n');
}

/**
 * Check if running in production with insecure environment
 * @returns {boolean} - True if production with security issues
 */
export function isProductionWithSecurityIssues() {
  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) return false;
  
  const validation = validateEnvironment();
  return !validation.valid && validation.issues.critical.length > 0;
}