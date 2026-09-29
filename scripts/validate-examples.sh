#!/usr/bin/env bash
# Validates every example guide (spec §8). Run from the repo root: pnpm validate:examples
set -euo pipefail
shopt -s nullglob globstar
files=()
for f in guides/examples/**/*.{yaml,yml,md}; do
  [[ "$(basename "$f")" == README.md ]] && continue
  files+=("$f")
done
if (( ${#files[@]} == 0 )); then echo "No example guides yet."; exit 0; fi
status=0
for f in "${files[@]}"; do node packages/core/bin/sweep.js validate "$f" || status=1; done
exit $status
