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

# Build arguments for user/group IDs
ARG PUID=1000
ARG PGID=1000

# Install PM2 globally
RUN npm install -g pm2

# Create app directory
WORKDIR /app

# Create non-root user with configurable IDs
RUN addgroup -g ${PGID} -S ggrequestz && \
    adduser -S -u ${PUID} -G ggrequestz ggrequestz

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --only=production --silent && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder --chown=ggrequestz:ggrequestz /app/build ./build
COPY --from=builder --chown=ggrequestz:ggrequestz /app/static ./static
COPY --from=builder --chown=ggrequestz:ggrequestz /app/package.json ./

# Copy PM2 ecosystem configuration
COPY --chown=ggrequestz:ggrequestz ecosystem.config.cjs ./

# Copy database scripts and migrations
COPY --chown=ggrequestz:ggrequestz scripts/ ./scripts/
COPY --chown=ggrequestz:ggrequestz migrations/ ./migrations/

# Copy src directory for database utilities (needed by Docker entrypoint)
COPY --from=builder --chown=ggrequestz:ggrequestz /app/src ./src

# Create logs directory with proper permissions
RUN mkdir -p /app/logs && chown -R ggrequestz:ggrequestz /app/logs

# Set proper permissions for scripts
RUN chmod +x scripts/database/db-manager.js
RUN chmod +x scripts/deployment/docker-entrypoint.js

# Switch to non-root user
USER ggrequestz

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Use custom entrypoint for better startup handling
CMD ["node", "scripts/deployment/docker-entrypoint.js"]