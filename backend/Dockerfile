# =============================================================================
# Stage 1: deps — install only production dependencies
# =============================================================================
FROM node:20-alpine AS deps

WORKDIR /app

# Copy manifests first for better layer caching
COPY package.json package-lock.json ./

RUN npm ci --omit=dev --ignore-scripts


# =============================================================================
# Stage 2: builder — compile TypeScript
# =============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./

# Install all deps (including devDeps needed for the build)
RUN npm ci --ignore-scripts

COPY . .

RUN npm run build


# =============================================================================
# Stage 3: runner — minimal production image
# =============================================================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy production node_modules from deps stage
COPY --from=deps --chown=appuser:appgroup /app/node_modules ./node_modules

# Copy compiled output from builder stage
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist

# Copy package.json for version / scripts reference
COPY --chown=appuser:appgroup package.json ./

USER appuser

EXPOSE 3000

# Health check — matches the /health endpoint added in main.ts
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/main"]
