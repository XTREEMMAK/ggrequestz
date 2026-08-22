# Configuration Guide

Complete reference for all GG Requestz configuration options.

## Environment Variables

### System Configuration

| Variable               | Description                                   | Default                 | Required       |
| ---------------------- | --------------------------------------------- | ----------------------- | -------------- |
| `PUID`                 | User ID for file permissions                  | `1000`                  | No             |
| `PGID`                 | Group ID for file permissions                 | `1000`                  | No             |
| `TZ`                   | Timezone                                      | `UTC`                   | No             |
| `APP_PORT`             | Application port                              | `3000`                  | No             |
| `NODE_ENV`             | Environment mode                              | `production`            | No             |
| `PM2_INSTANCES`        | PM2 worker instances                          | `max`                   | No             |
| `PM2_CRON_RESTART`     | Cron expression for scheduled worker restarts | -                       | No             |
| `PUBLIC_SITE_URL`      | Public URL for API docs and external links    | `http://localhost:3000` | No             |
| `ORIGIN`               | Canonical origin for CSRF and OIDC redirects  | `PUBLIC_SITE_URL`       | Behind a proxy |
| `UPDATE_CHECK_ENABLED` | Check GitHub for newer releases               | `true`                  | No             |

`ORIGIN` matters more than it looks. `adapter-node` rejects any form submission
whose `Origin` header disagrees with it, so a wrong value makes logins fail with
"Cross-site POST form submissions are forbidden" while GET requests work fine.

`UPDATE_CHECK_ENABLED` controls the only outbound call the app makes on its own
behalf: an unauthenticated request to the GitHub releases API, at most once every
six hours, backing off to 24 hours while it keeps failing. Set it to `false` on an
air-gapped install or anywhere the app should not reach out; the sidebar simply
shows no update indicator. Failures never affect a page render; they are logged
with their status code and nothing is shown to the user. `false`, `0`, `no` and
`off` all disable it.

### Database Configuration

| Variable            | Description                              | Default      | Required |
| ------------------- | ---------------------------------------- | ------------ | -------- |
| `POSTGRES_HOST`     | PostgreSQL host                          | `postgres`   | Yes      |
| `POSTGRES_PORT`     | PostgreSQL port                          | `5432`       | Yes      |
| `POSTGRES_DB`       | Database name                            | `ggrequestz` | Yes      |
| `POSTGRES_USER`     | Database user                            | `postgres`   | Yes      |
| `POSTGRES_PASSWORD` | Database password                        | -            | **Yes**  |
| `AUTO_MIGRATE`      | Auto-run migrations                      | `true`       | No       |
| `POSTGRES_POOL_MAX` | Max pool connections, **per PM2 worker** | `10`         | No       |

With `PM2_INSTANCES=max`, the real connection ceiling is `POSTGRES_POOL_MAX`
multiplied by your core count. Raise Postgres's `max_connections` to match
before increasing it.

### Authentication

| Variable         | Description                                                          | Default | Required |
| ---------------- | -------------------------------------------------------------------- | ------- | -------- |
| `AUTH_METHOD`    | Authentication method (`basic`, `oidc`, `oidc_generic`, `authentik`) | `basic` | Yes      |
| `SESSION_SECRET` | Session encryption key (32+ chars)                                   | -       | **Yes**  |

#### Basic Auth

No additional configuration needed. Admin account created on first visit. New users can register at `/register`.

#### Authentik Configuration

| Variable                  | Description          | Required                 |
| ------------------------- | -------------------- | ------------------------ |
| `AUTHENTIK_CLIENT_ID`     | OAuth2 client ID     | Yes (if using Authentik) |
| `AUTHENTIK_CLIENT_SECRET` | OAuth2 client secret | Yes (if using Authentik) |
| `AUTHENTIK_ISSUER`        | Authentik issuer URL | Yes (if using Authentik) |

#### Generic OIDC Configuration

