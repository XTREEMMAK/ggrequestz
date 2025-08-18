# API Documentation

## Base URL

```
http://localhost:5173/api  # Development
https://your-domain.com/api  # Production
```

## Authentication

All API endpoints require authentication unless specified otherwise.

### Headers

```http
Cookie: session=<session-token>
Content-Type: application/json
```

## Endpoints

### Version & Health

#### GET /api/version

Returns application version and feature information.

**Response:**

```json
{
  "version": "1.0.0",
  "name": "gg-requestz",
  "environment": "production",
  "features": {
    "oidc": true,
    "basicAuth": true,
    "redis": true,
    "romm": true,
    "typesense": true
  }
}
```

#### GET /api/health

Health check endpoint.

**Response:**

```json
{
  "status": "healthy",
  "timestamp": "2024-01-13T12:00:00Z",
  "services": {
    "database": "connected",
    "redis": "connected",
    "igdb": "connected"
  }
}
```

### Authentication

#### POST /api/auth/basic/login

Basic authentication login.

**Request:**

```json
{
  "username": "user@example.com",
  "password": "password123"
}
```

**Response:**

```json
{
  "success": true,
  "user": {
    "id": "123",
    "username": "user@example.com",
    "role": "user"
  }
}
```

#### POST /api/auth/logout

Logout current session.

**Response:**

```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

### Games

#### GET /api/games/search

Search games with optional filters.

**Query Parameters:**

- `q` (string): Search query
- `limit` (number): Results per page (default: 20)
- `offset` (number): Pagination offset
- `platforms` (string): Comma-separated platform IDs
- `genres` (string): Comma-separated genre IDs

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "123",
      "igdb_id": "456",
      "title": "Game Title",
      "cover_url": "https://...",
      "rating": 85,
      "release_date": "2024-01-01",
      "platforms": ["PC", "PS5"],
      "genres": ["Action", "RPG"]
    }
  ],
  "total": 100,
  "page": 1
}
```

#### GET /api/games/popular

Get popular games.

**Query Parameters:**

- `page` (number): Page number
- `limit` (number): Results per page (default: 16)

**Response:**

```json
{
  "success": true,
  "games": [...],
  "hasMore": true
}
```

#### GET /api/games/recent

Get recently released games.

**Query Parameters:**

- `page` (number): Page number
- `limit` (number): Results per page (default: 16)

**Response:**

```json
{
  "success": true,
  "games": [...],
  "hasMore": true
}
```

#### GET /api/games/:id

Get game details by ID.

**Response:**

```json
{
  "success": true,
  "game": {
    "id": "123",
    "title": "Game Title",
    "summary": "Game description...",
    "cover_url": "https://...",
    "screenshots": [...],
    "videos": [...],
    "platforms": [...],
    "genres": [...],
    "companies": [...],
    "game_modes": [...],
    "rating": 85,
    "release_date": "2024-01-01"
  }
}
```

### Requests

#### GET /api/requests

Get all game requests.

**Query Parameters:**

- `status` (string): Filter by status (pending, approved, rejected)
- `user_id` (string): Filter by user

**Response:**

```json
{
  "success": true,
  "requests": [
    {
      "id": "123",
      "game_id": "456",
      "user_id": "789",
      "status": "pending",
      "notes": "Please add this game",
      "created_at": "2024-01-01T12:00:00Z"
    }
  ]
}
```

#### POST /api/requests

Create a new game request.

**Request:**

```json
{
  "game_id": "456",
  "notes": "Please add this game"
}
```

**Response:**

```json
{
  "success": true,
  "request": {
    "id": "123",
    "status": "pending"
  }
}
```

#### DELETE /api/requests/:id

Delete a game request (admin only).

**Response:**

```json
{
  "success": true,
  "message": "Request deleted"
}
```

### Watchlist

#### GET /api/watchlist

Get user's watchlist.

**Response:**

```json
{
  "success": true,
  "watchlist": [
    {
      "id": "123",
      "game_id": "456",
      "added_at": "2024-01-01T12:00:00Z"
    }
  ]
}
```

#### POST /api/watchlist

Add game to watchlist.

**Request:**

```json
{
  "game_id": "456"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Added to watchlist"
}
```

#### DELETE /api/watchlist/:game_id

Remove game from watchlist.

**Response:**

```json
{
  "success": true,
  "message": "Removed from watchlist"
}
```

### Admin

#### GET /api/admin/settings

Get application settings (admin only).

**Response:**

```json
{
  "success": true,
  "settings": {
    "auth_method": "oidc_generic",
    "igdb_configured": true,
    "romm_configured": true,
    "redis_configured": true
  }
}
```

#### POST /api/admin/settings/update

Update application settings (admin only).

**Request:**

```json
{
  "setting_key": "value"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Settings updated"
}
```

#### GET /api/admin/users

Get all users (admin only).

**Query Parameters:**

- `role` (string): Filter by role (admin, user)

**Response:**

```json
{
  "success": true,
  "users": [
    {
      "id": "123",
      "username": "user@example.com",
      "role": "user",
      "created_at": "2024-01-01T12:00:00Z"
    }
  ]
}
```

### ROMM Integration

#### GET /api/romm/games

Get games from ROMM library.

**Response:**

```json
{
  "success": true,
  "games": [...],
  "total": 100
}
```

#### GET /api/romm/recent

Get recently added ROMs.

**Query Parameters:**

- `page` (number): Page number
- `limit` (number): Results per page

**Response:**

```json
{
  "success": true,
  "roms": [...],
  "hasMore": true
}
```

### Webhooks

#### POST /api/webhooks

Receive webhook notifications.

**Headers:**

```http
X-Webhook-Secret: <configured-secret>
```

**Request:**

```json
{
  "event": "game.added",
  "data": {
    "game_id": "123",
    "title": "New Game"
  }
}
```

**Response:**

```json
{
  "success": true,
  "processed": true
}
```

## Error Responses

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

### Common Error Codes

- `UNAUTHORIZED` - Authentication required
- `FORBIDDEN` - Insufficient permissions
- `NOT_FOUND` - Resource not found
- `VALIDATION_ERROR` - Invalid input
- `RATE_LIMITED` - Too many requests
- `SERVER_ERROR` - Internal server error

## Rate Limiting

API endpoints are rate-limited (when configured):

- **Authenticated users**: 1000 requests/hour
- **Unauthenticated**: 100 requests/hour

Rate limit headers:

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1642080000
```

## Pagination

List endpoints support pagination:

- `page` or `offset` - Starting position
- `limit` - Items per page (max: 100)

Response includes:

```json
{
  "data": [...],
  "total": 1000,
  "page": 1,
  "hasMore": true
}
```

## WebSocket Events (Future)

WebSocket endpoint: `ws://localhost:5173/ws`

### Events

- `game.request.created`
- `game.request.approved`
- `game.added`
- `watchlist.updated`

### Message Format

```json
{
  "event": "event.name",
  "data": {},
  "timestamp": "2024-01-01T12:00:00Z"
}
```
