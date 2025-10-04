# Configuration Guide

Complete reference for all GG Requestz configuration options.

## Environment Variables

### System Configuration

| Variable          | Description                                | Default                 | Required |
| ----------------- | ------------------------------------------ | ----------------------- | -------- |
| `PUID`            | User ID for file permissions               | `1000`                  | No       |
| `PGID`            | Group ID for file permissions              | `1000`                  | No       |
| `TZ`              | Timezone                                   | `UTC`                   | No       |
| `APP_PORT`        | Application port                           | `3000`                  | No       |
| `NODE_ENV`        | Environment mode                           | `production`            | No       |
| `PM2_INSTANCES`   | PM2 worker instances                       | `max`                   | No       |
| `PUBLIC_SITE_URL` | Public URL for API docs and external links | `http://localhost:3000` | No       |

### Database Configuration

| Variable            | Description         | Default      | Required |
| ------------------- | ------------------- | ------------ | -------- |
| `POSTGRES_HOST`     | PostgreSQL host     | `postgres`   | Yes      |
| `POSTGRES_PORT`     | PostgreSQL port     | `5432`       | Yes      |
| `POSTGRES_DB`       | Database name       | `ggrequestz` | Yes      |
| `POSTGRES_USER`     | Database user       | `postgres`   | Yes      |
| `POSTGRES_PASSWORD` | Database password   | -            | **Yes**  |
| `AUTO_MIGRATE`      | Auto-run migrations | `true`       | No       |

### Authentication

| Variable         | Description                                                  | Default | Required |
| ---------------- | ------------------------------------------------------------ | ------- | -------- |
| `AUTH_METHOD`    | Authentication method (`basic`, `authentik`, `oidc_generic`) | `basic` | Yes      |
| `SESSION_SECRET` | Session encryption key (32+ chars)                           | -       | **Yes**  |

#### Basic Auth

No additional configuration needed. Admin account created on first visit. New users can register at `/register`.

#### Authentik Configuration

| Variable                  | Description          | Required                 |
| ------------------------- | -------------------- | ------------------------ |
| `AUTHENTIK_CLIENT_ID`     | OAuth2 client ID     | Yes (if using Authentik) |
| `AUTHENTIK_CLIENT_SECRET` | OAuth2 client secret | Yes (if using Authentik) |
| `AUTHENTIK_ISSUER`        | Authentik issuer URL | Yes (if using Authentik) |

#### Generic OIDC Configuration

| Variable             | Description        | Required                             |
| -------------------- | ------------------ | ------------------------------------ |
| `OIDC_CLIENT_ID`     | OIDC client ID     | Yes (if using OIDC)                  |
| `OIDC_CLIENT_SECRET` | OIDC client secret | Yes (if using OIDC)                  |
| `OIDC_ISSUER_URL`    | OIDC provider URL  | Yes (if using OIDC)                  |
| `OIDC_REDIRECT_URI`  | OAuth callback URL | Yes (if using OIDC)                  |
| `OIDC_SCOPE`         | OAuth scopes       | No (default: `openid profile email`) |

### IGDB API (Required)

| Variable             | Description              | Required |
| -------------------- | ------------------------ | -------- |
| `IGDB_CLIENT_ID`     | Twitch app client ID     | **Yes**  |
| `IGDB_CLIENT_SECRET` | Twitch app client secret | **Yes**  |

