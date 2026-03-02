#!/usr/bin/env bash
set -euo pipefail

if ! command -v flyctl >/dev/null 2>&1; then
  echo "flyctl is required. Install it first: https://fly.io/docs/flyctl/install/"
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is required. Install it first: https://cli.github.com/"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is not authenticated. Run: gh auth login"
  exit 1
fi

if ! flyctl auth whoami >/dev/null 2>&1; then
  echo "flyctl is not authenticated. Run: flyctl auth login"
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

if [ ! -f "fly.toml" ]; then
  echo "fly.toml not found in repository root."
  exit 1
fi

APP_NAME="${FLY_APP_NAME:-$(grep -E '^app\s*=\s*".+"' fly.toml | head -1 | cut -d '"' -f 2)}"
REGION="${FLY_REGION:-$(grep -E '^primary_region\s*=\s*".+"' fly.toml | head -1 | cut -d '"' -f 2)}"

if [ -z "$APP_NAME" ]; then
  echo "Could not determine Fly app name from fly.toml"
  exit 1
fi

if [ -z "$REGION" ]; then
  REGION="iad"
fi

echo "Using Fly app: $APP_NAME (region: $REGION)"

if flyctl status --app "$APP_NAME" >/dev/null 2>&1; then
  echo "Fly app already exists: $APP_NAME"
else
  echo "Creating Fly app: $APP_NAME"
  flyctl apps create "$APP_NAME"
fi

if flyctl volumes list --app "$APP_NAME" 2>/dev/null | grep -Eq '(^|[[:space:]])data([[:space:]]|$)'; then
  echo "Volume 'data' already exists"
else
  echo "Creating volume 'data' (1GB)"
  flyctl volumes create data --app "$APP_NAME" --region "$REGION" --size 1 --yes
fi

REPO_NAME="$(gh repo view --json nameWithOwner --jq '.nameWithOwner')"
TOKEN="${FLY_API_TOKEN:-}"

if [ -z "$TOKEN" ]; then
  TOKEN="$(flyctl auth token)"
fi

if [ -z "$TOKEN" ]; then
  echo "Unable to get Fly token. Set FLY_API_TOKEN and rerun."
  exit 1
fi

printf '%s' "$TOKEN" | gh secret set FLY_API_TOKEN --repo "$REPO_NAME"
gh secret set FLY_APP_NAME --repo "$REPO_NAME" --body "$APP_NAME"

echo "✅ GitHub secrets configured for $REPO_NAME"
echo "   - FLY_API_TOKEN"
echo "   - FLY_APP_NAME"
echo ""
echo "Next: push to main or run Deploy to Fly.io workflow manually."
