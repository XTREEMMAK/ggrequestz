/**
 * Basic Authentication Login API Endpoint
 * Handles username/password authentication as fallback to Authentik
 */

import { json } from '@sveltejs/kit';
import { authenticateBasicUser, createBasicAuthToken } from '$lib/basicAuth.js';

export async function POST({ request, cookies }) {
  try {
    const formData = await request.formData();
    const username = formData.get('username')?.toString().trim();
    const password = formData.get('password')?.toString();

    // Validate input
    if (!username || !password) {
      return json({ error: 'Username and password are required' }, { status: 400 });
    }


    // Authenticate user
    const user = await authenticateBasicUser(username, password);
    
    if (!user) {
      return json({ error: 'Invalid username or password' }, { status: 401 });
    }


    // Create session token
    const token = createBasicAuthToken(user);

    // Set basic auth session cookie
    cookies.set('basic_auth_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60, // 24 hours
      path: '/'
    });

    // Return success
    return json({ 
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        is_admin: user.is_admin,
        auth_type: 'basic'
      }
    });

  } catch (error) {
    console.error('❌ Basic auth login error:', error);
    return json({ error: 'Authentication failed' }, { status: 500 });
  }
}