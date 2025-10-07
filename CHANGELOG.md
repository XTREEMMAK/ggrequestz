# Changelog

All notable changes to GG Requestz will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.5] - 2025-10-06

### ✨ New Features

- **Global Content Filtering System**
  - Added system-wide content filtering that supersedes user preferences
  - Admins can now ban specific games globally by IGDB ID
  - Support for global keyword blocking in game titles
  - Global genre exclusion filters
  - Global ESRB rating limits and mature content filters
  - All global filters apply across homepage, search, and API results

- **Enhanced Admin Settings**
  - New "Content Filtering" section in Admin Settings
  - Real-time game search for adding games to ban list
  - Watchlist integration for banned games management
  - Genre selection with multi-select interface
  - Custom keyword blocking with visual tag management

### 🐛 Bug Fixes

- **Content Filter Enforcement**
  - Fixed banned games appearing in Popular Games section
  - Fixed banned games appearing in Recent Releases section
  - Fixed banned games appearing in ROMM cross-reference results
  - Fixed client-side cached data overriding server-filtered results
  - Fixed session storage restoration bypassing global filters
  - Fixed array type validation errors when loading filter settings
  - Fixed `globalExcluded is not iterable` error in filter merging

- **Toast Notifications**
  - Fixed toast notifications not appearing on admin pages
  - Increased z-index from 50 to 9999 for proper display above modals
  - Added toast notifications to all admin settings save operations

- **Mobile Layout**
  - Fixed admin panel content appearing under sticky navigation on mobile
  - Changed from padding-top to margin-top (50px) for correct spacing

- **Form Validation**
  - Added requirement for at least 1 platform selection before request submission
  - Added toast error notifications for validation failures

### 🔧 Performance & Code Quality

- **Migration Consolidation**
  - Consolidated migrations 002-005 into single migration file
  - Moved legacy individual migrations to `migrations/legacy/` folder
  - Improved database setup efficiency for new installations

- **Code Cleanup**
  - Removed excessive debug logging from production code
  - Cleaned up array validation patterns across codebase
  - Simplified session storage restoration logic
  - Streamlined global filter application in homepage data loading

- **Array Type Safety**
  - Added comprehensive `Array.isArray()` checks throughout codebase
  - Fixed `.includes is not a function` errors in admin settings
  - Fixed `.map is not a function` errors in game filtering
  - Added fallback empty arrays for all JSON array fields from database

### 📚 Documentation

- Updated migration tracking for consolidated schema
- Added detailed comments for global filter functionality
- Documented filter precedence (global > user preferences)

## [1.2.4] - 2025-10-06

### 🐛 Bug Fixes

- **Environment Configuration**
  - Fixed development environment loading `.env` instead of `.env.development`
  - Renamed `.env.dev` → `.env.development` to follow Vite/SvelteKit conventions
  - Updated npm scripts to set `NODE_ENV=development` for proper env file loading
  - Server-side code now correctly uses `.env.development` in development mode
  - Created `load-env.js` preloader to ensure correct environment file loading with `--import` flag

- **API Key Authentication**
  - Fixed API request endpoint returning 302 redirects instead of 401 errors
  - Moved `/request` API endpoint to `/api/request` for consistency and proper authentication flow
  - Fixed all API endpoints to support API key authentication (Bearer token)
  - Added `request` parameter to `getAuthenticatedUser()` calls across 8+ endpoints
  - Created `getUserIdFromAuth()` utility for consistent user ID extraction across auth types
  - Fixed `/api/user/preferences`, `/api/watchlist/*`, `/api/request/rescind` endpoints
  - Updated client API calls and documentation to reflect new endpoint location

- **API Documentation**
  - Fixed Scalar API documentation not loading after Vue deprecation fix
  - Added `/api/openapi.json` to public routes list for unauthenticated access
  - Added Vue feature flags to `vite.config.js` for proper Scalar rendering
  - Reverted spec.url format to working configuration

### 🎨 UI Improvements

- **Admin Settings Page**
  - Added yellow info notice to external integrations section
  - Warning users that test configuration should be moved to environment file

- **Admin API Keys Page**
  - Added "API Docs" button for easy access to interactive API documentation

### 🔒 Security

