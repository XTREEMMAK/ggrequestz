/**
 * Webhook Integration Endpoint
 * Handles user synchronization webhooks from external systems
 */

import { json } from '@sveltejs/kit';
import { authManager } from '$lib/integrations/auth-manager.js';

/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
  try {
    // Get webhook signature from headers
    const signature = request.headers.get('x-hub-signature-256') || 
                     request.headers.get('x-signature') ||
                     request.headers.get('signature');

    // Parse webhook payload
    const payload = await request.json();

    // Log webhook received

    // Validate auth manager is configured for webhook integration
    const providerInfo = authManager.getProviderInfo();
    if (providerInfo.provider !== 'webhook_integration') {
      return json({
        success: false,
        error: 'Webhook integration not configured'
      }, { status: 400 });
    }

    // Process webhook
    const result = await authManager.handleWebhook(payload, signature);

    // Log result
    if (result.success) {
    } else {
      console.error(`❌ Webhook processing failed: ${result.error}`);
    }

    return json(result, { 
      status: result.success ? 200 : 400 
    });

  } catch (error) {
    console.error('Webhook endpoint error:', error);
    
    return json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}

/** @type {import('./$types').RequestHandler} */
export async function GET({ url }) {
  // Webhook verification endpoint (for some providers)
  const challenge = url.searchParams.get('hub.challenge');
  const verify_token = url.searchParams.get('hub.verify_token');
  
  if (challenge && verify_token) {
    const expected_token = process.env.WEBHOOK_VERIFY_TOKEN;
    
    if (verify_token === expected_token) {
      return new Response(challenge, { status: 200 });
    } else {
      return new Response('Forbidden', { status: 403 });
    }
  }

  return json({
    success: true,
    message: 'Webhook endpoint active',
    provider: authManager.getProviderInfo()?.provider || 'not_configured'
  });
}