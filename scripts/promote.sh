#!/usr/bin/env bash
#
# Promote dev to production.
#
#   npm run promote
#
# Main fast-forwards to dev — never a merge commit, never a cherry-pick — so
# production is a commit that dev already ran, byte for byte. Then the
# production ship: the same gates again on this machine, push, deploy. If main
# cannot fast-forward, something reached main that did not go through dev, and
# that is worth stopping for rather than merging around.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -n "$(git status --porcelain)" ]]; then
  echo "✗ uncommitted changes — promote from a clean tree" >&2
  exit 1
fi

git fetch origin --quiet
git checkout main --quiet
git pull --ff-only origin main --quiet
if ! git merge --ff-only dev; then
  echo "✗ main cannot fast-forward to dev — main has commits dev does not. Rebase dev on main first." >&2
  exit 1
fi
echo "── main is now $(git rev-parse --short HEAD) (dev)"
npm run ship