Get these from [Twitch Developer Console](https://dev.twitch.tv/console):

1. Create a new application
2. Set OAuth Redirect URL to `http://localhost`
3. Copy Client ID and Client Secret

### Optional Services

#### Redis Cache

| Variable    | Description          | Default              |
| ----------- | -------------------- | -------------------- |
| `REDIS_URL` | Redis connection URL | `redis://redis:6379` |

If not configured, falls back to in-memory caching.

#### ROMM Integration

| Variable          | Description     | Default |
| ----------------- | --------------- | ------- |
| `ROMM_SERVER_URL` | ROMM server URL | -       |
| `ROMM_USERNAME`   | ROMM username   | -       |
| `ROMM_PASSWORD`   | ROMM password   | -       |

#### Gotify Notifications

| Variable       | Description       | Default |
| -------------- | ----------------- | ------- |
| `GOTIFY_URL`   | Gotify server URL | -       |
| `GOTIFY_TOKEN` | Gotify app token  | -       |

#### n8n Webhooks

| Variable          | Description          | Default |
| ----------------- | -------------------- | ------- |
| `N8N_WEBHOOK_URL` | n8n webhook endpoint | -       |

## Docker Compose Configuration

### Using External Services

To use external PostgreSQL or Redis:

1. Remove the service from `docker-compose.yml`
2. Update the connection variables in `.env`
3. Ensure network connectivity

> **Note**: As of v1.1.4, Typesense has been removed and is no longer supported. All search functionality now uses direct IGDB API integration.

Example for external PostgreSQL:

```bash
POSTGRES_HOST=your-external-db.com
POSTGRES_PORT=5432
POSTGRES_USER=your_user
POSTGRES_PASSWORD=your_password
```

### Profiles

Docker Compose profiles for optional components:

```bash
# Start with notifications
docker compose --profile notifications up -d

# Start with reverse proxy
docker compose --profile proxy up -d
```

## File Permissions

For proper file permissions in Docker:

1. Find your user/group IDs:

```bash
id -u  # User ID (PUID)
id -g  # Group ID (PGID)
```

2. Set in `.env`:

```bash
PUID=1000
PGID=1000
```

## Security Best Practices

1. **Change default passwords** - Never use default database passwords
2. **Generate secure secrets** - Use 32+ character random strings for `SESSION_SECRET`
3. **Use HTTPS in production** - Set up SSL with reverse proxy
4. **Restrict database access** - Don't expose PostgreSQL port publicly
5. **Keep images updated** - Regularly pull latest Docker images

## Debug Environment Variables

### Development Debugging

The application supports several DEBUG environment variables for development debugging:

#### Core Debug Flags

- `DEBUG_AGE_RATINGS=true` - Enable detailed logging for age rating processing from IGDB API
- `DEBUG_IGDB_QUERIES=true` - Enable logging for all IGDB API queries and responses
- `DEBUG_USER_AUTH=true` - Enable detailed user authentication debugging and session validation

#### Performance Debug Flags

- `VITE_DEBUG_VIEWPORT_CACHING=true` - Enable verbose logging for viewport-based preloading and mobile cache optimization (client-side)

#### Usage Examples

```bash
# Enable all debug logging
DEBUG_AGE_RATINGS=true DEBUG_IGDB_QUERIES=true DEBUG_USER_AUTH=true VITE_DEBUG_VIEWPORT_CACHING=true npm run dev

# Enable only viewport caching debug (useful for mobile optimization)
VITE_DEBUG_VIEWPORT_CACHING=true npm run dev

# Enable only authentication debug
DEBUG_USER_AUTH=true npm run dev
```

## Mobile Caching Strategy

The application includes enhanced mobile caching with the following features:

### Viewport Observer

- **Mobile Detection**: Automatically detects mobile devices and applies aggressive caching
- **Intersection Observer**: Uses browser API to detect when game cards enter viewport
- **Preloading**: Automatically caches game details, images, and screenshots for mobile users

### Configuration

- **Desktop**: Standard hover-based preloading with 50px/100px margins
- **Mobile**: Aggressive preloading with 100px/200px margins and automatic background caching
- **Debug**: Use `VITE_DEBUG_VIEWPORT_CACHING=true` to monitor cache performance

### Cache Behavior

- **Images**: Lazy loaded with skeleton states
- **Game Data**: Pre-cached via `/api/games/{id}` when cards enter viewport
- **Screenshots**: First 2-3 screenshots pre-cached for mobile users
- **Batching**: Mobile requests are batched to avoid overwhelming slower networks

## Troubleshooting

### Environment Variables Not Loading

Docker Compose automatically loads `.env` from the same directory. Ensure:

- File is named exactly `.env` (not `.env.docker` or other)
- File is in same directory as `docker-compose.yml`
- No syntax errors in `.env` file

### Permission Denied Errors

Set correct PUID/PGID in `.env`:

```bash
PUID=$(id -u)
PGID=$(id -g)
```

### Database Connection Failed

Check PostgreSQL is running:

```bash
docker compose logs postgres
docker compose ps
```

## Migration Notes

### From v1.0.2

If upgrading from v1.0.2:

1. Rename `.env.docker` to `.env`
2. Add PUID/PGID variables
3. Pull new images: `docker compose pull`
4. Restart: `docker compose up -d`

### From v1.1.3 and earlier (Typesense Removal)

If upgrading from v1.1.3 or earlier:

1. **Remove Typesense configuration** from your `.env` file:

   ```bash
   # Remove these lines:
   # TYPESENSE_HOST=typesense
   # TYPESENSE_PORT=8108
   # TYPESENSE_PROTOCOL=http
   # TYPESENSE_API_KEY=xyz123
   ```

2. **Update Docker Compose** - Remove the `typesense` service from your `docker-compose.yml` if present

3. **Clean up containers**:

   ```bash
   docker compose down
   docker compose pull
   docker compose up -d
   ```

4. **No data loss** - All game data remains in your PostgreSQL database. The search now uses direct IGDB API calls for better performance and accuracy.
