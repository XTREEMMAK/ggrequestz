/**
 * Authentication logout endpoint - clears session and client storage
 */

import { redirect } from "@sveltejs/kit";
import { clearSessionCookie } from "$lib/auth.server.js";

export async function GET({ cookies, request }) {
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

    // Check if this is an AJAX request or wants JSON response
    const acceptHeader = request.headers.get("accept");
    const isAjax = acceptHeader?.includes("application/json");

    if (isAjax) {
      // For AJAX requests, return JSON response so client can handle cleanup
      return new Response(
        JSON.stringify({ success: true, redirect: "/login" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // For regular requests, return HTML with client-side cleanup script
    const cleanupHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Logging out...</title>
        <meta charset="utf-8">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: #1a202c;
            color: white;
          }
          .spinner {
            width: 40px;
            height: 40px;
            border: 4px solid #4a5568;
            border-top: 4px solid #3182ce;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-bottom: 1rem;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        </style>
      </head>
      <body>
        <div style="text-align: center;">
          <div class="spinner"></div>
          <p>Logging out...</p>
        </div>
        <script>
          // Clear all session storage related to the app
          try {
            // Homepage state and scroll data
            sessionStorage.removeItem('homepage_scroll_position');
            sessionStorage.removeItem('homepage_scroll_data'); // Scroll manager data
            sessionStorage.removeItem('homepage_content_state'); // Homepage loaded items state
            sessionStorage.removeItem('homepage_state');
            sessionStorage.removeItem('gameDetailReferrer');

            // Clear any other app-specific localStorage items
            localStorage.removeItem('homepage_state');

            console.log('✅ Cleared client-side storage on logout including scroll and loaded items state');
          } catch (error) {
            console.warn('Failed to clear client storage:', error);
          }

          // Redirect to login page after cleanup
          setTimeout(() => {
            window.location.href = '/login';
          }, 100);
        </script>
      </body>
      </html>
    `;

    return new Response(cleanupHtml, {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
  } catch (error) {
    console.error("Logout error:", error);
    throw redirect(302, "/login");
  }
}

export async function POST({ cookies, request }) {
  // Handle POST requests the same way
  return GET({ cookies, request });
}
