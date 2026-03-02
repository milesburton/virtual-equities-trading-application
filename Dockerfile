# Builder stage: use official Node image to build frontend assets
FROM node:24-alpine AS builder
WORKDIR /src/frontend

# Install build dependencies and build
COPY frontend/package.json frontend/package-lock.json* ./
COPY frontend/ ./
RUN npm ci --silent || npm install --silent
RUN npm run build

# Final runtime image: Ubuntu with Deno and runtime tools, no Node runtime
FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    unzip \
    bash \
    git \
    sudo \
    supervisor \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user for running Deno services
RUN useradd -m -s /bin/bash deno
USER deno
WORKDIR /home/deno

# Install Deno for runtime
RUN curl -fsSL https://deno.land/x/install/install.sh | sh
ENV DENO_INSTALL="/home/deno/.deno"
ENV PATH="${DENO_INSTALL}/bin:${PATH}"

# Copy application source (for Deno services) and frontend build output
WORKDIR /app
COPY --chown=deno:deno . .
COPY --from=builder /src/frontend/dist ./frontend/dist

# Optional: install any Deno tools if needed (kept minimal)
RUN /home/deno/.deno/bin/deno cache backend/src/market-sim/market-sim.ts || true

CMD ["/bin/bash"]
