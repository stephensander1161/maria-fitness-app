#!/usr/bin/env bash
#
# What a request-driven change may not touch.
#
#   npm run requests:guard            checks the commits on dev not yet on main
#   npm run requests:guard -- HEAD~1  checks from a given base
#
# The requests skill turns a sentence someone typed into the app into a commit.
# The skill's prompt says not to touch auth, spend, the public surface or the
# pipeline; this is the same rule as a check that runs on the diff, so it holds
# whether or not the prompt was followed — and it refuses a deleted test, since
# "make the test pass" is the oldest instruction an attacker gives. Not a
# substitute for the person who reads the promote pull request; a floor under
# them.
set -euo pipefail
cd "$(dirname "$0")/.."
BASE="${1:-origin/main}"
git fetch origin --quiet 2>/dev/null || true

# Paths a request may never change. Add, never remove, without a reason in the
# commit that does it.
PROTECTED='^(proxy\.ts|next\.config\.ts|vercel\.json|package\.json|package-lock\.json|CLAUDE\.md|\.github/|scripts/|\.claude/|lib/(env|session|auth|oauth|signup|audit|budget|spend|security-signals|request-authors|cron|push|backup)[^/]*\.ts|app/api/(auth|login|cron|admin)/|lib/tools/index\.ts|lib/tools/define\.ts)'

changed="$(git diff --name-only "$BASE"...HEAD; git diff --name-only --cached; git diff --name-only)"
deleted="$(git diff --name-only --diff-filter=D "$BASE"...HEAD; git diff --name-only --diff-filter=D --cached)"

bad="$(printf '%s\n' "$changed" | sort -u | grep -E "$PROTECTED" || true)"
gone="$(printf '%s\n' "$deleted" | sort -u | grep -E '^(tests|e2e)/' || true)"

if [[ -n "$bad" || -n "$gone" ]]; then
  [[ -n "$bad" ]]  && { echo "✗ a request-driven change touched protected paths:"; printf '   %s\n' $bad; }
  [[ -n "$gone" ]] && { echo "✗ a request-driven change deleted tests:"; printf '   %s\n' $gone; }
  echo "  These want a person deciding, not a request. Leave them out, or make the change yourself outside the requests skill."
  exit 1
fi
echo "✓ requests guard: nothing protected touched, no tests deleted (base $BASE)"
