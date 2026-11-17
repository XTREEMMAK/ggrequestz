/**
 * Regression tests for the admin bootstrap (GHSA-xm2w-327g-3fxg).
 *
 * "Initial setup" used to mean "no active user has the admin flag". An OIDC
 * install reaches that state in ordinary use: with a groups claim, the first
 * administrator's flag follows membership on their next sign-in. Verified live
 * against the test stack before the fix: after that demotion an anonymous
 * POST /api/auth/basic/setup created an administrator, which then signed in
 * with a password and opened /admin.
 *
 * The same "no admin" test also made the next new OIDC account an admin, and
 * made whoever opened /admin an admin. Each case below pins one of those shut.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The database these tests run against: accounts exist, none has the admin
 * flag. Queries are answered from it by what they ask, so a check keyed on
 * "no admin" and one keyed on "no account" get different answers.
 */
const db = {
  accounts: 1,
  admins: 0,
  failReads: false,
};

const inserted = [];

function answer(sql, params = []) {
  if (db.failReads && /SELECT/i.test(sql)) {
    throw new Error("connection refused");
  }
  if (/EXISTS \(SELECT 1 FROM ggr_users\)/i.test(sql)) {
    return { rows: [{ has_users: db.accounts > 0 }] };
  }
  // The two "is there an admin" shapes the old code used: COUNT(*) and LIMIT 1.
  if (/FROM ggr_users\s+WHERE is_admin = TRUE/i.test(sql)) {
    if (/COUNT\(\*\)/i.test(sql)) {
      return { rows: [{ count: String(db.admins) }] };
    }
    return { rows: db.admins > 0 ? [{ found: 1 }] : [] };
  }
  if (/INSERT INTO ggr_users/i.test(sql)) {
    inserted.push({ sql, params });
    return { rows: [{ id: 42, username: params[0], email: params[1] }] };
  }
  return { rows: [] };
}

const query = vi.fn(async (sql, params) => answer(sql, params));
const txStatements = [];
const withTransaction = vi.fn(async (fn) =>
  fn(async (sql, params) => {
    txStatements.push(sql);
    return answer(sql, params);
  }),
);

vi.mock("$lib/database.js", () => ({ query, withTransaction }));
vi.mock("../../src/lib/database.js", () => ({ query, withTransaction }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  db.accounts = 1;
  db.admins = 0;
  db.failReads = false;
  inserted.length = 0;
  txStatements.length = 0;
});

describe("needsInitialSetup", () => {
  it("is false when accounts exist but none is an admin", async () => {
    const { needsInitialSetup } = await import("../../src/lib/basicAuth.js");
    expect(await needsInitialSetup()).toBe(false);
  });

  it("is true only on an instance with no account at all", async () => {
    db.accounts = 0;
    const { needsInitialSetup } = await import("../../src/lib/basicAuth.js");
    expect(await needsInitialSetup()).toBe(true);
  });

  it("throws, rather than answering yes, when the database cannot say", async () => {
    db.failReads = true;
    const { needsInitialSetup } = await import("../../src/lib/basicAuth.js");
    await expect(needsInitialSetup()).rejects.toThrow();
  });
});

describe("POST /api/auth/basic/setup", () => {
  async function postSetup() {
    const { POST } = await import(
      "../../src/routes/api/auth/basic/setup/+server.js"
    );
    const body = new FormData();
    body.set("username", "intruder");
    body.set("email", "intruder@example.test");
    body.set("password", "Intruder-Pass-1");
    const request = new Request("http://localhost/api/auth/basic/setup", {
      method: "POST",
      body,
    });
    return POST({ request });
  }

  it("refuses an anonymous caller once any account exists, even with no admin", async () => {
    const response = await postSetup();
    expect(response.status).toBe(403);
    expect(withTransaction).not.toHaveBeenCalled();
    expect(inserted).toHaveLength(0);
  });

  it("refuses when the database cannot say whether accounts exist", async () => {
    db.failReads = true;
    const response = await postSetup();
    expect(response.status).toBe(503);
    expect(inserted).toHaveLength(0);
  });

  it("creates the first admin on an empty instance, under a lock, in one transaction", async () => {
    db.accounts = 0;
    const response = await postSetup();
    expect(response.status).toBe(200);
    expect(withTransaction).toHaveBeenCalledOnce();
    expect(txStatements[0]).toMatch(/pg_advisory_xact_lock/);
    expect(txStatements[1]).toMatch(/EXISTS \(SELECT 1 FROM ggr_users\)/);
    expect(txStatements.some((s) => /INSERT INTO ggr_users/.test(s))).toBe(
      true,
    );
    expect(txStatements.some((s) => /INSERT INTO ggr_user_roles/.test(s))).toBe(
      true,
    );
  });

  it("refuses the loser of a race for the first account", async () => {
    // The pre-check sees an empty table; by the time the lock is held another
    // request has created the first account.
    db.accounts = 0;
    withTransaction.mockImplementationOnce(async (fn) => {
      db.accounts = 1;
      return fn(async (sql, params) => {
        txStatements.push(sql);
        return answer(sql, params);
      });
    });
    const response = await postSetup();
    expect(response.status).toBe(403);
    expect(inserted).toHaveLength(0);
  });
});

