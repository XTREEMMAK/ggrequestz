/**
 * Regression tests for status-change side effects.
 *
 * Three paths could change a request's status and all three behaved
 * differently: admin/api/requests/update sent Gotify and invalidated cache,
 * bulk-update sent a bulk notification, and admin/requests/[id]/edit imported
 * no notifier at all -- approving there told nobody and invalidated nothing.
 *
 * These pin one owner for the transition, so "did we remember to notify?"
 * stops being a question you can get wrong per call site.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const sendRequestStatusNotification = vi.fn(async () => true);
const sendRequestCancelledDeletedNotification = vi.fn(async () => true);
const sendBulkRequestStatusNotification = vi.fn(async () => true);
const invalidateCache = vi.fn(async () => {});

const ROW = {
  id: "req-1",
  user_id: "12",
  user_name: "alice",
  title: "Chrono Trigger",
  request_type: "game",
  priority: "medium",
  status: "approved",
  admin_notes: null,
  previous_status: "pending",
};

const query = vi.fn(async () => ({ rows: [ROW] }));

vi.mock("$lib/database.js", () => ({ query }));
// A vi.mock factory replaces the module wholesale, so every export
// requestStatus.server.js imports from gotify.js has to be here -- including
// the bulk summary sender, or the module fails to link.
vi.mock("$lib/gotify.js", () => ({
  sendRequestStatusNotification,
  sendRequestCancelledDeletedNotification,
  sendBulkRequestStatusNotification,
}));
vi.mock("$lib/cache.js", () => ({ invalidateCache }));

async function freshModule() {
  vi.resetModules();
  return import("$lib/requestStatus.server.js");
}

/** Let fire-and-forget continuations run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("applyRequestStatusChange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query.mockResolvedValue({ rows: [ROW] });
  });

  it("reports the transition it performed", async () => {
    const { applyRequestStatusChange } = await freshModule();

    const result = await applyRequestStatusChange({
      id: "req-1",
      to: "approved",
      actor: "admin",
    });

    expect(result.from).toBe("pending");
    expect(result.to).toBe("approved");
    expect(result.changed).toBe(true);
  });

  it("reads the old status in the same statement that writes the new one", async () => {
    const { applyRequestStatusChange } = await freshModule();

    await applyRequestStatusChange({ id: "req-1", to: "approved" });

    const [sql] = query.mock.calls[0];
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("previous_status");
  });

  it("notifies and invalidates cache on a real change", async () => {
    const { applyRequestStatusChange } = await freshModule();

    await applyRequestStatusChange({ id: "req-1", to: "approved" });
    await settle();

    expect(sendRequestStatusNotification).toHaveBeenCalledTimes(1);
    expect(invalidateCache).toHaveBeenCalledTimes(1);
  });

  it("uses the cancellation notifier when cancelling", async () => {
    query.mockResolvedValue({
      rows: [{ ...ROW, status: "cancelled", previous_status: "pending" }],
    });
    const { applyRequestStatusChange } = await freshModule();

    await applyRequestStatusChange({ id: "req-1", to: "cancelled" });
    await settle();

    expect(sendRequestCancelledDeletedNotification).toHaveBeenCalledTimes(1);
    expect(sendRequestStatusNotification).not.toHaveBeenCalled();
  });

  it("does nothing when the status is unchanged", async () => {
    query.mockResolvedValue({
      rows: [{ ...ROW, status: "approved", previous_status: "approved" }],
    });
    const { applyRequestStatusChange } = await freshModule();

    const result = await applyRequestStatusChange({
      id: "req-1",
      to: "approved",
    });
    await settle();

    expect(result.changed).toBe(false);
    expect(sendRequestStatusNotification).not.toHaveBeenCalled();
  });

  it("reports a missing request instead of throwing", async () => {
    query.mockResolvedValue({ rows: [] });
    const { applyRequestStatusChange } = await freshModule();

    const result = await applyRequestStatusChange({
      id: "nope",
      to: "approved",
    });

    expect(result.row).toBeNull();
    expect(result.changed).toBe(false);
  });

  it("invalidates the per-user keys, not just the global ones", async () => {
    const { applyRequestStatusChange } = await freshModule();

    await applyRequestStatusChange({ id: "req-1", to: "approved" });
    await settle();

    expect(invalidateCache.mock.calls[0][0]).toEqual(
      expect.arrayContaining(["game-requests", "user-12-requests"]),
    );
  });

  it("does not fail the transition when notifying throws", async () => {
    sendRequestStatusNotification.mockRejectedValueOnce(
      new Error("gotify down"),
    );
    const { applyRequestStatusChange } = await freshModule();

    const result = await applyRequestStatusChange({
      id: "req-1",
      to: "approved",
    });
    await settle();

    expect(result.changed).toBe(true);
  });

  // admin_notes: an explicit "is the caller setting notes" flag travels
  // alongside the value, so a deliberate clear ("") cannot be mistaken for
  // "notes not mentioned" (undefined), and vice versa. These pin the SQL
  // parameters the CASE WHEN $4 branch depends on.

  it("writes admin notes when supplied as a non-empty string", async () => {
    const { applyRequestStatusChange } = await freshModule();

    await applyRequestStatusChange({
      id: "req-1",
      to: "approved",
      adminNotes: "looks good",
    });

    const [, params] = query.mock.calls[0];
    const [, , notesValue, setNotes] = params;
    expect(setNotes).toBe(true);
    expect(notesValue).toBe("looks good");
  });

  it("clears the admin notes column when supplied as an empty string", async () => {
    const { applyRequestStatusChange } = await freshModule();

    await applyRequestStatusChange({
      id: "req-1",
      to: "approved",
      adminNotes: "",
    });

    const [, params] = query.mock.calls[0];
    const [, , notesValue, setNotes] = params;
    expect(setNotes).toBe(true);
    expect(notesValue).toBeNull();
  });

  it("preserves the existing admin notes when the caller doesn't mention them", async () => {
    const { applyRequestStatusChange } = await freshModule();

    await applyRequestStatusChange({
      id: "req-1",
      to: "approved",
      // adminNotes intentionally omitted -- not the same as passing null.
    });

    const [, params] = query.mock.calls[0];
    const [, , , setNotes] = params;
    expect(setNotes).toBe(false);
  });

  // notify(): the notification must only ever carry notes this transition
  // actually wrote. row.admin_notes is the persisted column, which on the
  // "caller omitted notes" path is deliberately left untouched -- it can
  // still hold text an earlier, unrelated transition wrote (e.g. a prior
  // rejection reason). Presenting that as if it explains *this* transition
  // would be wrong, and is worst on the cancellation path where it renders
  // as "reason:", implying it's why the request was cancelled.

  const STALE_NOTE = "STALE-NOTE-FROM-A-PREVIOUS-REJECTION";

  it("does not carry a stale stored note when the caller omits notes on a normal transition", async () => {
    query.mockResolvedValue({
      rows: [
        {
          ...ROW,
          status: "approved",
          previous_status: "pending",
          admin_notes: STALE_NOTE,
        },
      ],
    });
    const { applyRequestStatusChange } = await freshModule();

    await applyRequestStatusChange({ id: "req-1", to: "approved" });
    await settle();

    expect(sendRequestStatusNotification).toHaveBeenCalledTimes(1);
    const [payload] = sendRequestStatusNotification.mock.calls[0];
    expect(payload.admin_notes).not.toBe(STALE_NOTE);
    expect(payload.admin_notes).toBeUndefined();
  });

  it("does not present a stale stored note as the cancellation reason when the caller omits notes", async () => {
    query.mockResolvedValue({
      rows: [
        {
          ...ROW,
          status: "cancelled",
          previous_status: "pending",
          admin_notes: STALE_NOTE,
        },
      ],
    });
    const { applyRequestStatusChange } = await freshModule();

    await applyRequestStatusChange({ id: "req-1", to: "cancelled" });
    await settle();

    expect(sendRequestCancelledDeletedNotification).toHaveBeenCalledTimes(1);
    const [payload] = sendRequestCancelledDeletedNotification.mock.calls[0];
    expect(payload.reason).not.toContain(STALE_NOTE);
  });

  it("carries the exact notes the caller supplied", async () => {
    query.mockResolvedValue({
      rows: [
        {
          ...ROW,
          status: "approved",
          previous_status: "pending",
          admin_notes: "looks good",
        },
      ],
    });
    const { applyRequestStatusChange } = await freshModule();

    await applyRequestStatusChange({
      id: "req-1",
      to: "approved",
      adminNotes: "looks good",
    });
    await settle();

    const [payload] = sendRequestStatusNotification.mock.calls[0];
    expect(payload.admin_notes).toBe("looks good");
  });
});
