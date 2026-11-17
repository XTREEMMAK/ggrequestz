/**
 * Regression tests for role assignment through the user management API
 * (GHSA-9j76-3g65-pr26).
 *
 * The JSON endpoints accepted `assign_role` from anyone holding `user.edit`,
 * on their own account, for any role. Verified live against the test stack
 * before the fix: a user in a custom role carrying `user.edit` assigned
 * themselves the `admin` role and held it.
 *
 * Actors: a moderator (custom role, `user.edit`, `user.ban`, `user.delete`,
 * not an administrator) and an administrator. Roles: 1 is `admin`, 3 is an
 * ordinary role, 4 is a custom role carrying an `admin.*` permission.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const MODERATOR = { sub: "moderator-sub", id: 2 };
const ADMIN = { sub: "admin-sub", id: 1 };
const ADMINISTRATORS = new Set([1]);
const ROLES = {
  1: { name: "admin", admin_level: true },
  3: { name: "user", admin_level: false },
  4: { name: "power", admin_level: true },
};

let actor;
const writes = [];

const verifySessionToken = vi.fn(async () => ({ sub: actor.sub }));
const getBasicAuthUser = vi.fn(() => null);
const userHasPermission = vi.fn(async (userId, permission) => {
  if (ADMINISTRATORS.has(Number(userId))) return true;
  return ["user.edit", "user.ban", "user.delete"].includes(permission);
});

const query = vi.fn(async (sql, params = []) => {
  if (/authentik_sub = \$1/.test(sql)) {
    return {
      rows: [{ id: params[0] === ADMIN.sub ? ADMIN.id : MODERATOR.id }],
    };
  }
  if (/FROM ggr_roles r\s+WHERE r\.id = \$1/.test(sql)) {
    const role = ROLES[Number(params[0])];
    return { rows: role ? [role] : [] };
  }
  if (/u\.id = ANY\(\$1::int\[\]\)/.test(sql)) {
    return {
      rows: params[0]
        .filter((id) => ADMINISTRATORS.has(id))
        .map((id) => ({ id })),
    };
  }
  if (/is_admin_count/.test(sql)) {
    return {
      rows: [{ is_admin_count: ADMINISTRATORS.has(Number(params[0])) ? 1 : 0 }],
    };
  }
  if (/COUNT\(/.test(sql)) {
    return { rows: [{ count: "2" }] };
  }
  if (
    /r\.name = 'admin' AND ur\.is_active = true/.test(sql) &&
    /IN \(/.test(sql)
  ) {
    return {
      rows: params
        .filter((id) => ADMINISTRATORS.has(Number(id)))
        .map((id) => ({ id })),
    };
  }
  if (
    /^\s*(INSERT INTO ggr_user_roles|DELETE FROM ggr_user_roles|UPDATE ggr_users)/.test(
      sql,
    )
  ) {
    writes.push(sql.trim().split("\n")[0]);
    return {
      rows: [{ id: 99, user_id: 99, is_active: false, email: "x", name: "x" }],
    };
  }
  return { rows: [] };
});

vi.mock("$lib/database.js", () => ({ query }));
vi.mock("$lib/auth.server.js", () => ({ verifySessionToken }));
vi.mock("$lib/userProfile.js", () => ({ userHasPermission }));
vi.mock("$lib/basicAuth.js", () => ({ getBasicAuthUser }));

const cookies = {
  get: (name) => (name === "session" ? "session-token" : undefined),
};

// Two literal imports, not one built from `route`. A template-string import
// makes Vite inject a virtual helper module whose id starts with a null byte,
// and the coverage HTML reporter then fails trying to write it as a file.
const ENDPOINTS = {
  update: () => import("../../src/routes/admin/api/users/update/+server.js"),
  "bulk-update": () =>
    import("../../src/routes/admin/api/users/bulk-update/+server.js"),
};

async function post(route, body) {
  const { POST } = await ENDPOINTS[route]();
  const request = new Request(`http://localhost/admin/api/users/${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const response = await POST({ request, cookies });
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  vi.clearAllMocks();
  writes.length = 0;
  actor = MODERATOR;
});

describe("POST /admin/api/users/update", () => {
  it("refuses a moderator assigning the admin role to themselves", async () => {
    const { status } = await post("update", {
      user_id: 2,
      action: "assign_role",
      value: 1,
    });
    expect(status).toBe(403);
    expect(writes).toHaveLength(0);
  });

  it("refuses the same request with the ids sent as strings", async () => {
    const { status } = await post("update", {
      user_id: "2",
      action: "assign_role",
      value: "1",
    });
    expect(status).toBe(403);
    expect(writes).toHaveLength(0);
  });

  it("refuses a moderator assigning even an ordinary role to themselves", async () => {
    const { status } = await post("update", {
      user_id: 2,
      action: "assign_role",
      value: 3,
    });
    expect(status).toBe(403);
    expect(writes).toHaveLength(0);
  });

  it.each([
    ["the admin role", 1],
    ["a custom role carrying admin.*", 4],
  ])(
    "refuses a moderator assigning %s to another user",
    async (_label, roleId) => {
      const { status } = await post("update", {
        user_id: 5,
        action: "assign_role",
        value: roleId,
      });
      expect(status).toBe(403);
      expect(writes).toHaveLength(0);
    },
  );

  it("refuses a moderator removing the admin role from an administrator", async () => {
    const { status } = await post("update", {
      user_id: 1,
      action: "remove_role",
      value: 1,
    });
    expect(status).toBe(403);
    expect(writes).toHaveLength(0);
  });

  it.each(["toggle_active", "ban", "delete"])(
    "refuses a moderator's %s on an administrator's account",
    async (action) => {
      const { status } = await post("update", { user_id: 1, action });
      expect(status).toBe(403);
      expect(writes).toHaveLength(0);
    },
  );

  it("still lets a moderator assign an ordinary role to another user", async () => {
    const { status } = await post("update", {
      user_id: 5,
      action: "assign_role",
      value: 3,
    });
    expect(status).toBe(200);
    expect(
      writes.some((sql) => sql.startsWith("INSERT INTO ggr_user_roles")),
    ).toBe(true);
  });

  it("lets an administrator assign the admin role to another user", async () => {
    actor = ADMIN;
    const { status } = await post("update", {
      user_id: 5,
      action: "assign_role",
      value: 1,
    });
    expect(status).toBe(200);
  });

  it("refuses an administrator changing their own roles", async () => {
    actor = ADMIN;
    const { status } = await post("update", {
      user_id: 1,
      action: "remove_role",
      value: 1,
    });
    expect(status).toBe(403);
    expect(writes).toHaveLength(0);
  });
});

describe("POST /admin/api/users/bulk-update", () => {
  it("refuses a moderator assigning the admin role when the list includes themselves", async () => {
    const { status } = await post("bulk-update", {
      user_ids: [5, "2"],
      action: "assign_role",
      value: 1,
    });
    expect(status).toBe(403);
    expect(writes).toHaveLength(0);
  });

  it("refuses a moderator assigning the admin role to other users", async () => {
    const { status } = await post("bulk-update", {
      user_ids: [5, 6],
      action: "assign_role",
      value: 1,
    });
    expect(status).toBe(403);
    expect(writes).toHaveLength(0);
  });

  it("refuses a moderator deactivating a list that contains an administrator", async () => {
    const { status } = await post("bulk-update", {
      user_ids: [5, 1],
      action: "deactivate",
    });
    expect(status).toBe(403);
    expect(writes).toHaveLength(0);
  });

  it("still lets a moderator assign an ordinary role to other users", async () => {
    const { status } = await post("bulk-update", {
      user_ids: [5, 6],
      action: "assign_role",
      value: 3,
    });
    expect(status).toBe(200);
  });
});
