/**
 * Regression test for webhook dispatch on request submission.
 *
 * The webhook was configurable and documented, but no code path fired it. The
 * only builder for the `game_request` payload lived in `$lib/webhooks.js`,
 * posting to the relative URL "/api/webhooks" -- browser-only, and imported by
 * nobody. A submitted request notified Gotify and stopped there, so an
 * automation pointed at REQUEST_WEBHOOK_URL never learned a request existed.
 *
 * This pins the wiring rather than the payload: that POST /api/request itself
 * dispatches, and that it stays fire-and-forget so a broken receiver cannot
 * fail a submission the database has already accepted.
 *
 * Creation-time dispatch is now gated on approval (see
 * request-approval-dispatch.test.js for the transition rule itself), so the
 * default here is a request that is auto-approved on the way in -- otherwise
 * a "dispatches on submission" assertion would describe a scenario that no
 * longer dispatches. The two tests at the bottom pin that gate directly.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const USER = { auth_type: "api_key", user_id: "12", name: "alice" };

const INSERTED_ROW = {
  id: "eac1cd44-5f6e-4f49-8ac1-9936066105a6",
  user_id: "12",
  user_name: "alice",
  request_type: "game",
  title: "Chrono Trigger",
  igdb_id: "1234",
  platforms: ["Super Nintendo"],
  priority: "medium",
  description: "",
  reason: null,
  status: "pending",
};

const getAuthenticatedUser = vi.fn(async () => USER);
const sendNewRequestNotification = vi.fn(async () => true);
const mayAutoApprove = vi.fn(async () => false);

// $10 / index 9 in the INSERT's column list below is `status`. The row
// returned here must echo whatever the route actually decided to insert --
// mirroring what a real INSERT ... RETURNING * would give back -- rather than
// a value hardcoded independent of mayAutoApprove, or the dispatch gate below
// would be exercised against a status the route never computed.
const STATUS_PARAM_INDEX = 9;

// Route the two statements the handler runs before it reaches the webhook.
const query = vi.fn(async (sql, params) => {
  if (sql.includes("INSERT INTO ggr_game_requests")) {
    return { rows: [{ ...INSERTED_ROW, status: params[STATUS_PARAM_INDEX] }] };
  }
  if (sql.includes("FROM ggr_users")) {
    return { rows: [{ id: "12", username: "alice", email: "a@example.test" }] };
  }
  return { rows: [] };
});

vi.mock("$lib/database.js", () => ({
  query,
  gameCache: { upsert: vi.fn(async () => {}) },
}));
vi.mock("$lib/auth.server.js", () => ({ getAuthenticatedUser }));
vi.mock("$lib/gotify.js", () => ({ sendNewRequestNotification }));
vi.mock("$lib/cache.js", () => ({ invalidateCache: vi.fn(async () => {}) }));
vi.mock("$lib/requestPolicy.server.js", () => ({
  findOpenDuplicate: vi.fn(async () => null),
  mayAutoApprove,
}));

/** Submit a request through the real handler. */
async function submitRequest(body = {}) {
  vi.resetModules();
  const { POST } = await import("../../src/routes/api/request/+server.js");

  const response = await POST({
    cookies: {},
    request: new Request("http://localhost/api/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request_type: "game",
        title: "Chrono Trigger",
        platforms: ["Super Nintendo"],
        igdb_id: "1234",
        ...body,
      }),
    }),
  });

  // The dispatch is deliberately not awaited by the handler. Let its
  // continuation run before asserting on it.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return response;
}

/** Calls made to the configured receiver, ignoring anything else. */
function webhookCalls() {
  return global.fetch.mock.calls.filter(
    ([url]) => String(url) === "http://receiver.test/hook",
  );
}

describe("POST /api/request webhook dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.REQUEST_WEBHOOK_URL = "http://receiver.test/hook";
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ received: true }),
    }));
    // Default this suite to the auto-approved path. Dispatch now only fires
    // for a request that is approved on the way in, and every test above the
    // approval-gating block below is about the dispatch itself, not about
    // who may skip the queue -- that belongs to
    // request-approval-dispatch.test.js and request-creation-status.test.js.
    mayAutoApprove.mockResolvedValue(true);
  });

  afterEach(() => {
    delete process.env.REQUEST_WEBHOOK_URL;
    vi.restoreAllMocks();
  });

  it("dispatches the webhook for a newly created request", async () => {
    const response = await submitRequest();
    expect(response.status).toBe(201);

    const calls = webhookCalls();
    expect(calls).toHaveLength(1);

    const payload = JSON.parse(calls[0][1].body);
    expect(payload.type).toBe("game_request");
    expect(payload.data.game_title).toBe("Chrono Trigger");
    expect(payload.data.platforms).toEqual(["Super Nintendo"]);
    expect(payload.data.request_id).toBe(INSERTED_ROW.id);
  });

  it("sends the stored row, not the submitted body", async () => {
    // The client may send anything; the receiver must see what was persisted.
    await submitRequest({ title: "Chrono Trigger", igdb_id: "9999" });

    expect(JSON.parse(webhookCalls()[0][1].body).data.igdb_id).toBe("1234");
  });

  it("still succeeds when the receiver rejects the webhook", async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => ({}),
    }));

    const response = await submitRequest();

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ success: true });
  });

  it("still succeeds when the receiver is unreachable", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });

    expect((await submitRequest()).status).toBe(201);
  });

  it("dispatches nothing when no webhook is configured", async () => {
    delete process.env.REQUEST_WEBHOOK_URL;

    const response = await submitRequest();

    expect(response.status).toBe(201);
    expect(webhookCalls()).toHaveLength(0);
  });

  it("keeps notifying Gotify, which the webhook does not replace", async () => {
    await submitRequest();

    expect(sendNewRequestNotification).toHaveBeenCalledTimes(1);
  });

  it("does not dispatch on submission when auto-approve is off", async () => {
    mayAutoApprove.mockResolvedValue(false);

    const response = await submitRequest();

    expect(response.status).toBe(201);
    expect(webhookCalls()).toHaveLength(0);
  });

  it("dispatches on submission when the request is auto-approved", async () => {
    mayAutoApprove.mockResolvedValue(true);

    await submitRequest();

    expect(webhookCalls()).toHaveLength(1);
  });
});
