/**
 * Basic Authentication Setup API Endpoint
 * Creates the initial admin user when no admin exists
 */

import { json } from '@sveltejs/kit';
import { createInitialAdmin, needsInitialSetup } from '$lib/basicAuth.js';

export async function POST({ request }) {
  try {
    process.stdout.write('🔧 ADMIN SETUP: API endpoint reached\n');
    
    // Check if setup is actually needed
    process.stdout.write('🔧 ADMIN SETUP: Checking if setup is needed\n');
    const setupNeeded = await needsInitialSetup();
    process.stdout.write(`🔧 ADMIN SETUP: Setup needed = ${setupNeeded}\n`);
    
    if (!setupNeeded) {
      process.stdout.write('🔧 ADMIN SETUP: Setup already completed, returning 400\n');
      return json({ error: 'Initial setup has already been completed' }, { status: 400 });
    }

    const formData = await request.formData();
    const username = formData.get('username')?.toString().trim();
    const email = formData.get('email')?.toString().trim();
    const password = formData.get('password')?.toString();

    // Validate input
    if (!username || !email || !password) {
      return json({ error: 'Username, email, and password are required' }, { status: 400 });
    }

    if (username.length < 3) {
      return json({ error: 'Username must be at least 3 characters long' }, { status: 400 });
    }

    if (!email.includes('@')) {
      return json({ error: 'Valid email address required' }, { status: 400 });
    }

    if (password.length < 8) {
      return json({ error: 'Password must be at least 8 characters long' }, { status: 400 });
    }


    // Create initial admin
    const admin = await createInitialAdmin(username, email, password);


    return json({ 
      success: true,
      message: 'Initial admin account created successfully',
      admin: {
        id: admin.id,
        username: admin.username,
        email: admin.email
      }
    });

  } catch (error) {
    console.error('❌ Initial setup error:', error);
    
    // Return specific error message if it's a known error
    if (error.message) {
      return json({ error: error.message }, { status: 400 });
    }
    
    return json({ error: 'Setup failed' }, { status: 500 });
  }
}