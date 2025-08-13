#!/bin/bash

# G.G Requestz Production Deployment Script
# Deploys the application with production security settings

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if .env.docker exists
if [ ! -f ".env.docker" ]; then
    print_error ".env.docker file not found!"
    print_error "Please ensure you have configured your environment variables."
    exit 1
fi

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if NODE_ENV is set to production in .env.docker
if ! grep -q "NODE_ENV=production" .env.docker; then
    print_error "NODE_ENV is not set to production in .env.docker"
    print_error "Please run the security configuration update first."
    exit 1
fi

print_status "🚀 Starting G.G Requestz Production Deployment"
echo

# Validate environment
print_status "Validating production environment..."

# Check required environment variables
required_vars=("SESSION_SECRET" "POSTGRES_PASSWORD" "AUTHENTIK_CLIENT_SECRET" "IGDB_CLIENT_SECRET")
missing_vars=()

for var in "${required_vars[@]}"; do
    if ! grep -q "^${var}=" .env.docker; then
        missing_vars+=("$var")
    fi
done

if [ ${#missing_vars[@]} -ne 0 ]; then
    print_error "Missing required environment variables:"
    for var in "${missing_vars[@]}"; do
        echo "  - $var"
    done
    exit 1
fi

print_success "Environment validation passed"

# Stop existing containers
print_status "Stopping existing containers..."
docker compose --env-file .env.docker down --remove-orphans || true

# Pull latest images
print_status "Pulling latest images..."
docker compose --env-file .env.docker -f docker-compose.yml -f docker-compose.production.yml pull || print_warning "Some images may not be available for pulling"

# Build application
print_status "Building application..."
docker compose --env-file .env.docker -f docker-compose.yml -f docker-compose.production.yml build --no-cache

# Start services
print_status "Starting production services..."
docker compose --env-file .env.docker -f docker-compose.yml -f docker-compose.production.yml up -d

# Wait for services to be healthy
print_status "Waiting for services to be healthy..."
sleep 10

# Fix migration table structure if needed
print_status "Ensuring migration table structure is compatible..."
if docker compose --env-file .env.docker exec ggrequestz node scripts/fix-migration-table.js; then
  print_success "Migration table structure validated"
else
  print_warning "Migration table fix had issues - deployment may still proceed"
fi

# Check service health
print_status "Checking service health..."

services=("ggrequestz" "postgres" "redis" "typesense")
healthy_services=0

for service in "${services[@]}"; do
    if docker compose --env-file .env.docker ps | grep -q "$service.*healthy\|$service.*running"; then
        print_success "$service is healthy"
        ((healthy_services++))
    else
        print_warning "$service may not be healthy - check logs: docker compose logs $service"
    fi
done

echo
if [ $healthy_services -eq ${#services[@]} ]; then
    print_success "🎉 Production deployment completed successfully!"
    echo
    print_status "Application is available at: https://$(grep DOMAIN= .env.docker | cut -d'=' -f2)"
    print_status "Check logs with: docker compose logs -f"
    print_status "Monitor services with: docker compose ps"
    echo
    print_status "🔒 Production Security Features Enabled:"
    echo "  ✓ Strict rate limiting (5 auth attempts per 15min)"
    echo "  ✓ Session hijacking protection"
    echo "  ✓ XSS input sanitization"
    echo "  ✓ Secure cookies and HSTS headers"
    echo "  ✓ Comprehensive security headers"
    echo "  ✓ Redis-based distributed rate limiting"
    echo
else
    print_warning "Some services may not be fully healthy. Check the logs above."
    print_status "You can check individual service logs with:"
    echo "  docker compose logs <service_name>"
fi

# Display useful commands
echo
print_status "Useful Commands:"
echo "  docker compose ps                 # Check service status"
echo "  docker compose logs -f            # Follow all logs"
echo "  docker compose logs -f ggrequestz # Follow app logs only"
echo "  docker compose down               # Stop all services"
echo "  docker compose restart ggrequestz # Restart app only"

# Security test reminder
echo
print_status "🔍 Recommended: Run security tests"
echo "  node scripts/test-security.js"
echo "  DOCKER_ENV=1 node scripts/test-security.js"