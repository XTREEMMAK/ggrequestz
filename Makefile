# GameRequest Docker Management Makefile

.PHONY: help build up down logs clean dev prod backup restore health

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
	@echo "🚀 Production:"
	@echo "  prod      Start production stack"
	@echo "  prod-full Start with all optional services"
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
	docker-compose build

# Start services
up:
	docker-compose up -d

# Stop services  
down:
	docker-compose down

# View logs
logs:
ifdef SERVICE
	docker-compose logs -f $(SERVICE)
else
	docker-compose logs -f
endif

# Clean up everything
clean:
	docker-compose down -v --remove-orphans
	docker-compose -f docker-compose.dev.yml down -v --remove-orphans
	docker system prune -f

# Development mode
dev:
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d

dev-logs:
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml logs -f

# Production mode
prod:
	docker-compose up -d

# Production with all services
prod-full:
	docker-compose --profile notifications --profile proxy up -d

# Health check
health:
	@echo "🏥 Checking application health..."
	@curl -s http://localhost:3000/api/health | jq . || echo "❌ Health check failed"

# Container status
status:
	docker-compose ps

# Resource usage
stats:
	docker stats --no-stream

# Database backup
backup:
	@echo "💾 Creating database backup..."
	@mkdir -p backups
	@docker-compose exec -T postgres pg_dump -U postgres ggrequestz > backups/backup_$(shell date +%Y%m%d_%H%M%S).sql
	@echo "✅ Backup created in backups/ directory"

# Restore database
restore:
ifndef BACKUP_FILE
	@echo "❌ Please specify BACKUP_FILE=path/to/backup.sql"
	@exit 1
endif
	@echo "🔄 Restoring database from $(BACKUP_FILE)..."
	@cat $(BACKUP_FILE) | docker-compose exec -T postgres psql -U postgres -d ggrequestz
	@echo "✅ Database restored"

# Initialize database schema
init-db:
	@echo "🗄️ Initializing database schema..."
	docker-compose exec ggrequestz node scripts/init-database.js init
	@echo "✅ Database schema initialized"

# PM2 management
pm2-status:
	docker-compose exec ggrequestz pm2 status

pm2-logs:
	docker-compose exec ggrequestz pm2 logs

pm2-restart:
	docker-compose exec ggrequestz pm2 restart ggrequestz

# Setup for first time
setup:
	@echo "🔧 Setting up GameRequest for first time..."
	@if [ ! -f .env ]; then \
		echo "📄 Copying environment template..."; \
		cp .env.docker .env; \
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
		cp .env.docker .env; \
		echo "NODE_ENV=development" >> .env; \
		echo "POSTGRES_PASSWORD=dev123" >> .env; \
		echo "TYPESENSE_API_KEY=dev123" >> .env; \
		echo "SESSION_SECRET=dev_session_secret_change_in_production" >> .env; \
	fi
	@$(MAKE) build
	@$(MAKE) dev
	@sleep 10
	@$(MAKE) init-db
	@echo "🎉 Development setup complete!"
	@echo "🌐 Application: http://localhost:3000"
	@echo "🔍 Typesense: http://localhost:8108"
	@echo "🗄️ PostgreSQL: localhost:5432"