# Changelog

All notable changes to GG Requestz will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.4] - 2025-09-26

### Major Changes

- **Typesense Search Engine Removal**
  - Completely removed Typesense dependency and container from Docker setup
  - Replaced all search functionality with direct IGDB API integration
  - Simplified architecture by eliminating search index synchronization
  - Reduced Docker container count and system complexity

### Fixed

- **Authentication & Request Management**
  - Fixed 401 Unauthorized error for basic auth users trying to remove their own requests
  - Enhanced `getSession` function to properly handle both JWT and basic auth tokens
  - Improved authentication flow to check both `session` and `basic_auth_session` cookies
  - Added comprehensive authentication debugging for troubleshooting

- **User Experience**
  - Replaced generic alert dialogs with toast notifications for better UX
  - Added success messages when requests are successfully removed
  - Enhanced error messages to show specific server errors instead of generic failures
  - Improved search page to auto-hide advanced filters when search is cleared

- **Docker Health Checks**
  - Fixed persistent "unhealthy" container status despite running application
  - Resolved IPv6 connection issues in health check script (localhost → 127.0.0.1)
  - Removed conflicting health check configurations between Dockerfile and Docker Compose
  - Created dedicated Node.js health check script with proper ES module compatibility

- **Admin Interface Search Focus Issues**
  - Fixed search input focus loss in Admin Users page during typing
  - Fixed search input focus loss in Admin Requests page during typing
  - Implemented client-side filtering with SvelteKit 5 reactive patterns
  - Search inputs now maintain focus throughout the entire search experience

- **Search Functionality**
  - Fixed game name search in Admin Requests (changed from `game_name` to `title`)
  - Restored advanced filters (platforms/genres) on main search page
  - Fixed filter persistence when navigating back from game details
  - Added smooth CSS transitions for filter appearance with proper spacing

- **404 Protection Security System** _(Later Removed)_
  - Fixed missing database table causing 404 protection failures
  - Updated time window from 5 minutes to 60 seconds for better brute force protection
  - Fixed database table name mismatch (`ggr_settings` → `ggr_system_settings`)
  - Fixed IP address validation for database storage (INET column compatibility)
  - Added comprehensive security logging and violation tracking

### Enhanced

- **Search Performance**
  - Direct IGDB API searches eliminate intermediate indexing delays
  - Real-time search results without synchronization lag
  - Improved search accuracy using native IGDB data

- **Security**
  - Enhanced 404 attempt monitoring with detailed logging
  - Automatic user logout after excessive 404 attempts (if authenticated)
  - Admin notifications for security violations via Gotify
  - Comprehensive audit trail in `ggr_security_logs` table

### Removed

- **404 Protection System**
  - Removed 404 protection system after security evaluation
  - Removed security API endpoints and database tables
  - Removed client-side 404 tracking and warnings
  - Simplified error handling and removed unnecessary complexity
  - Cleaned up migration files and security-related code

- **Dependencies**
  - Removed `typesense` npm package
  - Removed Typesense container from `docker-compose.yml`
  - Removed database synchronization scripts and commands
  - Cleaned up unused search indexing code

### Technical Changes

- Updated search API endpoints to use IGDB directly
- Migrated admin search interfaces to client-side filtering
- Added database migration for security logs table
- Implemented in-memory rate limiting for 404 protection
- Updated Docker compose files to remove Typesense service

## [1.1.3] - 2025-09-25

### Fixed

- **Database Migration System**
  - Fixed migration table schema detection and automatic repair
  - Added intelligent detection for existing database installations
  - Automatically marks initial schema as executed for existing databases
  - Prevents "trigger already exists" errors when migration history is reset
  - Database Manager now shows version number (v1.1.3) in console output

### Enhanced

- **Migration Robustness**
  - Improved handling of schema mismatches between old and new migration tables
  - Better error recovery when migration table needs to be recreated
  - Preserves database integrity during migration table fixes

### Technical Details

- Checks for core tables (`ggr_users`, `ggr_games_cache`, etc.) to detect initialized databases
- When migration table is fixed/recreated, automatically marks `001_initial_schema.sql` as complete if database exists
- Prevents re-running initial schema on already-initialized databases

## [1.1.2] - 2025-09-25

### Fixed

