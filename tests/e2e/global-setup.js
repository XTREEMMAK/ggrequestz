/**
 * Confirm the local Docker test stack is up before any e2e test runs.
 *
 * Without this, a stack that is not running produces a wall of identical
 * connection-refused timeouts across every browser project, which says nothing
 * about the actual problem. One clear message up front is worth more.
 *
 * Only used for local runs. On CI, Playwright's own webServer builds and serves
 * the app, so this is skipped.
 */

const PORT = process.env.GGR_TEST_PORT || "3100";
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default async function globalSetup() {
  let health;

  try {
    const response = await fetch(`${BASE_URL}/api/health`, {
      signal: AbortSignal.timeout(5000),
    });
    health = await response.json();
  } catch (error) {
    throw new Error(
      [
        ``,
        `The e2e suite expects the local test stack at ${BASE_URL}, and nothing answered.`,
        `  (${error?.message || error})`,
        ``,
        `Start it with:`,
        `  make test-seeded`,
        ``,
        `These tests deliberately do not boot 'npm run dev'. That loads`,
        `.env.development, which points at a real database.`,
        ``,
      ].join("\n"),
    );
  }

  if (health?.services?.database !== "healthy") {
    throw new Error(
      [
        ``,
        `The test stack at ${BASE_URL} is up but its database is not healthy.`,
        `  services: ${JSON.stringify(health?.services)}`,
        ``,
        `Check:  make test-logs SERVICE=app`,
        ``,
      ].join("\n"),
    );
  }
}
