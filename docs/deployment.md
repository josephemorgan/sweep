# Deployment

Sweep ships as one Docker image (Express serves `/api` and the built Angular client, spec §7).
Pushing a version tag (`v1.2.3`) runs the full CI suite on that commit and then publishes the
image to GitHub Container Registry (the `publish` job in `.github/workflows/ci.yml`) as:

| Tag | Example |
|---|---|
| exact version | `ghcr.io/josephemorgan/sweep:1.2.3` |
| minor series | `ghcr.io/josephemorgan/sweep:1.2` |
| `latest` | moves to every release |
| commit | `ghcr.io/josephemorgan/sweep:sha-<commit>` |

Pushes to `master` run CI but publish nothing. A server deploys by pulling the image, so the
server never builds anything and nothing on GitHub needs access to the server.

## Releasing

Tag the master commit you want to ship and push the tag:

```bash
git tag -a v1.2.3 -m "v1.2.3"
git push origin v1.2.3
```

Tags follow semver with a `v` prefix; anything else is ignored by the workflow. The image is
available a few minutes after the tag's CI run turns green, and the server's timer picks it
up on its next run.

## Server layout

The server keeps a clone of the repo for the compose files and a `.env` beside them:

```
/srv/sweep/
  docker-compose.yml        # from the repo
  docker-compose.prod.yml   # from the repo: image instead of build, restart policy
  scripts/deploy.sh         # from the repo
  .env                      # server-only, never committed
```

`.env` holds the runtime config. The compose file maps these into the container:

```
BETTER_AUTH_SECRET=<long random string>
SWEEP_APP_URL=https://sweep.example.com   # the public origin, as the reverse proxy serves it
TRUST_PROXY=1                             # behind a reverse proxy
SIGNUP_ENABLED=false
DEMO_ENABLED=false
# SWEEP_IMAGE_TAG=1.2.3                   # pin a release or roll back; default latest
```

Database migrations run when the server starts, so a deploy is only "start the new image".

## Deploying

`scripts/deploy.sh` does the whole thing: fast-forwards the clone (for compose file changes),
pulls the image, restarts the app only if the image changed, and removes the superseded Sweep
images (only those, matched by label). A `docker-compose.override.yml` beside the compose
files, for server-local settings such as a proxy network, is applied last. The clone must be
on `master` with its upstream set, or the fast-forward is skipped and the compose files go
stale. Run it by hand, or on a systemd timer so a release deploys itself a few minutes later:

```ini
# /etc/systemd/system/sweep-deploy.service
[Unit]
Description=Pull and restart Sweep if a new image was published

[Service]
Type=oneshot
WorkingDirectory=/srv/sweep
ExecStart=/srv/sweep/scripts/deploy.sh
```

```ini
# /etc/systemd/system/sweep-deploy.timer
[Unit]
Description=Check for a new Sweep image

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now sweep-deploy.timer
```

The package is public, so pulling needs no login. If it is ever made private, run
`docker login ghcr.io` once on the server with a classic token that has `read:packages`.

## Rollback

Set `SWEEP_IMAGE_TAG=1.2.2` (a previous release, or `sha-<commit>`) in `.env` and run
`scripts/deploy.sh`. Remove the line to follow `latest` again. The timer will not move off a
pinned tag.

Note that the server's compose files follow `master` through the script's fast-forward, while
the image follows releases. A compose change that lands between releases is applied at the
next timer run. That is harmless for additive changes such as a new `${VAR:-}` mapping, but a
change that needs a matching image should be released straight away.

## Why pull, not push

A home server is usually behind NAT with no fixed address, so an outbound poll is simpler and
safer than exposing a webhook or an SSH port to GitHub. The polling delay is the trade-off. A
self-hosted GitHub Actions runner removes the delay, but on a public repository it exposes the
server to code from pull requests, so it is not used here.
