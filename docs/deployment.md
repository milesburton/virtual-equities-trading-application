# Deployment — Fly.io

Deployments to [https://virtual-equities-trading.fly.dev](https://virtual-equities-trading.fly.dev) are triggered automatically by GitHub Actions on push to `main` (lint → unit tests → deploy).

## First-time setup

1. Create a Fly.io API token: `flyctl tokens create deploy`
2. Add it as a GitHub Actions secret named `FLY_API_TOKEN` (Settings → Secrets → Actions)

The `fly.toml` and `.github/workflows/deploy.yml` are already configured.

## Manual deploy

```sh
flyctl deploy --remote-only
```

## Debugging

```sh
flyctl logs --follow
flyctl ssh console
flyctl status
```

## Persistent storage

A 1 GB volume is mounted at `/app/backend/data` for the observability SQLite database.
