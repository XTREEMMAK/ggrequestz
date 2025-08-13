# Architecture Overview

## System Design

GG Requestz follows a modern, scalable architecture designed for performance and flexibility.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│   Frontend      │────▶│   Backend       │────▶│   Database      │
│   (SvelteKit)   │     │   (Node.js)     │     │   (PostgreSQL)  │
│                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        │                       │                       │
        ▼                       ▼                       ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│   Cache Layer   │     │   Search        │     │   External      │
│   (Redis)       │     │   (Typesense)   │     │   Services      │
│                 │     │                 │     │   (IGDB, ROMM)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Core Components

### Frontend (SvelteKit)
- **Server-Side Rendering (SSR)** for SEO and performance
- **Progressive Enhancement** with client-side hydration
- **Reactive State Management** using Svelte 5 runes
- **Optimistic UI Updates** for better user experience

### Backend (Node.js)
- **RESTful API** design with clear endpoints
- **Authentication Middleware** supporting multiple providers
- **Database Abstraction Layer** for clean data access
- **Caching Strategy** with Redis + memory fallback

### Database (PostgreSQL)
- **Normalized Schema** with proper relationships
- **Migration System** for version control
- **Optimized Indexes** for query performance
- **JSONB Fields** for flexible data storage

## Authentication Architecture

### Provider Registry System
```javascript
providers/
├── oidc-generic.js     // Generic OIDC provider
├── authentik.js        // Authentik-specific
├── api-integration.js  // REST API sync
└── webhook.js          // Real-time webhooks
```

### Authentication Flow
1. User initiates login
2. Provider selection (OIDC/Basic)
3. Token validation
4. Session creation
5. JWT refresh handling

## Caching Strategy

### Multi-Tier Caching
1. **Browser Cache** - Static assets, preloaded data
2. **Session Storage** - Temporary preload cache
3. **Redis Cache** - Shared application cache
4. **Memory Cache** - Fallback when Redis unavailable
5. **Database Cache** - Games cache table

### Cache Invalidation
- **TTL-based** expiration for different data types
- **Event-driven** invalidation for updates
- **Manual purge** via admin panel

## Performance Optimizations

### Server-Side
- **Cache Warming** on application startup
- **Parallel Data Fetching** with Promise.all
- **Connection Pooling** for database
- **Lazy Loading** of providers

### Client-Side
- **Hover Preloading** for instant navigation
- **Progressive Data Loading** with prioritization
- **Code Splitting** by route
- **Image Lazy Loading** with placeholders

## Data Flow

### Request Lifecycle
1. Client request → SvelteKit router
2. Load function → Data fetching
3. Cache check → Redis/Memory
4. Database query (if cache miss)
5. External API calls (if needed)
6. Response formatting
7. SSR rendering
8. Client hydration

### Real-Time Updates
- WebSocket support ready
- Event-driven architecture
- Pub/Sub with Redis

## Security Layers

### Application Security
- **OIDC/OAuth2** authentication
- **Session management** with secure cookies
- **CORS protection** with whitelisting
- **Rate limiting** ready to implement
- **Input validation** throughout

### Infrastructure Security
- **HTTPS only** in production
- **CSP headers** for XSS protection
- **SQL injection** prevention
- **Environment variable** isolation

## Scalability Considerations

### Horizontal Scaling
- Stateless application design
- Redis for shared session storage
- Database connection pooling
- CDN-ready static assets

### Vertical Scaling
- Efficient memory usage
- Optimized database queries
- Background job processing ready
- Resource monitoring hooks

## External Integrations

### IGDB API
- 200,000+ games database
- Rate-limited API calls
- Response caching
- Batch operations

### ROMM Library
- Real-time availability checks
- Cross-reference matching
- Cached availability status
- Fallback handling

### Typesense Search
- Full-text search capability
- Faceted filtering
- Real-time indexing
- Typo tolerance

## Deployment Architecture

### Docker Compose Stack
```yaml
services:
  app:          # Main application
  postgres:     # Database
  redis:        # Cache layer
  typesense:    # Search engine
```

### Environment Configurations
- Development (hot reload, debug)
- Staging (production-like)
- Production (optimized, secure)

## Monitoring & Observability

### Health Checks
- `/api/health` - Application health
- `/api/version` - Version info
- Database connectivity
- Redis availability
- External service status

### Performance Metrics
- Response time tracking
- Cache hit rates
- Database query performance
- External API latency

## Future Architecture Plans

### Microservices Ready
- Clean service boundaries
- API-first design
- Message queue ready
- Service mesh compatible

### Event-Driven Features
- WebSocket infrastructure
- Real-time notifications
- Live updates
- Collaborative features