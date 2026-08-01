/**
 * Regression tests for rescinding your own request.
 *
 * requestStatus.server.js documents itself as "the one place a request's status
 * changes", and it named three routes. There were four: api/request/rescind
 * wrote `status = 'cancelled'` with its own UPDATE. It was the only writer that
 * did no side effects, so withdrawing a request sent no Gotify cancellation and
 * invalidated no cache -- the request went on showing as open to the person who
 * had just cancelled it.
 *
 * These pin it going through the owner, and pin the two things that must not
 * change while it does: a user may only rescind their own request, and the
 * response shape stays as it was.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const STORED = {
  id: "req-1",
  user_id: "12",
  user_name: "alice",
  title: "Chrono Trigger",
  request_type: "game",
  igdb_id: "1234",
  priority: "medium",
  admin_notes: null,
};

/** The row the ownership pre-check finds, or null for "not yours". */
let ownedRow;

function answer(sql, params) {
  if (sql.includes("previous_status")) {
    return {
      rows: [
        {
          ...STORED,
          status: params[1],
          previous_status: ownedRow?.status ?? "pending",
          updated_at: "2026-07-29T00:00:00.000Z",
        },
      ],
    };
  }
  if (sql.includes("SELECT id, status, title, user_id")) {
    return { rows: ownedRow ? [ownedRow] : [] };
  }
  return { rows: [] };
}

const query = vi.fn();
const sendRequestStatusNotification = vi.fn();
const sendRequestCancelledDeletedNotification = vi.fn();
const sendBulkRequestStatusNotification = vi.fn();
const invalidateCache = vi.fn();
const sendGameRequestWebhook = vi.fn();
const getAuthenticatedUser = vi.fn();

vi.mock("$lib/database.js", () => ({ query }));
vi.mock("$lib/gotify.js", () => ({
  sendRequestStatusNotification,
  sendRequestCancelledDeletedNotification,
  sendBulkRequestStatusNotification,
}));
vi.mock("$lib/cache.js", () => ({ invalidateCache }));
vi.mock("$lib/webhooks.server.js", () => ({ sendGameRequestWebhook }));
vi.mock("$lib/auth.server.js", () => ({ getAuthenticatedUser }));
vi.mock("$lib/userProfile.js", () => ({
  userHasPermission: vi.fn(async () => false),
}));

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function rescind(body = { request_id: STORED.id }) {
  vi.resetModules();
  const { POST } = await import(
    "../../src/routes/api/request/rescind/+server.js"
  );
  const response = await POST({
    cookies: {},
    request: new Request("http://localhost/api/request/rescind", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  });
  await settle();
  return response;
}

describe("POST /api/request/rescind", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ownedRow = {
      id: STORED.id,
      status: "pending",
      title: STORED.title,
      user_id: "12",
    };

    query.mockImplementation(async (sql, params) => answer(sql, params));
    sendRequestStatusNotification.mockResolvedValue(true);
    sendRequestCancelledDeletedNotification.mockResolvedValue(true);
    invalidateCache.mockResolvedValue(undefined);
    sendGameRequestWebhook.mockResolvedValue(true);
    getAuthenticatedUser.mockResolvedValue({
      auth_type: "api_key",
      user_id: "12",
      name: "alice",
    });
  });

  it("notifies the cancellation, which it previously did not", async () => {
    await rescind();

    expect(sendRequestCancelledDeletedNotification).toHaveBeenCalledTimes(1);
    const [payload] = sendRequestCancelledDeletedNotification.mock.calls[0];
    expect(payload).toMatchObject({
      id: STORED.id,
      title: STORED.title,
      action: "cancelled",
    });
  });

  it("invalidates the caches the request appears in", async () => {
    await rescind();

    expect(invalidateCache).toHaveBeenCalledTimes(1);
    expect(invalidateCache.mock.calls[0][0]).toEqual(
      expect.arrayContaining(["game-requests", "user-12-requests"]),
    );
  });

  it("credits the person who rescinded, not a generic admin", async () => {
    await rescind();

    const [payload] = sendRequestCancelledDeletedNotification.mock.calls[0];
    expect(payload.admin_name).toBe("alice");
  });

  it("writes through the owner's statement, not its own UPDATE", async () => {
    await rescind();

    const writes = query.mock.calls.filter(([sql]) =>
      sql.includes("UPDATE ggr_game_requests"),
    );
    expect(writes).toHaveLength(1);
    expect(writes[0][0]).toContain("FOR UPDATE");
    expect(writes[0][0]).toContain("previous_status");
    expect(writes[0][1][1]).toBe("cancelled");
  });

  it("keeps its response shape", async () => {
    const response = await rescind();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      message: "Request successfully cancelled",
      request: {
        id: STORED.id,
        status: "cancelled",
        updated_at: "2026-07-29T00:00:00.000Z",
      },
    });
  });

  it("dispatches no webhook: cancelling is not an approval", async () => {
    await rescind();

    expect(sendGameRequestWebhook).not.toHaveBeenCalled();
  });

  it("still refuses a request that is not the caller's", async () => {
    ownedRow = null;

    const response = await rescind();

    expect(response.status).toBe(404);
    expect(
      query.mock.calls.filter(([sql]) =>
        sql.includes("UPDATE ggr_game_requests"),
      ),
    ).toHaveLength(0);
    expect(sendRequestCancelledDeletedNotification).not.toHaveBeenCalled();
  });

  it("still refuses a request that is already closed", async () => {
    ownedRow = { ...ownedRow, status: "fulfilled" };

    const response = await rescind();

    expect(response.status).toBe(400);
    expect(sendRequestCancelledDeletedNotification).not.toHaveBeenCalled();
  });
});
