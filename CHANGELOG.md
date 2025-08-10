# Changelog

All notable changes to GameRequest will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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

## [1.0.0] - 2024-12-XX

### Added
- Initial release of GameRequest
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

### Technical Details
- Node.js 18+ requirement
- PostgreSQL 12+ database
- Redis 6+ caching (optional)
- Typesense 0.25+ search (optional)
- Docker 20+ and Docker Compose 3.8+
- Modern browser support (ES2022+)

---

## Version History

- **v1.0.0**: Initial stable release with core functionality
- **v1.1.0** (Planned): Advanced user integrations and API enhancements
- **v1.2.0** (Planned): Enhanced admin features and analytics
- **v2.0.0** (Planned): Major UI/UX improvements and new integrations

## Migration Guides

### Upgrading to v1.1.0
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

Special thanks to all contributors who have helped make GameRequest possible:

- Core development team
- Community contributors  
- Beta testers and feedback providers
- Open source projects that make GameRequest possible:
  - SvelteKit and the Svelte ecosystem
  - PostgreSQL database
  - Redis caching
  - Typesense search
  - IGDB API
  - Docker and containerization tools

---

**Note**: This changelog is automatically updated with each release. For the most up-to-date information, check the repository's release notes and commit history.