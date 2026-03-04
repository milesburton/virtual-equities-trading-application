# =============================================================================
# .devcontainer/Dockerfile — App layer
# All heavy tooling lives in the base image (Dockerfile.base).
# This layer only adds the supervisord config which references workspace paths
# and changes alongside the application.
# Build context is the repo root (devcontainer.json: "context": "..").
# =============================================================================
FROM ghcr.io/milesburton/equities-trading-simulator/devcontainer-base:latest

COPY supervisord.conf /home/deno/supervisord.conf

CMD ["/usr/bin/supervisord", "-c", "/home/deno/supervisord.conf"]
