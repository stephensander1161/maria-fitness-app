#!/usr/bin/env bash
#
# Delete every deployment that is not the live one.
#
#   npm run prune
#
# Vercel's free tier includes 10GB of **Function Storage**, and that is not a
# measure of this app: it is the sum of every retained deployment's function
# bundles. This project ships several times a day, each deployment keeps its
# own copy of ~14MB of traced runtime across forty functions, and nothing ever
# expired them. Two hundred and sixty-eight deployments later the meter read
# 100% and Vercel wrote to say the next one would be refused.
#
# So retention is now part of shipping rather than a thing somebody remembers
# during an outage. `--safe` is what makes it safe: it skips any deployment
# with an active alias, which is production and any preview alias pointing at
# it. What it removes is the history — and the history is git. `npm run ship`
# from any commit reproduces any of them, which is the property that makes
# rollback-by-redeploy an acceptable trade for a ceiling that stops the app.
#
# Never fails the caller. Being unable to tidy up is not a reason to fail a
# deploy that has already gone out.
set -uo pipefail

cd "$(dirname "$0")/.."

PROJECT="${VERCEL_PROJECT:-maria-fitness-app}"
SCOPE="${VERCEL_SCOPE:-fitness-app18}"

before="$(npx vercel ls "$PROJECT" --scope "$SCOPE" 2>/dev/null | grep -c 'vercel\.app')"
npx vercel remove "$PROJECT" --safe --yes --scope "$SCOPE" >/dev/null 2>&1
after="$(npx vercel ls "$PROJECT" --scope "$SCOPE" 2>/dev/null | grep -c 'vercel\.app')"

if [[ -z "$before" || -z "$after" ]]; then
  echo "  (could not reach Vercel — deployments not pruned)" >&2
  exit 0
fi

# Vercel refuses more than 200 at a time and says to come back in ten minutes.
# Say so rather than leaving somebody to find out from an email.
if (( after > 5 )); then
  echo "  pruned $before → $after deployments (more than 200 at once is refused — run \`npm run prune\` again shortly)"
else
  echo "  pruned $before → $after deployments"
fi
exit 0
