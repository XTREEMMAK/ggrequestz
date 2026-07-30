/**
 * Regression tests for library configuration resolution.
 *
 * LIBRARY_* is the documented name; ROMM_* keeps working so an existing
 * install upgrades without touching anything. Same trade as
 * REQUEST_WEBHOOK_URL keeping N8N_WEBHOOK_URL.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEYS = [
  "LIBRARY_KIND",
  "LIBRARY_URL",
  "LIBRARY_PUBLIC_URL",
  "LIBRARY_API_TOKEN",
  "LIBRARY_USERNAME",
  "LIBRARY_PASSWORD",
  "ROMM_SERVER_URL",
  "ROMM_SERVER_URL_PUBLIC",
  "ROMM_API_TOKEN",
  "ROMM_USERNAME",
  "ROMM_PASSWORD",
];

async function fresh() {
  vi.resetModules();
  return import("$lib/library/config.js");
}

describe("resolveLibraryConfig", () => {
  beforeEach(() => {
    for (const key of KEYS) delete process.env[key];
  });

  afterEach(() => {
    vi.doUnmock("$env/dynamic/private");
  });

  it("defaults the kind to romm", async () => {
    const { resolveLibraryConfig } = await fresh();
    expect(resolveLibraryConfig().kind).toBe("romm");
  });

  it("reads a ROMM_*-only configuration, so an existing install is unchanged", async () => {
    process.env.ROMM_SERVER_URL = "http://romm.test:8080";
    process.env.ROMM_SERVER_URL_PUBLIC = "https://romm.example.com";
    process.env.ROMM_USERNAME = "user";
    process.env.ROMM_PASSWORD = "pass";
    const { resolveLibraryConfig } = await fresh();

    const config = resolveLibraryConfig();

    expect(config.url).toBe("http://romm.test:8080");
    expect(config.publicUrl).toBe("https://romm.example.com");
    expect(config.username).toBe("user");
    expect(config.password).toBe("pass");
  });

  it("prefers LIBRARY_* over ROMM_* when both are set", async () => {
    process.env.ROMM_SERVER_URL = "http://old.test";
    process.env.LIBRARY_URL = "http://new.test";
    const { resolveLibraryConfig } = await fresh();

    expect(resolveLibraryConfig().url).toBe("http://new.test");
  });

  it("falls back to the internal url when no public url is set", async () => {
    process.env.LIBRARY_URL = "http://internal.test";
    const { resolveLibraryConfig } = await fresh();

    expect(resolveLibraryConfig().publicUrl).toBe("http://internal.test");
  });

  it("accepts every supported kind", async () => {
    const { resolveLibraryConfig, LIBRARY_KINDS } = await fresh();

    expect(LIBRARY_KINDS).toEqual(["romm", "gaseous", "retrom"]);

    for (const kind of LIBRARY_KINDS) {
      process.env.LIBRARY_KIND = kind;
      expect(resolveLibraryConfig().kind).toBe(kind);
    }
  });

  it("refuses an unknown kind and names the valid ones", async () => {
    process.env.LIBRARY_KIND = "plex";
    const { resolveLibraryConfig } = await fresh();

    expect(() => resolveLibraryConfig()).toThrow(/plex/);
    expect(() => resolveLibraryConfig()).toThrow(/romm/);
  });

  it("lowercases and trims the kind, so LIBRARY_KIND=RomM works", async () => {
    process.env.LIBRARY_KIND = "  RomM  ";
    const { resolveLibraryConfig } = await fresh();

    expect(resolveLibraryConfig().kind).toBe("romm");
  });

  it("prefers the runtime env over process.env", async () => {
    process.env.LIBRARY_URL = "http://build.test";
    vi.resetModules();
    vi.doMock("$env/dynamic/private", () => ({
      env: { LIBRARY_URL: "http://runtime.test" },
    }));
    const { resolveLibraryConfig } = await import("$lib/library/config.js");

    expect(resolveLibraryConfig().url).toBe("http://runtime.test");
  });

  it("prefers LIBRARY_* over ROMM_* when both are set, for every field with a fallback", async () => {
    // url is covered by its own test above; this covers the rest, so a
    // regression that swaps the argument order in read() for any one of
    // these fields fails here instead of passing the whole suite.
    process.env.ROMM_SERVER_URL_PUBLIC = "http://old-public.test";
    process.env.LIBRARY_PUBLIC_URL = "http://new-public.test";
    process.env.ROMM_API_TOKEN = "old-token";
    process.env.LIBRARY_API_TOKEN = "new-token";
    process.env.ROMM_USERNAME = "old-user";
    process.env.LIBRARY_USERNAME = "new-user";
    process.env.ROMM_PASSWORD = "old-pass";
    process.env.LIBRARY_PASSWORD = "new-pass";
    const { resolveLibraryConfig } = await fresh();

    const config = resolveLibraryConfig();

    expect(config.publicUrl).toBe("http://new-public.test");
    expect(config.apiToken).toBe("new-token");
    expect(config.username).toBe("new-user");
    expect(config.password).toBe("new-pass");
  });

  it("prefers LIBRARY_URL over ROMM_SERVER_URL even when LIBRARY_URL only exists in process.env and ROMM_SERVER_URL only exists in the runtime env", async () => {
    // Name precedence (LIBRARY_* over ROMM_*) must win independently of
    // source precedence (runtime env over process.env) -- read() only gets
    // that right if it checks both sources for one name before moving on to
    // the next name.
    process.env.LIBRARY_URL = "http://library-process.test";
    vi.resetModules();
    vi.doMock("$env/dynamic/private", () => ({
      env: { ROMM_SERVER_URL: "http://romm-runtime.test" },
    }));
    const { resolveLibraryConfig } = await import("$lib/library/config.js");

    expect(resolveLibraryConfig().url).toBe("http://library-process.test");
  });

  it("resolves no timeout setting, because nothing consumes one", async () => {
    // LIBRARY_CHECK_TIMEOUT_MS was resolved here and read by nothing: the
    // setup check hardcodes 10s, this defaulted to 5s, and the declared
    // ROMM_CHECK_TIMEOUT_MS fallback had never existed. It can come back the
    // day something actually reads it.
    const { resolveLibraryConfig } = await fresh();

    expect(resolveLibraryConfig()).not.toHaveProperty("checkTimeoutMs");
  });
});
