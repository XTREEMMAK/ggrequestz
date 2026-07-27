# 📚 GG Requestz Documentation

Setup, deployment and reference material for running a GG Requestz instance.

## 🚀 Getting Started

- [Quick Start Guide](../QUICKSTART.md) — Docker setup, running from source, environment configuration
- [Configuration Guide](CONFIGURATION.md) — every environment variable the code reads
- [Architecture Overview](ARCHITECTURE.md) — system design and components

## ⚙️ Setup

- [Database Setup](setup/DATABASE_SETUP.md) — PostgreSQL settings, migrations, backups
- [OIDC / SSO Setup](setup/OIDC_SETUP.md) — any OIDC provider, plus roles and admin access
- [Production Deployment](setup/DEPLOYMENT.md) — reverse proxy, TLS, scaling, upgrades
- [Local Test Environment](setup/TESTING.md) — disposable stack with live RomM and Keycloak fixtures

## 🔌 Guides

- [Integrations](guides/INTEGRATIONS.md) — ROMM, Gotify, n8n
- [Custom Navigation](guides/NAVIGATION.md) — role-based navigation links
- [API Documentation](API.md) — REST API reference
- [Release Guide](guides/RELEASE_GUIDE.md) — cutting a release

## 🏗️ Development

- [Contributing Guide](../CONTRIBUTING.md) — development guidelines and standards
- [Working Agreements](../CLAUDE.md) — commit discipline, performance rules, migration constraints
- [Changelog](../CHANGELOG.md) — version history

## 🗂️ Structure

```
docs/
├── README.md                    # This index
├── ARCHITECTURE.md              # System architecture
├── API.md                       # API reference
├── CONFIGURATION.md             # Environment variable reference
├── setup/
│   ├── DATABASE_SETUP.md        # PostgreSQL and migrations
│   ├── DEPLOYMENT.md            # Production deployment
│   ├── OIDC_SETUP.md            # SSO, roles, admin access
│   └── TESTING.md               # Local Docker test stack
├── guides/
│   ├── INTEGRATIONS.md          # ROMM, Gotify, n8n
│   ├── NAVIGATION.md            # Custom navigation links
│   └── RELEASE_GUIDE.md         # Cutting a release
└── dev-notes/                   # Records of past investigations
    ├── V1.3_FINDINGS.md         # v1.3 root causes and open items
    └── ARCHIVE_LOGIN_ANIMATION.md
```

## 🆘 Getting Help

1. **Setup problems** — the guide for that service in `setup/`
2. **An integration isn't working** — [guides/INTEGRATIONS.md](guides/INTEGRATIONS.md), then the container logs
3. **Development questions** — [CONTRIBUTING.md](../CONTRIBUTING.md)
4. **Bugs and feature requests** — [open an issue](https://github.com/XTREEMMAK/ggrequestz/issues)

## 🔄 Maintaining these docs

Documentation must describe **shipped behavior**. Several guides here once
documented environment variables that no code read, which produced user-facing
bug reports ([#4](https://github.com/XTREEMMAK/ggrequestz/issues/4),
[#7](https://github.com/XTREEMMAK/ggrequestz/issues/7)). When you change a
documented setting, grep for it in `src/` before writing about it, and say so
explicitly when a feature is planned rather than implemented.
