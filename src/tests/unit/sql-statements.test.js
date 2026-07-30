/**
 * Regression tests for migration statement splitting.
 *
 * The splitter tracked string literals and dollar-quoted bodies but never
 * skipped comments, so a comment's contents were interpreted as SQL. Two
 * consequences, both hit in real migrations and neither visible through
 * `psql -f`, which parses comments correctly:
 *
 *   - A semicolon in a comment split the statement and handed Postgres the
 *     comment's tail as a bare statement. `AUTO_MIGRATE` runs migrations at
 *     container start, so that failed the boot.
 *   - An apostrophe in a comment flipped quote tracking for the rest of the
 *     file, so every later semicolon looked like it was inside a string and
 *     the whole migration collapsed into one statement. That one still
 *     "worked" — node-postgres sends a parameterless query over the simple
 *     protocol, which allows multiple commands — but per-statement error
 *     attribution was silently lost.
 */

import { describe, expect, it } from "vitest";
import { splitSQLStatements } from "../../../scripts/database/sql-statements.js";

describe("splitSQLStatements", () => {
  it("splits ordinary statements", () => {
    const statements = splitSQLStatements("SELECT 1;\nSELECT 2;\nSELECT 3;\n");

    expect(statements).toHaveLength(3);
  });

  it("does not split on a semicolon inside a line comment", () => {
    // The exact shape that failed a container boot: prose with a semicolon.
    const sql = `-- Seeding it changes no behaviour; it only lets an admin grant it.
INSERT INTO t (a) VALUES (1);
`;

    const statements = splitSQLStatements(sql);

    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain("INSERT INTO t");
  });

  it("does not let an apostrophe in a comment swallow the rest of the file", () => {
    // Four statements, and a possessive apostrophe in the header comment.
    const sql = `-- Fixes the route's error handler.
SELECT 1;
SELECT 2;
SELECT 3;
SELECT 4;
`;

    expect(splitSQLStatements(sql)).toHaveLength(4);
  });

  it("ignores a semicolon inside a block comment", () => {
    const sql = `/* one; two; three */
SELECT 1;
SELECT 2;
`;

    expect(splitSQLStatements(sql)).toHaveLength(2);
  });

  it("keeps comment text in the statement it precedes", () => {
    const statements = splitSQLStatements("-- why\nSELECT 1;\n");

    expect(statements[0]).toContain("-- why");
    expect(statements[0]).toContain("SELECT 1");
  });

  it("still treats a semicolon inside a string literal as text", () => {
    const statements = splitSQLStatements(
      "INSERT INTO t (a) VALUES ('one; two');\nSELECT 1;\n",
    );

    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain("'one; two'");
  });

  it("does not mistake a double dash inside a string literal for a comment", () => {
    const statements = splitSQLStatements(
      "INSERT INTO t (a) VALUES ('a -- b');\nSELECT 1;\n",
    );

    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain("'a -- b'");
  });

  it("keeps a dollar-quoted body with semicolons as one statement", () => {
    const sql = `CREATE OR REPLACE FUNCTION bump() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';
SELECT 1;
`;

    const statements = splitSQLStatements(sql);

    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain("RETURN NEW;");
  });

  it("counts the statements in a migration shaped like a real one", () => {
    // Two comment blocks containing an apostrophe and a semicolon, two data
    // fix-ups and two index creations: six semicolons, four statements.
    const sql = `-- Guard against duplicates.
--
-- Scoped to open rows only; a rejected request must not block a retry, and
-- the route's own pre-check gives the friendly message.

UPDATE t SET status = 'cancelled' WHERE id = 1;

UPDATE t SET status = 'cancelled' WHERE id = 2;

CREATE UNIQUE INDEX IF NOT EXISTS t_a_uniq ON t (a) WHERE status IN ('open');

CREATE UNIQUE INDEX IF NOT EXISTS t_b_uniq ON t (lower(b)) WHERE status IN ('open');
`;

    expect(splitSQLStatements(sql)).toHaveLength(4);
  });
});

/**
 * The splitter also carried a "am I inside a function body" flag, separate from
 * quote tracking. It armed on any `CREATE` whose remainder of the *whole file*
 * contained the word "function", and disarmed only at a following `LANGUAGE`.
 *
 * That is why `002_complete_schema_updates.sql` split into 13 statements rather
 * than 62: nothing after its `CREATE TRIGGER ... EXECUTE FUNCTION` says
 * `LANGUAGE`, so the flag stayed armed to end of file and every remaining
 * semicolon was ignored. Comment-skipping alone moved it to 14, which is why
 * these cases are worth pinning separately — they were not fixed by that.
 */
describe("splitSQLStatements and function bodies", () => {
  it("terminates CREATE TRIGGER ... EXECUTE FUNCTION at its own semicolon", () => {
    // Postgres 11+ syntax. No LANGUAGE follows, so the old flag never cleared
    // and this swallowed the remainder of the migration.
    const sql = `CREATE TRIGGER bump_t BEFORE UPDATE ON t
  FOR EACH ROW EXECUTE FUNCTION bump();

INSERT INTO t (a) VALUES (1);

INSERT INTO t (a) VALUES (2);
`;

    const statements = splitSQLStatements(sql);

    expect(statements).toHaveLength(3);
    expect(statements[0]).toContain("CREATE TRIGGER");
    expect(statements[2]).toContain("VALUES (2)");
  });

  it("does not let the word 'function' in a comment merge later statements", () => {
    // "-- Function to get ESRB rating level" appears in 002 and armed the flag.
    const sql = `-- Function to get the rating level
CREATE TABLE a (id int);
CREATE TABLE b (id int);
`;

    expect(splitSQLStatements(sql)).toHaveLength(2);
  });

  it("does not merge a table into a function defined later in the file", () => {
    const sql = `CREATE TABLE a (id int);

CREATE OR REPLACE FUNCTION f() RETURNS int AS $$
BEGIN
  RETURN 1;
END;
$$ LANGUAGE plpgsql;
`;

    const statements = splitSQLStatements(sql);

    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain("CREATE TABLE a");
    expect(statements[1]).toContain("RETURN 1;");
  });

  it("keeps an old-style single-quoted function body in one statement", () => {
    // Quote tracking, not a function flag, is what protects this form.
    const sql = `CREATE FUNCTION f() RETURNS int AS 'SELECT 1;' LANGUAGE sql;
SELECT 2;
`;

    const statements = splitSQLStatements(sql);

    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain("'SELECT 1;'");
  });
});
