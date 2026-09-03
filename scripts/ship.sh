#!/usr/bin/env bash
#
# Verify, then deploy production from a clean worktree.
#
#   npm run ship            # gates, then deploy
#   npm run ship -- --check # gates only, no deploy
#
# The worktree matters: `vercel --prod` uploads the working directory, so an
# uncommitted experiment on the desk would otherwise sail into production. This
# builds from HEAD and nothing else.
#
# It pushes before it deploys. Twenty-seven commits once sat on this machine
# and nowhere else while every one of them was live in production — Vercel had
# the code, GitHub did not, and the only backup of a day's work was one laptop.
# The gates are what qualify a commit; the push is what preserves it; the
# deploy is the last step and the only one that flakes. In that order, work can
# never be stranded locally.
#
# The retry is not superstition — `vercel --prod` intermittently returns
# deploy_failed on the first call and succeeds immediately on the second, which
# is the difference between an unattended loop that ships and one that stops.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"

echo "── typecheck"; npx tsc --noEmit -p .
echo "── lint";      npx eslint .
echo "── tests";     npx vitest run
echo "── build";     npm run build >/dev/null

if [[ "${1:-}" == "--check" ]]; then
  echo "✓ gates pass (not deployed)"
  exit 0
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "✗ uncommitted changes — commit first, production ships from HEAD" >&2
  git status --short >&2
  exit 1
fi

# ── push, before anything is deployed ───────────────────────────────────────
# A rejected push means the remote has moved and this HEAD is not what should
# go live, so it stops here rather than deploying something that cannot be
# reproduced from the repository.
if git remote get-url origin >/dev/null 2>&1; then
  BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  if [[ "$BRANCH" == "HEAD" ]]; then
    echo "✗ detached HEAD — check out a branch before shipping" >&2
    exit 1
  fi
  if [[ -n "$(git log --oneline "origin/$BRANCH..$BRANCH" 2>/dev/null)" ]] \
     || ! git rev-parse --verify --quiet "origin/$BRANCH" >/dev/null; then
    echo "── push"
    git push -u origin "$BRANCH"
  else
    echo "── push (nothing to push)"
  fi
else
  echo "── push (no origin remote — skipping)" >&2
fi

git worktree prune
W="$(mktemp -d)"
cleanup() { cd "$ROOT"; git worktree remove --force "$W" 2>/dev/null || true; git worktree prune; }
trap cleanup EXIT

git worktree add --detach "$W" HEAD >/dev/null 2>&1
cp -R "$ROOT/.vercel" "$W/.vercel"
[[ -f "$ROOT/.env" ]] && cp "$ROOT/.env" "$W/.env"
cd "$W"

for attempt in 1 2 3; do
  if npx vercel --prod --yes 2>&1 | tee /tmp/ship-$$.log | grep -qi "readyState.*READY"; then
    grep -oE 'https://[a-z0-9.-]+\.vercel\.app' /tmp/ship-$$.log | tail -1
    echo "✓ deployed (attempt $attempt)"
    rm -f /tmp/ship-$$.log
    exit 0
  fi
  echo "  attempt $attempt failed, retrying…" >&2
  sleep 5
done

echo "✗ deploy failed three times — see the log above" >&2
tail -20 /tmp/ship-$$.log >&2
exit 1
