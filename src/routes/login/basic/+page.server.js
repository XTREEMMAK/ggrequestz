/**
 * Basic authentication login page
 */

import { redirect, fail } from "@sveltejs/kit";
import { authenticateUser, createBasicAuthToken } from "$lib/basicAuth.js";
import { query } from "$lib/database.js";

export async function load({ parent }) {
  const { user } = await parent();

  // If user is already authenticated, redirect to homepage
  if (user) {
    throw redirect(302, "/");
  }

  // Check if registration is enabled
  let registrationEnabled = false;
  try {
    const settingResult = await query(
      "SELECT value FROM ggr_system_settings WHERE key = 'system.registration_enabled'",
    );
    registrationEnabled =
      settingResult.rows.length > 0 && settingResult.rows[0].value === "true";
  } catch (error) {
    console.warn("Could not check registration setting:", error);
  }

  return {
    user: null,
    registrationEnabled,
  };
}

export const actions = {
  login: async ({ request, cookies, url }) => {
    const formData = await request.formData();
    const identifier = formData.get("identifier")?.toString().trim();
    const password = formData.get("password")?.toString();

    if (!identifier || !password) {
      return fail(400, {
        error: "Username/email and password are required",
        identifier,
      });
    }

    try {
      const user = await authenticateUser(identifier, password);

      if (!user) {
        return fail(400, {
          error: "Invalid username/email or password",
          identifier,
        });
      }

      // Create session token
      const sessionToken = createBasicAuthToken(user);

      // Set basic auth session cookie
      cookies.set("basic_auth_session", sessionToken, {
        path: "/",
        httpOnly: true,
        secure: false, // Force insecure for debugging
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 3, // 3 days
        domain: undefined, // Let browser determine domain
      });

      // Debug: Try to immediately read back the cookie
      const readBack = cookies.get("basic_auth_session");

      // Redirect to intended destination or homepage
      const redirectTo = url.searchParams.get("redirectTo") || "/";
      throw redirect(302, redirectTo);
    } catch (error) {
      // Check if this is a redirect (which is expected)
      if (error.status === 302) {
        throw error; // Re-throw redirect
      }

      console.error("🔐 ACTUAL ERROR in login:", error);
      console.error("🔐 Error type:", error.constructor.name);
      console.error("🔐 Error message:", error.message);
      console.error("🔐 Error stack:", error.stack);

      return fail(500, {
        error: "Login failed. Please try again.",
        identifier,
      });
    }
  },
};