- **Migration Table Schema**
  - Fixed inconsistent column names in migration table
  - Changed from `version` column to `migration_name` column
  - Added automatic detection and repair of old schema

## [1.1.1] - 2025-09-25

### Fixed

- **Migration Table Schema Inconsistency**
  - Fixed `fixMigrationTable()` function to use correct column names
  - Resolved startup error: "column migration_name does not exist"

## [1.1.0] - 2025-09-24

### Added

- **Security Features**
  - 404 Attack Protection system with configurable limits
  - Gaming-themed 404 error page with animations and contextual messages
  - Client-side security monitoring with localStorage tracking
  - Admin-configurable security settings (max attempts, time windows, notifications)
  - Automatic user logout and admin notifications for security violations
  - Enhanced security logging with IP tracking and user agent detection

- **Enhanced User Experience**
  - Beautiful animated 404 page with floating elements and glitch effects
  - Contextual error messages for different 404 scenarios
  - Hidden navigation on error pages for better focus
  - Gaming-themed visual design with controller icons and cosmic backgrounds

- **Watchlist Improvements**
  - Batch processing for watchlist operations
  - Improved consistency across the application
  - Better synchronization between different watchlist views
  - Enhanced performance for large watchlists

- **Docker & Deployment**
  - New Docker Compose methods for easier instance deployment
  - Simplified setup process with better defaults
  - Enhanced Docker configuration for various deployment scenarios
  - Improved container startup and health checking

- **Database & Migration System**
  - Enhanced migration system for existing installations
  - Automatic security settings deployment for new installations
  - Missing database initialization scripts added
  - Migration file for existing installations (002_security_settings.sql)

- **Documentation & Usability**
  - Consolidated documentation for better readability
  - Enhanced setup guides and troubleshooting documentation
  - Clearer configuration instructions
  - Improved project structure and organization

### Fixed

- **Authentication & User Management**
  - Fixed basic user registration system
  - Resolved admin permission issues
  - Corrected user role assignment problems
  - Enhanced authentication flow reliability

- **UI & Form Improvements**
  - Fixed form title inconsistencies across the application
  - Resolved navigation visibility issues on error pages
  - Improved form validation and error handling
  - Enhanced responsive design for mobile devices

- **Database & Infrastructure**
  - Fixed missing database initialization scripts
  - Resolved migration system issues for existing installations
  - Enhanced database connection handling
  - Improved error handling for database operations

- **Security & Performance**
  - Implemented proper security headers
  - Enhanced session management
  - Improved error page performance with client-side tracking
  - Better handling of security violations and user logout

### Enhanced

- **Admin Panel**
  - New Security Settings section in admin panel
  - Comprehensive 404 protection controls
  - Real-time security monitoring configuration
  - Enhanced admin notification system integration

- **Performance & Reliability**
  - Optimized client-side security tracking
  - Improved error handling and graceful degradation
  - Enhanced cache management for security settings
  - Better resource loading and management

- **Migration & Upgrade Path**
  - Seamless upgrade path for existing installations
  - Automatic migration system for new features
  - Docker-friendly deployment updates
  - Backward compatibility maintained

### Migration Notes

When upgrading from v1.0.3 to v1.1.0:

1. **Security Features**:
   - New installations automatically include 404 protection
   - Existing Docker installations will get updates on restart
   - NPM installations: run `node scripts/database/db-manager.js migrate`

2. **Database Updates**:
   - New security settings table entries added automatically
   - Migration system handles existing installations gracefully
   - No manual database changes required

3. **Configuration**:
   - 404 protection enabled by default with sensible limits (5 attempts in 5 minutes)
   - Admin can configure all security settings via admin panel
   - Gotify notifications supported for security violations

4. **Deployment**:
   - Enhanced Docker Compose configurations available
   - Improved startup scripts and health checking
   - Better support for various deployment scenarios

## [1.0.3] - 2025-09-23

### Added

- **Pre-built Docker Images**
  - Automated Docker image publishing to GitHub Container Registry
  - Multi-platform support (amd64, arm64)
  - Images available at `ghcr.io/xtreemmak/ggrequestz`
  - Automatic builds on releases and main branch updates

- **Enhanced Docker Support**
  - PUID/PGID support for proper file permissions
  - Standard Docker Compose `.env` file convention (not `.env.docker`)
  - Improved environment variable handling
  - Better defaults and clearer configuration

