/**
 * Authentication logout endpoint - clears session
 */

import { redirect } from "@sveltejs/kit";
import { clearSessionCookie } from "$lib/auth.js";

export async function GET({ cookies }) {
  try {
    // Call helper to clear sessions (adjust call if your helper's signature differs)
    await clearSessionCookie({
      session: !!cookies.get("session"),
      basic_auth_session: !!cookies.get("basic_auth_session"),
    });

    // Ensure cookies are removed (safe to keep even if helper already did it)
    cookies.delete("session", {
      path: "/",
      secure: false,
      sameSite: "lax",
    });
    cookies.delete("basic_auth_session", {
      path: "/",
      secure: false,
      sameSite: "lax",
    });

    throw redirect(302, "/login");
  } catch (error) {
    if (error?.status === 302) {
      throw error; // Re-throw redirect
    }

    console.error("Logout error:", error);
    throw redirect(302, "/login");
  }
}

export async function POST({ cookies }) {
  // Handle POST requests the same way
  return GET({ cookies });
}
