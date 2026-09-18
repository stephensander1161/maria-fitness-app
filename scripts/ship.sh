#!/usr/bin/env bash
#
# Run the production gates on this machine.
#
#   npm run ship            (same as --check now)
#   npm run ship -- --check
#
# Until 2026-09-18 this also pushed main and deployed production from this
# laptop. It does not any more: main takes no direct pushes, and production is
# deployed by CI when the dev → main pull request merges (`npm run promote`).
# What is left is the fast local feedback — the same gates CI runs, without
# waiting for a runner. Nothing here reaches an environment.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"

# Production ships from main and nowhere else. Dev is `npm run ship:dev` from
# the dev branch; getting a dev commit to production is `npm run promote`.
echo "── test db";   npm run db:push:test >/dev/null && npm run db:seed:test >/dev/null
echo "── typecheck"; npx tsc --noEmit -p .
echo "── lint";      npx eslint .
echo "── tests";     npm run coverage
echo "── build";     npm run build >/dev/null
echo "── e2e";       npm run test:e2e

echo "✓ gates pass. Production deploys from CI when dev merges into main: npm run promote"
exit 0
