#!/usr/bin/env bash
# Push the schema to the dev environment's database: DATABASE_URL_DEV in .env,
# the Neon `dev` branch. Refuses rather than guessing when it is not set.
set -euo pipefail
cd "$(dirname "$0")/.."
DEV="$(grep -E '^DATABASE_URL_DEV=' .env | sed -E 's/^DATABASE_URL_DEV=//; s/^"//; s/"$//' || true)"
if [[ -z "$DEV" ]]; then
  echo "✗ DATABASE_URL_DEV is not set in .env — the dev database's pooled connection string (Neon → hidden-pond → branch dev)" >&2
  exit 1
fi
DATABASE_URL="$DEV" DATABASE_URL_DIRECT="$DEV" node node_modules/drizzle-kit/bin.cjs push
