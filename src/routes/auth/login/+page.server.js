/**
 * Basic authentication login page data loader
 */

import { redirect } from '@sveltejs/kit';
import { needsInitialSetup, isBasicAuthEnabled } from '$lib/basicAuth.js';

export async function load({ cookies }) {
  try {
    const authMethod = process.env.AUTH_METHOD || 'authentik';
    
    // If we're using Authentik auth method, redirect to Authentik login
    if (authMethod !== 'basic') {
      throw redirect(302, '/api/auth/login');
    }
    
    // Check if system needs initial setup
    const needsSetup = await needsInitialSetup();
    
    // Check if basic auth is enabled
    const basicAuthEnabled = await isBasicAuthEnabled();
    
    // For basic auth mode, Authentik is not available by design
    const authentikAvailable = false;

    return {
      needsSetup,
      basicAuthEnabled,
      authentikAvailable,
      authMethod,
      user: null // Will be populated by layout if logged in
    };
  } catch (error) {
    // Handle redirect separately
    if (error?.status === 302) {
      throw error;
    }
    
    console.error('Login page load error:', error);
    return {
      needsSetup: true,
      basicAuthEnabled: false,
      authentikAvailable: false,
      authMethod: 'basic',
      user: null
    };
  }
}