- **CRITICAL: Fixed Privilege Escalation Vulnerabilities**
  - **CVE-2025-SELF-ROLE**: Users can no longer assign or remove roles from themselves
  - **CVE-2025-ROLE-PERMS**: Non-admins blocked from modifying role permissions to grant themselves admin access
  - Added comprehensive security checks to prevent horizontal and vertical privilege escalation
  - Role assignment now requires `role.assign` permission (with `user.edit` fallback for backward compatibility)
  - Role permission editing now requires BOTH `role.edit_permissions` permission AND admin status
  - System roles (admin, user) are now protected from modification
  - Only administrators can assign/remove admin-level roles
  - Last admin protection: prevents removal of the final administrator
  - All role modification attempts are now logged for audit trail

- **Authentication & Authorization Fixes**
  - Fixed basic auth users with role-based admin permissions unable to access admin panel
  - Fixed basic auth admins unable to see "Admin Panel" menu item in sidebar
  - Fixed Authentik users getting 403 when creating API keys
  - Fixed getUserPermissions() trusting session token instead of querying database for basic auth users
  - Added role-based permission checks for basic auth users (previously only checked `is_admin` flag)
  - Unified permission checking across all auth methods (Basic Auth and Authentik)

### ✨ New Features

- **Granular API Key Management Permissions**
  - Added 5 new API key permissions: `apikey.view`, `apikey.create`, `apikey.revoke`, `apikey.delete`, `apikey.manage_all`
  - Admin role gets all API key permissions by default
  - User role gets view, create, and revoke permissions (can manage own keys)
  - API key endpoints now check specific permissions instead of just admin status
  - Allows fine-grained delegation of API key management capabilities

- **Role Management Permission System**
  - Added 5 new role management permissions: `role.view`, `role.create`, `role.edit_permissions`, `role.delete`, `role.assign`
  - Separates viewing roles from modifying them (security best practice)
  - Only admins with `role.edit_permissions` can modify what permissions a role has
  - Prevents managers/moderators from escalating privileges via role manipulation
  - Implements enterprise RBAC security model with separation of duties

### 🐛 Bug Fixes

- **Critical Migration System Fix**
  - Fixed broken migrations table schema detection in db-manager
  - Now properly detects and fixes ANY incorrect migration table schema (not just old versions)
  - Handles migrations tables with missing columns (executed_at, checksum, etc.)
  - Automatically drops and recreates broken migration tables on container restart
  - Fixes "column 'applied_at' does not exist" and similar migration errors
  - Ensures migration 002 runs properly to create ggr_api_keys table

- **Database Schema Fix**
  - Fixed missing `updated_at` column in ggr_games_cache table (migration 001 bug)
  - Migration 002 now adds the missing column to fix trigger errors
  - Resolves "record 'new' has no field 'updated_at'" PostgreSQL errors
  - Fixes INSERT/UPDATE failures on games cache table

- **Docker Health Check & Setup Endpoints**
  - Added /api/health to public API routes (fixes Docker unhealthy status)
  - Added /api/setup/ to public API routes (fixes setup on fresh installs)
  - Health checks and setup endpoints now work without authentication

- **API Keys UI**
  - Fixed API keys list not refreshing after creating new key
  - Changed keys state from $state to $derived for automatic reactivity
  - List now updates immediately without browser refresh
  - Replaced browser confirm() dialogs with proper modal components
  - Added styled confirmation modal for revoke/delete actions with warning icons
  - Fixed admin API routes (/admin/api/\*) being blocked by API authentication
  - Fixed basic auth users getting 401 when creating API keys
  - Fixed basic auth admins getting 403 due to missing permission records
  - Standardized user object to include both `id` and `user_id` fields for compatibility
  - Simplified permission checks to use `is_admin` flag instead of database permission lookups
  - Admin users can now create/delete/revoke API keys properly with both auth methods

- **OpenAPI Documentation**
  - Renamed DOMAIN to PUBLIC_SITE_URL for clarity and consistency
  - OpenAPI docs now show correct domain instead of internal Docker address
  - Updated .env.example and docker-compose.yml to use PUBLIC_SITE_URL
  - Format: `PUBLIC_SITE_URL=https://yourdomain.com` (include protocol)

## [1.2.3] - 2025-10-02

### 🔒 Security Fixes

- **CRITICAL: Fixed API Authentication Bypass Vulnerability**
  - All API endpoints were publicly accessible regardless of authentication token
  - Implemented proper public API routes whitelist (only /api/auth/, /api/version, /api/images/proxy, /api/webhooks/, /api/docs are public)
  - All other API routes now properly require authentication (session or API key)
  - Returns 401 Unauthorized with helpful error message for unauthenticated API requests
  - Fixed inverted authentication logic that was bypassing security checks

