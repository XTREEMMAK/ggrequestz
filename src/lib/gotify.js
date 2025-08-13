/**
 * Gotify notification utilities
 * Handles sending push notifications via Gotify server
 */

import { query } from "$lib/database.js";
import { env } from "$env/dynamic/private";

// Use dynamic environment variables for runtime configuration
const GOTIFY_URL = env.GOTIFY_URL || process.env.GOTIFY_URL || process.env.VITE_GOTIFY_URL;
const GOTIFY_TOKEN = env.GOTIFY_TOKEN || process.env.GOTIFY_TOKEN || process.env.VITE_GOTIFY_TOKEN;

/**
 * Send a notification via Gotify
 * @param {Object} notification - Notification data
 * @param {string} notification.title - Notification title
 * @param {string} notification.message - Notification message
 * @param {number} [notification.priority=2] - Notification priority (1-10)
 * @param {Object} [notification.extras] - Additional notification data
 * @param {string} [notification.type] - Notification type for filtering (new_requests, status_changes, admin_actions)
 * @returns {Promise<boolean>} - Success status
 */
export async function sendGotifyNotification({
  title,
  message,
  priority = 2,
  extras = {},
  type = null,
}) {
  try {
    let gotifyUrl = null;
    let gotifyToken = null;

    // First, check environment variables (highest priority)
    if (GOTIFY_URL && GOTIFY_TOKEN) {
      gotifyUrl = GOTIFY_URL;
      gotifyToken = GOTIFY_TOKEN;
    } else {
      // Fallback to database settings
      
      const settingsKeys = ['gotify.url', 'gotify.token'];
      if (type) {
        settingsKeys.push(`gotify.notifications.${type}`);
      }
      
      const settingsResult = await query(
        "SELECT key, value FROM ggr_system_settings WHERE key = ANY($1)",
        [settingsKeys]
      );

      const settings = {};
      settingsResult.rows.forEach((row) => {
        settings[row.key] = row.value;
      });

      gotifyUrl = settings["gotify.url"];
      gotifyToken = settings["gotify.token"];
      
      // Check if basic Gotify is configured
      if (!gotifyUrl || !gotifyToken) {
        console.warn("⚠️ Gotify not configured in environment or database - skipping notification");
        return false;
      }

      // Check if this notification type is enabled (if type is specified)
      if (type) {
        const typeSettingKey = `gotify.notifications.${type}`;
        const typeEnabled = settings[typeSettingKey];
        
        // Default to true if setting doesn't exist (for backward compatibility)
        // But if it exists and is 'false', skip the notification
        if (typeEnabled === 'false') {
          return false;
        }
      }
      
    }

    if (!gotifyUrl || !gotifyToken) {
      console.warn("⚠️ Gotify URL or token missing - skipping notification");
      return false;
    }

    // Validate URL format
    let parsedUrl;
    try {
      parsedUrl = new URL(gotifyUrl);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        throw new Error("Invalid protocol");
      }
    } catch (error) {
      console.error("❌ Invalid Gotify URL format:", gotifyUrl);
      return false;
    }

    // Prepare notification payload
    const notificationPayload = {
      title,
      message,
      priority: Math.max(1, Math.min(10, priority)), // Clamp between 1-10
      extras: {
        "client::display": {
          contentType: "text/markdown",
        },
        ...extras,
      },
    };

    // Send notification
    const notificationUrl = `${parsedUrl.toString().replace(/\/$/, "")}/message?token=${gotifyToken}`;


    const response = await fetch(notificationUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(notificationPayload),
      // Add timeout to prevent hanging
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(
        `Gotify API error: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const result = await response.json();


    return true;
  } catch (error) {
    console.error("❌ Failed to send Gotify notification:", error);

    // Don't throw the error - just log it and return false
    // Notifications should not break the main functionality
    return false;
  }
}

/**
 * Send a notification about a new game request
 * @param {Object} request - Request data
 * @param {string} request.id - Request ID
 * @param {string} request.title - Game title
 * @param {string} request.request_type - Type of request
 * @param {string} request.priority - Request priority
 * @param {string} request.user_name - User who submitted the request
 * @param {string} [request.description] - Request description
 * @returns {Promise<boolean>} - Success status
 */
export async function sendNewRequestNotification({
  id,
  title,
  request_type,
  priority,
  user_name,
  description = "",
}) {
  const requestTypeLabels = {
    game: "🎮 New Game Request",
    update: "🔄 Game Update Request",
    fix: "🔧 Game Fix Request",
  };

  const priorityEmojis = {
    low: "🟢",
    medium: "🟡",
    high: "🟠",
    urgent: "🔴",
  };

  const requestTitle = requestTypeLabels[request_type] || "📝 New Request";
  const priorityEmoji = priorityEmojis[priority] || "⚪";

  const messageLines = [
    `**Game:** ${title}`,
    `**User:** ${user_name}`,
    `**Priority:** ${priorityEmoji} ${priority.charAt(0).toUpperCase() + priority.slice(1)}`,
  ];

  if (description && description.trim()) {
    messageLines.push(`**Description:** ${description.trim()}`);
  }

  messageLines.push(`**Request ID:** ${id}`);

  const message = messageLines.join("\n");

  // Set priority based on request priority
  let gotifyPriority = 2; // Default
  switch (priority) {
    case "urgent":
      gotifyPriority = 8;
      break;
    case "high":
      gotifyPriority = 6;
      break;
    case "medium":
      gotifyPriority = 4;
      break;
    case "low":
      gotifyPriority = 2;
      break;
  }


  return await sendGotifyNotification({
    title: requestTitle,
    message,
    priority: gotifyPriority,
    type: 'new_requests',
    extras: {
      "game_request": {
        id,
        title,
        request_type,
        priority,
        user_name,
      },
    },
  });
}

/**
 * Send a notification about a request status change
 * @param {Object} request - Request data
 * @param {string} request.id - Request ID
 * @param {string} request.title - Game title
 * @param {string} request.old_status - Previous status
 * @param {string} request.new_status - New status
 * @param {string} request.user_name - User who submitted the request
 * @param {string} [request.admin_notes] - Admin notes
 * @returns {Promise<boolean>} - Success status
 */
export async function sendRequestStatusNotification({
  id,
  title,
  old_status,
  new_status,
  user_name,
  admin_notes = "",
}) {
  const statusEmojis = {
    pending: "⏳",
    approved: "✅",
    rejected: "❌",
    fulfilled: "🎉",
    cancelled: "🚫",
  };

  const statusLabels = {
    pending: "Pending Review",
    approved: "Approved",
    rejected: "Rejected",
    fulfilled: "Fulfilled",
    cancelled: "Cancelled",
  };

  const oldStatusEmoji = statusEmojis[old_status] || "📝";
  const newStatusEmoji = statusEmojis[new_status] || "📝";
  const oldStatusLabel = statusLabels[old_status] || old_status;
  const newStatusLabel = statusLabels[new_status] || new_status;

  const requestTitle = `🔔 Request Status Updated`;

  const messageLines = [
    `**Game:** ${title}`,
    `**User:** ${user_name}`,
    `**Status Change:** ${oldStatusEmoji} ${oldStatusLabel} → ${newStatusEmoji} ${newStatusLabel}`,
  ];

  if (admin_notes && admin_notes.trim()) {
    messageLines.push(`**Admin Notes:** ${admin_notes.trim()}`);
  }

  messageLines.push(`**Request ID:** ${id}`);

  const message = messageLines.join("\n");

  // Set priority based on new status
  let gotifyPriority = 4; // Default
  switch (new_status) {
    case "fulfilled":
      gotifyPriority = 6;
      break;
    case "approved":
      gotifyPriority = 5;
      break;
    case "rejected":
      gotifyPriority = 4;
      break;
    case "cancelled":
      gotifyPriority = 3;
      break;
    default:
      gotifyPriority = 4;
  }

  return await sendGotifyNotification({
    title: requestTitle,
    message,
    priority: gotifyPriority,
    type: 'status_changes',
    extras: {
      "request_status_change": {
        id,
        title,
        old_status,
        new_status,
        user_name,
      },
    },
  });
}

/**
 * Send a notification about admin actions
 * @param {Object} action - Action data
 * @param {string} action.title - Action title
 * @param {string} action.message - Action message
 * @param {string} [action.admin_name] - Name of the admin who performed the action
 * @param {number} [action.priority=4] - Notification priority
 * @param {Object} [action.extras] - Additional action data
 * @returns {Promise<boolean>} - Success status
 */
export async function sendAdminActionNotification({
  title,
  message,
  admin_name = "Admin",
  priority = 4,
  extras = {},
}) {
  const notificationTitle = `⚙️ ${title}`;
  
  const messageLines = [
    message,
    `**Admin:** ${admin_name}`,
  ];

  const finalMessage = messageLines.join("\n");

  return await sendGotifyNotification({
    title: notificationTitle,
    message: finalMessage,
    priority: priority,
    type: 'admin_actions',
    extras: {
      "admin_action": {
        title,
        admin_name,
        ...extras,
      },
    },
  });
}

/**
 * Send a notification specifically for cancelled/deleted requests
 * @param {Object} request - Request data
 * @param {string} request.id - Request ID  
 * @param {string} request.title - Game title
 * @param {string} request.user_name - User who submitted the request
 * @param {string} request.action - Action type ('cancelled' or 'deleted')
 * @param {string} [request.reason] - Reason for cancellation/deletion
 * @param {string} [request.admin_name] - Name of admin who performed action
 * @returns {Promise<boolean>} - Success status
 */
export async function sendRequestCancelledDeletedNotification({
  id,
  title,
  user_name,
  action, // 'cancelled' or 'deleted'
  reason = "",
  admin_name = "Admin",
}) {
  const actionEmoji = action === 'deleted' ? "🗑️" : "🚫";
  const actionLabel = action === 'deleted' ? "Deleted" : "Cancelled";
  
  const notificationTitle = `${actionEmoji} Request ${actionLabel}`;

  const messageLines = [
    `**Game:** ${title}`,
    `**User:** ${user_name}`,
    `**Action:** Request has been ${action}`,
  ];

  if (reason && reason.trim()) {
    messageLines.push(`**Reason:** ${reason.trim()}`);
  }

  messageLines.push(`**Admin:** ${admin_name}`);
  messageLines.push(`**Request ID:** ${id}`);

  const message = messageLines.join("\n");

  // Higher priority for deletions, medium for cancellations
  const gotifyPriority = action === 'deleted' ? 6 : 4;

  return await sendGotifyNotification({
    title: notificationTitle,
    message,
    priority: gotifyPriority,
    type: 'admin_actions',
    extras: {
      "request_cancelled_deleted": {
        id,
        title,
        user_name,
        action,
        reason,
        admin_name,
      },
    },
  });
}