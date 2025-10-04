import { json } from "@sveltejs/kit";
import { env } from "$env/dynamic/public";
import pkg from "../../../../package.json" assert { type: "json" };

/** @type {import('./$types').RequestHandler} */
export async function GET({ url }) {
  // Determine the base URL - use PUBLIC_SITE_URL if set, otherwise use request origin
  const baseUrl = env.PUBLIC_SITE_URL || url.origin;

  // Generate OpenAPI spec with dynamic server URL
  const openApiSpec = {
    openapi: "3.1.0",
    info: {
      title: "GG Requestz API",
      version: pkg.version,
      description:
        "Game request management platform with IGDB integration, watchlist, and ROMM library support",
      contact: {
        name: "GG Requestz Support",
      },
    },
    servers: [
      {
        url: `${baseUrl}/api`,
        description:
          process.env.NODE_ENV === "production"
            ? "Production server"
            : "Development server",
      },
    ],
    security: [
      {
        bearerAuth: [],
      },
      {
        cookieAuth: [],
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "API Key",
          description:
            "API key authentication with format: `ggr_<your-api-key>`",
        },
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "session",
          description: "Session-based authentication for web browsers",
        },
      },
      schemas: {
        Game: {
          type: "object",
          properties: {
            igdb_id: {
              type: "string",
              example: "72129",
            },
            title: {
              type: "string",
              example: "The Legend of Zelda: Breath of the Wild",
            },
            summary: {
              type: "string",
            },
            cover_url: {
              type: "string",
              format: "uri",
            },
            screenshots: {
              type: "array",
              items: {
                type: "string",
                format: "uri",
              },
            },
            platforms: {
              type: "array",
              items: {
                type: "string",
              },
            },
            genres: {
              type: "array",
              items: {
                type: "string",
              },
            },
            rating: {
              type: "number",
              format: "float",
            },
            release_date: {
              type: "string",
              format: "date",
            },
          },
        },
        Error: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: false,
            },
            error: {
              type: "string",
            },
            code: {
              type: "string",
              enum: [
                "UNAUTHORIZED",
                "FORBIDDEN",
                "NOT_FOUND",
                "VALIDATION_ERROR",
                "RATE_LIMITED",
                "SERVER_ERROR",
                "SERVICE_UNAVAILABLE",
              ],
            },
            details: {
              type: "string",
            },
          },
        },
        User: {
          type: "object",
          properties: {
            id: {
              type: "string",
            },
            username: {
              type: "string",
            },
            is_admin: {
              type: "boolean",
            },
          },
        },
        UserPreferences: {
          type: "object",
          properties: {
            content_filter_level: {
              type: "string",
              enum: ["none", "mild", "strict"],
            },
            hide_mature_content: {
              type: "boolean",
            },
            hide_nsfw_content: {
              type: "boolean",
            },
            max_esrb_rating: {
              type: "string",
              enum: ["E", "E10+", "T", "M", "AO"],
            },
            custom_content_blocks: {
              type: "array",
              items: {
                type: "string",
              },
            },
            preferred_genres: {
              type: "array",
              items: {
                type: "string",
              },
            },
            excluded_genres: {
              type: "array",
              items: {
                type: "string",
              },
            },
          },
        },
      },
    },
    paths: {
      "/version": {
        get: {
          tags: ["System"],
          summary: "Get API version",
          description: "Returns application version and feature information",
          security: [],
          responses: {
            200: {
              description: "Version information",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      version: {
                        type: "string",
                        example: pkg.version,
                      },
                      name: {
                        type: "string",
                        example: "gg-requestz",
                      },
                      environment: {
                        type: "string",
                        example: "production",
                      },
                      features: {
                        type: "object",
                        properties: {
                          oidc: { type: "boolean" },
                          basicAuth: { type: "boolean" },
                          redis: { type: "boolean" },
                          romm: { type: "boolean" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/health": {
        get: {
          tags: ["System"],
          summary: "Health check",
          description: "Health check endpoint for monitoring",
          security: [],
          responses: {
            200: {
              description: "Health status",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: {
                        type: "string",
                        example: "ok",
                      },
                      timestamp: {
                        type: "string",
                        format: "date-time",
                      },
                      uptime: {
                        type: "number",
                      },
                      version: {
                        type: "string",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/auth/basic/login": {
        post: {
          tags: ["Authentication"],
          summary: "Basic authentication login",
          requestBody: {
            required: true,
            content: {
              "application/x-www-form-urlencoded": {
                schema: {
                  type: "object",
                  properties: {
                    username: {
                      type: "string",
                      example: "user@example.com",
                    },
                    password: {
                      type: "string",
                      example: "password123",
                    },
                  },
                  required: ["username", "password"],
                },
              },
            },
          },
          responses: {
            200: {
              description: "Login successful",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                      user: { $ref: "#/components/schemas/User" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/auth/basic/register": {
        post: {
          tags: ["Authentication"],
          summary: "Register new user",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    username: {
                      type: "string",
                      example: "newuser@example.com",
                    },
                    password: {
                      type: "string",
                      example: "securepassword123",
                    },
                    confirmPassword: {
                      type: "string",
                      example: "securepassword123",
                    },
                  },
                  required: ["username", "password", "confirmPassword"],
                },
              },
            },
          },
          responses: {
            200: {
              description: "Registration successful",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                      user: { $ref: "#/components/schemas/User" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/auth/basic/logout": {
        get: {
          tags: ["Authentication"],
          summary: "Logout (GET)",
          responses: {
            200: {
              description: "Logout successful",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          tags: ["Authentication"],
          summary: "Logout (POST)",
          responses: {
            200: {
              description: "Logout successful",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/auth/basic/setup": {
        post: {
          tags: ["Authentication"],
          summary: "Initial basic auth setup",
          description: "Create first admin user during initial setup",
          security: [],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    username: {
                      type: "string",
                      example: "admin@example.com",
                    },
                    password: {
                      type: "string",
                      example: "securepassword123",
                    },
                    confirmPassword: {
                      type: "string",
                      example: "securepassword123",
                    },
                  },
                  required: ["username", "password", "confirmPassword"],
                },
              },
            },
          },
          responses: {
            200: {
              description: "Setup successful",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/auth/login": {
        get: {
          tags: ["Authentication"],
          summary: "OAuth login redirect",
          description: "Initiate OAuth/OIDC authentication flow",
          security: [],
          responses: {
            302: {
              description: "Redirect to OAuth provider",
            },
          },
        },
      },
      "/auth/callback": {
        get: {
          tags: ["Authentication"],
          summary: "OAuth callback",
          description: "OAuth/OIDC callback endpoint",
          security: [],
          parameters: [
            {
              name: "code",
              in: "query",
              schema: { type: "string" },
              description: "Authorization code from OAuth provider",
            },
            {
              name: "state",
              in: "query",
              schema: { type: "string" },
              description: "State parameter for CSRF protection",
            },
          ],
          responses: {
            302: {
              description: "Redirect to application after authentication",
            },
          },
        },
      },
      "/auth/logout": {
        get: {
          tags: ["Authentication"],
          summary: "OAuth logout",
          description: "Logout from OAuth session",
          responses: {
            302: {
              description: "Redirect after logout",
            },
          },
        },
        post: {
          tags: ["Authentication"],
          summary: "OAuth logout (POST)",
          description: "Logout from OAuth session via POST",
          responses: {
            302: {
              description: "Redirect after logout",
            },
          },
        },
      },
      "/search": {
        get: {
          tags: ["Games"],
          summary: "Search games",
          description: "Search games with IGDB integration",
          parameters: [
            {
              name: "q",
              in: "query",
              required: true,
              schema: {
                type: "string",
              },
              description: "Search query",
            },
            {
              name: "page",
              in: "query",
              schema: {
                type: "integer",
                default: 1,
              },
            },
            {
              name: "per_page",
              in: "query",
              schema: {
                type: "integer",
                default: 20,
                maximum: 100,
              },
            },
            {
              name: "autocomplete",
              in: "query",
              schema: {
                type: "boolean",
              },
            },
          ],
          responses: {
            200: {
              description: "Search results",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      hits: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            document: { $ref: "#/components/schemas/Game" },
                          },
                        },
                      },
                      found: { type: "integer" },
                      page: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          tags: ["Games"],
          summary: "Advanced search",
          description: "Advanced search with filters",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    query: { type: "string" },
                    platforms: {
                      type: "array",
                      items: { type: "string" },
                    },
                    genres: {
                      type: "array",
                      items: { type: "string" },
                    },
                    page: { type: "integer" },
                    per_page: { type: "integer" },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Search results",
            },
          },
        },
      },
      "/games/popular": {
        get: {
          tags: ["Games"],
          summary: "Get popular games",
          parameters: [
            {
              name: "page",
              in: "query",
              schema: {
                type: "integer",
                default: 1,
              },
            },
            {
              name: "limit",
              in: "query",
              schema: {
                type: "integer",
                default: 16,
              },
            },
            {
              name: "user_id",
              in: "query",
              schema: {
                type: "string",
              },
              description: "User ID for content filtering",
            },
          ],
          responses: {
            200: {
              description: "Popular games",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      games: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Game" },
                      },
                      hasMore: { type: "boolean" },
                      total: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/games/recent": {
        get: {
          tags: ["Games"],
          summary: "Get recently released games",
          parameters: [
            {
              name: "page",
              in: "query",
              schema: {
                type: "integer",
                default: 1,
              },
            },
            {
              name: "limit",
              in: "query",
              schema: {
                type: "integer",
                default: 16,
              },
            },
            {
              name: "user_id",
              in: "query",
              schema: {
                type: "string",
              },
            },
          ],
          responses: {
            200: {
              description: "Recent games",
            },
          },
        },
      },
      "/games/{id}": {
        get: {
          tags: ["Games"],
          summary: "Get game details",
          description: "Get detailed game information by IGDB ID",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: {
                type: "string",
              },
              example: "72129",
            },
          ],
          responses: {
            200: {
              description: "Game details",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      game: { $ref: "#/components/schemas/Game" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/watchlist/add": {
        post: {
          tags: ["Watchlist"],
          summary: "Add game to watchlist",
          security: [{ bearerAuth: [] }, { cookieAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    igdb_id: {
                      type: "string",
                      example: "72129",
                    },
                  },
                  required: ["igdb_id"],
                },
              },
            },
          },
          responses: {
            200: {
              description: "Added to watchlist",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                    },
                  },
                },
              },
            },
            401: {
              description: "Unauthorized",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/watchlist/remove": {
        post: {
          tags: ["Watchlist"],
          summary: "Remove game from watchlist",
          security: [{ bearerAuth: [] }, { cookieAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    igdb_id: { type: "string" },
                  },
                  required: ["igdb_id"],
                },
              },
            },
          },
          responses: {
            200: {
              description: "Removed from watchlist",
            },
          },
        },
      },
      "/watchlist/status/{id}": {
        get: {
          tags: ["Watchlist"],
          summary: "Check watchlist status",
          security: [{ bearerAuth: [] }, { cookieAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: {
                type: "string",
              },
            },
          ],
          responses: {
            200: {
              description: "Watchlist status",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      inWatchlist: { type: "boolean" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/watchlist/batch": {
        post: {
          tags: ["Watchlist"],
          summary: "Batch watchlist operations",
          security: [{ bearerAuth: [] }, { cookieAuth: [] }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    gameIds: {
                      type: "array",
                      items: { type: "string" },
                    },
                    action: {
                      type: "string",
                      enum: ["check_status"],
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Batch operation result",
            },
          },
        },
      },
      "/user/preferences": {
        get: {
          tags: ["User"],
          summary: "Get user preferences",
          security: [{ bearerAuth: [] }, { cookieAuth: [] }],
          responses: {
            200: {
              description: "User preferences",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      preferences: {
                        $ref: "#/components/schemas/UserPreferences",
                      },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          tags: ["User"],
          summary: "Update user preferences",
          security: [{ bearerAuth: [] }, { cookieAuth: [] }],
          requestBody: {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UserPreferences" },
              },
            },
          },
          responses: {
            200: {
              description: "Preferences updated",
            },
          },
        },
      },
      "/request": {
        post: {
          tags: ["Requests"],
          summary: "Submit game request",
          description:
            "Submit a new game request with support for game, update, and fix types",
          security: [{ bearerAuth: [] }, { cookieAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    request_type: {
                      type: "string",
                      enum: ["game", "update", "fix"],
                      description: "Type of request",
                      example: "game",
                    },
                    title: {
                      type: "string",
                      description: "Game title",
                      example: "Super Mario Kart",
                    },
                    igdb_id: {
                      type: "string",
                      description: "IGDB game ID (optional)",
                      example: "2332",
                    },
                    platforms: {
                      type: "array",
                      items: { type: "string" },
                      description: "List of platforms",
                      example: ["Super Nintendo Entertainment System"],
                    },
                    priority: {
                      type: "string",
                      enum: ["low", "medium", "high", "urgent"],
                      default: "medium",
                      description: "Request priority",
                    },
                    description: {
                      type: "string",
                      description: "Additional details about the request",
                    },
                    game_data: {
                      type: "object",
                      description: "Game metadata to cache (optional)",
                      properties: {
                        title: { type: "string" },
                        summary: { type: "string" },
                        cover_url: { type: "string" },
                        rating: { type: "number" },
                        release_date: { type: "string" },
                        platforms: {
                          type: "array",
                          items: { type: "string" },
                        },
                        genres: {
                          type: "array",
                          items: { type: "string" },
                        },
                        screenshots: {
                          type: "array",
                          items: { type: "string" },
                        },
                        videos: {
                          type: "array",
                          items: { type: "string" },
                        },
                        companies: {
                          type: "array",
                          items: { type: "string" },
                        },
                        game_modes: {
                          type: "array",
                          items: { type: "string" },
                        },
                      },
                    },
                  },
                  required: ["request_type", "title"],
                },
              },
            },
          },
          responses: {
            201: {
              description: "Request created successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean", example: true },
                      request: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          title: { type: "string" },
                          request_type: { type: "string" },
                          priority: { type: "string" },
                          status: { type: "string", example: "pending" },
                          created_at: {
                            type: "string",
                            format: "date-time",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            400: {
              description: "Invalid request data",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            401: {
              description: "Unauthorized",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
        get: {
          tags: ["Requests"],
          summary: "Get user's requests",
          description: "Retrieve current user's game requests",
          security: [{ bearerAuth: [] }, { cookieAuth: [] }],
          parameters: [
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", default: 20 },
            },
            {
              name: "offset",
              in: "query",
              schema: { type: "integer", default: 0 },
            },
            {
              name: "status",
              in: "query",
              schema: {
                type: "string",
                enum: [
                  "pending",
                  "approved",
                  "fulfilled",
                  "rejected",
                  "cancelled",
                ],
              },
            },
          ],
          responses: {
            200: {
              description: "List of user requests",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      requests: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "string" },
                            request_type: { type: "string" },
                            title: { type: "string" },
                            priority: { type: "string" },
                            status: { type: "string" },
                            description: { type: "string" },
                            platforms: {
                              type: "array",
                              items: { type: "string" },
                            },
                            created_at: { type: "string" },
                            updated_at: { type: "string" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/request/rescind": {
        post: {
          tags: ["Requests"],
          summary: "Rescind game request",
          security: [{ bearerAuth: [] }, { cookieAuth: [] }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    requestId: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Request rescinded",
            },
          },
        },
      },
      "/cache/stats": {
        get: {
          tags: ["Cache"],
          summary: "Get cache statistics",
          responses: {
            200: {
              description: "Cache statistics",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      stats: {
                        type: "object",
                        properties: {
                          redis: {
                            type: "object",
                            properties: {
                              connected: { type: "boolean" },
                              keyCount: { type: "integer" },
                              memoryUsed: { type: "string" },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/cache/clear": {
        post: {
          tags: ["Cache"],
          summary: "Clear cache",
          security: [{ bearerAuth: [] }, { cookieAuth: [] }],
          responses: {
            200: {
              description: "Cache cleared",
            },
          },
        },
      },
      "/cache/cleanup": {
        post: {
          tags: ["Cache"],
          summary: "Clean up stale cache entries",
          description: "Remove old or expired cache entries",
          security: [{ bearerAuth: [] }, { cookieAuth: [] }],
          responses: {
            200: {
              description: "Cache cleanup completed",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      cleaned: {
                        type: "integer",
                        description: "Number of entries cleaned",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/setup/check": {
        get: {
          tags: ["System"],
          summary: "Check setup status",
          description: "Check if initial setup is required",
          security: [],
          responses: {
            200: {
              description: "Setup status",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      needsSetup: { type: "boolean" },
                      hasUsers: { type: "boolean" },
                      authMethod: {
                        type: "string",
                        enum: ["oidc", "basic"],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/igdb": {
        post: {
          tags: ["Games"],
          summary: "IGDB API proxy",
          description: "Proxy requests to IGDB API with authentication",
          security: [{ bearerAuth: [] }, { cookieAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    endpoint: {
                      type: "string",
                      description: "IGDB endpoint to query",
                      example: "games",
                    },
                    query: {
                      type: "string",
                      description: "IGDB query string",
                      example: "fields *; where id = 1942;",
                    },
                  },
                  required: ["endpoint", "query"],
                },
              },
            },
          },
          responses: {
            200: {
              description: "IGDB response",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: { type: "array", items: { type: "object" } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/romm/clear-cache": {
        post: {
          tags: ["ROMM"],
          summary: "Clear ROMM cache",
          description: "Clear cached ROMM library data",
          security: [{ bearerAuth: [] }, { cookieAuth: [] }],
          responses: {
            200: {
              description: "ROMM cache cleared",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/images/proxy": {
        get: {
          tags: ["Utilities"],
          summary: "Proxy images",
          description: "Proxy and cache external images",
          parameters: [
            {
              name: "url",
              in: "query",
              required: true,
              schema: {
                type: "string",
                format: "uri",
              },
            },
          ],
          responses: {
            200: {
              description: "Image data",
              content: {
                "image/*": {
                  schema: {
                    type: "string",
                    format: "binary",
                  },
                },
              },
            },
          },
        },
      },
      "/webhooks": {
        post: {
          tags: ["Webhooks"],
          summary: "Receive webhooks",
          description: "Webhook endpoint for external integrations",
          parameters: [
            {
              name: "X-Webhook-Secret",
              in: "header",
              schema: {
                type: "string",
              },
            },
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    type: { type: "string" },
                    title: { type: "string" },
                    message: { type: "string" },
                    priority: { type: "integer" },
                    data: { type: "object" },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Webhook processed",
            },
          },
        },
      },
      "/browse/genres/{slug}": {
        get: {
          tags: ["Browse"],
          summary: "Browse by genre",
          parameters: [
            {
              name: "slug",
              in: "path",
              required: true,
              schema: {
                type: "string",
              },
              example: "role-playing-rpg",
            },
            {
              name: "page",
              in: "query",
              schema: {
                type: "integer",
              },
            },
            {
              name: "limit",
              in: "query",
              schema: {
                type: "integer",
              },
            },
          ],
          responses: {
            200: {
              description: "Games by genre",
            },
          },
        },
      },
      "/browse/publishers/{slug}": {
        get: {
          tags: ["Browse"],
          summary: "Browse by publisher",
          parameters: [
            {
              name: "slug",
              in: "path",
              required: true,
              schema: {
                type: "string",
              },
              example: "nintendo",
            },
          ],
          responses: {
            200: {
              description: "Games by publisher",
            },
          },
        },
      },
      "/romm/recent": {
        get: {
          tags: ["ROMM"],
          summary: "Get recent ROMs",
          description: "Get recently added ROMs from ROMM library",
          parameters: [
            {
              name: "page",
              in: "query",
              schema: {
                type: "integer",
              },
            },
            {
              name: "limit",
              in: "query",
              schema: {
                type: "integer",
              },
            },
          ],
          responses: {
            200: {
              description: "Recent ROMs",
            },
          },
        },
      },
      "/romm/cross-reference": {
        post: {
          tags: ["ROMM"],
          summary: "Cross-reference with ROMM",
          description: "Cross-reference games with ROMM library",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    gameIds: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Cross-reference results",
            },
          },
        },
      },
    },
    tags: [
      {
        name: "System",
        description: "System information and health checks",
      },
      {
        name: "Authentication",
        description: "User authentication endpoints",
      },
      {
        name: "Games",
        description: "Game search and discovery",
      },
      {
        name: "Watchlist",
        description: "Manage user watchlist",
      },
      {
        name: "User",
        description: "User preferences and settings",
      },
      {
        name: "Requests",
        description: "Game request management",
      },
      {
        name: "Browse",
        description: "Browse games by category",
      },
      {
        name: "Cache",
        description: "Cache management",
      },
      {
        name: "ROMM",
        description: "ROMM library integration",
      },
      {
        name: "Webhooks",
        description: "Webhook integrations",
      },
      {
        name: "Utilities",
        description: "Utility endpoints",
      },
    ],
  };

  return json(openApiSpec);
}
