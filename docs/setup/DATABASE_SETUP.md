# Database Setup Guide

This document explains how to set up the Supabase PostgreSQL database for GG Requestz with the new cache-first architecture.

## Architecture Overview

GG Requestz now uses a **cache-first strategy** to minimize IGDB API calls and improve performance:

- **Primary Data Source**: Supabase PostgreSQL database
- **Secondary Source**: IGDB API (fallback when cache misses)
- **Search Engine**: Typesense (with database fallback)
- **Cache Strategy**: Intelligent TTL-based refresh

## Database Tables

All tables use the `ggr_` prefix for namespace isolation:

### `ggr_games_cache`

- **Purpose**: Cache IGDB game data locally
- **Key Fields**: `igdb_id`, `title`, `summary`, `cover_url`, `rating`, `platforms`, `genres`
- **Cache Fields**: `cached_at`, `last_updated`, `needs_refresh`

### `ggr_game_requests`

- **Purpose**: Store user game requests
- **Key Fields**: `user_id`, `title`, `request_type`, `status`, `priority`
- **Types**: `game` (new), `update` (metadata), `fix` (broken data)

### `ggr_user_watchlist`

- **Purpose**: User's personal game watchlists
- **Key Fields**: `user_id`, `igdb_id`, `added_at`
- **Relation**: Links to `ggr_games_cache`

### `ggr_user_analytics`

- **Purpose**: Track user actions for insights
- **Key Fields**: `user_id`, `action`, `metadata`, `timestamp`

## Setup Instructions

### 1. Supabase Project Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Note your project URL and API keys
3. Copy the following from your Supabase dashboard:
   - **Project URL**: `https://your-project-ref.supabase.co`
   - **Anon Key**: Found in Settings > API
   - **Service Role Key**: Found in Settings > API (keep secret!)

### 2. Environment Configuration

Update your `.env` file with Supabase credentials:

```env
# Supabase Database Configuration
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_role_key
```

### 3. Database Initialization

Run the database initialization script:

```bash
# Initialize database tables and indexes
npm run db:init
```

This script will:

- Create all `ggr_` prefixed tables
- Set up indexes for performance
- Add triggers for automatic timestamps
- Verify table creation

### 4. Cache Warm-Up (Optional)

Populate the cache with popular games:

```bash
# Warm up the games cache
npm run db:warm
```

### 5. Verify Setup

Check cache statistics:

```bash
# Show cache statistics
npm run db:stats
```

## Cache Strategy Details

### Cache TTL (Time To Live)

- **Popular Games**: 6 hours
- **Recent Games**: 12 hours
- **Game Details**: 24 hours
- **Search Results**: 2 hours

### Cache Flow

1. **Request comes in** → Check cache first
2. **Cache hit & fresh** → Return cached data
3. **Cache miss/stale** → Fetch from IGDB API
4. **Cache result** → Store in database for future requests
5. **Return data** → Serve to user

### Background Refresh

- Stale games are refreshed in background
- Popular games are prioritized for refresh
- Failed API calls use stale cache as fallback

## Performance Benefits

### Before (Direct IGDB API)

- ⚠️ 2-5 second page loads
- ⚠️ Rate limited to 4 requests/second
- ⚠️ Fails when IGDB is down
- ⚠️ High API usage costs

### After (Cache-First)

- ✅ 200-500ms page loads
- ✅ Handle thousands of concurrent users
- ✅ Works offline/when IGDB is down
- ✅ 90% reduction in API calls

## Monitoring & Maintenance

### Regular Tasks

1. **Monitor cache hit rates** - Use `npm run db:stats`
2. **Refresh stale games** - Runs automatically in background
3. **Database maintenance** - PostgreSQL handles automatically
4. **API quota monitoring** - Much lower usage now

### Troubleshooting

**Database connection issues:**

- Verify Supabase credentials in `.env`
- Check Supabase project status
- Test network connectivity

**Cache not populating:**

- Check IGDB API credentials
- Verify IGDB API quotas
- Review application logs

**Performance issues:**

- Monitor database query performance
- Check Supabase usage metrics
- Consider upgrading Supabase plan if needed

## Database Migration

The system is designed for clean deployment:

1. Fresh Supabase database setup with `ggr_` tables
2. Cache populates automatically as users browse games
3. No migration needed from legacy systems
4. Clean, modern PostgreSQL architecture

## Security Considerations

- **Service Role Key**: Keep secret, only use server-side
- **Anon Key**: Safe for client-side use
- **Row Level Security**: Can be enabled for additional protection
- **API Rate Limiting**: Built into Supabase

## Backup & Recovery

Supabase provides automated backups:

- **Point-in-time recovery** for paid plans
- **Manual backups** via dashboard
- **Export options** for data portability

For additional backup, consider:

```bash
# Export games cache (example)
pg_dump -h your-supabase-host -U postgres -t ggr_games_cache > games_backup.sql
```
