#!/usr/bin/env bash
# PostToolUse(Edit|Write): format the edited file with the repo's Prettier.
# stdin is the hook JSON; the file is .tool_input.file_path (absolute).
# Skips files outside the repo, .prettierignore'd paths and unknown types. Exit 1 = non-blocking
# error (stderr shown to Claude); this hook never blocks.
set -uo pipefail

project_dir="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
file="$(jq -r '.tool_input.file_path // empty' 2>/dev/null)"

[[ -n "$file" && -f "$file" ]] || exit 0
case "$file" in
  "$project_dir"/*) ;;
  *) exit 0 ;;
esac

prettier="$project_dir/node_modules/.bin/prettier"
[[ -x "$prettier" ]] || exit 0

cd "$project_dir" || exit 0
if ! out="$("$prettier" --write --ignore-unknown --log-level warn -- "$file" 2>&1)"; then
  echo "prettier could not format $file: $out" >&2
  exit 1
fi
exit 0
