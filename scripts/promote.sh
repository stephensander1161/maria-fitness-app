#!/usr/bin/env bash
#
# Promote dev to production.
#
#   npm run promote
#
# main takes no direct pushes — a repository ruleset allows pull requests only,
# with the CI checks required and `from-dev` refusing any head but dev. So a
# promotion is: make sure dev is pushed, push the schema to production's
# database (from here, because production's credential never goes to a
# runner), open the dev → main pull request (or reuse the open one), switch on
# auto-merge, and wait. When the checks are green GitHub merges it, and the
# `deploy` job ships production. Then dev fast-forwards onto main so the two
# stay identical — main is dev plus the merge commit, nothing else.
#
# If main has commits dev does not, something reached main without going
# through dev; the pull request will show it and this refuses to continue.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -n "$(git status --porcelain)" ]]; then
  echo "✗ uncommitted changes — promote from a clean tree" >&2
  exit 1
fi
if [[ "$(git rev-parse --abbrev-ref HEAD)" != "dev" ]]; then
  echo "✗ promote runs from dev (you are on $(git rev-parse --abbrev-ref HEAD))" >&2
  exit 1
fi

git fetch origin --quiet
if [[ -n "$(git log --oneline dev..origin/main)" ]]; then
  echo "✗ main has commits dev does not:" >&2
  git log --oneline dev..origin/main >&2
  echo "  Something reached main without going through dev. Fast-forward dev onto main first." >&2
  exit 1
fi
if [[ -z "$(git log --oneline origin/main..dev)" ]]; then
  echo "── nothing to promote: main already has everything on dev"
  exit 0
fi

echo "── push dev"
git push origin dev --quiet

# The schema first, the code after: a column the new code reads must exist
# before the new code is serving. drizzle-kit push is idempotent, so this is
# a no-op when nothing changed.
echo "── schema → production"
npm run db:push

echo "── pull request dev → main"
REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
PR="$(gh pr list --base main --head dev --state open --json number -q '.[0].number')"
if [[ -z "$PR" ]]; then
  PR="$(gh pr create --base main --head dev \
      --title "Promote dev to production" \
      --body "$(printf 'Everything on dev, into production.\n\n```\n%s\n```\n\nOpened by `npm run promote`; merges itself when the checks are green.' "$(git log --oneline origin/main..dev)")" \
    | grep -oE '[0-9]+$')"
  echo "   opened #$PR"
else
  echo "   reusing #$PR"
fi
gh pr merge "$PR" --merge --auto >/dev/null
echo "   https://github.com/$REPO/pull/$PR"

echo "── waiting for the checks"
gh pr checks "$PR" --watch --fail-fast || {
  echo "✗ a check failed — production is unchanged. See the pull request." >&2
  exit 1
}

# Green. Auto-merge lands it within a few seconds; wait for main to move.
for i in $(seq 1 60); do
  if [[ "$(gh pr view "$PR" --json state -q .state)" == "MERGED" ]]; then break; fi
  sleep 5
done
if [[ "$(gh pr view "$PR" --json state -q .state)" != "MERGED" ]]; then
  echo "✗ checks passed but the pull request has not merged — look at it on GitHub." >&2
  exit 1
fi

echo "── main merged; dev fast-forwards onto it"
git fetch origin --quiet
git merge --ff-only origin/main --quiet
git push origin dev --quiet
echo "✓ promoted $(git rev-parse --short origin/main) — the deploy job is shipping production:"
echo "   https://github.com/$REPO/actions?query=branch%3Amain"

# Requests the skill built onto dev were marked planned, not shipped, because
# they were not live. Now they are: list them so they can be closed.
echo "── open requests (mark the ones that just went out: npm run feedback -- --status <id> shipped)"
npm run -s feedback 2>/dev/null | sed -n '1,40p' || true
