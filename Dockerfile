# ── Stage 0a: Extract Redpanda broker binary ──────────────────────────────────
FROM redpandadata/redpanda:v24.3.6 AS redpanda-src

# ── Stage 0b: Extract Redpanda Console binary ─────────────────────────────────
FROM redpandadata/console:v2.7.2 AS console-src

# ── Stage 1: Build frontend assets ────────────────────────────────────────────
FROM node:24-alpine AS builder
WORKDIR /src/frontend

COPY frontend/package.json frontend/package-lock.json* ./
COPY frontend/ ./
RUN npm ci --silent || npm install --silent
RUN npm run build

# ── Stage 2: Runtime image ────────────────────────────────────────────────────
# Debian slim + official Deno image as base. Deno's alpine image fails on
# Depot's build platform (glibc symbol mismatches); Debian avoids that.
FROM denoland/deno:2.7.1 AS runtime
ENV DEBIAN_FRONTEND=noninteractive

# Install supervisord, bash, libstdc++ (required by Redpanda), ca-certificates for curl HTTPS
RUN apt-get update && apt-get install -y --no-install-recommends \
    supervisor curl bash libstdc++6 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy Redpanda runtime assets and place real executables on PATH.
# This avoids relying on wrapper scripts that hard-code /opt/redpanda paths.
COPY --from=redpanda-src /opt/redpanda/lib /usr/local/lib/redpanda
COPY --from=redpanda-src /opt/redpanda/libexec/redpanda /usr/local/bin/redpanda
COPY --from=redpanda-src /opt/redpanda/libexec/rpk /usr/local/bin/rpk
# Copy Redpanda Console binary
COPY --from=console-src /app/console /usr/local/bin/redpanda-console
RUN chmod +x /usr/local/bin/redpanda /usr/local/bin/rpk /usr/local/bin/redpanda-console
## Avoid exporting LD_LIBRARY_PATH globally here. Some system utilities
## (invoked during image builds or by devcontainer features) can break
## if Redpanda's private libc is picked up. Set the library path only
## when launching Redpanda at runtime via the supervisord command or
## wrapper scripts instead.

# Download Traefik v3 binary
ARG TRAEFIK_VERSION=3.3.3
RUN curl -fsSL "https://github.com/traefik/traefik/releases/download/v${TRAEFIK_VERSION}/traefik_v${TRAEFIK_VERSION}_linux_amd64.tar.gz" \
    | tar -xz -C /usr/local/bin traefik \
    && chmod +x /usr/local/bin/traefik

# Pre-cache the file-server and crypto modules used by the frontend server
RUN deno cache jsr:@std/http/file-server jsr:@std/crypto jsr:@std/encoding/hex

# Copy application source and Fly.io configs
WORKDIR /app
COPY . .
COPY --from=builder /src/frontend/dist ./frontend/dist

# Install npm dependencies (populates node_modules/ for npm: imports like kafkajs)
RUN deno install

# Pre-cache all backend Deno modules to avoid slow cold-start JIT compilation
RUN deno cache \
    frontend-server.ts \
    backend/src/lib/messaging.ts \
    backend/src/market-sim/market-sim.ts \
    backend/src/ems/ems-server.ts \
    backend/src/oms/oms-server.ts \
    backend/src/algo/limit-strategy.ts \
    backend/src/algo/twap-strategy.ts \
    backend/src/algo/pov-strategy.ts \
    backend/src/algo/vwap-strategy.ts \
    backend/src/observability/observability-server.ts \
    backend/src/user-service/user-service.ts \
    backend/src/journal/journal-server.ts \
    backend/src/fix/fix-exchange.ts \
    backend/src/fix/fix-gateway.ts

EXPOSE 80
CMD ["supervisord", "-c", "/app/supervisord-fly.conf"]
