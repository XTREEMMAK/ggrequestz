/**
 * Regression tests for the bulk status change.
 *
 * bulk-update replaced one `UPDATE ... WHERE id IN (...)` with a serial per-row
 * loop and no transaction. The loop itself is deliberate -- per-row atomicity is
 * what makes each transition's from/to detection correct and each dispatch fire
 * exactly once -- but with nothing wrapping it, a row raising 23505 left rows
 * 1..k-1 committed *and already dispatched*, real downloads in flight, while the
 * throw escaped and the client got `500 {success:false}` with no indication that
 * anything had succeeded.
 *
 * The batch is now one transaction, and the side effects are deferred until
 * after commit: a dispatch cannot be rolled back, so nothing may fire for a
 * write that has not committed.
 *
 * The same loop also deleted a feature. sendBulkNotificationForRequests
 * collapsed a bulk action into one summary Gotify message; notifying per row
 * turned bulk-approving 100 requests into 100 pushes, 100 settings reads and 100
 * cache invalidations, and removed "Bulk Request Update" from the product. The
 * summary is restored here, while a single-row action keeps its detailed
 * per-row notification.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const IDS = ["r1", "r2", "r3"];

function row(id) {
  return {
    id,
    user_id: id === "r3" ? "99" : "12",
    user_name: "alice",
    title: `Game ${id}`,
    request_type: "game",
    igdb_id: `igdb-${id}`,
    priority: "medium",
    admin_notes: null,
  };
}

function uniqueViolation() {
  const error = new Error(
    'duplicate key value violates unique constraint "ggr_game_requests_open_igdb_uniq"',
  );
  error.code = "23505";
  return error;
}

/** Which id's status write loses to the duplicate guard, if any. */
let conflictingId;

const txEvents = [];

function answer(sql, params) {
  if (sql.includes("previous_status")) {
    const id = params[0];
    if (id === conflictingId) throw uniqueViolation();
    return {
      rows: [{ ...row(id), status: params[1], previous_status: "pending" }],
    };
  }
  if (sql.includes("SELECT igdb_id, title, request_type")) {
    return { rows: [row(params[0])] };
  }
  if (sql.includes("status = ANY($3)")) {
    return {
      rows: [{ id: "blocker-1", status: "approved", user_name: "bob" }],
    };
  }
  if (sql.includes("FROM ggr_users")) {
    return { rows: [{ id: 7 }] };
  }
  return { rows: [] };
}

const query = vi.fn();
const txQuery = vi.fn();
const withTransaction = vi.fn();

const sendRequestStatusNotification = vi.fn();
const sendRequestCancelledDeletedNotification = vi.fn();
const sendBulkRequestStatusNotification = vi.fn();
const invalidateCache = vi.fn();
const sendGameRequestWebhook = vi.fn();
const userHasPermission = vi.fn();
const verifySessionToken = vi.fn();

vi.mock("$lib/database.js", () => ({ query, withTransaction }));
vi.mock("$lib/gotify.js", () => ({
  sendRequestStatusNotification,
  sendRequestCancelledDeletedNotification,
  sendBulkRequestStatusNotification,
}));
vi.mock("$lib/cache.js", () => ({ invalidateCache }));
vi.mock("$lib/webhooks.server.js", () => ({ sendGameRequestWebhook }));
vi.mock("$lib/userProfile.js", () => ({ userHasPermission }));
vi.mock("$lib/auth.server.js", () => ({ verifySessionToken }));
vi.mock("$lib/basicAuth.js", () => ({ getBasicAuthUser: vi.fn(() => null) }));

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const cookies = {
  get: (name) => (name === "session" ? "session-token" : null),
};

function jsonRequest(url, body) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function bulkUpdate(body) {
  vi.resetModules();
  const { POST } = await import(
    "../../src/routes/admin/api/requests/bulk-update/+server.js"
  );
  const response = await POST({
    cookies,
    request: jsonRequest(
      "http://localhost/admin/api/requests/bulk-update",
      body,
    ),
  });
  await settle();
  return response;
}

async function singleUpdate(body) {
  vi.resetModules();
  const { POST } = await import(
    "../../src/routes/admin/api/requests/update/+server.js"
  );
  const response = await POST({
    cookies,
    request: jsonRequest("http://localhost/admin/api/requests/update", body),
  });
  await settle();
  return response;
}

/** The status writes that were issued, in order, by request id. */
function statusWriteIds(mock) {
  return mock.mock.calls
    .filter(([sql]) => sql.includes("previous_status"))
    .map(([, params]) => params[0]);
}

