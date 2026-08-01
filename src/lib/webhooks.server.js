/**
 * The outbound request webhook, server side.
 *
 * `$lib/webhooks.js` describes the same payload, but posts to the relative URL
 * "/api/webhooks", which only resolves in a browser. That made it unusable from
 * an endpoint, and in practice nothing imported it -- so a submitted request
 * notified Gotify and no configured receiver ever heard about it.
 *
 * Dispatching from here follows the same shape as the Gotify call beside it in
 * `/api/request`: the route calls the sender directly rather than posting to our
 * own HTTP endpoint. `/api/webhooks` shares these functions so both paths emit
 * a byte-identical payload and a receiver need not care which produced it.
 */

import { env } from "$env/dynamic/private";

// A receiver that is slow must not hold a user's request open. By the time this
// runs the request is already committed; the webhook is a courtesy.
const WEBHOOK_TIMEOUT_MS = 5000;

// The 1-10 scale the payload has always used. `urgent` previously fell through
// to the medium value, ranking it below `high` -- the one ordering a receiver is
// likely to act on.
const WEBHOOK_PRIORITIES = {
  urgent: 9,
  high: 8,
  medium: 5,
  low: 3,
};
const DEFAULT_WEBHOOK_PRIORITY = WEBHOOK_PRIORITIES.medium;

/**
 * The configured outbound webhook URL.
 *
 * REQUEST_WEBHOOK_URL is preferred; N8N_WEBHOOK_URL keeps working so existing
 * installs need no change.
 * @returns {string} - The URL, or "" when the webhook is not configured
 */
export function requestWebhookUrl() {
  return (
    env.REQUEST_WEBHOOK_URL ||
    process.env.REQUEST_WEBHOOK_URL ||
    env.N8N_WEBHOOK_URL ||
    process.env.N8N_WEBHOOK_URL ||
    ""
  );
}

/**
 * Post a payload to the configured receiver.
 * @param {Object} payload - The webhook payload
 * @returns {Promise<Object>} - The receiver's response, or a status summary
 */
export async function sendRequestWebhook(payload) {
  const response = await fetch(requestWebhookUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(
      `Request webhook error: ${response.status} ${response.statusText}`,
    );
  }

  // Receivers return whatever they like; a non-JSON body is still a success.
  try {
    return await response.json();
  } catch {
    return { status: "sent", statusCode: response.status };
  }
}

/**
 * Announce a game request entering `approved`.
 *
 * Takes the `ggr_game_requests` row as stored -- the INSERT's RETURNING row for
 * a request created already approved, or the approving UPDATE's RETURNING row
 * when an admin approves one -- so the payload carries the stored values rather
 * than the submitted ones.
 *
 * The same request can dispatch more than once: re-opening a fulfilled request
 * approves it again, because the game needs fetching a second time. `type` and
 * `request_id` are identical across those dispatches, so a re-dispatch is
 * marked in `data` (see redispatchMarker) rather than being indistinguishable
 * from the first. The marker is only added on a re-dispatch, leaving a first
 * dispatch byte-identical to what receivers already parse.
 *
 * @param {Object} request - The stored ggr_game_requests row
 * @param {Object} [options]
 * @param {string|null} [options.previousStatus] - The status the request left,
 *   or null when it was created already approved
 * @returns {Promise<boolean>} - Whether a webhook was dispatched
 */
export async function sendGameRequestWebhook(request, { previousStatus } = {}) {
  if (!requestWebhookUrl()) return false;

  // JSONB comes back parsed, so this is normally already an array. Tolerate a
  // bare string rather than emitting a one-character-per-index mess.
  const platforms = Array.isArray(request.platforms)
    ? request.platforms
    : request.platforms
      ? [request.platforms]
      : [];

  await sendRequestWebhook({
    type: "game_request",
    title: `New Game Request: ${request.title}`,
    message:
      `${request.user_name} requested "${request.title}"\n\n` +
      `Reason: ${request.reason || "No reason provided"}\n` +
      `Platforms: ${platforms.join(", ") || "Not specified"}`,
    priority: WEBHOOK_PRIORITIES[request.priority] ?? DEFAULT_WEBHOOK_PRIORITY,
    data: {
      request_id: request.id,
      user_id: request.user_id,
      game_title: request.title,
      igdb_id: request.igdb_id,
      platforms,
      request_type: request.request_type,
      ...redispatchMarker(previousStatus),
    },
    timestamp: new Date().toISOString(),
  });

  return true;
}

/**
 * The `data` keys that mark a dispatch as not the first for this request.
 *
 * A receiver deduplicating on `request_id` alone would silently drop the
 * re-fetch, and one that does not would treat it as a brand new request.
 * `redispatch: true` says "act on this again"; `previous_status` says what the
 * request was before, so a receiver can decide for itself.
 *
 * Derived from the transition, which is all the caller knows. `fulfilled` is
 * the documented re-open path and always implies a prior approval. `rejected`
 * and `cancelled` are also treated as re-dispatches: a request in either state
 * may or may not have been approved before, and claiming "first dispatch" when
 * it was is the more damaging of the two mistakes. `pending` and creation are
 * the genuine first-dispatch cases and carry no marker at all.
 *
 * One case cannot be detected from the transition: approved -> pending ->
 * approved dispatches twice and the second carries no marker, because the
 * transition into it is indistinguishable from a first approval.
 */
function redispatchMarker(previousStatus) {
  if (!previousStatus || previousStatus === "pending") return {};

  return { redispatch: true, previous_status: previousStatus };
}
