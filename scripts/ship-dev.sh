#!/usr/bin/env bash
#
# Ship the dev branch to the dev environment.
#
#   npm run ship:dev
#
# The gates here, on this machine, for fast feedback — then the push. The
# deploy itself is CI's (`deploy-dev` in .github/workflows/ci.yml): it runs
# the same gates again on a clean runner and then points
# dev.sorewinner.app at the new preview. Nothing a laptop does
# reaches an environment; a laptop only decides what is worth pushing.
#
# Schema changes go to the dev database from here (`db:push:dev`, reading
# DATABASE_URL_DEV from .env), before the code that needs them is pushed.
set -euo pipefail
cd "$(dirname "$0")/.."

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" != "dev" ]]; then
  echo "✗ ship:dev runs from the dev branch (you are on $BRANCH)" >&2
  exit 1
fi

echo "── test db";   npm run db:push:test >/dev/null && npm run db:seed:test >/dev/null
echo "── typecheck"; npx tsc --noEmit -p .
echo "── lint";      npx eslint .
echo "── tests";     npm run coverage
echo "── build";     npm run build >/dev/null
echo "── e2e";       npm run test:e2e

if [[ -n "$(git status --porcelain)" ]]; then
  echo "✗ uncommitted changes — commit first, dev ships from HEAD" >&2
  git status --short >&2
  exit 1
fi

echo "── schema → dev database"
npm run db:push:dev

echo "── push"
git push -u origin dev
REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo "")"
echo "✓ pushed $(git rev-parse --short HEAD) — CI is deploying it to https://dev.sorewinner.app"
[[ -n "$REPO" ]] && echo "   https://github.com/$REPO/actions?query=branch%3Adev"
exit 0
