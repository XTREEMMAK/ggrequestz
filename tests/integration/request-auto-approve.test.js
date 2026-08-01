/**
 * Regression tests for auto-approve.
 *
 * request.auto_approve was bound in admin/settings/+page.svelte and saved to
 * ggr_system_settings, but no server code read it -- POST /api/request
 * hardcoded status "pending", so the checkbox did nothing at all.
 *
 * Settings values are bare strings ('true'/'false'), and the key is absent
 * from the table until someone saves the settings form, so absence must read
 * as false.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const userHasPermission = vi.fn(async () => false);
let settingRow = [];

const query = vi.fn(async (sql) => {
  if (sql.includes("ggr_system_settings")) return { rows: settingRow };
  return { rows: [] };
});

vi.mock("$lib/database.js", () => ({ query }));
vi.mock("$lib/userProfile.js", () => ({ userHasPermission }));

async function freshPolicy() {
  vi.resetModules();
  return import("$lib/requestPolicy.server.js");
}

describe("mayAutoApprove", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userHasPermission.mockResolvedValue(false);
    settingRow = [];
  });

  it("is false when the permission is absent and the setting is unset", async () => {
    const { mayAutoApprove } = await freshPolicy();
    await expect(mayAutoApprove("12")).resolves.toBe(false);
  });

  it("is true when the user holds request.auto_approve", async () => {
    userHasPermission.mockResolvedValue(true);
    const { mayAutoApprove } = await freshPolicy();

    await expect(mayAutoApprove("12")).resolves.toBe(true);
    expect(userHasPermission).toHaveBeenCalledWith(
      "12",
      "request.auto_approve",
    );
  });

  it("is true when the global setting is on for everyone", async () => {
    settingRow = [{ value: "true" }];
    const { mayAutoApprove } = await freshPolicy();

    await expect(mayAutoApprove("12")).resolves.toBe(true);
  });

  it("treats the string 'false' as off, not as a truthy string", async () => {
    settingRow = [{ value: "false" }];
    const { mayAutoApprove } = await freshPolicy();

    await expect(mayAutoApprove("12")).resolves.toBe(false);
  });

  it("does not consult the setting once the permission has answered yes", async () => {
    userHasPermission.mockResolvedValue(true);
    const { mayAutoApprove } = await freshPolicy();

    await mayAutoApprove("12");

    const settingsReads = query.mock.calls.filter(([sql]) =>
      sql.includes("ggr_system_settings"),
    );
    expect(settingsReads).toHaveLength(0);
  });
});
