#!/usr/bin/env bash
# Publish ER Companion v1.1.0 once GitHub auth exists.
# Usage: ./publish.sh            (uses gh auth token, or SSH if remote is git@)
set -euo pipefail

cd "$(dirname "$0")/.."
export PATH="$HOME/.local/bin:$HOME/.local/toolchain/node/bin:$PATH"

TAG="v1.1.0"
OUT="/tmp/er-release-1.1.0"

if ! gh auth status >/dev/null 2>&1; then
  echo "error: gh is not authenticated. Run: gh auth login -h github.com" >&2
  exit 1
fi

echo "== verifying clean tree =="
git status --short | grep . && { echo "error: uncommitted changes" >&2; exit 1; } || true

echo "== pushing master + tag =="
git push origin master
git push origin "$TAG" 2>/dev/null || { git tag -f "$TAG" HEAD; git push -f origin "$TAG"; }

echo "== ensuring release assets =="
test -f "$OUT/er-companion_1.1.0_amd64.deb"
test -f "$OUT/er-companion_1.1.0_amd64.AppImage"
test -f "$OUT/SHA256SUMS.txt"

echo "== publishing release =="
if gh release view "$TAG" >/dev/null 2>&1; then
  gh release upload "$TAG" "$OUT"/* --clobber
else
  gh release create "$TAG" \
    --title "v1.1.0 — Redesign and content expansion" \
    --notes-file "${NOTES:-/tmp/release-notes-1.1.0.md}" \
    "$OUT/er-companion_1.1.0_amd64.deb" \
    "$OUT/er-companion_1.1.0_amd64.AppImage" \
    "$OUT/SHA256SUMS.txt"
fi

echo "== triggering cross-platform CI =="
gh workflow run desktop.yml --ref "$TAG" || true
sleep 4
gh run list --workflow=desktop.yml --limit 2

echo "== done =="
gh release view "$TAG" --json url,assets --jq '{url, assets: [.assets[].name]}'
