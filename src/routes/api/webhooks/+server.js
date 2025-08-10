/**
 * Webhook endpoint for Gotify notifications and n8n automation
 */

import { json, error } from "@sveltejs/kit";
import { GOTIFY_URL, GOTIFY_TOKEN, N8N_WEBHOOK_URL } from "$env/static/private";

export async function POST({ request }) {
  try {
    const {
      type,
      title,
      message,
      priority = 5,
      data = {},
    } = await request.json();

    if (!type || !title || !message) {
      throw error(400, "Missing required fields: type, title, message");
    }

    const results = {
      gotify: null,
      n8n: null,
    };

    // Send Gotify notification
    if (GOTIFY_URL && GOTIFY_TOKEN) {
      try {
        const gotifyResponse = await sendGotifyNotification({
          title,
          message,
          priority,
          extras: {
            type,
            data,
            timestamp: new Date().toISOString(),
          },
        });
        results.gotify = gotifyResponse;
      } catch (gotifyError) {
        console.error("Gotify notification failed:", gotifyError);
        results.gotify = { error: gotifyError.message };
      }
    }

    // Send n8n webhook
    if (N8N_WEBHOOK_URL) {
      try {
        const n8nResponse = await sendN8nWebhook({
          type,
          title,
          message,
          priority,
          data,
          timestamp: new Date().toISOString(),
        });
        results.n8n = n8nResponse;
      } catch (n8nError) {
        console.error("n8n webhook failed:", n8nError);
        results.n8n = { error: n8nError.message };
      }
    }

    return json({
      success: true,
      results,
    });
  } catch (err) {
    console.error("Webhook API error:", err);

    if (err.status) {
      throw err; // Re-throw SvelteKit errors
    }

    throw error(500, "Failed to process webhook request");
  }
}

/**
 * Send notification to Gotify
 */
async function sendGotifyNotification({ title, message, priority, extras }) {
  const response = await fetch(`${GOTIFY_URL}/message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Gotify-Key": GOTIFY_TOKEN,
    },
    body: JSON.stringify({
      title,
      message,
      priority,
      extras,
    }),
  });

  if (!response.ok) {
    throw new Error(`Gotify API error: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Send webhook to n8n
 */
async function sendN8nWebhook(payload) {
  const response = await fetch(N8N_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`n8n webhook error: ${response.statusText}`);
  }

  // n8n might return different response formats
  try {
    return await response.json();
  } catch {
    return { status: "sent", statusCode: response.status };
  }
}

// Helper function for common notification types (moved to lib/webhooks.js)
// This function should be imported from $lib/webhooks.js instead