describe("bulk status change", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    txEvents.length = 0;
    conflictingId = null;

    query.mockImplementation(async (sql, params) => answer(sql, params));
    txQuery.mockImplementation(async (sql, params) => answer(sql, params));
    withTransaction.mockImplementation(async (fn) => {
      txEvents.push("BEGIN");
      try {
        const result = await fn(txQuery);
        txEvents.push("COMMIT");
        return result;
      } catch (error) {
        txEvents.push("ROLLBACK");
        throw error;
      }
    });
    sendRequestStatusNotification.mockResolvedValue(true);
    sendRequestCancelledDeletedNotification.mockResolvedValue(true);
    sendBulkRequestStatusNotification.mockResolvedValue(true);
    invalidateCache.mockResolvedValue(undefined);
    sendGameRequestWebhook.mockResolvedValue(true);
    userHasPermission.mockResolvedValue(true);
    verifySessionToken.mockResolvedValue({
      sub: "authentik-sub",
      name: "admin",
      email: "admin@example.test",
    });
  });

  describe("when one row in the batch conflicts", () => {
    beforeEach(() => {
      conflictingId = "r2";
    });

    it("commits nothing", async () => {
      await bulkUpdate({ request_ids: IDS, status: "approved" });

      expect(txEvents).toEqual(["BEGIN", "ROLLBACK"]);
      expect(txEvents).not.toContain("COMMIT");
    });

    it("dispatches nothing, including for the rows that wrote successfully", async () => {
      await bulkUpdate({ request_ids: IDS, status: "approved" });

      // r1 was written before r2 failed. Under the old serial loop its webhook
      // had already gone out -- a download in flight for a row that ends up
      // rolled back.
      expect(statusWriteIds(txQuery)).toContain("r1");
      expect(sendGameRequestWebhook).not.toHaveBeenCalled();
    });

    it("notifies nobody and invalidates no cache", async () => {
      await bulkUpdate({ request_ids: IDS, status: "approved" });

      expect(sendBulkRequestStatusNotification).not.toHaveBeenCalled();
      expect(sendRequestStatusNotification).not.toHaveBeenCalled();
      expect(invalidateCache).not.toHaveBeenCalled();
    });

    it("answers 409 with the blocking request, not 500", async () => {
      const response = await bulkUpdate({
        request_ids: IDS,
        status: "approved",
      });

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        success: false,
        existing_request_id: "blocker-1",
      });
    });

    it("stops at the conflict instead of writing the rest of the batch", async () => {
      await bulkUpdate({ request_ids: IDS, status: "approved" });

      expect(statusWriteIds(txQuery)).toEqual(["r1", "r2"]);
    });
  });

  describe("when the whole batch succeeds", () => {
    it("commits, then dispatches once per approved row", async () => {
      const response = await bulkUpdate({
        request_ids: IDS,
        status: "approved",
      });

      expect(response.status).toBe(200);
      expect(txEvents).toEqual(["BEGIN", "COMMIT"]);
      expect(sendGameRequestWebhook).toHaveBeenCalledTimes(3);
    });

    it("dispatches only after the commit", async () => {
      let committedWhenDispatched = [];
      sendGameRequestWebhook.mockImplementation(async () => {
        committedWhenDispatched.push(txEvents.includes("COMMIT"));
        return true;
      });

      await bulkUpdate({ request_ids: IDS, status: "approved" });

      expect(committedWhenDispatched).toEqual([true, true, true]);
    });

    it("sends one summary notification rather than one per row", async () => {
      await bulkUpdate({ request_ids: IDS, status: "approved" });

      expect(sendBulkRequestStatusNotification).toHaveBeenCalledTimes(1);
      expect(sendRequestStatusNotification).not.toHaveBeenCalled();
    });

    it("tells the summary which rows and which status", async () => {
      await bulkUpdate({ request_ids: IDS, status: "approved" });

      const [summary] = sendBulkRequestStatusNotification.mock.calls[0];
      expect(summary.status).toBe("approved");
      expect(summary.requests.map((request) => request.id)).toEqual(IDS);
      expect(summary.actor).toBe("admin");
    });

    it("invalidates cache once for the batch, not once per row", async () => {
      await bulkUpdate({ request_ids: IDS, status: "approved" });

      expect(invalidateCache).toHaveBeenCalledTimes(1);
    });

    it("still covers every affected user in that one invalidation", async () => {
      // r3 belongs to a different user, whose per-user keys must not be lost
      // to the de-duplication that makes it a single call.
      await bulkUpdate({ request_ids: IDS, status: "approved" });

      expect(invalidateCache.mock.calls[0][0]).toEqual(
        expect.arrayContaining([
          "game-requests",
          "recent-requests",
          "user-12-requests",
          "user-99-requests",
        ]),
      );
    });

    it("does not repeat a key shared by two rows", async () => {
      await bulkUpdate({ request_ids: IDS, status: "approved" });

      const keys = invalidateCache.mock.calls[0][0];
      expect(new Set(keys).size).toBe(keys.length);
    });

    it("uses the summary for a cancellation too, not the per-row canceller", async () => {
      await bulkUpdate({ request_ids: IDS, status: "cancelled" });

      expect(sendBulkRequestStatusNotification).toHaveBeenCalledTimes(1);
      expect(sendRequestCancelledDeletedNotification).not.toHaveBeenCalled();
    });

    it("reports every updated row to the client", async () => {
      const response = await bulkUpdate({
        request_ids: IDS,
        status: "approved",
      });

      const body = await response.json();
      expect(body.updated_count).toBe(3);
      expect(body.updated_requests.map((request) => request.id)).toEqual(IDS);
    });
  });

  describe("a single-row action", () => {
    it("keeps its detailed per-row notification and sends no summary", async () => {
      const response = await singleUpdate({
        request_id: "r1",
        status: "approved",
      });

      expect(response.status).toBe(200);
      expect(sendRequestStatusNotification).toHaveBeenCalledTimes(1);
      expect(sendBulkRequestStatusNotification).not.toHaveBeenCalled();
    });
  });
});