### ✨ New Features

- **API Key Management System**
  - Complete API key management interface in admin panel
  - Secure API key generation using bcrypt hashing (ggr\_<64 hex characters> format)
  - Scope-based permissions system (games:read, requests:write, admin:write, etc.)
  - API key expiration support with automatic validation
  - Keys shown only once upon creation for security
  - Track last usage timestamp and manage active/revoked status
  - Modern UI with card-based layout, status badges, and smooth transitions
  - API Keys menu added to admin navigation with key icon

- **Enhanced API Documentation**
  - Comprehensive OpenAPI 3.0 specification with all endpoints documented
  - Added 8+ new endpoint groups: game requests, OAuth flows, setup endpoints, IGDB integration, cache management
  - Detailed request/response schemas with examples
  - Security requirements properly defined for each endpoint
  - Fixed Scalar API Reference integration for better developer experience
  - Dynamic OpenAPI spec generation using environment variables (PUBLIC_SITE_URL)
  - Server URLs automatically adjust for development/production environments

### 🐛 Bug Fixes

- **Admin UI Improvements**
  - Fixed main sidebar appearing under admin sidebar when collapsed
  - Resolved content padding issues on admin pages
  - Proper z-index hierarchy (admin sidebar: z-60, main sidebar: z-40)
  - Added CSS :has() selector to completely hide main sidebar on admin pages
  - Fixed layout shift caused by reserved sidebar space

- **Cache & Performance**
  - Extended homepage cache from 5 to 15 minutes to prevent unnecessary rebuilds
  - Added cache invalidation after request submission for immediate UI updates
  - Game request details now appear instantly in admin list without page refresh

### 🔧 Technical Changes

- **Database**
  - Added ggr_api_keys table with proper indexes
  - Foreign key constraints for user relationships
  - JSONB scopes field for flexible permission management
  - Unique constraint on key_prefix for fast lookups

- **API Authentication Flow**
  - Priority order: API Key (Bearer token) → Authentik session → Basic auth session
  - Improved error handling and logging for auth failures
  - API key authentication updates last_used_at timestamp

- **Code Quality**
  - Formatted all files with Prettier
  - Passed svelte-check type checking
  - Fixed module import issues in API documentation page
  - Improved transition animations across admin UI

### 📝 Documentation

- **OpenAPI Specification**
  - Complete API reference at /api/docs
  - All endpoints documented with examples
  - Security schemes for API keys and session auth
  - Proper error response documentation

## [1.2.2] - 2025-09-29

### Database & Migration Fixes

- **Docker Installation Bug Fix**
  - Fixed critical Docker entrypoint bug preventing migrations from running on fresh installs
  - Fresh Docker installations now properly run both `init` and `migrate` commands
  - Resolved missing tables (ggr_user_preferences, ggr_genre_metadata) on new deployments

- **Migration Consolidation**
  - Consolidated migrations 002-007 into single comprehensive migration for fresh installs
  - Archived legacy migration files to prevent accidental execution
  - Fixed content_rating field type from VARCHAR(255) to TEXT to handle long IGDB descriptions
  - Improved database initialization reliability and performance

### Code Quality & Performance

- **Debug Cleanup**
  - Removed console.log statements and debugging code from previous development iterations
  - Fixed syntax errors in viewport observer and performance metrics modules
  - Cleaned up empty function bodies and missing console.log statements

- **Smooth Card Scaling**
  - Restored smooth scaling functionality for game card sizing slider
  - Replaced CSS Grid with Flexbox + CSS clamp() for continuous scaling
  - Implemented high-precision range slider (0.1 increments) for smooth transitions
  - Cards now dynamically adjust items per row without overlapping
  - Fixed step-wise adjustments to provide truly smooth scaling experience

- **Code Formatting & Linting**
  - Applied Prettier formatting across entire codebase
  - Ensured all files pass ESLint requirements
  - Fixed remaining syntax errors preventing build and formatting

### Technical Improvements

- **Grid Layout System**
  - Migrated from CSS Grid minmax() to Flexbox with CSS clamp() for smooth scaling
  - Added dynamic CSS custom properties for responsive card sizing
  - Improved mobile viewport handling with better responsive breakpoints

- **Performance Optimizations**
  - Enhanced viewport observation for intelligent preloading
  - Improved scroll position management and restoration
  - Optimized performance metrics collection and monitoring

