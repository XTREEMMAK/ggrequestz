/**
 * Environment loader for development
 * Loads .env.development before the app starts
 * Uses override: true to ensure development values take precedence
 */
import { config } from "dotenv";

// Load .env.development in development mode with override
const envPath =
  process.env.NODE_ENV === "development" ? ".env.development" : ".env";

config({ path: envPath, override: true });

console.log(
  `📝 Loaded environment from: ${envPath} (NODE_ENV=${process.env.NODE_ENV})`,
);
console.log(`🗄️  Database host: ${process.env.POSTGRES_HOST}`);
