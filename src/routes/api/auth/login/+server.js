/**
 * Authentication login endpoint - initiates OIDC flow
 */

import { redirect } from "@sveltejs/kit";
import { getAuthorizationUrl } from "$lib/auth.server.js";
import { generateId } from "$lib/utils.js";

export async function GET({ url, cookies }) {
  try {
    // Generate state parameter for security
    const state = generateId();

    // Store state in cookie for verification
    cookies.set("auth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 minutes
      path: "/",
    });

    // Build redirect URI
    const redirectUri = `${url.origin}/api/auth/callback`;

    // Get authorization URL
    const authUrl = getAuthorizationUrl(redirectUri, state);

    throw redirect(302, authUrl);
  } catch (error) {
    if (error.status === 302) {
      throw error; // Re-throw redirect
    }

    console.error("❌ Login error:", error);
    console.error("❌ Error stack:", error.stack);

    // Return more specific error information
    const errorParam = encodeURIComponent(error.message || "login_failed");
    throw redirect(302, `/?error=${errorParam}`);
  }
}
