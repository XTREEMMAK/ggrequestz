#!/usr/bin/env node

/**
 * Populate a G.G Requestz database with deterministic demo data.
 *
 * This exists so "a seeded instance" means something specific and repeatable.
 * Migrations create the schema plus system roles and permissions, but no domain
 * data at all — a freshly migrated database has no games, no requests and no
 * users, which makes most of the UI impossible to look at.
 *
 * Runs entirely offline. No IGDB, ROMM or OIDC credentials are required, so it
 * works in CI and on a laptop with no network.
 *
 * It does NOT create the admin. scripts/testing/seed-app.sh does that through
 * the app's own first-run endpoint, which assigns the admin role properly; a
 * direct INSERT here would set is_admin but leave ggr_user_roles empty.
 *
 * Usage:
 *   node scripts/testing/seed-data.js            # the local test stack
 *   POSTGRES_PORT=5432 node scripts/testing/seed-data.js
 *   node scripts/testing/seed-data.js --force    # skip the not-a-real-instance check
 *
 * Safe to re-run: every statement is idempotent.
 *
 * Deliberately does NOT read the repo .env. That file points at the production
 * stack, and a script whose whole job is inserting demo rows must not default to
 * aiming there. Override with POSTGRES_* in the environment instead.
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcrypt";
import pkg from "pg";

const { Client } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");

const force = process.argv.includes("--force");

// Defaults match docker-compose.test.yml, which is the stack this targets.
// Anything explicitly in the environment wins.
const DB = {
  host: process.env.POSTGRES_HOST || "127.0.0.1",
  port: Number(process.env.POSTGRES_PORT || 5433),
  database: process.env.POSTGRES_DB || "ggrequestz",
  user: process.env.POSTGRES_USER || "ggrequestz",
  password: process.env.POSTGRES_PASSWORD || "testpass",
};

// Test-only, and printed on completion so nobody has to read the source to log
// in. bcrypt cost 12 matches what the app uses for real accounts.
const DEMO_PASSWORD = "ggr-test-user";
const BCRYPT_COST = 12;

const USERS = [
  {
    username: "player",
    email: "player@example.test",
    name: "Pat Player",
    role: "user",
  },
  {
    username: "curator",
    email: "curator@example.test",
    name: "Casey Curator",
    role: "manager",
  },
];

const say = (msg) => console.log(msg);

/**
 * Insert the game fixtures. These carry synthetic igdb_ids in a 99xxxx range so
 * they can never collide with genuinely cached IGDB records.
 * @param {import("pg").Client} db
 * @returns {Promise<string[]>} - The seeded igdb_ids
 */
async function seedGames(db) {
  const { games } = JSON.parse(
    readFileSync(join(repoRoot, "tests", "fixtures", "games.json"), "utf8"),
  );

  for (const game of games) {
    await db.query(
      `INSERT INTO ggr_games_cache
         (igdb_id, title, summary, cover_url, rating, release_date,
          platforms, genres, popularity_score, source_type)
       VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8, 'igdb_general')
       ON CONFLICT (igdb_id) DO UPDATE SET
         title = EXCLUDED.title,
         summary = EXCLUDED.summary,
         rating = EXCLUDED.rating,
         release_date = EXCLUDED.release_date,
         platforms = EXCLUDED.platforms,
         genres = EXCLUDED.genres,
         popularity_score = EXCLUDED.popularity_score,
         last_updated = NOW()`,
      [
        game.igdb_id,
        game.title,
        game.summary,
        game.rating,
        game.release_date,
        JSON.stringify(game.platforms),
        JSON.stringify(game.genres),
        game.popularity_score,
      ],
    );
  }

  say(`  games:     ${games.length}`);
  return games.map((g) => g.igdb_id);
}

/**
 * Create the non-admin demo accounts, each with its role row. Without the
 * ggr_user_roles entry a user exists but has no permissions, which is not a
 * state the app ever produces on its own.
 * @param {import("pg").Client} db
 * @returns {Promise<Array<{id: number, username: string, role: string}>>}
 */
async function seedUsers(db) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_COST);
  const created = [];

  for (const user of USERS) {
    const { rows } = await db.query(
      // username is VARCHAR(255) and preferred_username is TEXT, so the same
      // placeholder cannot serve both — Postgres cannot deduce one type for it.
      `INSERT INTO ggr_users
         (email, name, username, preferred_username, password_hash,
          is_active, is_admin)
       VALUES ($1, $2, $3, $4, $5, true, false)
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name,
         username = EXCLUDED.username,
         password_hash = EXCLUDED.password_hash,
         is_active = true
       RETURNING id`,
      [user.email, user.name, user.username, user.username, passwordHash],
    );

    const id = rows[0].id;

    await db.query(
      `INSERT INTO ggr_user_roles (user_id, role_id)
       SELECT $1, r.id FROM ggr_roles r WHERE r.name = $2
       ON CONFLICT (user_id, role_id) DO NOTHING`,
      [id, user.role],
    );

    created.push({ id, username: user.username, role: user.role });
  }

  say(`  users:     ${created.length} (plus whatever seed-app.sh created)`);
  return created;
}

