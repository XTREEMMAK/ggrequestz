/**
 * SvelteKit server-side hooks for performance optimization and authentication
 */

import { sequence } from '@sveltejs/kit/hooks';
import { redirect } from '@sveltejs/kit';
import { getSession } from '$lib/auth.js';
import { getBasicAuthUser } from '$lib/basicAuth.js';

// HTTP Cache headers hook
const cacheHeaders = async ({ event, resolve }) => {
  const response = await resolve(event);
  
  // Add cache headers for static assets
  if (event.url.pathname.startsWith('/api/')) {
    // API responses - short cache for dynamic content
    response.headers.set('Cache-Control', 'private, max-age=300'); // 5 minutes
    response.headers.set('Vary', 'Cookie');
  } else if (event.url.pathname.startsWith('/_app/')) {
    // Build assets - long cache with versioning
    response.headers.set('Cache-Control', 'public, max-age=31536000, immutable'); // 1 year
  } else if (event.url.pathname.match(/\.(js|css|woff|woff2|png|jpg|jpeg|gif|svg|ico)$/)) {
    // Static assets - medium cache
    response.headers.set('Cache-Control', 'public, max-age=86400'); // 1 day
  } else if (event.url.pathname === '/' || event.url.pathname.startsWith('/game/')) {
    // HTML pages - short cache with revalidation
    response.headers.set('Cache-Control', 'public, max-age=300, must-revalidate'); // 5 minutes
    response.headers.set('Vary', 'Accept-Encoding, Cookie');
  }
  
  // Security headers
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  
  // Allow CDN scripts for Vanta.js and Three.js, YouTube embeds
  response.headers.set('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' " +
    "https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "font-src 'self' data:; " +
    "connect-src 'self' https:; " +
    "media-src 'self'; " +
    "object-src 'none'; " +
    "frame-src 'self' https://www.youtube.com https://youtube.com; " +
    "worker-src 'self'; " +
    "form-action 'self';"
  );
  
  return response;
};

// Performance timing hook
const performanceTiming = async ({ event, resolve }) => {
  const start = Date.now();
  const response = await resolve(event);
  const duration = Date.now() - start;
  
  // Add performance timing header for debugging
  if (event.url.pathname.startsWith('/api/')) {
    response.headers.set('X-Response-Time', `${duration}ms`);
  }
  
  // Log slow responses
  if (duration > 1000) {
    console.warn(`Slow response: ${event.url.pathname} took ${duration}ms`);
  }
  
  return response;
};

// Authentication hook
const authGuard = async ({ event, resolve }) => {
  const { url, cookies } = event;
  
  
  // Special logging for admin routes
  if (url.pathname.startsWith('/admin')) {
  }
  
  // Define routes that don't require authentication
  const publicRoutes = [
    '/login',
    '/login/basic', 
    '/setup',  // Setup pages need to be accessible when database is down
    '/api',
    '/auth/setup'
  ];
  
  // Check if current route is public
  const isPublicRoute = publicRoutes.some(route => url.pathname.startsWith(route));
  
  // Skip auth check for public routes and API endpoints
  if (isPublicRoute || url.pathname.startsWith('/api/')) {
    if (url.pathname.includes('/api/auth/basic/setup')) {
      
    }
    return resolve(event);
  }
  
  // Check authentication
  let user = null;
  
  try {
    // Try Authentik session first
    const sessionCookie = cookies.get('session');
    if (sessionCookie) {
      user = await getSession(`session=${sessionCookie}`);
    }
    
    // Try basic auth session if no Authentik session
    if (!user) {
      const basicAuthSession = cookies.get('basic_auth_session');
      if (basicAuthSession) {
        user = await getBasicAuthUser(basicAuthSession);
      }
    }
  } catch (error) {
    console.error('🔐 AUTH GUARD: Auth check error:', error);
  }
  
  
  // Redirect to login if not authenticated
  if (!user) {
    throw redirect(302, '/login');
  }
  
  return resolve(event);
};

export const handle = sequence(authGuard, performanceTiming, cacheHeaders);