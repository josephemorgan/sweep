#!/usr/bin/env sh
# Tag HEAD with the next version and print the push command that releases it.
#
#   scripts/tag.sh --patch | --minor | --major [--push]
#
# The next version is computed from the highest existing vX.Y.Z tag (v0.0.0 when there is none).
# Pushing the tag triggers the publish job (docs/deployment.md). Without --push the tag stays
# local and the command to push it is printed.
set -eu

usage() {
  echo "usage: scripts/tag.sh --patch | --minor | --major [--push]" >&2
  exit 2
}

bump=''
push=false
for arg in "$@"; do
  case "$arg" in
    --patch | --minor | --major)
      [ -z "$bump" ] || usage
      bump="${arg#--}"
      ;;
    --push) push=true ;;
    *) usage ;;
  esac
done
[ -n "$bump" ] || usage

cd "$(git rev-parse --show-toplevel)"

# Refuse to tag anything the release would not actually contain.
if [ -n "$(git status --porcelain)" ]; then
  echo "error: the working tree has uncommitted changes" >&2
  exit 1
fi
branch=$(git branch --show-current)
if [ "$branch" != master ]; then
  echo "error: on branch '$branch', releases are tagged on master" >&2
  exit 1
fi
git fetch --quiet origin master
if ! git merge-base --is-ancestor HEAD origin/master; then
  echo "error: HEAD is not on origin/master yet; push master first" >&2
  exit 1
fi
existing=$(git tag --points-at HEAD --list 'v[0-9]*' | head -n 1)
if [ -n "$existing" ]; then
  echo "error: HEAD is already tagged $existing" >&2
  exit 1
fi

latest=$(git tag --list 'v[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -n 1)
[ -n "$latest" ] || latest=v0.0.0
IFS=. read -r major minor patch <<EOF
${latest#v}
EOF

case "$bump" in
  major) major=$((major + 1)); minor=0; patch=0 ;;
  minor) minor=$((minor + 1)); patch=0 ;;
  patch) patch=$((patch + 1)) ;;
esac
next="v$major.$minor.$patch"

git tag -a "$next" -m "$next"
echo "tagged $(git rev-parse --short HEAD) as $next (previous: $latest)"

if $push; then
  git push origin "$next"
  echo "pushed; CI will publish ghcr.io/josephemorgan/sweep:${next#v} when the run is green"
else
  echo "push it to release: git push origin $next"
fi
