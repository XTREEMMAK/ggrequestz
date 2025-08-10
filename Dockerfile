# Multi-stage build for GameRequest application
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci --silent

# Copy source code
COPY . .

# Copy build-specific .env file (placeholder values, overridden at runtime)
COPY .env.docker-build .env

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Install PM2 globally
RUN npm install -g pm2

# Create app directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S ggrequestz -u 1001

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --only=production --silent && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder --chown=ggrequestz:nodejs /app/build ./build
COPY --from=builder --chown=ggrequestz:nodejs /app/static ./static
COPY --from=builder --chown=ggrequestz:nodejs /app/package.json ./

# Copy PM2 ecosystem configuration
COPY --chown=ggrequestz:nodejs ecosystem.config.cjs ./

# Copy database scripts and migrations
COPY --chown=ggrequestz:nodejs scripts/ ./scripts/
COPY --chown=ggrequestz:nodejs migrations/ ./migrations/

# Copy src directory for database utilities (needed by Docker entrypoint)
COPY --from=builder --chown=ggrequestz:nodejs /app/src ./src

# Create logs directory with proper permissions
RUN mkdir -p /app/logs && chown -R ggrequestz:nodejs /app/logs

# Set proper permissions for scripts
RUN chmod +x scripts/init-database.js
RUN chmod +x scripts/run-migrations.js || echo "Migration script not found, skipping"
RUN chmod +x scripts/docker-entrypoint.js

# Switch to non-root user
USER ggrequestz

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Use custom entrypoint for better startup handling
CMD ["node", "scripts/docker-entrypoint.js"]