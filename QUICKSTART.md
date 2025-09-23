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

# Choose authentication method: basic, authentik, or oidc_generic
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

Set `AUTH_METHOD=basic` in `.env`. Create admin account on first visit.

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
ROMM_USERNAME=your_username
ROMM_PASSWORD=your_password

# Gotify Notifications
GOTIFY_URL=http://your-gotify-server
GOTIFY_TOKEN=your_token

# n8n Webhooks
N8N_WEBHOOK_URL=https://your-n8n-webhook
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

## Next Steps

- [Full Configuration Guide](docs/CONFIGURATION.md) - All configuration options
- [Production Deployment](docs/DEPLOYMENT.md) - SSL, reverse proxy, backups
- [Admin Guide](docs/setup/AUTHENTIK_ADMIN_SETUP.md) - User management
- [API Documentation](docs/API.md) - REST API reference

## Getting Help

- 📖 [Documentation](docs/README.md)
- 🐛 [Report Issues](https://github.com/XTREEMMAK/ggrequestz/issues)
- 💬 [Discussions](https://github.com/XTREEMMAK/ggrequestz/discussions)
