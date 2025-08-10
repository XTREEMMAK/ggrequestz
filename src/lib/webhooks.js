/**
 * Webhook utility functions for notifications
 */

/**
 * Send game request notification via webhook
 */
export async function sendGameRequestNotification(requestData) {
  return await fetch("/api/webhooks", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "game_request",
      title: `New Game Request: ${requestData.title}`,
      message: `${requestData.user_name} requested "${requestData.title}"\n\nReason: ${requestData.reason || "No reason provided"}\nPlatforms: ${requestData.platforms?.join(", ") || "Not specified"}`,
      priority:
        requestData.priority === "high"
          ? 8
          : requestData.priority === "low"
            ? 3
            : 5,
      data: {
        request_id: requestData.id,
        user_id: requestData.user_id,
        game_title: requestData.title,
        igdb_id: requestData.igdb_id,
        platforms: requestData.platforms,
        request_type: requestData.request_type,
      },
    }),
  });
}

/**
 * Send general notification via webhook
 */
export async function sendNotification({
  type,
  title,
  message,
  priority = 5,
  data = {},
}) {
  return await fetch("/api/webhooks", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type,
      title,
      message,
      priority,
      data,
    }),
  });
}
