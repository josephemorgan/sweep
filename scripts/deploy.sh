#!/usr/bin/env sh
# Pull the latest published image and restart the app if it changed. Safe to run on a timer:
# when nothing changed, `up -d` leaves the running containers alone.
# Usage (from the clone on the server): scripts/deploy.sh
set -eu
cd "$(dirname "$0")/.."

# Explicit -f flags turn off Compose's automatic docker-compose.override.yml, so add it back
# last (server-local settings win) when the server has one.
compose() {
  if [ -f docker-compose.override.yml ]; then
    docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.override.yml "$@"
  else
    docker compose -f docker-compose.yml -f docker-compose.prod.yml "$@"
  fi
}

# Keep the compose files current. Skipped silently when this is not a clone, the branch has no
# upstream, or there is no network.
git pull --ff-only --quiet 2>/dev/null || true

compose pull --quiet app
compose up -d --remove-orphans
# Only Sweep's own superseded images, matched by the label CI stamps on them.
docker image prune -f --filter label=org.opencontainers.image.title=sweep >/dev/null
