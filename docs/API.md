# API Documentation

## Interactive Documentation

Visit `/api/docs` for the interactive Scalar API reference with all endpoints, schemas, and examples.

The OpenAPI specification is dynamically generated at `/api/openapi.json` and automatically uses the correct domain based on your environment.

## Base URL

```
http://localhost:5173/api  # Development
https://your-domain.com/api  # Production
```

The base URL is automatically configured via the `PUBLIC_SITE_URL` environment variable.

## Authentication

Most API endpoints require authentication. GG Requestz supports multiple authentication methods:

### Session-Based Authentication (Cookies)

For web browser access, authentication is handled via session cookies:

```http
Cookie: session=<session-token>
Cookie: basic_auth_session=<basic-auth-token>
Content-Type: application/json
```

### API Key Authentication (Recommended for Programmatic Access)

For programmatic access, use API keys with Bearer token authentication:

```http
Authorization: Bearer ggr_<your-api-key>
Content-Type: application/json
```

**Creating API Keys:**

1. Log in to your account
2. Navigate to Admin → API Keys
3. Click "Create New API Key"
4. Select the appropriate scopes (permissions)
5. Copy the generated key - it will only be shown once!

**API Key Scopes:**

- `games:read` - Read game information and search
- `requests:read` - View game requests
- `requests:write` - Create and manage game requests
- `watchlist:read` - View watchlist
- `watchlist:write` - Add and remove games from watchlist
- `user:read` - Read user profile and preferences
- `user:write` - Update user profile and preferences
- `admin:read` - Read admin data and analytics
- `admin:write` - Manage users, requests, and system settings
- `*` - Full access to all API endpoints

**Security Best Practices:**

- Store API keys securely (use environment variables, never commit to git)
- Use the minimum required scopes for each key
- Rotate keys regularly
- Revoke unused keys immediately
- Set expiration dates when possible

## Core Endpoints

### Version & Health

#### GET /api/version

Returns application version and feature information.

**Response:**

```json
{
  "version": "1.2.2",
  "name": "gg-requestz",
  "environment": "production",
  "buildTime": "2025-09-29T12:00:00Z",
  "features": {
    "oidc": true,
    "basicAuth": true,
    "redis": true,
    "romm": true,
    "typesense": false
  },
  "api": {
    "version": "v1",
    "endpoints": [
      "/api/games",
      "/api/auth",
      "/api/search",
      "/api/watchlist",
      "/api/admin"
    ]
  }
}
```

#### GET /api/health

Health check endpoint for monitoring.

**Response:**

```json
{
  "status": "ok",
  "timestamp": "2025-09-29T12:00:00Z",
  "uptime": 3600,
  "version": "1.2.2"
}
```

### Authentication

#### POST /api/auth/basic/login

Basic authentication login.

**Request:**

```http
Content-Type: application/x-www-form-urlencoded

username=user@example.com&password=password123
```

**Response:**

```json
{
  "success": true,
  "message": "Login successful",
  "user": {
    "id": "123",
    "username": "user@example.com",
    "is_admin": false
  }
}
```

#### POST /api/auth/basic/register

Register new user account.

**Request:**

```json
{
  "username": "newuser@example.com",
  "password": "securepassword123",
  "confirmPassword": "securepassword123"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Registration successful",
  "user": {
    "id": "124",
    "username": "newuser@example.com",
    "is_admin": false
  }
}
```

#### POST /api/auth/basic/logout

#### GET /api/auth/basic/logout

Logout current session.

**Response:**

