# 🚀 GG Requestz Quick Start Guide

Get GG Requestz running in 5 minutes with Docker Compose.

## Prerequisites

- Docker & Docker Compose installed
- IGDB API credentials ([Get them here](https://dev.twitch.tv/console))

## Quick Setup

### 1. Clone & Configure

```bash
# Clone the repository
git clone https://github.com/XTREEMMAK/ggrequestz.git
cd ggrequestz

# Copy environment template
cp .env.example .env

# Edit .env with your settings
nano .env
```

### 2. Required Settings

Edit `.env` and update these required values:

```bash
# Set your timezone and user IDs (optional but recommended)
PUID=1000           # Your user ID (run: id -u)
PGID=1000           # Your group ID (run: id -g)
TZ=America/New_York # Your timezone

# Database password (change from default!)
POSTGRES_PASSWORD=your_secure_password_here

# IGDB API (get from Twitch Developer Console)
IGDB_CLIENT_ID=your_igdb_client_id
IGDB_CLIENT_SECRET=your_igdb_client_secret

# Session security (generate a random 32+ character string)
SESSION_SECRET=generate_random_32_character_string_here

# Choose authentication method: basic, oidc, oidc_generic, or authentik
# (the last three are equivalent and all select OIDC/SSO)
AUTH_METHOD=basic
```

### 3. Start the Application

```bash
# Start all services
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f ggrequestz
```

### 4. Access the Application

1. Open http://localhost:3000 in your browser
2. If using `AUTH_METHOD=basic`, you'll be prompted to create an admin account
3. Start adding and managing game requests!

## Using Pre-built Images

By default, Docker Compose will pull the pre-built image from GitHub Container Registry:

```bash
docker compose pull
docker compose up -d
```

To build locally instead:

```bash
docker compose build
docker compose up -d
```

## Common Commands

```bash
# Stop all services
docker compose down

# Update to latest version
docker compose pull
docker compose up -d

# View logs
docker compose logs -f

# Restart a service
docker compose restart ggrequestz

# Remove everything (including data)
docker compose down -v
```

## Authentication Options

### Basic Auth (Simplest)

Set `AUTH_METHOD=basic` in `.env`. Create admin account on first visit or register new users at `/register`.

### Authentik

Set `AUTH_METHOD=authentik` and configure:

- `AUTHENTIK_CLIENT_ID`
- `AUTHENTIK_CLIENT_SECRET`
- `AUTHENTIK_ISSUER`

### Generic OIDC (Keycloak, Auth0, etc.)

Set `AUTH_METHOD=oidc_generic` and configure:

- `OIDC_CLIENT_ID`
- `OIDC_CLIENT_SECRET`
- `OIDC_ISSUER_URL`

## Optional Services

Add these to `.env` if you want to enable them:

```bash
# ROMM Integration
ROMM_SERVER_URL=http://your-romm-server
# Recommended for RomM 5.0+: a Client API Token with the "roms.read" scope.
# It does not expire and avoids storing your password.
ROMM_API_TOKEN=your_client_api_token
# Fallback for RomM 4.x:
#ROMM_USERNAME=your_username
#ROMM_PASSWORD=your_password

# Gotify Notifications
GOTIFY_URL=http://your-gotify-server
GOTIFY_TOKEN=your_token

# Outbound request webhook (any JSON receiver)
REQUEST_WEBHOOK_URL=https://your-webhook-endpoint
```

The update check is the one thing that is on by default rather than opt-in. It asks
the GitHub releases API whether a newer version exists, at most every six hours, and
shows an indicator beside the version number in the sidebar. Turn it off if the app
should not reach out:

```bash
UPDATE_CHECK_ENABLED=false
```

## Troubleshooting

### Port Already in Use

Change `APP_PORT` in `.env`:

```bash
APP_PORT=3001  # Use a different port
```

### Database Connection Issues

Ensure PostgreSQL is running:

```bash
docker compose ps postgres
docker compose logs postgres
```

### Reset Everything

```bash
docker compose down -v  # Warning: Deletes all data!
docker compose up -d
```

## Running from Source (Development)

The Docker flow above is the supported way to run G.G Requestz. To develop
against it instead:

```bash
npm install
cp .env.example .env
npm run dev
```

The app serves on <http://localhost:5174>. The port is fixed: `vite.config.js`
sets `strictPort: true`, so the dev server exits rather than falling through to
another port if 5174 is taken.

You still need a PostgreSQL instance; the app will not start without one. The
quickest option is to run just the database from the compose file and point
`.env` at it:

```bash
docker compose up -d postgres redis
npm run db:migrate
```

### What each service gets you

Nothing but PostgreSQL is strictly required, but the app is progressively more
useful as you add:

| Service        | Variables                              | Without it                                       |
| -------------- | -------------------------------------- | ------------------------------------------------ |
| **PostgreSQL** | `POSTGRES_*`                           | The app does not start                           |
| **IGDB**       | `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET` | No game data, search and browse return nothing   |
| **Redis**      | `REDIS_URL`                            | Falls back to an in-memory cache, per PM2 worker |
| **OIDC**       | `OIDC_*`                               | Basic auth only (which is the default anyway)    |
| **ROMM**       | `ROMM_SERVER_URL` + `ROMM_API_TOKEN`   | No library section                               |
| **Gotify**     | `GOTIFY_*`                             | No push notifications                            |
| **Webhook**    | `REQUEST_WEBHOOK_URL`                  | No outbound request events                       |

Get IGDB credentials from the [Twitch Developer Console](https://dev.twitch.tv/console):
register an application with OAuth redirect URL `http://localhost:5174`, then
use its Client ID and Secret. See [api-docs.igdb.com](https://api-docs.igdb.com/#getting-started).

### Development commands

```bash
npm run dev         # Dev server on :5174
npm run build       # Production build
npm run preview     # Preview the production build
npm run check       # svelte-check
npm run lint        # prettier --check (this is what CI gates on)
npm run format      # prettier --write
npm run test:unit   # vitest
npm run test:e2e    # playwright
```

For integration testing against a real installation with live RomM and Keycloak
fixtures, see [TESTING.md](TESTING.md).

## Next Steps

- [Full Configuration Guide](../CONFIGURATION.md) - All configuration options
- [Production Deployment](DEPLOYMENT.md) - SSL, reverse proxy, backups
- [Database Setup](DATABASE_SETUP.md) - PostgreSQL and migrations
- [Authentication Setup](OIDC_SETUP.md) - OIDC, Authentik, basic auth
- [Custom Navigation](../guides/NAVIGATION.md) - Role-based navigation links
- [Integrations](../guides/INTEGRATIONS.md) - ROMM, Gotify, outbound webhooks
- [Architecture Overview](../ARCHITECTURE.md) - System design and components
- [API Documentation](../API.md) - REST API reference
- [Contributing Guide](../../CONTRIBUTING.md) - Development guidelines

## Getting Help

- 📖 [Documentation](../../README.md#-documentation)
- 🐛 [Report Issues](https://github.com/XTREEMMAK/ggrequestz/issues)
- 💬 [Discussions](https://github.com/XTREEMMAK/ggrequestz/discussions)
