/**
 * Authentication callback endpoint - handles OIDC callback
 */

import { redirect } from "@sveltejs/kit";
import {
  exchangeCodeForTokens,
  getUserInfo,
  createSessionToken,
  createSessionCookie,
} from "$lib/auth.js";
import { upsertUserFromAuthentik } from "$lib/userProfile.js";

export async function GET({ url, cookies }) {

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

    // Verify state parameter
    if (!state || !storedState || state !== storedState) {
      console.error("❌ Invalid state parameter");
      console.error(
        `📊 State comparison: received="${state}", stored="${storedState}"`,
      );
      throw redirect(302, "/?error=invalid_state");
    }


    // Clear state cookie
    cookies.delete("auth_state", { path: "/" });

    if (!code) {
      console.error("❌ No authorization code received");
      throw redirect(302, "/?error=no_code");
    }


    // Build redirect URI
    const redirectUri = `${url.origin}/api/auth/callback`;

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code, redirectUri);

    if (!tokens.access_token) {
      console.error("❌ No access token received in response");
      throw redirect(302, "/?error=no_token");
    }


    // Get user information
    const userInfo = await getUserInfo(tokens.access_token);

    if (!userInfo) {
      console.error("❌ Failed to get user info");
      throw redirect(302, "/?error=no_user_info");
    }


    // Create or update user profile in database
    const user = await upsertUserFromAuthentik(userInfo);

    if (!user) {
      console.error("❌ Failed to create/update user profile");
      throw redirect(302, "/?error=profile_creation_failed");
    }


    // Create session token with local user reference
    const sessionToken = await createSessionToken(
      userInfo,
      tokens.access_token,
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
