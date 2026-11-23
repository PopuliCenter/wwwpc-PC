# =============================================================================
# Backend (NestJS) — BUILD DARI ROOT MONOREPO (npm workspaces)
# -----------------------------------------------------------------------------
# Context build = root repo  →  docker-compose.yml: { context: ., dockerfile: backend/Dockerfile }
# Alasan: backend/tsconfig.json `extends ../tsconfig.base.json`, dan sebagian
# devDependency (typescript, @types/node, @nestjs/cli) ada di root & di-hoist.
# Build per-folder (context ./backend) gagal karena file root itu tidak ikut.
# =============================================================================

# ── Stage 1: builder — install seluruh workspace + compile ───────────────────
FROM node:24-alpine AS builder
WORKDIR /app

# Manifest dulu (root + kedua workspace) agar layer install ter-cache
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

RUN npm ci --ignore-scripts

# Config TS bersama + source backend
COPY tsconfig.base.json ./
COPY backend/ ./backend/

# Compile (nest build) lalu buang devDependencies agar image ramping.
# Keamanan (audit T-01): image produksi TIDAK membawa source, test, maupun
# skrip seed/cleanup (seed membuat akun dengan kredensial uji). Dihapus di stage
# builder — bukan di runner — agar tidak tertinggal di layer image mana pun.
# Runtime hanya butuh backend/dist (termasuk dist/migrations) + node_modules.
RUN npm run build --workspace=backend \
 && npm prune --omit=dev \
 && rm -rf backend/src backend/test backend/scripts \
           backend/dist/seed-* backend/dist/cleanup-* \
 && find backend/dist -name '*.spec.*' -delete


# ── Stage 2: runner — image produksi ─────────────────────────────────────────
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# User non-root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Salin seluruh /app dari builder: node_modules (ter-hoist) + backend/dist utuh,
# sehingga resolusi modul Node (backend/node_modules → root node_modules) pasti benar.
COPY --from=builder --chown=appuser:appgroup /app ./

USER appuser
WORKDIR /app/backend

EXPOSE 3000

# Health check — cocok dengan endpoint /health di main.ts
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/main"]
