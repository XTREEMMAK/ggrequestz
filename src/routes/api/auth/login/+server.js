/**
 * Authentication login endpoint - initiates OIDC flow
 */

import { redirect } from "@sveltejs/kit";
import { getAuthorizationUrl, resolveRedirectUri } from "$lib/server/oidc.js";
import { generateId } from "$lib/utils.js";

export async function GET({ url, cookies }) {
  try {
    // CSRF state, plus a nonce so the id_token can be checked for replay.
    const state = generateId();
    const nonce = generateId();

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 minutes
      path: "/",
    };

    cookies.set("auth_state", state, cookieOptions);
    cookies.set("auth_nonce", nonce, cookieOptions);

    // Must match what is registered at the provider.
    const redirectUri = resolveRedirectUri(url);

    // Get authorization URL
    const authUrl = await getAuthorizationUrl(redirectUri, state, nonce);

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
