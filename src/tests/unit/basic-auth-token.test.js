/**
 * Regression tests for basic-auth session token signing.
 *
 * These tokens carry `is_admin`. They were previously unsigned base64 JSON,
 * "verified" by decoding and checking `exp`, so anyone could mint an admin
 * session by crafting a cookie. Guard that this stays fixed.
 */

import { describe, it, expect, beforeAll } from "vitest";

let createBasicAuthToken;
let verifyBasicAuthToken;

beforeAll(async () => {
  process.env.SESSION_SECRET = "test-secret-not-the-example-value";
  const mod = await import("$lib/basicAuth.js");
  createBasicAuthToken = mod.createBasicAuthToken;
  verifyBasicAuthToken = mod.verifyBasicAuthToken;
});

const user = {
  id: 1,
  username: "alice",
  email: "alice@example.test",
  is_admin: false,
};

describe("basic auth session tokens", () => {
  it("round-trips a token it signed", () => {
    const payload = verifyBasicAuthToken(createBasicAuthToken(user));

    expect(payload).not.toBeNull();
    expect(payload.id).toBe(1);
    expect(payload.username).toBe("alice");
    expect(payload.auth_type).toBe("basic");
  });

  it("rejects a forged admin token (the original vulnerability)", () => {
    const forged = Buffer.from(
      JSON.stringify({
        id: 1,
        username: "attacker",
        is_admin: true,
        auth_type: "basic",
        sub: "basic_auth_1",
        iat: Date.now(),
        exp: Date.now() + 86_400_000,
      }),
    ).toString("base64");

    expect(verifyBasicAuthToken(forged)).toBeNull();
  });

  it("rejects a token whose payload was tampered with after signing", () => {
    const [, signature] = createBasicAuthToken(user).split(".");

    const tampered = Buffer.from(
      JSON.stringify({
        ...user,
        is_admin: true,
        auth_type: "basic",
        exp: Date.now() + 1000,
      }),
    ).toString("base64url");

    expect(verifyBasicAuthToken(`${tampered}.${signature}`)).toBeNull();
  });

  it("rejects an expired token", () => {
    const expired = createBasicAuthToken(user);
    const [encoded] = expired.split(".");
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString());
    expect(payload.exp).toBeGreaterThan(Date.now());

    // Re-sign an already-expired payload so only expiry can fail it.
    process.env.SESSION_SECRET = "test-secret-not-the-example-value";
    const stale = { ...payload, exp: Date.now() - 1000 };
    const staleEncoded = Buffer.from(JSON.stringify(stale)).toString(
      "base64url",
    );
    const crypto = require("crypto");
    const sig = crypto
      .createHmac("sha256", Buffer.from(process.env.SESSION_SECRET, "utf8"))
      .update(staleEncoded)
      .digest("base64url");

    expect(verifyBasicAuthToken(`${staleEncoded}.${sig}`)).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(verifyBasicAuthToken("")).toBeNull();
    expect(verifyBasicAuthToken("not-a-token")).toBeNull();
    expect(verifyBasicAuthToken("a.b.c.d")).toBeNull();
  });
});