```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

#### GET /api/auth/login

OIDC authentication initiation.

**Response:**
Redirects to OIDC provider login page.

#### GET /api/auth/callback

OIDC authentication callback.

**Query Parameters:**

- `code` (string): Authorization code from OIDC provider
- `state` (string): Security state parameter

### Game Search & Discovery

#### GET /api/search

Search games with IGDB integration.

**Query Parameters:**

- `q` (string): Search query
- `page` (number): Page number (default: 1)
- `per_page` (number): Results per page (default: 20, max: 100)
- `autocomplete` (boolean): Return autocomplete suggestions

**Autocomplete Response:**

```json
{
  "success": true,
  "suggestions": [
    "The Legend of Zelda",
    "Zelda: Breath of the Wild",
    "Zelda: Tears of the Kingdom"
  ]
}
```

**Search Response:**

```json
{
  "success": true,
  "hits": [
    {
      "document": {
        "id": "72129",
        "name": "The Legend of Zelda: Breath of the Wild",
        "summary": "Game description...",
        "cover": {
          "url": "https://images.igdb.com/igdb/image/upload/t_cover_big/co1nqg.jpg"
        },
        "platforms": [{ "name": "Nintendo Switch" }, { "name": "Wii U" }],
        "genres": [{ "name": "Adventure" }, { "name": "Role-playing (RPG)" }],
        "rating": 97.5,
        "first_release_date": 1488499200
      }
    }
  ],
  "found": 1,
  "page": 1
}
```

#### POST /api/search

Advanced search with filters.

**Request:**

```json
{
  "query": "zelda",
  "platforms": ["Nintendo Switch"],
  "genres": ["Adventure"],
  "page": 1,
  "per_page": 20
}
```

### Games

#### GET /api/games/popular

Get popular games from IGDB.

**Query Parameters:**

- `page` (number): Page number (default: 1)
- `limit` (number): Results per page (default: 16)
- `user_id` (string): User ID for content filtering

**Response:**

```json
{
  "success": true,
  "games": [
    {
      "igdb_id": "72129",
      "title": "The Legend of Zelda: Breath of the Wild",
      "cover_url": "https://images.igdb.com/igdb/image/upload/t_cover_big/co1nqg.jpg",
      "rating": 97.5,
      "popularity_score": 98.2,
      "platforms": ["Nintendo Switch", "Wii U"],
      "genres": ["Adventure", "Role-playing (RPG)"]
    }
  ],
  "hasMore": true,
  "total": 1000
}
```

#### GET /api/games/recent

Get recently released games.

**Query Parameters:**

- `page` (number): Page number (default: 1)
- `limit` (number): Results per page (default: 16)
- `user_id` (string): User ID for content filtering

**Response:**

```json
{
  "success": true,
  "games": [...],
  "hasMore": true,
  "total": 500
}
```

#### GET /api/games/{id}

Get detailed game information by IGDB ID.

**Example:** `/api/games/72129`

**Response:**

```json
{
  "success": true,
  "game": {
    "igdb_id": "72129",
    "title": "The Legend of Zelda: Breath of the Wild",
    "summary": "Step into a world of discovery...",
    "cover_url": "https://images.igdb.com/igdb/image/upload/t_cover_big/co1nqg.jpg",
    "screenshots": [
      "https://images.igdb.com/igdb/image/upload/t_screenshot_big/sc1234.jpg"
    ],
    "videos": [
      {
        "video_id": "vNuOLHNR1bw",
        "name": "Official Trailer"
      }
    ],
    "platforms": ["Nintendo Switch", "Wii U"],
    "genres": ["Adventure", "Role-playing (RPG)"],
    "companies": ["Nintendo"],
    "game_modes": ["Single player"],
    "rating": 97.5,
    "release_date": "2017-03-03",
    "esrb_rating": "E10+",
    "is_mature": false,
    "is_nsfw": false,
    "content_rating": "Everyone 10+: Fantasy Violence, Mild Suggestive Themes"
  }
}
```

### Browse

#### GET /api/browse/genres/{slug}

Browse games by genre.

**Example:** `/api/browse/genres/role-playing-rpg`

**Query Parameters:**

- `page` (number): Page number
- `limit` (number): Results per page

**Response:**

```json
{
  "success": true,
  "genre": {
    "name": "Role-playing (RPG)",
    "slug": "role-playing-rpg"
  },
  "games": [...],
  "pagination": {
    "page": 1,
    "hasMore": true,
    "total": 2500
  }
}
```

#### GET /api/browse/publishers/{slug}

Browse games by publisher.

**Example:** `/api/browse/publishers/nintendo`

### Watchlist

#### POST /api/watchlist/add

Add game to user's watchlist.

**Request:**

```json
{
  "igdb_id": "72129"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Added to watchlist"
}
```

#### POST /api/watchlist/remove

Remove game from watchlist.

**Request:**

```json
{
  "igdb_id": "72129"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Removed from watchlist"
}
```

#### POST /api/watchlist/batch

Batch watchlist operations.

**Request:**

```json
{
  "gameIds": ["72129", "12345", "67890"],
  "action": "check_status"
}
```

**Response:**

```json
{
  "success": true,
  "watchlistStatuses": {
    "72129": true,
    "12345": false,
    "67890": true
  }
}
```

#### GET /api/watchlist/status/{id}

Check if game is in user's watchlist.

**Example:** `/api/watchlist/status/72129`

**Response:**

```json
{
  "success": true,
  "inWatchlist": true
}
```

### Game Requests

#### POST /api/request

Submit a new game request.

**Authentication Required:** Yes (API key or session)

**Required Scopes:** `requests:write` (for API keys)

**Request:**

```json
{
  "request_type": "game",
  "title": "The Legend of Zelda: Breath of the Wild",
  "igdb_id": "72129",
  "platforms": ["Nintendo Switch", "Wii U"],
  "priority": "medium",
  "description": "Would love to have this game in the library",
  "game_data": {
    "title": "The Legend of Zelda: Breath of the Wild",
    "summary": "Game description...",
    "cover_url": "https://images.igdb.com/...",
    "rating": 97.5,
    "platforms": ["Nintendo Switch", "Wii U"],
    "genres": ["Adventure", "RPG"]
  }
}
```

**Request Types:**

- `game` - Request a new game
- `update` - Request an update to existing game (include `update_type`, `new_information`, `existing_game`)
- `fix` - Report an issue with a game (include `issue_type`, `affected_platform`, `existing_game`)

**Priority Levels:**

- `low` - Nice to have
- `medium` - Would appreciate (default)
- `high` - Really want this
- `urgent` - Critical request

**Response:**

```json
{
  "success": true,
  "request": {
    "id": 123,
    "title": "The Legend of Zelda: Breath of the Wild",
    "request_type": "game",
    "priority": "medium",
    "status": "pending",
    "created_at": "2025-10-06T12:00:00Z"
  }
}
```

#### POST /api/request/rescind

Remove/rescind a game request.

**Request:**

```json
{
  "requestId": "uuid-request-id"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Request rescinded successfully"
}
```

### User Preferences

#### GET /api/user/preferences

Get user's content filtering preferences.

**Response:**

```json
{
  "success": true,
  "preferences": {
    "content_filter_level": "mild",
    "hide_mature_content": true,
    "hide_nsfw_content": true,
    "max_esrb_rating": "T",
    "custom_content_blocks": ["violence", "gambling"],
    "preferred_genres": ["Adventure", "RPG"],
    "excluded_genres": ["Horror", "Sports"],
    "apply_to_homepage": true,
    "apply_to_popular": true,
    "apply_to_recent": false,
    "apply_to_search": true
  }
}
```

#### POST /api/user/preferences

Update user preferences.

**Request:**

```json
{
  "content_filter_level": "strict",
  "hide_mature_content": true,
  "max_esrb_rating": "E10+",
  "custom_content_blocks": ["violence", "drug use"]
}
```

**Response:**

```json
{
  "success": true,
  "message": "Preferences updated successfully"
}
```

### IGDB Proxy

#### GET /api/igdb

Direct IGDB API proxy for game data.

**Query Parameters:**

- `action` (string): IGDB action (search, details, etc.)
- `query` (string): Search query
- `limit` (number): Result limit

#### POST /api/igdb

Advanced IGDB queries.

**Request:**

```json
{
  "action": "search",
  "query": "zelda",
  "limit": 10
}
```

### ROMM Integration

#### GET /api/romm/recent

Get recently added ROMs from ROMM library.

**Query Parameters:**

- `page` (number): Page number
- `limit` (number): Results per page

**Response:**

```json
{
  "success": true,
  "roms": [
    {
      "id": "123",
      "name": "Super Mario Bros.",
      "platform": "NES",
      "added_at": "2025-09-29T12:00:00Z"
    }
  ],
  "hasMore": true
}
```

#### POST /api/romm/cross-reference

Cross-reference games with ROMM library.

**Request:**

```json
{
  "gameIds": ["72129", "12345"]
}
```

**Response:**

```json
{
  "success": true,
  "enrichedGames": [
    {
      "igdb_id": "72129",
      "name": "The Legend of Zelda: Breath of the Wild",
      "romm_available": true,
      "romm_url": "http://romm-server/rom/123"
    }
  ]
}
```

#### POST /api/romm/clear-cache

Clear ROMM integration cache.

**Response:**

```json
{
  "success": true,
  "message": "ROMM cache cleared"
}
```

### Image Proxy

#### GET /api/images/proxy

Proxy and cache external images.

**Query Parameters:**

- `url` (string): Image URL to proxy

**Example:** `/api/images/proxy?url=https://images.igdb.com/igdb/image/upload/t_cover_big/co1nqg.jpg`

