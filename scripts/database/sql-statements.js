/**
 * Splitting a migration file into statements.
 *
 * Extracted from db-manager.js so it can be tested without importing the CLI,
 * which connects to a database on import.
 */

export function splitSQLStatements(sql) {
  const statements = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inDollarQuote = false;
  let dollarTag = "";
  let inFunction = false;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];

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
