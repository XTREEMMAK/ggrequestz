/**
 * Webhook endpoint for Gotify notifications and the outbound request webhook.
 */

import { json, error } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";

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
    if (
      (env.GOTIFY_URL || process.env.GOTIFY_URL) &&
      (env.GOTIFY_TOKEN || process.env.GOTIFY_TOKEN)
    ) {
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

    // Send the outbound request webhook.
    //
    // The payload has always been provider-neutral JSON, but both the variable
    // and the docs named n8n, so it reads as an n8n-only feature. The same
    // dispatch under a neutral name lets any receiver subscribe -- a download
    // automation service, a script, a chat bridge -- without pretending to be
    // n8n.
    if (requestWebhookUrl()) {
      try {
        const n8nResponse = await sendRequestWebhook({
          type,
          title,
          message,
          priority,
          data,
          timestamp: new Date().toISOString(),
        });
        results.n8n = n8nResponse;
      } catch (n8nError) {
        console.error("Request webhook failed:", n8nError);
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
  const response = await fetch(
    `${env.GOTIFY_URL || process.env.GOTIFY_URL}/message`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gotify-Key": env.GOTIFY_TOKEN || process.env.GOTIFY_TOKEN,
      },
      body: JSON.stringify({
        title,
        message,
        priority,
        extras,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Gotify API error: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * The configured outbound webhook URL.
 *
 * REQUEST_WEBHOOK_URL is preferred; N8N_WEBHOOK_URL keeps working so existing
 * installs need no change.
 */
function requestWebhookUrl() {
  return (
    env.REQUEST_WEBHOOK_URL ||
    process.env.REQUEST_WEBHOOK_URL ||
    env.N8N_WEBHOOK_URL ||
    process.env.N8N_WEBHOOK_URL
  );
}

/**
 * Send the outbound request webhook.
 */
async function sendRequestWebhook(payload) {
  const response = await fetch(
    requestWebhookUrl(),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    throw new Error(`Request webhook error: ${response.statusText}`);
  }

  // Receivers return whatever they like; a non-JSON body is still a success.
  try {
    return await response.json();
  } catch {
    return { status: "sent", statusCode: response.status };
  }
}

// Helper function for common notification types (moved to lib/webhooks.js)
// This function should be imported from $lib/webhooks.js instead
