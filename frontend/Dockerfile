# =============================================================================
# Frontend (React + Vite) — BUILD DARI ROOT MONOREPO (npm workspaces)
# -----------------------------------------------------------------------------
# Context build = root repo  →  docker-compose.yml: { context: ., dockerfile: frontend/Dockerfile }
# Alasan: frontend/tsconfig.json `extends ../tsconfig.base.json`, dan @types/node
# + typescript di-hoist dari root. Build per-folder (context ./frontend) gagal.
# =============================================================================

# ── Stage 1: builder — install seluruh workspace + build Vite ────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Manifest dulu (root + kedua workspace) agar layer install ter-cache
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

RUN npm ci --ignore-scripts

# Config TS bersama + source frontend
COPY tsconfig.base.json ./
COPY frontend/ ./frontend/

# API base URL di-bake saat build (semua call browser ke /api relatif)
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN npm run build --workspace=frontend


# ── Stage 2: runner — serve SPA via nginx ────────────────────────────────────
FROM nginx:1.27-alpine AS runner

RUN rm /etc/nginx/conf.d/default.conf
COPY frontend/nginx.conf /etc/nginx/conf.d/app.conf
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