| Variable             | Description                                                    | Required                             |
| -------------------- | -------------------------------------------------------------- | ------------------------------------ |
| `OIDC_CLIENT_ID`     | OIDC client ID                                                 | Yes (if using OIDC)                  |
| `OIDC_CLIENT_SECRET` | OIDC client secret                                             | Yes (if using OIDC)                  |
| `OIDC_ISSUER_URL`    | OIDC provider URL                                              | Yes (if using OIDC)                  |
| `OIDC_REDIRECT_URI`  | OAuth callback URL                                             | Yes (if using OIDC)                  |
| `OIDC_SCOPES`        | OAuth scopes, space-separated                                  | No (default: `openid profile email`) |
| `OIDC_PROVIDER_NAME` | Login button label, rendered as "Login with &lt;name&gt;"      | No (default: `SSO`)                  |
| `OIDC_GROUPS_CLAIM`  | Name of the claim carrying group membership                    | No (default: `groups`)               |
| `OIDC_ROLE_MAP`      | Group-to-role mapping, e.g. `my-admins:admin,my-staff:manager` | No                                   |
| `OIDC_ADMIN_GROUP`   | Members of this group are granted admin                        | No                                   |

Endpoints are discovered from `<OIDC_ISSUER_URL>/.well-known/openid-configuration`.
For providers without a discovery document, set them manually with
`OIDC_AUTH_URL`, `OIDC_TOKEN_URL`, `OIDC_USERINFO_URL`, `OIDC_JWKS_URI` and
`OIDC_END_SESSION_URL`.

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

#### Game Library

The library integration is backend-neutral. `LIBRARY_*` is the current spelling
of these settings and `LIBRARY_KIND` selects which backend to talk to.

| Variable             | Description                                                                               | Default       |
| -------------------- | ----------------------------------------------------------------------------------------- | ------------- |
| `LIBRARY_KIND`       | Backend: `romm`, `gaseous` or `retrom`. An unknown value is refused rather than defaulted | `romm`        |
| `LIBRARY_URL`        | Server-side API base. Prefer an internal hostname                                         | -             |
| `LIBRARY_PUBLIC_URL` | Browser-facing base for links and cover images                                            | `LIBRARY_URL` |
| `LIBRARY_API_TOKEN`  | API token, where the backend uses one                                                     | -             |
| `LIBRARY_USERNAME`   | Username, where the backend authenticates that way                                        | -             |
| `LIBRARY_PASSWORD`   | Password, where the backend authenticates that way                                        | -             |

Per-backend setup, including which capabilities each one supports and what it
needs in place of a token, is in
[guides/INTEGRATIONS.md](guides/INTEGRATIONS.md).

##### Local library index

Optional. When enabled, the app walks the whole library on a timer and keeps a
local copy in Postgres, then answers listing, search and cross-reference queries
from there instead of calling the backend on a render path.

| Variable                       | Description                                                              | Default           |
| ------------------------------ | ------------------------------------------------------------------------ | ----------------- |
| `LIBRARY_SYNC_ENABLED`         | Run the index sync. Only the literal string `true` enables it            | `false`           |
| `LIBRARY_SYNC_INTERVAL_MS`     | How often a pass runs                                                    | `900000` (15 min) |
| `LIBRARY_SYNC_BATCH`           | Entries per batch. One database statement and one backend page per batch | `500`             |
| `LIBRARY_SYNC_MAX_SWEEP_RATIO` | Largest share of the indexed library one completed pass may mark removed | `0.5`             |

**Off by default, deliberately.** Enabling it means an upgraded install starts
walking its entire library on a timer, so it has to be asked for. Every read
still falls back to the backend when no pass has completed.

Two things follow from that default, both worth knowing before you leave it off:

- Backends that cannot list recently-added games or search server-side answer
  those queries only from the index. `retrom` is the case that matters, so
  leaving the sync off there means those two features never work rather than
  working slowly.
