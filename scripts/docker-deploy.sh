#!/bin/bash

# Docker Production Deployment Script for G.G Requestz
# This script automates the deployment process with proper error handling

set -e

echo "🚀 G.G Requestz Production Deployment"
echo "====================================="

# Configuration
COMPOSE_FILE="docker-compose.yml"
ENV_FILE=".env.docker"
PROJECT_NAME="ggrequestz"

# Function to check if file exists
check_file() {
    local file=$1
    if [ ! -f "$file" ]; then
        echo "❌ Error: $file not found!"
        echo "   Please create this file before deploying."
        exit 1
    fi
    echo "✅ Found: $file"
}

# Function to check required environment variables
check_env_vars() {
    echo "🔍 Checking required environment variables..."
    
    # Source the env file
    if [ -f "$ENV_FILE" ]; then
        set -a
        source "$ENV_FILE"
        set +a
    fi
    
    local required_vars=(
        "POSTGRES_PASSWORD"
        "SESSION_SECRET"
        "IGDB_CLIENT_ID"
        "IGDB_CLIENT_SECRET"
    )
    
    local missing_vars=()
    
    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            missing_vars+=("$var")
        else
            echo "  ✅ $var is set"
        fi
    done
    
    if [ ${#missing_vars[@]} -gt 0 ]; then
        echo "❌ Missing required environment variables:"
        for var in "${missing_vars[@]}"; do
            echo "   - $var"
        done
        echo ""
        echo "Please update $ENV_FILE with the missing variables."
        exit 1
    fi
}

# Function to build and start services
deploy_services() {
    echo ""
    echo "🏗️  Building and starting services..."
    
    # Build images with no cache to ensure fresh build
    echo "📦 Building application image..."
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build --no-cache ggrequestz
    
    # Start dependency services first
    echo "🗄️  Starting database services..."
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d postgres redis typesense
    
    # Wait for dependencies to be healthy
    echo "⏳ Waiting for dependencies to be healthy..."
    timeout=300  # 5 minutes
    elapsed=0
    
    while [ $elapsed -lt $timeout ]; do
        if docker-compose -f "$COMPOSE_FILE" ps | grep -E "(postgres|redis|typesense)" | grep -q "unhealthy\|starting"; then
            echo "  Waiting for services to become healthy... (${elapsed}s)"
            sleep 5
            elapsed=$((elapsed + 5))
        else
            echo "✅ Dependencies are ready!"
            break
        fi
    done
    
    if [ $elapsed -ge $timeout ]; then
        echo "❌ Timeout waiting for dependencies to become healthy"
        echo "📋 Current status:"
        docker-compose -f "$COMPOSE_FILE" ps
        exit 1
    fi
    
    # Start the main application
    echo "🚀 Starting G.G Requestz application..."
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d ggrequestz
    
    # Wait for app to be healthy
    echo "⏳ Waiting for application to be healthy..."
    elapsed=0
    
    while [ $elapsed -lt $timeout ]; do
        if docker-compose -f "$COMPOSE_FILE" ps ggrequestz | grep -q "healthy"; then
            echo "✅ Application is healthy!"
            break
        elif docker-compose -f "$COMPOSE_FILE" ps ggrequestz | grep -q "unhealthy"; then
            echo "❌ Application failed health check"
            echo "📋 Application logs:"
            docker-compose -f "$COMPOSE_FILE" logs --tail=50 ggrequestz
            exit 1
        else
            echo "  Waiting for application to start... (${elapsed}s)"
            sleep 10
            elapsed=$((elapsed + 10))
        fi
    done
    
    if [ $elapsed -ge $timeout ]; then
        echo "❌ Timeout waiting for application to become healthy"
        echo "📋 Application logs:"
        docker-compose -f "$COMPOSE_FILE" logs --tail=50 ggrequestz
        exit 1
    fi
}

# Function to show deployment status
show_status() {
    echo ""
    echo "📊 Deployment Status:"
    echo "===================="
    docker-compose -f "$COMPOSE_FILE" ps
    
    echo ""
    echo "🌐 Service URLs:"
    echo "  • Application: http://localhost:${APP_PORT:-3000}"
    echo "  • PostgreSQL: localhost:${POSTGRES_EXTERNAL_PORT:-5432}"
    echo "  • Redis: localhost:${REDIS_EXTERNAL_PORT:-6380}"
    echo "  • Typesense: http://localhost:${TYPESENSE_EXTERNAL_PORT:-8108}"
    
    echo ""
    echo "📋 Useful commands:"
    echo "  • View logs: docker-compose logs -f"
    echo "  • Stop services: docker-compose down"
    echo "  • Restart app: docker-compose restart ggrequestz"
    echo "  • Health check: curl http://localhost:${APP_PORT:-3000}/api/health"
}

# Main deployment process
echo "🔍 Pre-deployment checks..."
check_file "$COMPOSE_FILE"
check_file "$ENV_FILE"
check_env_vars

echo ""
echo "🧹 Running cleanup (optional - you can skip this)..."
read -p "Run cleanup script? This will stop existing containers. (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if [ -f "scripts/docker-cleanup.sh" ]; then
        ./scripts/docker-cleanup.sh
    else
        echo "⚠️  Cleanup script not found, continuing without cleanup..."
    fi
fi

deploy_services
show_status

echo ""
echo "🎉 Deployment completed successfully!"
echo ""
echo "💡 Next steps:"
echo "  1. Test the application: curl http://localhost:${APP_PORT:-3000}/api/health"
echo "  2. Check the logs if there are any issues: docker-compose logs -f"
echo "  3. Access the application in your browser"