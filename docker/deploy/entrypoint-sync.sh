#!/bin/sh
set -e

INTERVAL="${DEPLOY_INTERVAL_SECONDS:-300}"

echo "Convy production sync agent"
echo "  branch:   ${DEPLOY_BRANCH:-production}"
echo "  interval: ${INTERVAL}s"
echo "  repo:     ${REPO_DIR:-/repo}"

while true; do
  if /usr/local/bin/sync-production.sh; then
    :
  else
    echo "Sync/deploy cycle failed — keeping current running version."
  fi
  sleep "$INTERVAL"
done