- **Documentation Improvements**
  - New QUICKSTART.md for 5-minute setup
  - Consolidated CONFIGURATION.md with all options
  - Simplified README with clear navigation
  - Clearer authentication setup instructions

### Fixed

- **Authentication & Permissions**
  - Fixed basic auth admin users unable to manage requests
  - Corrected permission checking for `is_admin` flag
  - Fixed `ggr_user_permissions` table reference error
  - Resolved async/await misuse in authentication modules

- **Environment Configuration**
  - Fixed development environment using wrong `.env` file
  - Separated `.env` (Docker/production) from `.env.dev` (development)
  - Fixed DOTENV_CONFIG_PATH support for development
  - Corrected environment variable loading in multiple modules

- **Search & UI**
  - Implemented missing watchlist functionality in search page
  - Fixed favorite icon click handlers
  - Corrected reactive state management for watchlist

### Changed

- **Docker Standardization**
  - Docker Compose now uses standard `.env` file (community standard)
  - Simplified environment variable structure
  - Updated Dockerfile with configurable user/group IDs
  - Default to pulling pre-built images instead of building locally

- **Development Workflow**
  - Development scripts now use `.env.dev` by default
  - Improved separation between production and development configs
  - Better error messages for configuration issues

### Migration Notes

When upgrading from v1.0.2:

1. **Environment Files**:
   - Rename `.env.docker` to `.env` for Docker deployments
   - Use `.env.dev` for local development

2. **Docker Images**:
   - Images now available at `ghcr.io/xtreemmak/ggrequestz`
   - No need to build locally unless customizing

3. **Permissions**:
   - Add PUID/PGID to `.env` for proper file permissions
   - Database migrations run automatically

## [1.0.2] - 2025-08-18

### Fixed

- **Docker-Specific Issues**
  - Fixed ROMM section not displaying on mobile first login
  - Fixed Popular Games section returning "No popular games available" in Docker
  - Fixed Load More button double-firing on mobile touch events
  - Fixed Load More pagination for Popular Games (was only caching 8 games instead of 50)
  - Added retry logic with exponential backoff for ROMM API requests
  - Improved timeout handling for Docker container network latency
  - Fixed progressive loading race conditions between sections
  - Fixed cache corruption detection triggering incorrectly in Docker
  - Added cache warming on Docker startup for faster initial loads
  - Improved Redis connection handling with Docker-friendly settings

### Improved

- **Performance Optimizations**
  - Load More buttons now fetch sufficient data for multiple pages
  - Better cache management for paginated content
  - Increased timeouts for Docker environments by 50%
  - Debounced touch events to prevent double-triggering

## [1.0.1] - 2025-08-15

### Added

- **New Components & Services**
  - LoadMoreButton component with preloading support and loading states
  - SkeletonLoader component with multiple variants (card, list, circle, text, image)
  - Client-side services for progressive enhancement (clientServices.js)
  - Performance optimization utilities with lazy loading (performance module)
  - RommCrossReferenceService for client-side ROMM integration
  - WatchlistService with optimistic updates and caching

- **Advanced Performance Features**
  - Modular performance system with lazy-loaded utilities
  - Image proxy endpoint with Redis caching for external images
  - Lazy loader with intersection observer for better image loading
  - Prefetcher service for predictive data loading
  - Performance metrics collection system
  - Bundle optimization with dynamic imports
  - Hover preloading for instant navigation (200ms+ improvement)
  - Server-side cache warming on startup
  - Progressive data loading with prioritization
  - Custom hover preloading for Load More buttons
  - Session-based preload caching
  - Smart timeout protection with graceful fallbacks

- **Enhanced API Endpoints**
  - Individual game API endpoint (/api/games/[id]) with caching
  - Image proxy API (/api/images/proxy) for external image caching
  - ROMM cross-reference API for library availability checks
  - Enhanced game data endpoints with improved error handling

- **Server-Side Optimizations**
  - Server-only auth utilities (auth.server.js) with proper browser guards
  - Server-only ROMM integration (romm.server.js) with batched operations
  - Improved separation of server and client code
  - Enhanced environment variable management

