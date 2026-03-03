# ── Stage 1: Build frontend assets ────────────────────────────────────────────
FROM node:24-alpine AS builder
WORKDIR /src/frontend

COPY frontend/package.json frontend/package-lock.json* ./
COPY frontend/ ./
RUN npm ci --silent || npm install --silent
RUN npm run build

# ── Stage 2: Runtime image ────────────────────────────────────────────────────
# Official Deno alpine image + supervisord + Traefik for full-stack single-VM deploy.
FROM denoland/deno:alpine-2.7.1 AS runtime
ENV DEBIAN_FRONTEND=noninteractive

# Install supervisord, curl (health checks), bash
RUN apk add --no-cache supervisor curl bash

# Download Traefik v3 binary
ARG TRAEFIK_VERSION=3.3.3
RUN curl -fsSL "https://github.com/traefik/traefik/releases/download/v${TRAEFIK_VERSION}/traefik_v${TRAEFIK_VERSION}_linux_amd64.tar.gz" \
    | tar -xz -C /usr/local/bin traefik \
    && chmod +x /usr/local/bin/traefik

# Pre-install the file-server so it is cached in the image layer
RUN deno install -A --quiet jsr:@std/http/file-server

# Copy application source and Fly.io configs
WORKDIR /app
COPY . .
COPY --from=builder /src/frontend/dist ./frontend/dist

# Pre-cache all backend Deno modules to avoid slow cold-start JIT compilation
RUN deno cache \
    backend/src/market-sim/market-sim.ts \
    backend/src/ems/ems-server.ts \
    backend/src/oms/oms-server.ts \
    backend/src/algo/limit-strategy.ts \
    backend/src/algo/twap-strategy.ts \
    backend/src/algo/pov-strategy.ts \
    backend/src/algo/vwap-strategy.ts \
    backend/src/observability/observability-server.ts \
    backend/src/fix/fix-exchange.ts \
    backend/src/fix/fix-gateway.ts

EXPOSE 80
CMD ["supervisord", "-c", "/app/supervisord-fly.conf"]