**Response:** Image binary data with appropriate headers.

### Cache Management

#### GET /api/cache/stats

Get cache statistics.

**Response:**

```json
{
  "success": true,
  "stats": {
    "redis": {
      "connected": true,
      "keyCount": 1250,
      "memoryUsed": "15.2MB"
    },
    "memory": {
      "keyCount": 500,
      "estimatedSize": "5.1MB"
    }
  }
}
```

#### POST /api/cache/clear

Clear all cache data.

**Response:**

```json
{
  "success": true,
  "message": "Cache cleared successfully"
}
```

#### POST /api/cache/cleanup

Clean up expired cache entries.

**Query Parameters:**

- `type` (string): Cache type to clean (redis, memory, all)

### Admin Endpoints

#### POST /api/admin/clear-cache

Admin cache management.

**Request:**

```json
{
  "gameId": "72129",
  "clearEsrbOnly": false
}
```

### Setup & Configuration

#### POST /api/setup/check

Check service connectivity during setup.

**Request:**

```json
{
  "service": "igdb_api"
}
```

**Response:**

```json
{
  "success": true,
  "service": "igdb_api",
  "status": "connected",
  "details": "IGDB API accessible"
}
```

### Webhooks

#### POST /api/webhooks

Receive webhook notifications for external integrations.

