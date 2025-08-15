<p align="center">
  <img src="static/GGR_Logo.webp" alt="G.G Requestz Logo" width="400">
</p>
# 🎮 GG Requestz

A modern game discovery and request management platform with IGDB integration, ROMM library support, and powerful search capabilities.

![Version](https://img.shields.io/badge/version-1.0.1-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## ✨ Features

- **🔍 Advanced Search** - Search 200,000+ games with filters and real-time results
- **📚 ROMM Integration** - Seamless integration with your ROMM game library
- **🔐 Flexible Authentication** - Support for OIDC providers (Authentik, Keycloak, Auth0) and basic auth
- **⚡ High Performance** - Redis caching, hover preloading, and optimized data fetching
- **🎨 Modern UI** - Responsive design with dark mode and smooth animations

## 🚀 Quick Start

### Docker Compose (Recommended)

```bash
# Step 1: Clone the repository
git clone https://github.com/XTREEMMAK/ggrequestz.git
cd ggrequestz

# Step 2: Copy .env.example file and rename to .env.docker
cp .env.example .env.docker

# Step 3: Adjust environment variables to taste. Read on how to get your Typesense API key
# Edit .env.docker with your settings

# Step 4: Run the deploy script
sudo ./scripts/deploy-production.sh
```

### Local Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

## 📖 Documentation

- [Architecture Overview](docs/ARCHITECTURE.md) - System design and components
- [Deployment Guide](docs/DEPLOYMENT.md) - Production deployment instructions
- [Development Guide](docs/DEVELOPMENT.md) - Local setup and contributing
- [API Documentation](docs/API.md) - REST API endpoints
- [Performance Guide](docs/PERFORMANCE.md) - Caching and optimization

### Authentication Guides
- [Generic OIDC Setup](docs/OIDC_SETUP.md) - Configure any OIDC provider
- [Authentik Setup](docs/AUTHENTIK_ADMIN_SETUP.md) - Specific Authentik configuration

## 🔧 Configuration

### Required Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost/ggrequestz

# Authentication (Choose one)
AUTH_METHOD=oidc_generic
OIDC_ISSUER_URL=https://your-provider.com
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret

# IGDB API (Required for game data)
IGDB_CLIENT_ID=your-igdb-client
IGDB_CLIENT_SECRET=your-igdb-secret

# Optional
REDIS_URL=redis://localhost:6379
ROMM_URL=http://your-romm-instance
```

### Getting IGDB API Credentials

IGDB (Internet Game Database) provides the game data for G.G. Requestz. To get your API credentials:

1. **Create a Twitch Developer Account**
   - Visit the [Twitch Developer Console](https://dev.twitch.tv/console)
   - Sign in with your Twitch account (or create one if needed)

2. **Register Your Application**
   - Click "Register Your Application"
   - Fill in the required details:
     - **Name**: G.G. Requestz (or your preferred name)
     - **OAuth Redirect URLs**: `http://localhost:5173` (for development)
     - **Category**: Application Integration

3. **Get Your Credentials**
   - After registration, you'll receive:
     - **Client ID** → Use as `IGDB_CLIENT_ID`
     - **Client Secret** → Use as `IGDB_CLIENT_SECRET`

4. **Detailed Setup Guide**
   - For complete setup instructions, visit: https://api-docs.igdb.com/#getting-started
   - The IGDB API uses Twitch's OAuth system for authentication

**Note**: These credentials are required for the application to fetch game data, search results, and cover images.

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🔗 Links

- [Changelog](CHANGELOG.md) - Version history and updates
- [Issues](https://github.com/yourusername/ggrequestz/issues) - Report bugs or request features
- [Discord](https://discord.gg/yourdiscord) - Community support