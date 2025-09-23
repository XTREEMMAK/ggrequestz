/**
 * Game request submission endpoint
 * Handles POST requests for new game requests, updates, and fixes
 */

import { json } from "@sveltejs/kit";
import { query } from "$lib/database.js";
import { getAuthenticatedUser } from "$lib/auth.server.js";
import { sendNewRequestNotification } from "$lib/gotify.js";

/**
 * Submit a new game request
 * @param {Request} request - The request object
 * @returns {Response} - JSON response with success/error status
 */
export async function POST({ request, cookies }) {
  try {
    // Verify user authentication
    const user = await getAuthenticatedUser(cookies);
    if (!user) {
      return json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    // Get user's local database ID
    let userResult;
    let localUserId;

    // Debug logging for authentication troubleshooting
    console.log("🔍 AUTH DEBUG: User authentication details:", {
      auth_type: user.auth_type,
      sub: user.sub,
      id: user.id,
      email: user.email,
      username: user.username,
    });

    try {
      if (user.auth_type === "basic") {
        // For basic auth users, try multiple lookup strategies
        let basicAuthId;

        // Strategy 1: Direct ID if available
        if (user.id) {
          basicAuthId = parseInt(user.id);
        }
        // Strategy 2: Extract from sub if it follows basic_auth_123 format
        else if (user.sub && user.sub.startsWith("basic_auth_")) {
          basicAuthId = parseInt(user.sub.replace("basic_auth_", ""));
        }
        // Strategy 3: Try parsing sub directly as ID
        else if (user.sub) {
          basicAuthId = parseInt(user.sub);
        }

        console.log("🔍 AUTH DEBUG: Basic auth lookup with ID:", basicAuthId);

        if (!basicAuthId || isNaN(basicAuthId)) {
          console.error("❌ AUTH DEBUG: Invalid basic auth ID:", { user });
          return json(
            { success: false, error: "Invalid user authentication format" },
            { status: 400 },
          );
        }

        // Look up basic auth user - check both with and without password_hash requirement
        userResult = await query(
          "SELECT id, username, email FROM ggr_users WHERE id = $1 AND (password_hash IS NOT NULL OR authentik_sub IS NULL)",
          [basicAuthId],
        );

        console.log("🔍 AUTH DEBUG: Basic auth user lookup result:", {
          found: userResult.rows.length > 0,
          userId: userResult.rows[0]?.id,
        });
      } else {
        // For Authentik users
        console.log("🔍 AUTH DEBUG: Authentik user lookup with sub:", user.sub);

        if (!user.sub) {
          console.error("❌ AUTH DEBUG: Missing sub for Authentik user:", {
            user,
          });
          return json(
            { success: false, error: "Invalid Authentik user format" },
            { status: 400 },
          );
        }

        userResult = await query(
          "SELECT id, username, email FROM ggr_users WHERE authentik_sub = $1",
          [user.sub],
        );

        console.log("🔍 AUTH DEBUG: Authentik user lookup result:", {
          found: userResult.rows.length > 0,
          userId: userResult.rows[0]?.id,
        });
      }

      if (userResult.rows.length === 0) {
        console.error("❌ AUTH DEBUG: User not found in database:", {
          auth_type: user.auth_type,
          lookup_value:
            user.auth_type === "basic" ? user.id || user.sub : user.sub,
        });

        return json(
          { success: false, error: "User not found in database" },
          { status: 404 },
        );
      }

      localUserId = userResult.rows[0].id;
      console.log(
        "✅ AUTH DEBUG: Successfully found user with local ID:",
        localUserId,
      );
    } catch (dbError) {
      console.error(
        "❌ AUTH DEBUG: Database error during user lookup:",
        dbError,
      );
      return json(
        { success: false, error: "Database error during authentication" },
        { status: 500 },
      );
    }

    // Parse request data
    const requestData = await request.json();

    // Validate required fields
    if (!requestData.request_type || !requestData.title) {
      return json(
        {
          success: false,
          error: "Missing required fields: request_type and title",
        },
        { status: 400 },
      );
    }

    // Validate request type
    const validTypes = ["game", "update", "fix"];
    if (!validTypes.includes(requestData.request_type)) {
      return json(
        {
          success: false,
          error: "Invalid request_type. Must be one of: game, update, fix",
        },
        { status: 400 },
      );
    }

    // Validate priority
    const validPriorities = ["low", "medium", "high", "urgent"];
    const priority = requestData.priority || "medium";
    if (!validPriorities.includes(priority)) {
      return json(
        {
          success: false,
          error: "Invalid priority. Must be one of: low, medium, high, urgent",
        },
        { status: 400 },
      );
    }

    // Prepare data for database insertion
    const insertData = {
      user_id: localUserId,
      user_name:
        requestData.user_name ||
        user.name ||
        user.preferred_username ||
        user.username ||
        user.email,
      request_type: requestData.request_type,
      title: requestData.title,
      igdb_id: requestData.igdb_id || null,
      platforms: JSON.stringify(requestData.platforms || []),
      priority: priority,
      description: requestData.description || "",
      status: "pending",
    };

    // Handle request-type specific fields
    switch (requestData.request_type) {
      case "update":
        insertData.reason = `Update type: ${requestData.update_type || "content"}`;
        if (requestData.new_information) {
          insertData.description =
            `${insertData.description}\n\nNew Information: ${requestData.new_information}`.trim();
        }
        if (requestData.existing_game) {
          insertData.description =
            `${insertData.description}\n\nExisting Game: ${requestData.existing_game}`.trim();
        }
        break;

      case "fix":
        insertData.reason = `Issue type: ${requestData.issue_type || "other"}`;
        if (requestData.affected_platform) {
          insertData.description =
            `${insertData.description}\n\nAffected Platform: ${requestData.affected_platform}`.trim();
        }
        if (requestData.existing_game) {
          insertData.description =
            `${insertData.description}\n\nAffected Game: ${requestData.existing_game}`.trim();
        }
        break;

      case "game":
      default:
        // No additional processing needed for game requests
        break;
    }

    // Insert into database
    const result = await query(
      `
      INSERT INTO ggr_game_requests (
        user_id, user_name, request_type, title, igdb_id, 
        platforms, priority, description, reason, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
      ) RETURNING *
    `,
      [
        insertData.user_id,
        insertData.user_name,
        insertData.request_type,
        insertData.title,
        insertData.igdb_id,
        insertData.platforms,
        insertData.priority,
        insertData.description,
        insertData.reason || null,
        insertData.status,
      ],
    );

    const insertedRequest = result.rows[0];

    // Log the request for analytics
    try {
      await query(
        `
        INSERT INTO ggr_user_analytics (user_id, action, metadata)
        VALUES ($1, $2, $3)
      `,
        [
          localUserId,
          "game_request_submitted",
          JSON.stringify({
            request_id: insertedRequest.id,
            request_type: requestData.request_type,
            title: requestData.title,
            priority: priority,
          }),
        ],
      );
    } catch (analyticsError) {
      console.warn("Failed to log analytics:", analyticsError);
      // Don't fail the request if analytics logging fails
    }

    // Send Gotify notification asynchronously (don't wait for it)
    sendNewRequestNotification({
      id: insertedRequest.id,
      title: insertedRequest.title,
      request_type: insertedRequest.request_type,
      priority: insertedRequest.priority,
      user_name: insertedRequest.user_name,
      description: insertedRequest.description,
    }).catch((error) => {
      console.warn("Failed to send Gotify notification:", error);
      // Don't fail the request if notification fails
    });

    return json(
      {
        success: true,
        request: {
          id: insertedRequest.id,
          title: insertedRequest.title,
          request_type: insertedRequest.request_type,
          priority: insertedRequest.priority,
          status: insertedRequest.status,
          created_at: insertedRequest.created_at,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("❌ Game request submission error:", error);

    // Handle specific database errors
    if (error.code === "23503") {
      // Foreign key violation
      return json(
        {
          success: false,
          error:
            "Invalid game reference. Please try selecting a game from the search results.",
        },
        { status: 400 },
      );
    }

    if (error.code === "23505") {
      // Unique constraint violation
      return json(
        {
          success: false,
          error: "You have already submitted a similar request.",
        },
        { status: 409 },
      );
    }

    return json(
      {
        success: false,
        error: "Failed to submit request. Please try again.",
      },
      { status: 500 },
    );
  }
}

/**
 * Get user's game requests (optional GET endpoint for future use)
 * @param {Request} request - The request object
 * @returns {Response} - JSON response with user's requests
 */
export async function GET({ url, cookies }) {
  try {
    // Verify user authentication
    const user = await getAuthenticatedUser(cookies);
    if (!user) {
      return json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    // Get user's local database ID (use same logic as POST)
    let userResult;
    let localUserId;

    try {
      if (user.auth_type === "basic") {
        // For basic auth users, try multiple lookup strategies
        let basicAuthId;

        if (user.id) {
          basicAuthId = parseInt(user.id);
        } else if (user.sub && user.sub.startsWith("basic_auth_")) {
          basicAuthId = parseInt(user.sub.replace("basic_auth_", ""));
        } else if (user.sub) {
          basicAuthId = parseInt(user.sub);
        }

        if (!basicAuthId || isNaN(basicAuthId)) {
          return json(
            { success: false, error: "Invalid user authentication format" },
            { status: 400 },
          );
        }

        userResult = await query(
          "SELECT id, username, email FROM ggr_users WHERE id = $1 AND (password_hash IS NOT NULL OR authentik_sub IS NULL)",
          [basicAuthId],
        );
      } else {
        // For Authentik users
        if (!user.sub) {
          return json(
            { success: false, error: "Invalid Authentik user format" },
            { status: 400 },
          );
        }

        userResult = await query(
          "SELECT id, username, email FROM ggr_users WHERE authentik_sub = $1",
          [user.sub],
        );
      }

      if (userResult.rows.length === 0) {
        return json(
          { success: false, error: "User not found in database" },
          { status: 404 },
        );
      }

      localUserId = userResult.rows[0].id;
    } catch (dbError) {
      console.error(
        "❌ GET requests: Database error during user lookup:",
        dbError,
      );
      return json(
        { success: false, error: "Database error during authentication" },
        { status: 500 },
      );
    }

    // Get query parameters
    const limit = parseInt(url.searchParams.get("limit")) || 20;
    const offset = parseInt(url.searchParams.get("offset")) || 0;
    const status = url.searchParams.get("status");

    // Build query
    let queryText = `
      SELECT id, request_type, title, priority, status, description, 
             platforms, created_at, updated_at
      FROM ggr_game_requests 
      WHERE user_id = $1
    `;
    const params = [localUserId];

    if (status) {
      queryText += ` AND status = $${params.length + 1}`;
      params.push(status);
    }

    queryText += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await query(queryText, params);
    const requests = result.rows;

    return json({
      success: true,
      requests: requests.map((req) => ({
        ...req,
        platforms:
          typeof req.platforms === "string"
            ? JSON.parse(req.platforms)
            : req.platforms,
      })),
    });
  } catch (error) {
    console.error("❌ Failed to get user requests:", error);
    return json(
      {
        success: false,
        error: "Failed to retrieve requests",
      },
      { status: 500 },
    );
  }
}