- The cross-reference that decides whether a game is already in your library
  reads the index when one exists, and otherwise falls back to inspecting only
  the most recently added titles. On a large library that fallback misses most
  of it.

`LIBRARY_SYNC_MAX_SWEEP_RATIO` is a safety valve, not a tuning knob. A pass only
removes entries after enumerating the whole backend without error, so a failed
walk already sweeps nothing. This covers the backend that answers honestly and
answers empty, after its own database is reset or its ROM volume is unmounted:
without the ratio, one such pass would mark the entire index removed. Entries are
marked with a timestamp rather than deleted, so a refused or mistaken sweep is
recoverable.

##### The ROMM names still work

| Variable                 | Description                                                              | Default           |
| ------------------------ | ------------------------------------------------------------------------ | ----------------- |
| `ROMM_SERVER_URL`        | ROMM server URL for server-side API calls. Prefer an internal hostname   | -                 |
| `ROMM_SERVER_URL_PUBLIC` | Browser-facing ROMM URL for links and cover images                       | `ROMM_SERVER_URL` |
| `ROMM_API_TOKEN`         | Client API Token with the `roms.read` scope (RomM 5.0+, **recommended**) | -                 |
| `ROMM_USERNAME`          | ROMM username (fallback for RomM 4.x)                                    | -                 |
| `ROMM_PASSWORD`          | ROMM password (fallback for RomM 4.x)                                    | -                 |

Each `ROMM_*` name above is read as a fallback for the `LIBRARY_*` on the same
row, so an existing install upgrades without touching its configuration. This is
the same trade `REQUEST_WEBHOOK_URL` made with `N8N_WEBHOOK_URL`. When both are
set, the `LIBRARY_*` value wins.

That precedence is the reason the `LIBRARY_*` entries in `.env.example` ship
commented out: an uncommented `LIBRARY_URL` silently overrides a
`ROMM_SERVER_URL` the operator has already configured.

Set `ROMM_SERVER_URL_PUBLIC` only when the two differ. On Kubernetes, or any
setup where the app reaches ROMM over an internal network the browser cannot,
`ROMM_SERVER_URL` is a service address like `http://romm.media.svc:8080` while
users need `https://romm.example.com`. Without the split, "Play in ROMM" links
and ROMM cover images point at an address the browser cannot resolve:

```env
ROMM_SERVER_URL=http://romm.media.svc:8080
ROMM_SERVER_URL_PUBLIC=https://romm.example.com
```

`ROMM_API_TOKEN` is preferred: it does not expire, and it avoids storing a
password. The account behind either method must hold the `roms.read` scope:
RomM issues a token containing only the scopes the account actually has, so an
under-privileged account authenticates successfully and then gets a 403 on every
library request.

#### Gotify Notifications

| Variable       | Description       | Default |
| -------------- | ----------------- | ------- |
| `GOTIFY_URL`   | Gotify server URL | -       |
| `GOTIFY_TOKEN` | Gotify app token  | -       |

#### Outbound Request Webhook

Posts request events as JSON to any endpoint that accepts them: n8n, a download
automation service, a script, a chat bridge. See
[Integrations](guides/INTEGRATIONS.md) for the payload.

| Variable              | Description                                    | Default |
| --------------------- | ---------------------------------------------- | ------- |
| `REQUEST_WEBHOOK_URL` | Endpoint receiving request events              | -       |
| `N8N_WEBHOOK_URL`     | Deprecated alias for the above; still honoured | -       |

`N8N_WEBHOOK_URL` continues to work, so existing installs need no change. When
both are set, `REQUEST_WEBHOOK_URL` wins.

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

### Services

`docker-compose.yml` defines exactly three services (`ggrequestz`, `postgres`
and `redis`) and **no Compose profiles**. Older documentation referred to
`--profile notifications`, `--profile proxy`, `--profile search` and
`--profile all`; those select nothing. Gotify, n8n and a reverse proxy are
things you run yourself and point the app at.

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
