# G.G Requestz Docker Management Makefile

.PHONY: help build up down logs clean dev prod backup restore health \
	test-blank test-seeded test-live test-down test-logs test-seed test-shell

# Default target
help:
	@echo "🎮 G.G Requestz Docker Management"
	@echo ""
	@echo "📦 Basic Commands:"
	@echo "  build     Build all containers"
	@echo "  up        Start all services"
	@echo "  down      Stop all services"
	@echo "  logs      View logs (use SERVICE=name for specific service)"
	@echo "  clean     Remove containers and volumes"
	@echo ""
	@echo "🔧 Development:"
	@echo "  dev       Start in development mode"
	@echo "  dev-logs  Follow development logs"
	@echo ""
	@echo "🧪 Local test stack (docker-compose.test.yml):"
	@echo "  test-blank   Fresh empty instance — lands on the /setup wizard"
	@echo "  test-seeded  Admin + demo library — lands on /login"
	@echo "  test-live    Seeded, plus real IGDB/ROMM credentials from .env"
	@echo "  test-seed    Re-run the fixture seeding against a running stack"
	@echo "  test-logs    Follow test stack logs"
	@echo "  test-shell   Shell into the test app container"
	@echo "  test-down    Stop the test stack and delete its volumes"
	@echo ""
	@echo "🚀 Production:"
	@echo "  prod      Start production stack"
	@echo ""
	@echo "📊 Monitoring:"
	@echo "  health    Check application health"
	@echo "  status    Show container status"
	@echo "  stats     Show resource usage"
	@echo ""
	@echo "💾 Data Management:"
	@echo "  backup    Create database backup"
	@echo "  restore   Restore from backup (requires BACKUP_FILE=path)"
	@echo "  init-db   Initialize/reset database schema"
	@echo ""
	@echo "Example usage:"
	@echo "  make up"
	@echo "  make logs SERVICE=ggrequestz"
	@echo "  make backup"

# Build containers
build:
	docker compose build

# Start services
up:
	docker compose up -d

# Stop services  
down:
	docker compose down

# View logs
logs:
ifdef SERVICE
	docker compose logs -f $(SERVICE)
else
	docker compose logs -f
endif

# Clean up everything
clean:
	docker compose down -v --remove-orphans
	docker system prune -f

# Development mode
dev:
	docker compose --env-file .env.development up -d

dev-logs:
	docker compose --env-file .env.development logs -f

# Production mode. Compose reads .env from the working directory by default.
prod:
	docker compose -f docker-compose.yml -f docker-compose.production.yml up -d

# Health check
health:
	@echo "🏥 Checking application health..."
	@curl -s http://localhost:3000/api/health | jq . || echo "❌ Health check failed"

# Container status
status:
	docker compose ps

# Resource usage
stats:
	docker stats --no-stream

# Database backup
backup:
	@echo "💾 Creating database backup..."
	@mkdir -p backups
	@docker compose exec -T postgres pg_dump -U postgres ggrequestz > backups/backup_$(shell date +%Y%m%d_%H%M%S).sql
	@echo "✅ Backup created in backups/ directory"

# Restore database
restore:
ifndef BACKUP_FILE
	@echo "❌ Please specify BACKUP_FILE=path/to/backup.sql"
	@exit 1
endif
	@echo "🔄 Restoring database from $(BACKUP_FILE)..."
	@cat $(BACKUP_FILE) | docker compose exec -T postgres psql -U postgres -d ggrequestz
	@echo "✅ Database restored"

# Initialize database schema
init-db:
	@echo "🗄️ Initializing database schema..."
	docker compose exec ggrequestz node scripts/database/db-manager.js init
	@echo "✅ Database schema initialized"

# PM2 management
pm2-status:
	docker compose exec ggrequestz pm2 status

pm2-logs:
	docker compose exec ggrequestz pm2 logs

pm2-restart:
	docker compose exec ggrequestz pm2 restart ggrequestz

# Setup for first time
setup:
	@echo "🔧 Setting up G.G Requestz for first time..."
	@if [ ! -f .env ]; then \
		echo "📄 Copying environment template..."; \
		cp .env.example .env; \
		echo "⚠️  Please edit .env with your configuration before running 'make up'"; \
	else \
		echo "✅ .env already exists"; \
	fi
	@echo "🏗️ Building containers..."
	@$(MAKE) build
	@echo ""
	@echo "🎉 Setup complete! Next steps:"
	@echo "1. Edit .env with your configuration"  
	@echo "2. Run: make up"
	@echo "3. Run: make init-db"
	@echo "4. Access: http://localhost:3000"

