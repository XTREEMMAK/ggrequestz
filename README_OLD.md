<p align="center">
  <img src="static/GGR_Logo.webp" alt="G.G Requestz Logo" width="400">
</p>

# 🎮 G.G Requestz - Game Discovery & Request Platform

A comprehensive game discovery and request application built with **SvelteKit 5**, featuring intelligent search, user authentication, and automated workflows.

## ✨ Features

### 🔍 **Advanced Search & Discovery**

- **Typesense Integration**: Lightning-fast fuzzy search with intelligent normalization
- **IGDB API**: Real-time game data from the Internet Game Database
- **Smart Filtering**: Filter by platforms, genres, release dates, and popularity
- **Autocomplete**: Instant search suggestions with debounced input

### 🎯 **Request Management**

- **Multi-tab Forms**: Request new games, updates, or report issues
- **Priority Levels**: Set request priorities (low, medium, high)
- **Platform Selection**: Specify preferred gaming platforms
- **Status Tracking**: Monitor request status from submission to fulfillment

### 👤 **User Management**

- **Authentik OIDC**: Secure authentication with enterprise-grade identity provider
- **Personal Watchlist**: Save and manage favorite games
- **Request History**: Track all submitted requests with detailed status
- **Profile Management**: View account information and activity

### 🔔 **Automation & Notifications**

- **Gotify Integration**: Real-time push notifications for request updates
- **n8n Webhooks**: Automated workflow triggering for request processing
- **Email Notifications**: Optional email alerts for important updates

### 📱 **Modern UI/UX**

- **Responsive Design**: Mobile-first approach with Tailwind CSS 4.0
- **Animated Login**: Vanta.js powered waves with dynamic gradient overlays
- **Advanced Animations**: Multi-layered blend modes and choreographed reveals
- **Interactive Cards**: Hover animations and smooth transitions
- **Status Indicators**: Color-coded badges for easy status recognition

## 🏗️ Architecture

### **Frontend**

- **SvelteKit 5**: Modern web framework with server-side rendering
- **TailwindCSS 4.0**: Utility-first CSS framework with custom theme
- **Component Library**: Reusable UI components (GameCard, SearchBar, etc.)

### **Backend Services**

- **Supabase PostgreSQL**: Database with cache-first game data management
- **Typesense**: Search engine for fast, typo-tolerant search
- **IGDB API**: Game metadata and information provider

### **Authentication**

- **Authentik**: OpenID Connect (OIDC) identity provider
- **JWT Sessions**: Secure cookie-based session management
- **Protected Routes**: Role-based access control

### **Integration**

- **Gotify**: Self-hosted notification server
- **Webhooks**: Event-driven architecture for real-time updates

## 🚀 Quick Start

### Prerequisites

```bash
Node.js 18+ and npm
```

### Installation

```bash
# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Start development server
npm run dev
```

### Environment Configuration

#### **Required Environment Variables**

```bash
# Database Configuration (REQUIRED)
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=ggrequestz
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_secure_password

# Authentication (REQUIRED)
AUTHENTIK_CLIENT_ID=your_client_id
AUTHENTIK_CLIENT_SECRET=your_client_secret
AUTHENTIK_ISSUER=https://auth.yourdomain.com
SESSION_SECRET=your_secure_random_string_min_32_chars

# IGDB API Integration (REQUIRED)
IGDB_CLIENT_ID=your_igdb_client_id
IGDB_CLIENT_SECRET=your_igdb_client_secret
```

#### **Optional Environment Variables**

```bash
# Search Engine (Optional - enables advanced search)
TYPESENSE_API_KEY=your_typesense_key
TYPESENSE_HOST=localhost
TYPESENSE_PORT=8108
TYPESENSE_PROTOCOL=http

# Notifications (Optional - enables push notifications)
GOTIFY_URL=https://notifications.yourdomain.com
GOTIFY_TOKEN=your_gotify_token

# ROMM Integration (Optional - enables game library)
ROMM_SERVER_URL=https://romm.yourdomain.com
ROMM_USERNAME=your_romm_username
ROMM_PASSWORD=your_romm_password

# Redis Cache (Optional - enables distributed caching)
# If not provided, falls back to in-memory caching
REDIS_URL=redis://localhost:6379

# Automation (Optional - enables workflow triggers)
N8N_WEBHOOK_URL=https://automation.yourdomain.com/webhook
```

## 📁 Project Structure

```
src/
├── routes/                     # SvelteKit routes
│   ├── +layout.svelte         # Main layout with navigation
│   ├── +layout.js            # Global data loading
│   ├── +page.svelte          # Homepage dashboard
│   ├── request/              # Request management
│   ├── search/               # Advanced search
│   ├── game/[id]/           # Game details
│   ├── profile/             # User profile
│   └── api/                 # API endpoints
├── components/             # Reusable UI components
│   ├── GameCard.svelte    # Game display card
│   ├── SearchBar.svelte   # Search input with autocomplete
│   ├── RequestForm.svelte # Multi-tab request form
│   └── Navigation.svelte   # Main navigation
├── lib/                   # Utility libraries
│   ├── auth.js           # Authentication utilities
│   ├── typesense.js      # Search client
│   ├── igdb.js          # Game database client
│   ├── supabase.js      # Database client
│   └── utils.js         # Helper functions
├── app.css              # Global styles and theme
└── app.html            # HTML template
```

## ⚡ **Performance & Caching**

### **Multi-Layer Caching System**

GameRequest implements a comprehensive caching strategy for optimal performance:

