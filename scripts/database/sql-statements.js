/**
 * Splitting a migration file into statements.
 *
 * Extracted from db-manager.js so it can be tested without importing the CLI.
 *
 * The hard part is knowing which characters are structural and which are just
 * text. A semicolon inside a string literal, a dollar-quoted function body, or
 * a comment is not a statement separator, and an apostrophe inside a comment is
 * not the start of a string.
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
  let inFunction = false;
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

    // Check for function keywords
    if (!inSingleQuote && !inDoubleQuote && !inDollarQuote) {
      const remaining = sql.substring(i).toLowerCase();
      if (remaining.startsWith("create") && remaining.includes("function")) {
        inFunction = true;
      }
      if (inFunction && remaining.startsWith("language")) {
        inFunction = false;
      }
    }

    // Statement separator
    if (
      char === ";" &&
      !inSingleQuote &&
      !inDoubleQuote &&
      !inDollarQuote &&
      !inFunction
    ) {
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
