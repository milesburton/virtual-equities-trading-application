# Deployment Guide: Fly.io

This guide walks you through deploying the Virtual Equities Trading Application to Fly.io using GitHub Actions for continuous deployment.

## Prerequisites

1. **Fly.io Account** - Sign up at https://fly.io/
2. **GitHub Account** - Already have this
3. **flyctl CLI** (optional, for local testing)
   - macOS: `brew install flyctl`
   - Linux/Windows: https://fly.io/docs/hands-on/install-flyctl/

## Setup Steps

### 1. Create Fly.io App (First Time Only)

```bash
# Install flyctl
brew install flyctl  # or appropriate installer for your OS

# Login to Fly.io
flyctl auth login

# Create the app and launch
flyctl launch

# When prompted:
# - App Name: virtual-equities-trading (or your choice)
# - Region: iad (or closest to you)
# - Postgres/Redis: No (we use SQLite)
# - Deploy now: No (we'll use GitHub Actions)
```

This creates `fly.toml` with your app configuration.

### 2. Set Up GitHub Actions Deployment

#### Step 2a: Create Fly.io API Token

```bash
# Generate a new API token
flyctl tokens create deploy

# This outputs your FLY_API_TOKEN
```

#### Step 2b: Add Secret to GitHub

1. Go to your GitHub repository
2. Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Name: `FLY_API_TOKEN`
5. Value: Paste your token from Step 2a
6. Click "Add secret"

### 3. Verify Configuration

The following files are already configured:
- **fly.toml** - Fly.io app configuration
- **.github/workflows/deploy.yml** - Automatic deployment on push to main

### 4. Deploy

#### Option A: Automatic (Recommended)
```bash
git push origin main
```
GitHub Actions will:
1. Run all backend tests (deno task test)
2. Run all frontend tests (npm run test:unit)
3. Deploy to Fly.io on success

Check deployment status:
- GitHub: Actions tab
- Fly.io: https://fly.io/dashboard

#### Option B: Manual Deploy
```bash
flyctl deploy --remote-only
```

## Access Your App

After deployment:
- **Frontend UI:** https://virtual-equities-trading.fly.dev
- **Market Sim API:** https://virtual-equities-trading.fly.dev/api/market-sim
- **WebSocket Feed:** wss://virtual-equities-trading.fly.dev/ws/market-sim

## Environment Variables

Fly.io environment variables are configured in `fly.toml`. To add secrets:

```bash
flyctl secrets set SECRET_NAME=value
```

Current environment variables (in fly.toml):
- `MARKET_SIM_PORT=5000`
- `EMS_PORT=5001`
- `OMS_PORT=5002`
- `ALGO_TRADER_PORT=5003`
- `TWAP_ALGO_PORT=5004`
- `POV_ALGO_PORT=5005`
- `VWAP_ALGO_PORT=5006`
- `OBSERVABILITY_PORT=5007`
- `FRONTEND_PORT=8080`

## Persistent Storage

Your app has a 1GB persistent volume mounted at `/app/backend/data` for:
- SQLite database (`observability.db`)
- Environment configuration (`.env`)

Volume management:
```bash
# List volumes
flyctl volumes list

# View volume details
flyctl volumes show <volume-id>
```

## Monitoring & Debugging

```bash
# Check app status
flyctl status

# View recent logs
flyctl logs

# SSH into running machine
flyctl ssh console

# Scale machines (free tier allows 1 VM)
flyctl machines list
flyctl scale count 1
```

## Cost

**Free tier includes:**
- 3 shared-cpu-1x 256MB VMs (your app uses 1)
- 3GB storage (you have 1GB allocated)
- Unlimited data transfer (ingress only)

**Costs after free tier:**
- Compute: $0.024/hour per VM-vCPU
- Storage: $0.15/GB per month
- Typical small app: ~$5-10/month

## Troubleshooting

### Deployment Fails
Check logs:
```bash
flyctl logs --follow
```

Common issues:
- Missing `FLY_API_TOKEN` secret in GitHub
- Failed tests (check Actions tab for details)
- Port conflicts (app uses ports 5000-8080 internally)

### WebSocket Connection Issues
Fly.io fully supports WebSocket. If you see connection errors:
1. Check browser console for exact error
2. Verify endpoint URL uses `wss://` (secure WebSocket)
3. Check `flyctl logs` for backend errors

### Performance Issues
- Free tier VMs are shared CPU (not guaranteed performance)
- For production: `flyctl machine update <id> --cpus 2 --memory 512`
- Monitor with `flyctl status`

## Next Steps

1. Push changes to GitHub:
   ```bash
   git push origin main
   ```

2. Watch deployment in GitHub Actions tab

3. Visit https://virtual-equities-trading.fly.dev

4. Monitor with:
   ```bash
   flyctl logs --follow
   ```

## Documentation

- [Fly.io Docs](https://fly.io/docs/)
- [Docker Compose on Fly.io](https://fly.io/docs/reference/builds/)
- [Fly.io GitHub Actions](https://github.com/superfly/flyctl-actions)