- **Documentation & Project Structure**
  - Reorganized documentation into logical sections (docs/setup/, docs/guides/)
  - Enhanced README with better project structure
  - Improved API documentation
  - Developer notes and troubleshooting guides
  - Consolidated and organized project files for better maintainability

- **Authentication Enhancements**
  - Generic OIDC provider support (not Authentik-specific)
  - Support for Keycloak, Auth0, Okta, Azure AD
  - Provider registry system with lazy loading
  - Basic auth with bcrypt password hashing

### Improved

- **UI/UX Enhancements**
  - Dark theme optimization for skeleton loaders (bg-gray-300 → bg-gray-600)
  - Enhanced game card hover effects with image rotation
  - Better loading states and animations
  - Improved visual feedback throughout the application
  - Fixed homepage state persistence for load more functionality
  - Resolved back navigation state issues after page refresh
  - Enhanced SkeletonLoader component with improved dark theme colors
  - Changed skeleton placeholder colors from light gray to darker gray for better contrast

- **Performance Optimizations**
  - Reduced bundle size through lazy loading and code splitting
  - Optimized image loading with proxy caching
  - Better memory management with modular architecture
  - Reduced server load through client-side optimizations
  - Converted GameCard components to use direct links for native preloading
  - Optimized homepage data fetching with parallel loading
  - Improved error handling with timeout protection

- **Code Quality & Architecture**
  - Better separation of concerns between client and server code
  - Improved error handling and resilience
  - Enhanced type safety and validation
  - More maintainable and scalable codebase structure
  - Updated hooks for proper header mutability

### Technical Improvements

- **State Management**
  - Enhanced homepage state persistence across navigation
  - Intelligent state validation for page refresh scenarios
  - Session-aware cache management with timestamp validation
  - Fixed load more content restoration after back navigation
  - Improved state synchronization between page loads

- **Caching Strategy**
  - Redis-backed image caching with 7-day TTL
  - Intelligent cache invalidation and warming
  - Client-side service caching with TTL management
  - Optimized batch processing for ROMM integration

- **Docker & Environment Improvements**
  - Fixed environment variable loading in Docker production environments
  - Improved dotenv handling for development vs production
  - Enhanced IGDB API integration for containerized deployments
  - Better error handling for missing environment variables

- **Security Enhancements**
  - Proper domain validation for image proxy
  - Enhanced authentication flow separation
  - Better session management and token handling
  - Improved CSRF protection and validation

### Fixed

- Search input focus loss issues
- Headers immutability errors in hooks.server.js
- Missing variable references in preloaders
- ROMM cross-reference API errors

### Refactored & Removed

- **Code Deduplication & Cleanup**
  - Consolidated authentication modules (removed auth.client.js, authHelper.js, authUnified.js)
  - Merged ROMM functionality into server-specific modules (romm.js → romm.server.js)
  - Removed legacy TypeSense integration (typesense.js → typesense.server.js)
  - Eliminated obsolete IGDB client (igdb-node.js) in favor of improved igdb.js

- **Script Consolidation**
  - Restructured database scripts into organized modules (scripts/database/)
  - Removed duplicate deployment scripts (deploy-production.sh, docker-cleanup.sh, etc.)
  - Consolidated migration management into unified db-manager.js
  - Removed redundant setup and utility scripts

- **Documentation Organization**
  - Moved root-level documentation files into structured directories
  - Consolidated setup guides into docs/setup/ (DATABASE_SETUP.md, DOCKER_SETUP.md, etc.)
  - Moved troubleshooting guides into docs/guides/ (ROMM_TROUBLESHOOTING.md, INTEGRATION_GUIDE.md)
  - Removed outdated documentation (README_OLD.md, custom-navigation-setup.md)
  - Archived legacy documentation into docs/dev-notes/

- **Route Cleanup**
  - Removed dedicated auth login routes (consolidated into unified login system)
  - Streamlined authentication flow by removing redundant pages
  - Better separation between setup, login, and application routes

- **Library Reorganization**
  - Split client/server concerns (auth.js + auth.server.js)
  - Removed unused utility modules (lib/index.js)
  - Better module boundaries and cleaner imports

## [1.0.0] - 2025-08-11

### Added

