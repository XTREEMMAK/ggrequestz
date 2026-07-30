/**
 * Regression tests for a request re-entering the open set.
 *
 * The duplicate-guard indexes cover `pending` and `approved` as one set, so a
 * pending<->approved transition can never collide with them. The only way to
 * violate them is a row *re-entering* that set, and nothing handled it:
 *
 *   1. Alice requests a game. An admin rejects it -- the row is now outside
 *      both partial indexes.
 *   2. Bob requests the same game. The pre-check correctly finds nothing (a
 *      failed fetch is meant to be retryable), so two rows exist.
 *   3. The admin re-opens Alice's row. The index already holds Bob's, so
 *      Postgres raises 23505.
 *
 * Every step is legitimate. Unhandled, the 23505 escaped as a bare HTTP 500
 * from the two admin API routes and as `{success:false, error:"Failed to
 * update request"}` from the edit page -- and Alice's row could then never
 * return to pending or approved while Bob's stayed open, with no in-app way to
 * discover why or to find the blocking row. Transitions to `pending` are not
 * approve-gated, so a request.edit-only user reached this too.
 *
 * These pin the recovery: 409 from all three admin paths, carrying
 * `existing_request_id` -- the same field the submission 409 uses, so the two
 * conflict responses are one shape.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const ALICE_ROW = {
  id: "alice-1",
  user_id: "12",
  user_name: "alice",
  title: "Chrono Trigger",
  request_type: "game",
  igdb_id: "1234",
  priority: "medium",
  status: "rejected",
  admin_notes: null,
};

const BOBS_OPEN_ROW = {
  id: "bob-1",
  status: "pending",
  user_name: "bob",
};

/** A pg unique_violation, as node-postgres surfaces it. */
function uniqueViolation() {
  const error = new Error(
    'duplicate key value violates unique constraint "ggr_game_requests_open_igdb_uniq"',
  );
  error.code = "23505";
  return error;
}

// Per-test switches, reset in beforeEach.
let statusWriteFails;
let statusWriteMissesTheRow;
let fieldWriteFails;
let openDuplicate;

const txEvents = [];

/**
 * Every statement these routes issue. Ordered most specific first: the owner's
 * status write, findOpenDuplicate's lookup and the edit page's field UPDATE all
 * name ggr_game_requests.
 */
function answer(sql) {
  if (sql.includes("previous_status")) {
    // The status owner's UPDATE ... FOR UPDATE.
    if (statusWriteFails) throw uniqueViolation();
    if (statusWriteMissesTheRow) return { rows: [] };
    return {
      rows: [{ ...ALICE_ROW, status: "approved", previous_status: "rejected" }],
    };
  }
  if (sql.includes("SELECT igdb_id, title, request_type")) {
    // describeRequestConflict reading the row whose write was rejected.
    return { rows: [ALICE_ROW] };
  }
  if (sql.includes("status = ANY($3)")) {
    // findOpenDuplicate.
    return { rows: openDuplicate ? [openDuplicate] : [] };
  }
  if (sql.includes("UPDATE ggr_game_requests")) {
    // The edit page's own field UPDATE.
    if (fieldWriteFails) throw uniqueViolation();
    return { rows: [ALICE_ROW] };
  }
  if (sql.includes("FROM ggr_users")) {
    return { rows: [{ id: 7 }] };
  }
  return { rows: [] };
}

const query = vi.fn();
const txQuery = vi.fn();

// A transaction whose boundaries are observable. The routes must never commit a
// unit that contained a conflict, and must never dispatch from inside one.
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

