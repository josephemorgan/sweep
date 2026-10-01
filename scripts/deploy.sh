#!/usr/bin/env sh
# Pull the latest published image and restart the app if it changed. Safe to run on a timer:
# when nothing changed, `up -d` leaves the running containers alone.
# Usage (from the clone on the server): scripts/deploy.sh
set -eu
cd "$(dirname "$0")/.."

compose() {
  docker compose -f docker-compose.yml -f docker-compose.prod.yml "$@"
}

# Keep the compose files current. Skipped silently when this is not a clone or there is no network.
git pull --ff-only --quiet 2>/dev/null || true

compose pull --quiet app
compose up -d --remove-orphans
docker image prune -f >/dev/null
