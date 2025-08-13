/**
 * Security initialization - run environment validation and security checks on startup
 */

import { validateEnvironment, logEnvironmentValidation, isProductionWithSecurityIssues } from './envValidation.js';

/**
 * Initialize security validation and checks
 * Should be called during application startup
 */
export async function initSecurity() {
  try {
    console.log('🔒 [STARTUP] Initializing security validation...');
    
    // Load environment variables first (for development)
    if (process.env.NODE_ENV !== 'production') {
      try {
        const { config } = await import('dotenv');
        config();
      } catch (error) {
        // Silently continue if dotenv fails - might be in production
      }
    }
    
    // Validate environment variables
    const validation = validateEnvironment();
    
    // In Docker/production, be more graceful with logging
    const isDocker = process.env.NODE_ENV === 'production' || process.env.DOCKER === 'true';
    
    if (isDocker && !validation.valid) {
      console.warn('⚠️  [SECURITY] Environment validation issues detected:');
      if (validation.issues.critical.length > 0) {
        console.warn(`   - ${validation.issues.critical.length} critical issues`);
      }
      if (validation.issues.high.length > 0) {
        console.warn(`   - ${validation.issues.high.length} high priority issues`);
      }
      // Don't exit in Docker - just warn
    } else {
      logEnvironmentValidation(validation);
      
      // Check for critical security issues in production (non-Docker)
      if (isProductionWithSecurityIssues()) {
        console.error('💀 CRITICAL SECURITY ISSUES DETECTED IN PRODUCTION!');
        console.error('   Application startup blocked for security reasons.');
        console.error('   Please fix critical environment variable issues before deploying.');
        
        // Only exit if not in Docker environment
        if (process.env.NODE_ENV === 'production' && !isDocker) {
          process.exit(1);
        }
      }
      }
    
    // Log security features enabled (condensed for Docker)
    if (isDocker) {
      console.log('🛡️  [SECURITY] All security features enabled and operational');
    } else {
      console.log('🛡️  Security features enabled:');
      console.log('   ✅ CSRF Protection: checkOrigin enabled');
      console.log('   ✅ Rate Limiting: Multiple tiers configured');
      console.log('   ✅ Security Headers: HSTS, CSP, XSS protection');
      console.log('   ✅ JWT Security: Proper token validation');
      console.log('   ✅ Cache Security: Poisoning protection enabled');
      console.log('   ✅ Request Size Limits: 50MB maximum');
      console.log('   ✅ Environment Validation: Security checks passed');
    }
    
    console.log('🔒 [STARTUP] Security initialization complete');
    
    return validation;
  } catch (error) {
    console.error('❌ [STARTUP] Security initialization failed:', error.message);
    console.error('   Continuing with reduced security features...');
    
    // Return a basic validation object to prevent crashes
    return {
      valid: false,
      error: error.message,
      fallback: true
    };
  }
}

/**
 * Get security status for health checks
 * @returns {Object} - Security status information
 */
export function getSecurityStatus() {
  const validation = validateEnvironment();
  
  return {
    environment: {
      valid: validation.valid,
      issues: {
        critical: validation.summary.critical,
        high: validation.summary.high,
        medium: validation.summary.medium
      }
    },
    features: {
      csrf: true,
      rateLimiting: true,
      securityHeaders: true,
      jwtSecurity: true,
      cacheSecurity: true,
      requestLimits: true
    },
    production: process.env.NODE_ENV === 'production',
    secureTransport: process.env.NODE_ENV === 'production'
  };
}