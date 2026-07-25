/**
 * Authentication callback endpoint - handles OIDC callback
 */

import { redirect } from "@sveltejs/kit";
import { createSessionToken } from "$lib/auth.server.js";
import {
  exchangeCodeForTokens,
  resolveIdentity,
  resolveRedirectUri,
} from "$lib/server/oidc.js";
import { upsertUserFromAuthentik } from "$lib/userProfile.js";
import crypto from "crypto";

export async function GET({ url, cookies, getClientAddress, request, locals }) {
  try {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");
    const storedState = cookies.get("auth_state");

    // Check for OAuth errors
    if (error) {
      console.error(`❌ OAuth error: ${error}`);
      console.error(`❌ Error description: ${errorDescription}`);
      const errorParam = encodeURIComponent(
        `${error}: ${errorDescription || "OAuth error"}`,
      );
      throw redirect(302, `/?error=${errorParam}`);
    }

    // Verify state parameter. Compared in constant time — a plain !== leaks
    // timing information about a CSRF-relevant secret.
    if (!state || !storedState || !timingSafeEqual(state, storedState)) {
      console.error("❌ Invalid state parameter");
      throw redirect(302, "/?error=invalid_state");
    }

    const nonce = cookies.get("auth_nonce");

    // Clear single-use cookies
    cookies.delete("auth_state", { path: "/" });
    cookies.delete("auth_nonce", { path: "/" });

    if (!code) {
      console.error("❌ No authorization code received");
      throw redirect(302, "/?error=no_code");
    }

    // Must be byte-identical to the value sent in the auth request.
    const redirectUri = resolveRedirectUri(url);

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code, redirectUri);

    if (!tokens.access_token && !tokens.id_token) {
      console.error("❌ No access_token or id_token received in response");
      throw redirect(302, "/?error=no_token");
    }

    // Identity comes from the verified id_token where possible, merged with
    // /userinfo. Previously the id_token was ignored entirely and identity was
    // taken from an unverified userinfo response.
    const userInfo = await resolveIdentity(tokens, nonce);

    if (!userInfo) {
      console.error("❌ Failed to resolve user identity from the provider");
      throw redirect(302, "/?error=no_user_info");
    }

    // Create or update user profile in database
    const user = await upsertUserFromAuthentik(userInfo);

    if (!user) {
      console.error("❌ Failed to create/update user profile");
      throw redirect(302, "/?error=profile_creation_failed");
    }

    // Create session token
    const sessionToken = await createSessionToken(
      userInfo,
      user.id, // Add local user ID to session
    );

    // Set session cookie with Docker-compatible settings
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60, // 24 hours
      path: "/",
    };

    // Don't set domain explicitly - let browser determine it
    // This ensures it works in both Docker and local environments
    cookies.set("session", sessionToken, cookieOptions);

    // Redirect to homepage with cache-busting parameter to force reload
    const timestamp = Date.now();
    throw redirect(302, `/?t=${timestamp}`);
  } catch (error) {
    if (error.status === 302) {
      throw error; // Re-throw redirect
    }

    console.error("❌ Callback error:", error);
    console.error("❌ Error stack:", error.stack);

    // Return more specific error information
    const errorParam = encodeURIComponent(error.message || "callback_failed");
    throw redirect(302, `/?error=${errorParam}`);
  }
}

/**
 * Constant-time string comparison for equal-length secrets.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
