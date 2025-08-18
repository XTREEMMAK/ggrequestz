# 🚀 G.G Requestz Setup Guide

## Quick Start

The application is now ready to run! Dependencies have been installed and the development server is working.

### 1. Start Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173` (or the next available port).

### 2. Environment Configuration

**Important:** You'll need to configure the external services for full functionality. Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

## 📚 Detailed Setup Guides

For detailed setup instructions, see the documentation in `/docs/setup/`:

- [Database Setup](docs/setup/DATABASE_SETUP.md) - PostgreSQL and database configuration
- [Docker Setup](docs/setup/DOCKER_SETUP.md) - Docker deployment guide
- [Authentication Setup](docs/setup/AUTHENTIK_ADMIN_SETUP.md) - OIDC authentication
- [Navigation Setup](docs/setup/NAVIGATION_SETUP.md) - Custom navigation configuration
- [Deployment Guide](docs/setup/DEPLOYMENT.md) - Production deployment

### 3. Service Configuration Priority

For **basic functionality** (UI and navigation), no external services are required. The app will use mock data.

For **full functionality**, configure services in this order:

#### **Level 1: Basic Game Data (Recommended First)**

```bash
# IGDB API (Free - get games data)
IGDB_CLIENT_ID=your_igdb_client_id
IGDB_CLIENT_SECRET=your_igdb_client_secret
```

**Getting IGDB Credentials:**

1. Create a Twitch developer account at [dev.twitch.tv/console](https://dev.twitch.tv/console)
2. Register your application with OAuth redirect URL: `http://localhost:5173`
3. Use the Client ID and Client Secret as your IGDB credentials
4. For detailed instructions: https://api-docs.igdb.com/#getting-started

- Provides real game data instead of mock data

#### **Level 2: User Authentication (Optional)**

```bash
# Authentik OIDC (Self-hosted auth)
AUTHENTIK_CLIENT_ID=your_client_id
AUTHENTIK_CLIENT_SECRET=your_client_secret
AUTHENTIK_ISSUER=https://auth.yourdomain.com
SESSION_SECRET=your_random_session_secret
```

- Enables user login, watchlists, and requests
- Can use other OIDC providers by modifying auth.js

#### **Level 3: Search Engine (Optional)**

```bash
# Typesense (Self-hosted search)
TYPESENSE_API_KEY=your_typesense_key
TYPESENSE_HOST=your_typesense_host
TYPESENSE_PORT=443
TYPESENSE_PROTOCOL=https
```

- Enables advanced search and filtering
- Falls back to IGDB API search if not configured

#### **Level 4: Data Persistence (Optional)**

```bash
# Supabase Database
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_role_key
```

- Stores user requests, watchlists, and cached game data
- Provides cache-first architecture for better performance

#### **Level 5: Notifications (Optional)**

```bash
# Gotify & n8n (Self-hosted notifications)
GOTIFY_URL=https://notifications.yourdomain.com
GOTIFY_TOKEN=your_gotify_token
N8N_WEBHOOK_URL=https://automation.yourdomain.com/webhook
```

- Sends notifications for new requests
- Enables workflow automation

## 🎮 Current Status

✅ **Working Now:**

- Complete UI with responsive design
- Navigation and page routing
- Mock data for games and requests
- All components functional
- Request forms (data saved locally)

🔧 **With Service Configuration:**

- Real game data from IGDB
- User authentication and sessions
- Persistent data storage
- Advanced search capabilities
- Push notifications

## 🛠️ Development Commands

```bash
npm run dev         # Start development server
npm run build       # Build for production
npm run preview     # Preview production build
npm run check       # Type checking
npm run lint        # Lint code
npm run format      # Format code
```

## 📱 Features Available Immediately

- **Homepage Dashboard**: Browse mock games and requests
- **Search Page**: Search with filtering (uses IGDB if configured)
- **Request Forms**: Multi-tab forms for games, updates, and fixes
- **Game Details**: Detailed game information pages
- **Profile Page**: User interface (login required)
- **Responsive Design**: Works on all devices
- **Dark Mode Support**: Automatic theme switching

## 🔍 Testing the Application

1. **Browse Games**: Visit the homepage to see game cards
2. **Search**: Use the search bar to find games
3. **Request Games**: Fill out the request form
4. **View Details**: Click any game card to see details
5. **Mobile View**: Resize browser to test responsive design

## 🚨 Common Issues

**Port in Use**: The dev server will automatically find the next available port.

**Mock Data**: If you see "No games found", this is normal without IGDB API configured.

**Authentication**: Login button will show an error without Authentik configured - this is expected.

**Search Results**: Without Typesense, search falls back to IGDB API or mock data.

## 📚 Next Steps

1. **Configure IGDB API** for real game data
2. **Set up authentication** for user features
3. **Deploy to production** using `npm run build`
4. **Add external services** for full functionality

## 🔗 Additional Documentation

- [Architecture Overview](docs/ARCHITECTURE.md) - System design and components
- [API Documentation](docs/API.md) - API endpoints and usage
- [Integration Guide](docs/guides/INTEGRATION_GUIDE.md) - Third-party integrations
- [ROMM Troubleshooting](docs/guides/ROMM_TROUBLESHOOTING.md) - ROMM integration help
- [Contributing Guide](CONTRIBUTING.md) - Development guidelines

The application is designed to work gracefully with or without external services!
