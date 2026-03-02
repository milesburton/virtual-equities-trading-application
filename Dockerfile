# Builder stage: use official Node image to build frontend assets
FROM node:24-alpine AS builder
WORKDIR /src/frontend

# Install build dependencies and build
COPY frontend/package.json frontend/package-lock.json* ./
COPY frontend/ ./
RUN npm ci --silent || npm install --silent
RUN npm run build

# Final runtime image: use official Deno image as base
FROM denoland/deno:alpine-1.44.0 AS runtime
ENV DEBIAN_FRONTEND=noninteractive

# Install additional runtime dependencies on top of Deno image
RUN deno install -A --quiet jsr:@std/http/file-server

# Copy application source and frontend build output
WORKDIR /app
COPY . .
COPY --from=builder /src/frontend/dist ./frontend/dist

EXPOSE 80
CMD [ "deno", "run", "--allow-net", "--allow-read", "jsr:@std/http/file-server", "frontend/dist", "--port", "80", "--host", "0.0.0.0"]
