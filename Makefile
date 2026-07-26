# GameRequest Docker Management Makefile

.PHONY: help build up down logs clean dev prod backup restore health \
	test-up test-down test-logs test-seed test-shell

# Default target
help:
	@echo "🎮 GameRequest Docker Management"
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
	@echo "  test-up     Build and start the test stack + fixtures"
	@echo "  test-seed   Seed the admin login, RomM and Keycloak into known states"
	@echo "  test-logs   Follow test stack logs"
	@echo "  test-shell  Shell into the test app container"
	@echo "  test-down   Stop the test stack and delete its volumes"
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
	@echo "🔧 Setting up GameRequest for first time..."
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
# ---------------------------------------------------------------------------

TEST_COMPOSE = docker compose -f docker-compose.test.yml
TEST_PROFILES = --profile romm --profile oidc

# Build and start the app, database, cache and integration fixtures
test-up:
	mkdir -p tmp/test-fixtures/romm-library/roms tmp/test-fixtures/romm-assets
	$(TEST_COMPOSE) $(TEST_PROFILES) up -d --build
	@echo ""
	@echo "App:      http://127.0.0.1:$${GGR_TEST_PORT:-3100}"
	@echo "RomM:     http://127.0.0.1:$${ROMM_TEST_PORT:-8090}"
	@echo "Keycloak: http://127.0.0.1:$${KEYCLOAK_TEST_PORT:-8091}"
	@echo ""
	@echo "Next: make test-seed"

# Provision the admin and fixtures, and print the env vars to configure the app
# with. seed-app.sh runs first so there is an account to sign in with before the
# integration config is printed.
test-seed:
	./scripts/testing/seed-app.sh
	./scripts/testing/seed-romm.sh
	./scripts/testing/seed-keycloak.sh

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