**Headers:**

```http
Content-Type: application/json
X-Webhook-Secret: <configured-secret>
```

**Request:**

```json
{
  "type": "game.requested",
  "title": "New Game Request",
  "message": "User requested: The Legend of Zelda",
  "priority": 5,
  "data": {
    "game_id": "72129",
    "user_id": "123"
  }
}
```

**Response:**

```json
{
  "success": true,
  "results": {
    "gotify": {
      "id": 456,
      "message": "Notification sent"
    },
    "n8n": {
      "status": "processed"
    }
  }
}
```

## Error Responses

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Error message describing what went wrong",
  "code": "ERROR_CODE",
  "details": "Additional error context"
}
```

### Common Error Codes

- `UNAUTHORIZED` - Authentication required or failed
- `FORBIDDEN` - Insufficient permissions
- `NOT_FOUND` - Resource not found
- `VALIDATION_ERROR` - Invalid request parameters
- `RATE_LIMITED` - Too many requests
- `SERVER_ERROR` - Internal server error
- `SERVICE_UNAVAILABLE` - External service unavailable

### HTTP Status Codes

- `200` - Success
- `400` - Bad Request (validation error)
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `429` - Rate Limited
- `500` - Internal Server Error

## Rate Limiting

Rate limiting is applied per endpoint (when configured):

- **Authenticated users**: 1000 requests/hour
- **Unauthenticated**: 100 requests/hour
- **Admin users**: 5000 requests/hour

Rate limit headers:

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1640995200
```

## Pagination

List endpoints support pagination with consistent parameters:

**Query Parameters:**

- `page` (number): Page number (starts at 1)
- `limit` or `per_page` (number): Items per page (max: 100)

**Response Format:**

```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 1000,
    "hasMore": true
  }
}
```

## Content Filtering

Many game endpoints support content filtering based on user preferences:

**Query Parameters:**

