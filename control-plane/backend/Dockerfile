# ============================================================================
# CT Assessment SaaS - Backend API Dockerfile (PostgreSQL)
# ============================================================================

# Stage 1: Build
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy application code
COPY src ./src

# ============================================================================
# Stage 2: Runtime
FROM node:18-alpine

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy from builder
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/src ./src
COPY --chown=nodejs:nodejs package*.json ./

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8080/saude', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})" || exit 1

# Use non-root user
USER nodejs

# Expose port
EXPOSE 8080

# Start application with dumb-init
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]

# ============================================================================
# Labels
# ============================================================================
LABEL maintainer="CT Assessment Team"
LABEL description="CT Assessment SaaS - Backend API (PostgreSQL)"
LABEL version="1.0"
