#!/usr/bin/env bash
# One-command deploy to Vercel.
#
#   ./scripts/deploy.sh
#
# Requires `npx vercel login` first (interactive, needs a browser).
# Pushes only the variables the app actually needs — the Neon claim URL and the
# direct (non-pooled) connection string stay local.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! npx --yes vercel whoami >/dev/null 2>&1; then
  echo "Not logged in. Run:  npx vercel login" >&2
  exit 1
fi

[ -f .env ] || { echo "No .env found." >&2; exit 1; }

read_env() {
  # Value may contain '=' (connection strings do), so split on the first only.
  grep -m1 "^$1=" .env | cut -d= -f2- || true
}

REQUIRED=(ANTHROPIC_API_KEY DATABASE_URL AUTH_SECRET APP_PASSPHRASE)
OPTIONAL=(DAILY_COST_LIMIT_MICROS MAX_CHAT_PER_DAY MAX_CHAT_PER_MINUTE COACH_MODEL)

for key in "${REQUIRED[@]}"; do
  [ -n "$(read_env "$key")" ] || { echo "Missing $key in .env" >&2; exit 1; }
done

echo "→ Linking project (accept the prompts once; it remembers after that)"
npx vercel link --yes

push() {
  local key="$1" value="$2"
  [ -n "$value" ] || return 0
  # Remove first so re-running this script updates rather than erroring.
  npx vercel env rm "$key" production --yes >/dev/null 2>&1 || true
  printf '%s' "$value" | npx vercel env add "$key" production >/dev/null
  echo "   set $key"
}

echo "→ Pushing environment variables"
for key in "${REQUIRED[@]}" "${OPTIONAL[@]}"; do
  push "$key" "$(read_env "$key")"
done

echo "→ Deploying to production"
npx vercel deploy --prod

cat <<'DONE'

Done. Next:
  1. Open the URL in Safari on her phone
  2. Enter the passphrase (APP_PASSPHRASE in .env)
  3. Share → Add to Home Screen

To ship a change later:  npx vercel deploy --prod
DONE
