#!/usr/bin/env bash
#
# Deploy the dev branch to the dev environment, through the same gates.
#
#   npm run ship:dev            # from the dev branch: gates, push, deploy, alias
#
# Dev is a Vercel *preview* deployment of the `dev` branch, aliased to a fixed
# address so it is a place rather than a link that changes every push:
#
#   https://maria-fitness-app-dev.vercel.app
#
# It reads the project's Preview environment — its own database, its own
# AUTH_SECRET, no Blob store, no crons (Vercel runs crons on production only) —
# so nothing done on dev can touch a real person's rows. The gates are the
# production gates, unchanged: what reaches dev has passed exactly what reaches
# prod has passed; the difference is who has looked at it.
#
# Promotion is `npm run promote`: main fast-forwards to dev and ships. Nothing
# reaches production that was not on dev first.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"
DEV_ALIAS="maria-fitness-app-dev.vercel.app"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" != "dev" ]]; then
  echo "✗ ship:dev runs from the dev branch (you are on $BRANCH)" >&2
  exit 1
fi

# The same gates as production, in the same order. See scripts/ship.sh for
# why each is here; none of them is weaker for dev.
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

echo "── push"
git push -u origin dev

git worktree prune
W="$(mktemp -d)"
cleanup() { cd "$ROOT"; git worktree remove --force "$W" 2>/dev/null || true; git worktree prune; }
trap cleanup EXIT
git worktree add --detach "$W" HEAD >/dev/null 2>&1
cp -R "$ROOT/.vercel" "$W/.vercel"
cd "$W"

# A preview deployment — no `--prod` — so it reads the Preview environment.
for attempt in 1 2 3; do
  if npx vercel --yes 2>&1 | tee /tmp/ship-dev-$$.log | grep -qiE "readyState.*READY|Preview: https://"; then
    URL="$(grep -oE 'https://maria-fitness-app-[a-z0-9]+-fitness-app18\.vercel\.app' /tmp/ship-dev-$$.log | tail -1)"
    if [[ -z "$URL" ]]; then URL="$(grep -oE 'https://[a-z0-9.-]+\.vercel\.app' /tmp/ship-dev-$$.log | tail -1)"; fi
    echo "── alias"
    npx vercel alias set "$URL" "$DEV_ALIAS" >/dev/null
    echo "https://$DEV_ALIAS"
    echo "✓ dev deployed (attempt $attempt)"
    rm -f /tmp/ship-dev-$$.log
    exit 0
  fi
  echo "  attempt $attempt failed, retrying…" >&2
  sleep 5
done

echo "✗ dev deploy failed three times — see the log above" >&2
tail -20 /tmp/ship-dev-$$.log >&2
exit 1