- **Database Schema Improvements**
  - Enhanced content_rating field to handle unlimited length descriptions
  - Improved migration tracking and compatibility with existing installations
  - Added comprehensive database utility functions for content filtering

## [1.2.1] - 2025-09-28

### Bug Fixes

- **Popular Games Display**
  - Fixed Popular Games section not showing on homepage due to progressive loading logic
  - Changed showPopularGames state from false to true for immediate display
  - Popular Games API was working correctly but frontend visibility was blocked

- **Cover Image Quality**
  - Upgraded Popular Games to use high-quality covers instead of low-quality thumbnails
  - Fixed cover URLs to use `t_cover_big` format instead of default `t_thumb`
  - Applied existing `getHighQualityCover()` function to Popular Games formatting

- **Admin Panel Improvements**
  - Added missing collapse button functionality to admin sidebar
  - Integrated admin layout with shared sidebar collapse state store
  - Added responsive sidebar width transitions and floating expand button
  - Added tooltips for navigation items when sidebar is collapsed
  - Fixed main content padding to adjust for collapsed admin sidebar

- **User Interface Polish**
  - Removed dark background from user button when main sidebar is collapsed
  - Improved visual consistency between main and admin layouts
  - Enhanced sidebar collapse functionality across all admin pages

- **Mobile Admin Sidebar**
  - Fixed mobile admin sidebar not closing when navigation items are clicked
  - Added proper onclick handlers to navigation links for better mobile UX
  - Mobile menu now automatically closes after selecting a navigation item

- **Content Security Policy**
  - Fixed CSP violation for confetti library web workers
  - Added `worker-src` directive allowing blob URLs for web worker creation
  - Confetti animations now work properly without CSP errors

- **Development Server Issues**
  - Fixed Vite dependency cache issues causing 504 errors
  - Resolved outdated optimize dependency errors for canvas-confetti
  - Improved development server stability and module loading

### Technical Improvements

- Fixed IGDB query concatenation issues that were causing API syntax errors
- Improved genre filtering reliability in Popular Games section
- Enhanced sidebar state management with proper store integration
- Better responsive design for admin panel with collapsed sidebar support
- Enhanced CSP configuration in `svelte.config.js` with proper worker-src directive
- Improved mobile navigation UX with automatic sidebar closing
- Better error handling for development environment dependency issues

## [1.2.0] - 2025-09-27

### Major Features

- **Comprehensive Content Filtering System**
  - Fixed content filtering for Popular Games API to respect all user ESRB preferences (not just Maximum E users)
  - Implemented dual-layer filtering: official ESRB ratings + title-based keyword detection
  - Enhanced custom content blocks with UI for entering custom words/phrases to filter
  - Added comprehensive mature content keyword list for automatic title-based detection
  - Fixed content filtering to work "across all of them completely" for all rating levels
  - Content filtering now applies to Popular Games, Recent Games, and Search results

- **Enhanced Genre Filtering**
  - Fixed genre filtering bypass in New Releases load more functionality
  - Corrected server-side IGDB API syntax for genre exclusions
  - Genre filtering now works consistently across Popular Games and Recent Games sections
  - Fixed incorrect syntax from `genres != [id1,id2]` to proper `(genres != id1 & genres != id2)`

- **Custom Content Blocks UI**
  - Added complete Custom Content Blocks section to user preferences page
  - Users can now enter custom words or phrases to filter from game titles and content warnings
  - Real-time add/remove functionality with visual feedback
  - Enhanced filtering works against both IGDB content warnings and game titles
  - Persistent storage of custom blocks in user preferences

- **User Registration System**
  - Implemented complete user registration system for basic auth
  - New users can self-register with username/password authentication
  - Registration form with password confirmation and validation
  - Automatic user creation in database with proper role assignment
  - Enhanced authentication flow to support both existing and new users

### Enhanced User Interface

- **Homepage Grid Layout Improvements**
  - Fixed oversized game covers when only one game displays on homepage
  - Improved CSS grid layout from `1fr` to fixed `200px` max width with centering
  - Added responsive grid system with `repeat(auto-fit, minmax(180px, 200px))`
  - Removed maximum width constraints from main game container for better flexibility
  - Better visual balance for varying numbers of games displayed

- **Sidebar Enhancements**
  - Added darker background (`bg-gray-800`) behind username button for better visibility
  - Enhanced sidebar visual hierarchy and contrast
  - Applied background styling to both collapsed and expanded sidebar states