#### **Hybrid Cache System (Redis + Memory Fallback)**
- **Redis Primary**: Distributed caching for production environments
- **Memory Fallback**: In-memory cache when Redis is unavailable
- **TTL-based caching** with automatic cleanup and expiration
- **Popular games**: 10 minutes (changes less frequently)
- **Recent games**: 5 minutes (moderate refresh rate)
- **ROMM games**: 3 minutes (library changes more often)
- **User data**: 3 minutes (personalized content)
- **Game details**: 15 minutes (stable game information)
- **Auto-invalidation**: Cache keys are automatically invalidated when admin updates requests

#### **HTTP Cache Headers**
- **Static assets**: 1 year cache with immutable flag
- **API responses**: 5 minutes private cache
- **HTML pages**: 5 minutes with revalidation
- **Build assets**: Long-term caching with versioning

#### **Performance Monitoring**
Monitor cache effectiveness via:
```bash
GET /api/cache/stats    # View cache statistics
DELETE /api/cache/stats # Clear memory cache
```

**Expected Performance:**
- **First load**: ~2000ms → ~800ms (60% improvement)
- **Subsequent loads**: ~2000ms → ~200-400ms (80-90% improvement)
- **Cached responses**: Near-instantaneous

### **Database Optimization**
- **Performance indexes** for fast queries
- **Connection pooling** for efficient database access
- **Query optimization** with prepared statements

## 🎮 Key Features

### Smart Search Normalization

- Article removal ("The Witcher 3" → "Witcher 3")
- Number conversion ("three" → "3")
- Punctuation handling
- Abbreviation expansion

### Multi-tab Request System

- **Game Requests**: Request new games with priority levels
- **Update Requests**: Request updates for existing games
- **Fix Reports**: Report issues with broken links or files

### Interactive Dashboard

- Recently added games
- Recently requested games
- User watchlist (authenticated users)
- Trending/popular games

## 🛠️ Development

### Available Scripts

```bash
npm run dev         # Start development server
npm run build       # Build for production
npm run preview     # Preview production build
npm run check       # Run Svelte type checking
npm run lint        # Lint code with prettier
npm run format      # Format code with prettier
```

## 🚢 Deployment

### Production Build

```bash
npm run build
node build/index.js
```

### Docker Deployment

GameRequest includes a comprehensive Docker stack with flexible deployment options:

#### Quick Start (All Services)
```bash
# Clone and setup
git clone <repository>
cd ggrequestz
cp .env.example .env

# Edit .env with your required configuration
nano .env

# Start with all local services
docker compose --profile database --profile cache --profile search up -d
```

#### Deployment Scenarios

**Full Stack (Recommended for new installations):**
```bash
# All services included locally
docker compose --profile database --profile cache --profile search up -d
```

**External Services (For existing infrastructure):**
```bash
# Use external database/cache/search
docker compose -f docker-compose.yml -f docker-compose.external.yml up -d
```

**Development Mode:**
```bash
# Development with hot reload
docker compose -f docker-compose.yml -f docker-compose.development.yml up -d
```

**Production Mode:**
```bash
# Production with optimizations and resource limits
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d
```

#### Included Services

**Core Services:**
- **GameRequest App**: Main application with automatic migrations
- **PostgreSQL**: Database with health checks and persistence
- **Redis**: Cache server (256MB default, LRU eviction)
- **Typesense**: Search engine for game discovery

**Optional Services:**
- **Gotify**: Notification server (`--profile notifications`)
- **Traefik**: Reverse proxy with SSL (`--profile proxy`)

#### Configuration Examples

**Minimum Required (.env):**
```bash
# Database
POSTGRES_PASSWORD=your_secure_password

# Authentication (choose one)
AUTHENTIK_CLIENT_ID=your_client_id
AUTHENTIK_CLIENT_SECRET=your_client_secret
AUTHENTIK_ISSUER=https://auth.yourdomain.com
SESSION_SECRET=your_32_char_random_string

# IGDB API
IGDB_CLIENT_ID=your_igdb_client_id
IGDB_CLIENT_SECRET=your_igdb_client_secret
```

**External Services (.env):**
```bash
# Use external database
POSTGRES_HOST=your-db-host.com
POSTGRES_USER=your_db_user
POSTGRES_PASSWORD=your_db_password

# Use external Redis
REDIS_URL=redis://your-redis-host:6379

# Use external Typesense
TYPESENSE_HOST=your-search-host.com
TYPESENSE_API_KEY=your_api_key
```

#### Advanced Features

**Automatic Database Migrations:**
- Runs on container startup
- Version tracking and safe execution
- Disable with `AUTO_MIGRATE=false`

**Health Checks:**
- All services include health monitoring
- Automatic restart on failure
- Startup dependency management

**Resource Management:**
- Production mode includes resource limits
- Memory and CPU reservations
- Log rotation and cleanup

See [DOCKER_TESTING.md](DOCKER_TESTING.md) for comprehensive testing instructions and troubleshooting guides.

## 🔒 Security

- **OIDC Authentication**: Enterprise-grade security with Authentik
- **JWT Sessions**: Secure cookie-based session management
- **Input Validation**: Comprehensive request validation
- **CSRF Protection**: State parameter validation

## 📊 Technology Stack

- **Frontend**: SvelteKit 5, TailwindCSS 4.0
- **Search**: Typesense with fuzzy matching
- **Games Data**: IGDB API integration
- **Authentication**: Authentik OIDC/OAuth2
- **Storage**: Supabase PostgreSQL database
- **Notifications**: Gotify + n8n automation

---

**Built with ❤️ using SvelteKit 5 and modern web technologies**