/**
 * One request per status, so every filter and badge in the admin UI has
 * something to show. Statuses are constrained by the schema, so this list has
 * to stay in step with ggr_game_requests_status_check.
 * @param {import("pg").Client} db
 * @param {Array<{id: number, username: string}>} users
 * @param {string[]} gameIds
 */
async function seedRequests(db, users, gameIds) {
  const statuses = [
    "pending",
    "approved",
    "rejected",
    "fulfilled",
    "cancelled",
  ];
  const priorities = ["low", "medium", "high", "urgent"];
  const types = ["game", "update", "fix"];

  for (const [index, status] of statuses.entries()) {
    const user = users[index % users.length];
    const igdbId = gameIds[index];

    const { rows } = await db.query(
      `SELECT title FROM ggr_games_cache WHERE igdb_id = $1`,
      [igdbId],
    );

    // A stable id keyed off the status keeps re-runs from stacking duplicates,
    // since ggr_game_requests has no natural unique column to conflict on.
    await db.query(
      `INSERT INTO ggr_game_requests
         (id, user_id, user_name, request_type, title, igdb_id,
          platforms, priority, description, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         updated_at = NOW()`,
      [
        `00000000-0000-4000-8000-00000000000${index + 1}`,
        String(user.id),
        user.username,
        types[index % types.length],
        rows[0].title,
        igdbId,
        JSON.stringify(["PC"]),
        priorities[index % priorities.length],
        `Seeded ${status} request, for exercising the ${status} filter.`,
        status,
      ],
    );
  }

  say(`  requests:  ${statuses.length} (one per status)`);
}

/**
 * Watchlist entries, split across the demo users.
 * @param {import("pg").Client} db
 * @param {Array<{id: number}>} users
 * @param {string[]} gameIds
 */
async function seedWatchlist(db, users, gameIds) {
  let count = 0;

  for (const [index, user] of users.entries()) {
    for (const igdbId of gameIds.slice(index * 4, index * 4 + 4)) {
      await db.query(
        `INSERT INTO ggr_user_watchlist (user_id, igdb_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, igdb_id) DO NOTHING`,
        [String(user.id), igdbId],
      );
      count += 1;
    }
  }

  say(`  watchlist: ${count} entries`);
}

/**
 * A custom navigation link, so the role-visibility logic in NAVIGATION.md has a
 * row to demonstrate.
 * @param {import("pg").Client} db
 */
async function seedNavigation(db) {
  await db.query(
    `INSERT INTO ggr_custom_navigation
       (name, href, icon, position, is_external, visible_to_all, minimum_role)
     SELECT 'Seeded Link', '/search?q=seeded', 'heroicons:beaker', 90,
            false, true, 'viewer'
     WHERE NOT EXISTS (
       SELECT 1 FROM ggr_custom_navigation WHERE name = 'Seeded Link'
     )`,
  );

  say(`  nav:       1 custom link`);
}

/**
 * Refuse to write demo rows into what looks like a real instance.
 *
 * The fixtures use synthetic 99xxxx igdb_ids, so any *other* cached game means
 * this database has talked to IGDB — which a disposable test stack seeded only
 * by this script never does.
 *
 * @param {import("pg").Client} db
 */
async function refuseIfRealInstance(db) {
  if (force) return;

  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS count
       FROM ggr_games_cache
      WHERE igdb_id NOT LIKE '99%'`,
  );

  if (rows[0].count === 0) return;

  console.error(
    `\nRefusing to seed: ${DB.database} at ${DB.host}:${DB.port} already holds ` +
      `${rows[0].count} real cached games.`,
  );
  console.error(
    "This looks like a live instance, not a disposable test stack. Check the",
  );
  console.error(
    "POSTGRES_* values in your environment. Pass --force if you are certain.",
  );
  process.exit(1);
}

async function main() {
  const db = new Client(DB);

  try {
    await db.connect();
  } catch (error) {
    console.error(
      `\nCould not connect to postgres at ${DB.host}:${DB.port}/${DB.database}`,
    );
    console.error(`  ${error.message}`);
    console.error(`\nIs the stack up?  make test-seeded`);
    process.exit(1);
  }

  try {
    const { rows } = await db.query(
      `SELECT to_regclass('public.ggr_games_cache') AS present`,
    );
    if (!rows[0].present) {
      console.error(
        "\nSchema not found. Migrations have not run against this database yet.",
      );
      console.error(
        "Start the stack and let the entrypoint migrate, then retry.",
      );
      process.exit(1);
    }

    await refuseIfRealInstance(db);

    say(`Seeding ${DB.database} at ${DB.host}:${DB.port}`);

    const gameIds = await seedGames(db);
    const users = await seedUsers(db);
    await seedRequests(db, users, gameIds);
    await seedWatchlist(db, users, gameIds);
    await seedNavigation(db);

    say(`\nDemo accounts (AUTH_METHOD=basic):`);
    for (const user of users) {
      say(
        `  ${user.username.padEnd(8)} / ${DEMO_PASSWORD}   role: ${user.role}`,
      );
    }
    say(`\nThe admin account comes from scripts/testing/seed-app.sh.`);
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error("\nSeeding failed:", error.message);
  process.exit(1);
});
