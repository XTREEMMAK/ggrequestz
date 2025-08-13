#!/bin/bash

# Docker Production Cleanup Script for G.G Requestz
# This script helps resolve common Docker production issues

set -e

echo "🐳 Docker Production Cleanup for G.G Requestz"
echo "============================================="

# Function to check if port is in use
check_port() {
    local port=$1
    if lsof -i :$port > /dev/null 2>&1; then
        echo "⚠️  Port $port is in use:"
        lsof -i :$port
        return 0
    else
        echo "✅ Port $port is available"
        return 1
    fi
}

# Function to stop containers by name pattern
stop_containers() {
    local pattern=$1
    echo "🛑 Stopping containers matching pattern: $pattern"
    
    containers=$(docker ps -q --filter "name=$pattern" 2>/dev/null || true)
    if [ -n "$containers" ]; then
        docker stop $containers
        echo "✅ Stopped containers: $containers"
    else
        echo "ℹ️  No running containers found matching: $pattern"
    fi
}

# Function to remove containers by name pattern
remove_containers() {
    local pattern=$1
    echo "🗑️  Removing containers matching pattern: $pattern"
    
    containers=$(docker ps -aq --filter "name=$pattern" 2>/dev/null || true)
    if [ -n "$containers" ]; then
        docker rm $containers
        echo "✅ Removed containers: $containers"
    else
        echo "ℹ️  No containers found matching: $pattern"
    fi
}

# Function to remove networks by name pattern
remove_networks() {
    local pattern=$1
    echo "🌐 Removing networks matching pattern: $pattern"
    
    networks=$(docker network ls -q --filter "name=$pattern" 2>/dev/null || true)
    if [ -n "$networks" ]; then
        docker network rm $networks 2>/dev/null || echo "⚠️  Some networks may be in use"
        echo "✅ Attempted to remove networks"
    else
        echo "ℹ️  No networks found matching: $pattern"
    fi
}

# Check for conflicting ports
echo "🔍 Checking for port conflicts..."
check_port 6379 && echo "  Consider stopping system Redis: sudo systemctl stop redis"
check_port 5432 && echo "  Consider stopping system PostgreSQL: sudo systemctl stop postgresql"
check_port 8108 && echo "  Consider stopping any Typesense service"

# Cleanup old containers
echo ""
echo "🧹 Cleaning up old G.G Requestz containers..."
stop_containers "ggrequestz"
remove_containers "ggrequestz"

# Cleanup networks
echo ""
remove_networks "ggrequestz"

# Remove unused Docker resources
echo ""
echo "🧽 Cleaning up unused Docker resources..."
docker system prune -f
docker volume prune -f

# Remove any dangling images
echo ""
echo "🖼️  Removing dangling images..."
docker image prune -f

echo ""
echo "✅ Cleanup complete!"
echo ""
echo "💡 Next steps:"
echo "   1. Run: docker-compose up -d"
echo "   2. Monitor logs: docker-compose logs -f"
echo "   3. Check health: docker-compose ps"
echo ""
echo "🔧 If you still have port conflicts:"
echo "   • Redis: sudo systemctl stop redis && sudo systemctl disable redis"
echo "   • PostgreSQL: sudo systemctl stop postgresql && sudo systemctl disable postgresql"
echo "   • Or update .env.docker to use different external ports"