async function updateRequest(body) {
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

async function bulkUpdateRequests(body) {
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

async function submitEditForm(fields = {}) {
  vi.resetModules();
  const { actions } = await import(
    "../../src/routes/admin/requests/[id]/edit/+page.server.js"
  );

  const formData = new FormData();
  for (const [key, value] of Object.entries({
    title: "Chrono Trigger",
    status: "approved",
    priority: "medium",
    ...fields,
  })) {
    formData.set(key, value);
  }

  const result = await actions.default({
    params: { id: ALICE_ROW.id },
    cookies,
    request: new Request("http://localhost/admin/requests/alice-1/edit", {
      method: "POST",
      body: formData,
    }),
  });
  await settle();
  return result;
}

async function statusOwner() {
  vi.resetModules();
  return import("$lib/requestStatus.server.js");
}

describe("re-entering the open set", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    txEvents.length = 0;

    statusWriteFails = true;
    statusWriteMissesTheRow = false;
    fieldWriteFails = false;
    openDuplicate = BOBS_OPEN_ROW;

    // vi.clearAllMocks() clears recorded calls but keeps implementations, so
    // every implementation is (re)installed here rather than at declaration.
    query.mockImplementation(async (sql) => answer(sql));
    txQuery.mockImplementation(async (sql) => answer(sql));
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

  describe("applyRequestStatusChange", () => {
    it("reports the conflict instead of throwing", async () => {
      const { applyRequestStatusChange } = await statusOwner();

      const outcome = await applyRequestStatusChange({
        id: ALICE_ROW.id,
        to: "approved",
      });

      expect(outcome.conflict).toBeDefined();
      expect(outcome.changed).toBe(false);
      expect(outcome.row).toBeNull();
    });

    it("names the superseding request, so an admin can go and resolve it", async () => {
      const { applyRequestStatusChange } = await statusOwner();

      const { conflict } = await applyRequestStatusChange({
        id: ALICE_ROW.id,
        to: "approved",
      });

      expect(conflict).toEqual({
        existing_request_id: "bob-1",
        existing_status: "pending",
        existing_user_name: "bob",
      });
    });

    it("performs no side effects for a write that did not happen", async () => {
      const { applyRequestStatusChange } = await statusOwner();

      await applyRequestStatusChange({ id: ALICE_ROW.id, to: "approved" });
      await settle();

      expect(sendGameRequestWebhook).not.toHaveBeenCalled();
      expect(sendRequestStatusNotification).not.toHaveBeenCalled();
      expect(invalidateCache).not.toHaveBeenCalled();
    });

    it("still reports a conflict when the blocking row cannot be identified", async () => {
      // The lookup is advisory. Losing it must not turn a 409 back into a 500.
      openDuplicate = null;
      const { applyRequestStatusChange } = await statusOwner();

      const { conflict } = await applyRequestStatusChange({
        id: ALICE_ROW.id,
        to: "approved",
      });

      expect(conflict).toEqual({
        existing_request_id: null,
        existing_status: null,
        existing_user_name: null,
      });
    });

    it("still throws on an error that is not a duplicate violation", async () => {
      const { applyRequestStatusChange } = await statusOwner();
      query.mockImplementationOnce(async () => {
        throw new Error("connection terminated unexpectedly");
      });

      await expect(
        applyRequestStatusChange({ id: ALICE_ROW.id, to: "approved" }),
      ).rejects.toThrow("connection terminated unexpectedly");
    });
  });

  describe("POST /admin/api/requests/update", () => {
    it("answers 409, not 500", async () => {
      const response = await updateRequest({
        request_id: ALICE_ROW.id,
        status: "approved",
      });

      expect(response.status).toBe(409);
    });

    it("names the blocking request in the body", async () => {
      const response = await updateRequest({
        request_id: ALICE_ROW.id,
        status: "approved",
      });

      const body = await response.json();
      expect(body).toMatchObject({
        success: false,
        existing_request_id: "bob-1",
      });
      expect(body.error).toContain("bob-1");
    });

    it("reaches a request.edit-only user moving a row back to pending", async () => {
      // Only approved/rejected/fulfilled are approve-gated, so this path is
      // open to a non-approver -- and it re-enters the indexed set too.
      userHasPermission.mockImplementation(
        async (_id, permission) => permission === "request.edit",
      );

      const response = await updateRequest({
        request_id: ALICE_ROW.id,
        status: "pending",
      });

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        existing_request_id: "bob-1",
      });
    });

    it("still answers 404 for a request that does not exist", async () => {
      // The conflict branch must not swallow the not-found case.
      statusWriteFails = false;
      statusWriteMissesTheRow = true;

      const response = await updateRequest({
        request_id: "nope",
        status: "approved",
      });

      expect(response.status).toBe(404);
    });
  });

  describe("POST /admin/api/requests/bulk-update", () => {
    it("answers 409 naming the blocking request", async () => {
      const response = await bulkUpdateRequests({
        request_ids: [ALICE_ROW.id],
        status: "approved",
      });

      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body).toMatchObject({
        success: false,
        existing_request_id: "bob-1",
      });
      expect(body.error).toContain("bob-1");
    });

    it("rolls the batch back rather than committing it", async () => {
      await bulkUpdateRequests({
        request_ids: [ALICE_ROW.id],
        status: "approved",
      });

      expect(txEvents).toEqual(["BEGIN", "ROLLBACK"]);
    });
  });

  describe("the edit page action", () => {
    it("answers 409 naming the blocking request", async () => {
      const result = await submitEditForm({ status: "approved" });

      expect(result.status).toBe(409);
      expect(result.data).toMatchObject({
        success: false,
        existing_request_id: "bob-1",
      });
      expect(result.data.error).toContain("bob-1");
    });

    it("rolls the field edits back with the failed status change", async () => {
      // The field UPDATE and the status change used to be two implicit
      // transactions: the rename committed while the admin was told the whole
      // save had failed.
      await submitEditForm({ title: "Renamed", status: "approved" });

      expect(txEvents).toEqual(["BEGIN", "ROLLBACK"]);

      const fieldWrites = txQuery.mock.calls.filter(
        ([sql]) =>
          sql.includes("UPDATE ggr_game_requests") &&
          !sql.includes("previous_status"),
      );
      expect(fieldWrites).toHaveLength(1);
      // Nothing about this save may have gone out through a connection the
      // rollback does not cover.
      expect(
        query.mock.calls.filter(([sql]) =>
          sql.includes("UPDATE ggr_game_requests"),
        ),
      ).toHaveLength(0);
    });

    it("dispatches and notifies nothing when the status change conflicts", async () => {
      await submitEditForm({ status: "approved" });

      expect(sendGameRequestWebhook).not.toHaveBeenCalled();
      expect(sendRequestStatusNotification).not.toHaveBeenCalled();
      expect(invalidateCache).not.toHaveBeenCalled();
    });

    it("answers 409 when a rename alone collides on the title index", async () => {
      // `title` is part of the open-title index for rows with no igdb_id, so
      // the field UPDATE itself can raise 23505 -- before any status change.
      statusWriteFails = false;
      fieldWriteFails = true;

      const result = await submitEditForm({
        title: "Some Other Open Title",
        status: "",
      });

      expect(result.status).toBe(409);
      expect(result.data).toMatchObject({ existing_request_id: "bob-1" });
      expect(txEvents).toEqual(["BEGIN", "ROLLBACK"]);
    });
  });

  describe("a save with no conflict", () => {
    beforeEach(() => {
      statusWriteFails = false;
      openDuplicate = null;
    });

    it("commits the edit page and runs its side effects after commit", async () => {
      const result = await submitEditForm({ status: "approved" });

      expect(result).toMatchObject({ success: true });
      expect(txEvents).toEqual(["BEGIN", "COMMIT"]);
      expect(sendGameRequestWebhook).toHaveBeenCalledTimes(1);
      expect(sendRequestStatusNotification).toHaveBeenCalledTimes(1);
      expect(invalidateCache).toHaveBeenCalledTimes(1);
    });

    it("commits before anything is dispatched", async () => {
      // A webhook cannot be un-sent, so it must not be in flight while the
      // transaction can still roll back.
      let committedWhenDispatched = -1;
      sendGameRequestWebhook.mockImplementation(async () => {
        committedWhenDispatched = txEvents.indexOf("COMMIT");
        return true;
      });

      await submitEditForm({ status: "approved" });

      expect(committedWhenDispatched).toBeGreaterThanOrEqual(0);
    });
  });
});