# Quick development setup
dev-setup:
	@echo "🔧 Setting up development environment..."
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "NODE_ENV=development" >> .env; \
		echo "POSTGRES_PASSWORD=dev123" >> .env; \
		echo "SESSION_SECRET=dev_session_secret_change_in_production" >> .env; \
	fi
	@$(MAKE) build
	@$(MAKE) dev
	@sleep 10
	@$(MAKE) init-db
	@echo "🎉 Development setup complete!"
	@echo "🌐 Application: http://localhost:3000"
	@echo "🗄️ PostgreSQL: localhost:5432"

# ---------------------------------------------------------------------------
# Local test stack — a real Docker install built from this working tree, plus
# RomM and Keycloak fixtures. See docs/setup/TESTING.md.
#
# Two modes, because they test different things and are mutually exclusive:
#
#   test-blank   no admin, no data. needsInitialSetup() is true, so the app
#                redirects to /setup. This is the only way to exercise the
#                first-run wizard, and seeding destroys the state.
#   test-seeded  admin, demo library, requests, watchlist. Lands on /login.
#
# Both start from an empty volume, so switching between them means test-down
# first — which the targets do for you.
# ---------------------------------------------------------------------------

# --env-file /dev/null is load-bearing. Compose automatically reads ./.env for
# ${VAR:-default} interpolation, so without this every default in
# docker-compose.test.yml resolved from the *production* .env: the stack
# inherited AUTH_METHOD=authentik (which hardcodes needsSetup=false and hides
# the setup wizard entirely), the real SESSION_SECRET, and the real
# ROMM_SERVER_URL. The test stack is meant to be self-contained.
TEST_COMPOSE = docker compose --env-file /dev/null -f docker-compose.test.yml

# test-live is the deliberate exception: it reads .env so the real IGDB and ROMM
# credentials interpolate through. docker-compose.test.live.yml pins everything
# else back to the test values. No romm profile — it points at a real ROMM.
TEST_LIVE_COMPOSE = docker compose --env-file .env \
	-f docker-compose.test.yml -f docker-compose.test.live.yml
TEST_LIVE_PROFILES = --profile oidc

TEST_PROFILES = --profile romm --profile oidc

# Shared: wipe any previous stack and bring a fresh one up. Starting from a
# deleted volume is what makes "blank" mean blank.
define test_stack_up
	mkdir -p tmp/test-fixtures/romm-library/roms tmp/test-fixtures/romm-assets
	$(1) --profile all down -v 2>/dev/null || true
	$(1) $(2) up -d --build
endef

define test_stack_banner
	@echo ""
	@echo "App:      http://127.0.0.1:$${GGR_TEST_PORT:-3100}"
	@echo "RomM:     http://127.0.0.1:$${ROMM_TEST_PORT:-8090}"
	@echo "Keycloak: http://127.0.0.1:$${KEYCLOAK_TEST_PORT:-8091}"
	@echo ""
endef

# A brand new installation: schema and system roles only, no admin.
test-blank:
	$(call test_stack_up,$(TEST_COMPOSE),$(TEST_PROFILES))
	$(call test_stack_banner)
	@echo "Blank instance. Open the app and it will redirect to /setup."
	@echo "Do NOT run 'make test-seed' — creating the admin ends the blank state."

# A populated installation: admin, demo library, requests, watchlist.
test-seeded:
	$(call test_stack_up,$(TEST_COMPOSE),$(TEST_PROFILES))
	@$(MAKE) --no-print-directory test-seed
	./scripts/testing/seed-romm.sh
	./scripts/testing/seed-keycloak.sh
	$(call test_stack_banner)
	@echo "Seeded instance. Sign in at /login."

# Seeded, plus the real IGDB and ROMM credentials from .env, for exercising the
# live integrations. The database and cache stay disposable.
test-live:
	@test -f .env || { echo "❌ .env not found — test-live layers it for credentials"; exit 1; }
	$(call test_stack_up,$(TEST_LIVE_COMPOSE),$(TEST_LIVE_PROFILES))
	@$(MAKE) --no-print-directory test-seed
	$(call test_stack_banner)
	@echo "Seeded instance with live IGDB/ROMM credentials from .env."

# Provision the admin and demo data against a stack that is already running.
# seed-app.sh runs first so there is an account to sign in with, and it also
# waits for the entrypoint's migrations, which seed-data.js needs.
#
# The RomM and Keycloak fixtures are seeded by test-seeded only: test-live
# points at a real ROMM, so provisioning the local fixture there is meaningless.
test-seed:
	./scripts/testing/seed-app.sh
	node scripts/testing/seed-data.js

test-logs:
ifdef SERVICE
	$(TEST_COMPOSE) logs -f $(SERVICE)
else
	$(TEST_COMPOSE) logs -f
endif

test-shell:
	$(TEST_COMPOSE) exec app sh

# Removes volumes too — the stack is disposable by design
test-down:
	$(TEST_COMPOSE) --profile all down -v
