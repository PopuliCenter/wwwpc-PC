# =============================================================================
# Stage 1: builder — install deps and build the Vite SPA
# =============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./

# Monorepo npm-workspaces: lock file hanya ada di root, tidak di context ini.
RUN npm install --ignore-scripts

COPY . .

# Build args for environment variables that need to be baked in at build time
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN npm run build


# =============================================================================
# Stage 2: runner — serve with nginx
# =============================================================================
FROM nginx:1.27-alpine AS runner

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/app.conf

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

# Health check via nginx stub status
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
