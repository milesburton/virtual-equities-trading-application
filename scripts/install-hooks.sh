#!/bin/sh
#
# Installs git hooks from scripts/hooks/ into .git/hooks/.
# Run this once after cloning the repository.
#
set -e

REPO_ROOT=$(git rev-parse --show-toplevel)
HOOKS_SRC="$REPO_ROOT/scripts/hooks"
HOOKS_DEST="$REPO_ROOT/.git/hooks"

cp "$HOOKS_SRC/pre-commit" "$HOOKS_DEST/pre-commit"
cp "$HOOKS_SRC/commit-msg" "$HOOKS_DEST/commit-msg"
chmod +x "$HOOKS_DEST/pre-commit" "$HOOKS_DEST/commit-msg"

echo "Git hooks installed successfully."
echo "  pre-commit : runs lint, type-check, and tests before every commit"
echo "  commit-msg : enforces Conventional Commits format"
