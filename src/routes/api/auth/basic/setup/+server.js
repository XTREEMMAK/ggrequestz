/**
 * Basic Authentication Setup API Endpoint
 * Creates the first account, as an administrator, on an instance that has no
 * account at all
 */

import { json } from "@sveltejs/kit";
import {
  createInitialAdmin,
  needsInitialSetup,
  SetupClosedError,
} from "$lib/basicAuth.js";

const SETUP_CLOSED = { error: "Initial setup has already been completed" };

export async function POST({ request }) {
  try {
    process.stdout.write("🔧 ADMIN SETUP: API endpoint reached\n");

    // Public by necessity: there is no account to sign in with yet. So it must
    // refuse on any instance that has one, and refuse when it cannot tell.
    // Answering "setup needed" on a database error, or on "no admin" rather
    // than "no account", is what let an anonymous caller create an admin
    // (GHSA-xm2w-327g-3fxg).
    let setupNeeded;
    try {
      setupNeeded = await needsInitialSetup();
    } catch (statusError) {
      console.error(
        "🔧 ADMIN SETUP: could not read setup status, refusing:",
        statusError?.message || statusError,
      );
      return json(
        { error: "Setup status could not be determined" },
        { status: 503 },
      );
    }

    if (!setupNeeded) {
      process.stdout.write(
        "🔧 ADMIN SETUP: Setup already completed, returning 403\n",
      );
      return json(SETUP_CLOSED, { status: 403 });
    }

    const formData = await request.formData();
    const username = formData.get("username")?.toString().trim();
    const email = formData.get("email")?.toString().trim();
    const password = formData.get("password")?.toString();

    // Validate input
    if (!username || !email || !password) {
      return json(
        { error: "Username, email, and password are required" },
        { status: 400 },
      );
    }

    if (username.length < 3) {
      return json(
        { error: "Username must be at least 3 characters long" },
        { status: 400 },
      );
    }

    if (!email.includes("@")) {
      return json({ error: "Valid email address required" }, { status: 400 });
    }

    if (password.length < 8) {
      return json(
        { error: "Password must be at least 8 characters long" },
        { status: 400 },
      );
    }

    // Create initial admin
    const admin = await createInitialAdmin(username, email, password);

    return json({
      success: true,
      message: "Initial admin account created successfully",
      admin: {
        id: admin.id,
        username: admin.username,
        email: admin.email,
      },
    });
  } catch (error) {
    // Another request created the first account between the check above and
    // the insert. createInitialAdmin re-checks under a lock.
    if (error instanceof SetupClosedError) {
      return json(SETUP_CLOSED, { status: 403 });
    }

    console.error("❌ Initial setup error:", error);

    // Return specific error message if it's a known error
    if (error.message) {
      return json({ error: error.message }, { status: 400 });
    }

    return json({ error: "Setup failed" }, { status: 500 });
  }
}
