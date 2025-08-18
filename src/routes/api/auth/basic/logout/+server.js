/**
 * Basic Authentication Logout API Endpoint
 * Clears the basic auth session cookie
 */

import { json, redirect } from "@sveltejs/kit";

export async function POST({ cookies }) {
  try {
    // Clear all possible session cookies
    cookies.delete("basic_auth_session", { path: "/" });
    cookies.delete("session", { path: "/" }); // Authentik/other providers

    return json({ success: true });
  } catch (error) {
    console.error("❌ Logout error:", error);
    return json({ error: "Logout failed" }, { status: 500 });
  }
}

export async function GET({ cookies }) {
  try {
    // Clear all possible session cookies
    cookies.delete("basic_auth_session", { path: "/" });
    cookies.delete("session", { path: "/" }); // Authentik/other providers

    throw redirect(302, "/");
  } catch (error) {
    if (error.status === 302) {
      throw error; // Re-throw redirect
    }

    console.error("❌ Logout error:", error);
    throw redirect(302, "/");
  }
}
