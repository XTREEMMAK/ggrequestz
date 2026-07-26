# 📚 GG Requestz Documentation

Welcome to the comprehensive documentation for GG Requestz. This directory contains all the guides and references you need to set up, deploy, and maintain your GG Requestz instance.

## 📖 Table of Contents

### 🚀 Getting Started

- [Quick Start Guide](../QUICKSTART.md) - Docker setup, running from source, environment configuration
- [Architecture Overview](ARCHITECTURE.md) - System design and components

### ⚙️ Setup & Configuration

- [Database Setup](setup/DATABASE_SETUP.md) - PostgreSQL configuration and migrations
- [Docker Setup](setup/DOCKER_SETUP.md) - Container deployment guide
- [Docker Updates](setup/DOCKER_UPDATES.md) - Updating Docker deployments
- [Authentication Setup](setup/AUTHENTIK_ADMIN_SETUP.md) - OIDC authentication configuration
- [OIDC Setup](setup/OIDC_SETUP.md) - Generic OIDC provider setup
- [Navigation Setup](setup/NAVIGATION_SETUP.md) - Custom navigation configuration
- [Deployment Guide](setup/DEPLOYMENT.md) - Production deployment strategies

### 🔌 Integrations & Guides

- [Integration Guide](guides/INTEGRATION_GUIDE.md) - Third-party service integrations
- [ROMM Troubleshooting](guides/ROMM_TROUBLESHOOTING.md) - ROMM integration troubleshooting
- [API Documentation](API.md) - API endpoints and usage

### 🏗️ Development

- [Contributing Guide](../CONTRIBUTING.md) - Development guidelines and standards
- [Changelog](../CHANGELOG.md) - Version history and changes

### 🎨 UI/UX

- **SkeletonLoader Component**: Enhanced with dark theme-optimized colors for better visual consistency
- **Preloading System**: Hover-based data preloading for improved navigation performance

## 🗂️ Documentation Structure

```
docs/
├── README.md                    # This index file
├── ARCHITECTURE.md              # System architecture overview
├── API.md                       # API documentation
├── CONFIGURATION.md             # Full environment variable reference
├── setup/                       # Setup and configuration guides
│   ├── DATABASE_SETUP.md        # Database configuration
│   ├── DOCKER_SETUP.md          # Docker deployment
│   ├── DOCKER_UPDATES.md        # Docker updates
│   ├── DEPLOYMENT.md            # Production deployment
│   ├── TESTING.md               # Local Docker test stack with live fixtures
│   ├── AUTHENTIK_ADMIN_SETUP.md # Authentication setup
│   ├── OIDC_SETUP.md            # OIDC configuration
│   └── NAVIGATION_SETUP.md      # Navigation configuration
├── guides/                      # Integration and troubleshooting guides
│   ├── INTEGRATION_GUIDE.md     # Third-party integrations
│   ├── ROMM_TROUBLESHOOTING.md  # ROMM troubleshooting
│   ├── MIGRATION_v1.0.3.md      # Upgrade notes for v1.0.3
│   └── RELEASE_GUIDE.md         # Cutting a release
└── dev-notes/                   # Records of past investigations
    ├── V1.3_FINDINGS.md         # v1.3 root causes and open items
    └── ARCHIVE_LOGIN_ANIMATION.md
```

## 🆘 Getting Help

1. **Quick Issues**: Check the troubleshooting guides in `guides/`
2. **Setup Problems**: Review the setup guides in `setup/`
3. **Development Questions**: See the [Contributing Guide](../CONTRIBUTING.md)
4. **Feature Requests**: Open an issue on the project repository

## 🔄 Documentation Updates

This documentation is maintained alongside the codebase. When making changes:

1. Update relevant documentation files
2. Ensure links remain valid
3. Test setup procedures
4. Update this index if new documents are added

---

**Need to get started quickly?** Jump to the [Quick Start Guide](../QUICKSTART.md)!