- `user_id` (string): User ID for applying content filters

Filtering automatically applies:

- ESRB rating restrictions
- Mature content blocking
- NSFW content blocking
- Custom content blocks
- Genre exclusions

## Integration Examples

### JavaScript/Node.js

**With API Key:**

```javascript
const API_KEY = process.env.GGR_API_KEY; // Store securely in environment variables

// Search for games
const response = await fetch(
  "https://your-domain.com/api/search?q=zelda&page=1&per_page=10",
  {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
    },
  },
);
const data = await response.json();

// Add to watchlist
await fetch("https://your-domain.com/api/watchlist/add", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ igdb_id: "72129" }),
});

// Get popular games
const popular = await fetch(
  "https://your-domain.com/api/games/popular?limit=20",
  {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
    },
  },
);
const games = await popular.json();
```

**With Session Cookies (Browser):**

```javascript
// Search for games
const response = await fetch("/api/search?q=zelda&page=1&per_page=10");
const data = await response.json();

// Add to watchlist
await fetch("/api/watchlist/add", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ igdb_id: "72129" }),
});
```

### cURL

**With API Key:**

```bash
# Store your API key
export GGR_API_KEY="ggr_your_api_key_here"

# Get game details
curl -H "Authorization: Bearer $GGR_API_KEY" \
     "https://your-domain.com/api/games/72129"

# Search for games
curl -H "Authorization: Bearer $GGR_API_KEY" \
     "https://your-domain.com/api/search?q=zelda"

# Add to watchlist
curl -X POST \
     -H "Authorization: Bearer $GGR_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"igdb_id":"72129"}' \
     "https://your-domain.com/api/watchlist/add"

# Get popular games with filtering
curl -H "Authorization: Bearer $GGR_API_KEY" \
     "https://your-domain.com/api/games/popular?page=1&limit=20"
```

**With Session Cookie:**

```bash
# Get game details
curl "https://your-domain.com/api/games/72129"

# Search with authentication
curl -H "Cookie: session=your-token" \
     "https://your-domain.com/api/search?q=zelda"

# Add to watchlist
curl -X POST \
     -H "Content-Type: application/json" \
     -H "Cookie: session=your-token" \
     -d '{"igdb_id":"72129"}' \
     "https://your-domain.com/api/watchlist/add"
```

### Python

**With API Key:**

```python
import requests
import os

# Load API key from environment
API_KEY = os.getenv('GGR_API_KEY')
BASE_URL = 'https://your-domain.com/api'

# Create session with auth header
session = requests.Session()
session.headers.update({
    'Authorization': f'Bearer {API_KEY}',
    'Content-Type': 'application/json'
})

# Search for games
response = session.get(f'{BASE_URL}/search', params={
    'q': 'zelda',
    'page': 1,
    'per_page': 10
})
games = response.json()

# Add to watchlist
response = session.post(f'{BASE_URL}/watchlist/add',
    json={'igdb_id': '72129'})
result = response.json()

# Get popular games
response = session.get(f'{BASE_URL}/games/popular', params={
    'page': 1,
    'limit': 20
})
popular_games = response.json()

# Get game details
response = session.get(f'{BASE_URL}/games/72129')
game = response.json()
```

**With Session Cookie:**

```python
import requests

# Search for games
response = requests.get('https://your-domain.com/api/search', {
    'q': 'zelda',
    'page': 1,
    'per_page': 10
})
games = response.json()

# Add to watchlist with session
session = requests.Session()
session.cookies.set('session', 'your-session-token')
session.post('https://your-domain.com/api/watchlist/add',
             json={'igdb_id': '72129'})
```

## API Versioning

Current API version: **v1**

Version information available at `/api/version`

Future versions will be available at `/api/v2/...` with backwards compatibility maintained for v1.

## External Service Integration

GG Requestz integrates with:

- **IGDB API** - Game data and search
- **ROMM** - Personal ROM library management
- **Gotify** - Push notifications
- **n8n** - Workflow automation
- **Redis** - Caching and session storage

See [Integration Guide](guides/INTEGRATION_GUIDE.md) for detailed setup instructions.
