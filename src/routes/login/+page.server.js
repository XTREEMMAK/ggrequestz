/**
 * Login page data loader
 */

import { redirect } from "@sveltejs/kit";
import { AUTHENTIK_CLIENT_ID, AUTHENTIK_CLIENT_SECRET, AUTHENTIK_ISSUER } from '$env/static/private';

export async function load({ parent }) {
  const { user, needsSetup, authMethod } = await parent();
  
  
  // If setup is needed, redirect to setup page
  if (needsSetup) {
    throw redirect(302, "/setup");
  }
  
  // If user is already authenticated, redirect to homepage
  if (user) {
    throw redirect(302, "/");
  }
  
  // Check what authentication methods are available
  const isAuthentikEnabled = !!(
    AUTHENTIK_CLIENT_ID && 
    AUTHENTIK_CLIENT_SECRET && 
    AUTHENTIK_ISSUER
  );
  
  // Check if basic auth is enabled (by checking if initial admin exists) - only if we're in basic auth mode
  let isBasicAuthEnabled = false;
  if (authMethod === 'basic') {
    try {
      const { needsInitialSetup } = await import('$lib/basicAuth.js');
      isBasicAuthEnabled = !(await needsInitialSetup());
    } catch (error) {
      console.error('Error checking basic auth status:', error);
      isBasicAuthEnabled = false;
    }
  }
  
  return {
    user: null,
    isAuthentikEnabled,
    isBasicAuthEnabled,
    hasAuthentikId: !!AUTHENTIK_CLIENT_ID,
    hasAuthentikSecret: !!AUTHENTIK_CLIENT_SECRET,
    hasAuthentikIssuer: !!AUTHENTIK_ISSUER
  };
}