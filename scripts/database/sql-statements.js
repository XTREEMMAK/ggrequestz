/**
 * Splitting a migration file into statements.
 *
 * Extracted from db-manager.js so it can be tested without importing the CLI.
 *
 * The hard part is knowing which characters are structural and which are just
 * text. A semicolon inside a string literal, a dollar-quoted function body, or
 * a comment is not a statement separator, and an apostrophe inside a comment is
 * not the start of a string.
 *
 * There is deliberately no separate "am I inside a function body" state. There
 * used to be, and it was the single largest source of mis-splitting: it set a
 * flag on any `CREATE` whose *remainder of the entire file* contained the word
 * "function", and cleared it only at a following `LANGUAGE`. So a comment
 * reading "-- Function to get ESRB rating level" armed it, and
 * `CREATE TRIGGER ... EXECUTE FUNCTION f();` -- ordinary Postgres 11+ syntax
 * with no `LANGUAGE` after it -- armed it permanently, swallowing every
 * remaining statement in the file.
 *
 * A function body does not need its own state, because it is always already
 * quoted: `$$ ... $$` is covered by dollar-quote tracking and the older
 * `AS 'body'` form by single-quote tracking. Verified by applying every
 * migration to an empty database both ways and diffing the resulting schema --
 * identical tables, columns, indexes, functions and triggers, but 135 correctly
 * separated statements instead of 31 merged blobs.
 */

/**
 * Split a SQL script into individual statements.
 *
 * @param {string} sql - The full text of a migration file
 * @returns {string[]} - Statements, comments retained, empties dropped
 */
export function splitSQLStatements(sql) {
  const statements = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inDollarQuote = false;
  let dollarTag = "";
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const next = sql[i + 1];

    // Comments are copied through untouched but never interpreted. Without
    // this, an apostrophe in a comment ("the route's handler") flipped quote
    // tracking for the remainder of the file, collapsing every later statement
    // into one, and a semicolon in a comment split it mid-sentence and handed
    // Postgres the tail as a bare statement -- which, since AUTO_MIGRATE runs
    // at container start, failed the boot.
    if (inLineComment) {
      current += char;
      if (char === "\n") inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      current += char;
      if (char === "*" && next === "/") {
        current += next;
        i += 1;
        inBlockComment = false;
      }
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && !inDollarQuote) {
      if (char === "-" && next === "-") {
        current += char + next;
        i += 1;
        inLineComment = true;
        continue;
      }
      if (char === "/" && next === "*") {
        current += char + next;
        i += 1;
        inBlockComment = true;
        continue;
      }
    }

    current += char;

    // Handle dollar quoting (PostgreSQL function bodies)
    if (char === "$" && !inSingleQuote && !inDoubleQuote) {
      if (!inDollarQuote) {
        const match = sql.substring(i).match(/^\$([^$]*)\$/);
        if (match) {
          dollarTag = match[1];
          inDollarQuote = true;
          current += match[0].substring(1);
          i += match[0].length - 1;
          continue;
        }
      } else {
        const expectedEnd = `$${dollarTag}$`;
        if (sql.substring(i).startsWith(expectedEnd)) {
          inDollarQuote = false;
          current += expectedEnd.substring(1);
          i += expectedEnd.length - 1;
          continue;
        }
      }
    }

    // Handle regular quotes
    if (!inDollarQuote) {
      if (char === "'" && !inDoubleQuote) inSingleQuote = !inSingleQuote;
      if (char === '"' && !inSingleQuote) inDoubleQuote = !inDoubleQuote;
    }

    // Statement separator
    if (char === ";" && !inSingleQuote && !inDoubleQuote && !inDollarQuote) {
      const statement = current.trim();
      if (statement && statement !== ";") {
        statements.push(statement);
      }
      current = "";
    }
  }

  // Add final statement if exists
  const finalStatement = current.trim();
  if (finalStatement && finalStatement !== ";") {
    statements.push(finalStatement);
  }

  return statements.filter((stmt) => stmt.length > 0);
}