describe("first OIDC account", () => {
  const identity = {
    sub: "new-provider-user",
    email: "new@example.test",
    name: "New User",
    // No groups claim, so role sync leaves the flag as created.
    groups: undefined,
  };

  /** The is_admin value createUserFromAuthentik inserted. */
  function insertedAdminFlag() {
    const insert = inserted.find((row) => /authentik_sub/.test(row.sql));
    return insert?.params[5];
  }

  it("is not made an admin when accounts already exist but none is an admin", async () => {
    const { createUserFromAuthentik } = await import(
      "../../src/lib/userProfile.js"
    );
    await createUserFromAuthentik(identity);
    expect(insertedAdminFlag()).toBe(false);
  });

  it("is not made an admin when the database cannot say whether it is first", async () => {
    const { createUserFromAuthentik } = await import(
      "../../src/lib/userProfile.js"
    );
    // Reads fail, but the INSERT is still answered, as in a flapping connection.
    db.failReads = true;
    await createUserFromAuthentik(identity);
    expect(insertedAdminFlag()).toBe(false);
  });

  it("is made an admin on an empty instance", async () => {
    db.accounts = 0;
    const { createUserFromAuthentik } = await import(
      "../../src/lib/userProfile.js"
    );
    await createUserFromAuthentik(identity);
    expect(insertedAdminFlag()).toBe(true);
  });
});

describe("group sync demoting the last administrator", () => {
  it("says how to recover, since nothing re-grants the flag automatically", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    query.mockImplementation(async (sql, params) => {
      if (/^\s*UPDATE ggr_users SET\s+email/i.test(sql)) {
        return { rows: [{ id: 7 }] };
      }
      return answer(sql, params);
    });
    const { updateUserFromAuthentik } = await import(
      "../../src/lib/userProfile.js"
    );

    await updateUserFromAuthentik(7, {
      sub: "first-admin",
      email: "first@example.test",
      groups: ["players"],
    });

    expect(
      query.mock.calls.some(
        ([sql, params]) =>
          /SET is_admin = \$1/.test(sql) && params[0] === false,
      ),
    ).toBe(true);
    expect(
      warn.mock.calls.some(([message]) =>
        String(message).includes("No active administrator remains"),
      ),
    ).toBe(true);
    warn.mockRestore();
  });
});

describe("admin layout", () => {
  it("does not make a non-admin visitor an admin when no admin exists", async () => {
    const assignAdminRole = vi.fn(async () => true);
    vi.doMock("$lib/userProfile.js", () => ({
      userHasPermission: vi.fn(async () => false),
      getUserPermissions: vi.fn(async () => []),
      // Present so that code which still reached for them would be caught.
      hasAdminUsers: vi.fn(async () => false),
      assignAdminRole,
    }));
    query.mockImplementation(async (sql) => {
      if (/FROM ggr_users WHERE authentik_sub/.test(sql)) {
        return { rows: [{ id: 5, is_admin: false }] };
      }
      return { rows: [] };
    });

    const { load } = await import("../../src/routes/admin/+layout.server.js");
    const parent = async () => ({
      user: { sub: "provider-user", groups: ["players"] },
    });

    await expect(load({ parent })).rejects.toMatchObject({
      status: 302,
      location: "/?error=unauthorized",
    });
    expect(assignAdminRole).not.toHaveBeenCalled();
    vi.doUnmock("$lib/userProfile.js");
  });
});