- **Profile Page Custom Content Blocks**
  - Interactive input field for adding new content blocks
  - Visual list of current blocked terms with remove functionality
  - Real-time updates with optimistic UI updates
  - Keyboard shortcuts (Enter to add) for better UX

### Fixed

- **Content Filtering Issues**
  - Fixed missing `user_id` parameter in Popular Games API calls preventing content filtering
  - Fixed `ReferenceError: skipESRB is not defined` errors across multiple functions
  - Fixed content filtering not being applied during client-side pagination
  - Fixed Recent Games API missing user preferences parameter
  - Fixed Popular Games load more not respecting user ESRB preferences

- **API and Database Issues**
  - Fixed watchlist batch API `TypeError: watchlistStatuses.forEach is not a function`
  - Removed incorrect use of `cacheUserPermissions` wrapper causing Map iteration failures
  - Fixed user ID extraction logic across different authentication methods
  - Enhanced user ID resolution for both basic auth and JWT sessions

- **Genre Filtering Bypass**
  - Fixed server-side genre exclusion syntax in IGDB API queries
  - Fixed client-side fallback filtering not being applied consistently
  - Resolved genre filtering bypass in New Releases load more functionality

### Code Quality & Performance

- **Major Code Deduplication**
  - Created new `$lib/api/apiUtils.js` module consolidating duplicate API patterns
  - Reduced Popular Games API from 110 to 88 lines (20% reduction)
  - Reduced Recent Games API from 49 to 38 lines (22% reduction)
  - Eliminated duplicate pagination, user preferences, and error handling code
  - Consolidated API response building into reusable utilities

- **Enhanced API Utilities**
  - `parsePaginationParams()` for consistent pagination handling
  - `loadUserPreferences()` for user preference loading with filter checks
  - `handleApiError()` for standardized error handling and logging
  - `buildPaginatedResponse()` for consistent API response formatting

- **Removed Code Duplication**
  - Removed duplicate `resolveAgeRatings` function from `igdb.js`
  - Consolidated content rating logic into `contentRating.js`
  - Eliminated ~200+ lines of duplicate code across API endpoints
  - Improved maintainability and consistency

### Enhanced

- **Authentication System**
  - Enhanced user ID extraction logic for both basic auth and JWT tokens
  - Improved session handling across different authentication methods
  - Better error handling for authentication failures
  - Consistent user context across all API endpoints

- **Content Rating System**
  - Enhanced mature content keyword detection with comprehensive term list
  - Improved title-based filtering accuracy
  - Better integration between ESRB ratings and custom content blocks
  - More robust content filtering across all game discovery sections

- **User Preferences System**
  - Enhanced user preferences loading with filter-specific checks
  - Improved preference persistence and validation
  - Better integration between client-side UI and server-side filtering
  - Consistent preference application across all API endpoints

### Technical Changes

- **API Improvements**
  - Standardized user preference loading across all game API endpoints
  - Enhanced error handling with consistent logging and user feedback
  - Improved pagination handling with reusable utilities
  - Better separation of concerns between client and server code

- **Database Optimizations**
  - Enhanced user ID resolution logic for different authentication types
  - Improved query patterns for user preference loading
  - Better error handling for database operations
  - Consistent user context extraction across endpoints

- **Client-Side Enhancements**
  - Added `getUserId()` helper function for consistent user context
  - Enhanced API call patterns with proper user parameter passing
  - Improved error handling and user feedback in UI components
  - Better state management for user preferences

### Migration Notes

When upgrading from v1.1.4 to v1.2.0:

1. **Content Filtering**:
   - Content filtering is now properly enabled for all users automatically
   - Custom content blocks UI is now available in user profile preferences
   - No manual configuration required - filtering works out of the box

2. **User Registration**:
   - New user registration system allows self-service account creation
   - Existing users are unaffected and authentication remains the same
   - Registration is available at `/register` for new basic auth users

3. **API Changes**:
   - All game API endpoints now properly respect user content filtering preferences
   - No client-side changes required - filtering is applied server-side
   - Custom content blocks are automatically applied to search results

4. **Database**:
   - No database migrations required
   - Existing user preferences work with new filtering system
   - Custom content blocks use existing user preferences table structure

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
  - **Note**: This fix was incomplete - see Unreleased section for proper Vite/SvelteKit integration
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
  - Development scripts now use `.env.development` by default (Vite convention)
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
