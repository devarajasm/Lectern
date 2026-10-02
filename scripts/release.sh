#!/usr/bin/env bash
# Cut a release: bump the version everywhere, date the CHANGELOG, commit and tag.
#   scripts/release.sh 0.2.0
# Then publish with:  git push origin main --follow-tags
# (the Release workflow builds the bundles and creates the GitHub release).
set -euo pipefail

new="${1:-}"
if [[ ! "$new" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$ ]]; then
  echo "usage: $0 <major.minor.patch[-prerelease]>" >&2
  exit 1
fi

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean; commit or stash first." >&2
  exit 1
fi
if git rev-parse "v$new" >/dev/null 2>&1; then
  echo "Tag v$new already exists." >&2
  exit 1
fi
if ! grep -q "^## \[Unreleased\]" CHANGELOG.md; then
  echo "CHANGELOG.md has no '## [Unreleased]' section." >&2
  exit 1
fi

echo "$new" > VERSION
(cd frontend && npm version "$new" --no-git-tag-version --allow-same-version >/dev/null)

today="$(date +%Y-%m-%d)"
python3 - "$new" "$today" <<'PY'
import re, sys
new, today = sys.argv[1], sys.argv[2]
path = "CHANGELOG.md"
text = open(path).read()
text = text.replace("## [Unreleased]", f"## [Unreleased]\n\n## [{new}] - {today}", 1)
open(path, "w").write(text)
PY

(cd backend && { [[ -x .venv/bin/python ]] && .venv/bin/python -m pytest -q || python3 -m pytest -q; })

git add VERSION frontend/package.json frontend/package-lock.json CHANGELOG.md
git commit -m "Release v$new"
git tag -a "v$new" -m "Lectern v$new"
echo
echo "Tagged v$new. Publish with:  git push origin main --follow-tags"
