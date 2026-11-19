#!/usr/bin/env bash
# Commit and push generated data without ever failing on a race.
#   commit-data.sh "<message>" <path> [<path>...]
# Only the given paths are staged. If the push is rejected (another data job pushed
# first) the commit is replayed on top of the new tip and pushed again. Generated
# data always wins in a rebase conflict (-X theirs = our commit while rebasing).
set -euo pipefail
msg="$1"; shift
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add -- "$@"
if git diff --cached --quiet; then
  echo "No data changes"
  exit 0
fi
git commit -q -m "$msg"
branch="${GITHUB_REF_NAME:-main}"
for attempt in 1 2 3 4 5 6; do
  if git pull --rebase -X theirs -q origin "$branch" && git push -q origin "HEAD:$branch"; then
    echo "Pushed on attempt $attempt"
    exit 0
  fi
  git rebase --abort 2>/dev/null || true
  echo "Push attempt $attempt failed; retrying"
  sleep $((attempt * 5 + RANDOM % 10))
done
echo "Could not push after retries" >&2
exit 1
