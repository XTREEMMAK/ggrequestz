/**
 * Tests for OIDC redirect-URI resolution.
 *
 * Two things are guarded here.
 *
 * `PUBLIC_SITE_URL` was read only from `$env/dynamic/private` and `process.env`.
 * SvelteKit routes PUBLIC_-prefixed variables to `$env/dynamic/public` and omits
 * them from the private module, so the public module was never consulted. In
 * practice deployments still worked, because both Compose and the dev server's
 * `load-env.js` preload populate `process.env`, but the resolution depended on
 * that happening rather than on reading the correct source.
 *
 * Separately, a malformed value (typically a missing scheme) was returned
 * verbatim into the authorization request, where the only symptom was the
 * provider's generic "missing, invalid, or mismatching redirection URI".
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { env as privateEnv } from "$env/dynamic/private";
import { env as publicEnv } from "$env/dynamic/public";
import { resolveRedirectUri } from "$lib/server/oidc.js";

const KEYS = ["OIDC_REDIRECT_URI", "PUBLIC_SITE_URL"];
const savedProcessEnv = {};

beforeEach(() => {
  for (const key of KEYS) {
    delete privateEnv[key];
    delete publicEnv[key];
    savedProcessEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of KEYS) {
    delete privateEnv[key];
    delete publicEnv[key];
    if (savedProcessEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedProcessEnv[key];
    }
  }
});

const requestUrl = new URL("http://192.0.2.10:5173/api/auth/login");

describe("resolveRedirectUri", () => {
  it("honours PUBLIC_SITE_URL when it is only in the public env module", () => {
    // The regression: previously undefined here, so the origin won instead.
    publicEnv.PUBLIC_SITE_URL = "https://grq.example.test";

    expect(resolveRedirectUri(requestUrl)).toBe(
      "https://grq.example.test/api/auth/callback",
    );
  });

  it("still reads PUBLIC_SITE_URL from process.env, as production supplies it", () => {
    process.env.PUBLIC_SITE_URL = "https://grq.example.test";

    expect(resolveRedirectUri(requestUrl)).toBe(
      "https://grq.example.test/api/auth/callback",
    );
  });

  it("prefers an explicit OIDC_REDIRECT_URI over PUBLIC_SITE_URL", () => {
    privateEnv.OIDC_REDIRECT_URI = "https://explicit.example.test/callback";
    publicEnv.PUBLIC_SITE_URL = "https://grq.example.test";

    expect(resolveRedirectUri(requestUrl)).toBe(
      "https://explicit.example.test/callback",
    );
  });

  it("strips trailing slashes from PUBLIC_SITE_URL", () => {
    publicEnv.PUBLIC_SITE_URL = "https://grq.example.test///";

    expect(resolveRedirectUri(requestUrl)).toBe(
      "https://grq.example.test/api/auth/callback",
    );
  });

  it("ignores an empty PUBLIC_SITE_URL rather than building a bare path", () => {
    publicEnv.PUBLIC_SITE_URL = "";

    expect(resolveRedirectUri(requestUrl)).toBe(
      "http://192.0.2.10:5173/api/auth/callback",
    );
  });

  it("falls back to the request origin when nothing is configured", () => {
    expect(resolveRedirectUri(requestUrl)).toBe(
      "http://192.0.2.10:5173/api/auth/callback",
    );
  });
});

describe("malformed configuration warnings", () => {
  let warn;

  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it("warns when OIDC_REDIRECT_URI has no scheme, but still returns it", () => {
    // The exact value that produced Authentik's "Redirect URI Error".
    privateEnv.OIDC_REDIRECT_URI = "192.0.2.10:5174/api/auth/callback";

    expect(resolveRedirectUri(requestUrl)).toBe(
      "192.0.2.10:5174/api/auth/callback",
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("OIDC_REDIRECT_URI");
    expect(warn.mock.calls[0][0]).toContain("192.0.2.10:5174");
  });

  it("stays silent for a well-formed OIDC_REDIRECT_URI", () => {
    privateEnv.OIDC_REDIRECT_URI = "http://192.0.2.10:5174/api/auth/callback";

    expect(resolveRedirectUri(requestUrl)).toBe(
      "http://192.0.2.10:5174/api/auth/callback",
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns on an unsupported scheme rather than only on a parse failure", () => {
    // Parses cleanly as a URL, so only the protocol check catches it.
    privateEnv.OIDC_REDIRECT_URI = "ftp://example.test/api/auth/callback";

    resolveRedirectUri(requestUrl);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("ftp:");
  });

  it("warns when PUBLIC_SITE_URL has no scheme, and still builds the callback", () => {
    publicEnv.PUBLIC_SITE_URL = "192.0.2.10:5174";

    expect(resolveRedirectUri(requestUrl)).toBe(
      "192.0.2.10:5174/api/auth/callback",
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("PUBLIC_SITE_URL");
  });

  it("stays silent when falling back to the request origin", () => {
    expect(resolveRedirectUri(requestUrl)).toBe(
      "http://192.0.2.10:5173/api/auth/callback",
    );
    expect(warn).not.toHaveBeenCalled();
  });
});