- Initial release of GG Requestz
- SvelteKit 5 application framework
- Authentik OIDC authentication support
- Basic authentication with admin user creation
- IGDB API integration for game data
- Advanced search with Typesense integration
- Redis caching with memory fallback
- PostgreSQL database with connection pooling
- Game request management system
- User role and permission system
- Admin panel for user and request management
- ROMM library integration for game collections
- Gotify notification support
- n8n webhook automation
- Responsive design with Tailwind CSS
- Dark mode support
- PWA capabilities
- Docker containerization
- PM2 process management
- Comprehensive API endpoints
- Real-time search with autocomplete
- Personal watchlists and favorites
- Request status tracking
- Priority-based request handling
- Multi-platform game support
- Cache optimization for performance
- Health check endpoints
- Logging and monitoring capabilities
- Multi-page first-run setup wizard with system checks
- Welcome page with feature overview and IGDB backgrounds
- System connectivity checks for database, Redis, IGDB API, and ROMM
- Enhanced admin account creation with password strength validation
- Setup completion page with FOSS information and next steps
- Comprehensive Docker infrastructure with external service support
- Docker Compose profiles for flexible deployment scenarios
- Automatic database migration system with version tracking
- Production-ready Docker configuration with resource limits
- Development Docker configuration with hot reload support
- External service override files for existing infrastructure
- Comprehensive testing documentation (DOCKER_TESTING.md)
- Enhanced contribution guidelines (CONTRIBUTING.md)
- MIT license for open source distribution
- Comprehensive .env.example with all configuration options

### Changed

- Updated main navigation to hide on login and setup pages
- Enhanced authentication flow with better error handling
- Improved Docker entrypoint with graceful startup and health checks
- Updated README.md with comprehensive deployment scenarios
- Restructured environment configuration for better organization

### Fixed

- Admin users filters now work correctly using URL parameter detection
- Login page navigation properly hidden on all devices
- Setup flow properly redirects from old auth/setup route
- Docker depends_on configuration allows external services
- Environment variable handling in Docker containers

### Security

- Enhanced input validation throughout the application
- Secure session management with configurable secrets
- Protection against common web vulnerabilities
- Safe database migration execution with rollback support

### Technical Details

- Node.js 18+ requirement
- PostgreSQL 12+ database
- Redis 6+ caching (optional)
- Typesense 0.25+ search (optional)
- Docker 20+ and Docker Compose 3.8+
- Modern browser support (ES2022+)

---

## Version History

- **v1.0.0** (2025-08-11): Initial stable release with core functionality
- **v1.0.1** (2025-08-15): Major performance improvements and project reorganization
- **v1.0.2** (2025-08-18): Docker-specific fixes and mobile improvements
- **v1.0.3** (2025-09-23): Pre-built Docker images and authentication improvements
- **v1.1.0** (2025-09-24): Security features, 404 protection, watchlist improvements
- **v1.2.0** (Planned): Enhanced admin features and analytics
- **v2.0.0** (Planned): Major UI/UX improvements and new integrations

## Migration Guides

### Upgrading to v1.0.2

When upgrading from v1.0.1:

1. Docker users should rebuild containers for improved performance
2. Clear Redis cache after upgrade for best results
3. Mobile users will experience better touch interaction

### Upgrading to v1.0.1

When upgrading from v1.0.0:

1. Update your .env file with new configuration options
2. Run database migrations: `npm run db:migrate`
3. Restart your application

### Docker Updates

For Docker deployments:

1. Pull the latest images: `docker compose pull`
2. Restart with migrations: `docker compose up -d`
3. Check health status: `docker compose ps`

## Support and Documentation

- **Installation Guide**: See README.md
- **Docker Guide**: See DOCKER_TESTING.md
- **Contributing**: See CONTRIBUTING.md
- **API Documentation**: Available at `/api/docs` (when enabled)
- **Issue Tracker**: GitHub Issues
- **Community**: GitHub Discussions

## Acknowledgments

Special thanks to all contributors who have helped make GG Requestz possible:

- Core development team
- Community contributors
- Beta testers and feedback providers
- Open source projects that make GG Requestz possible:
  - SvelteKit and the Svelte ecosystem
  - PostgreSQL database
  - Redis caching
  - Typesense search
  - IGDB API
  - Docker and containerization tools

---

**Note**: This changelog is automatically updated with each release. For the most up-to-date information, check the repository's release notes and commit history.
