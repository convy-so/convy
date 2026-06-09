#!/bin/sh
# Run Drizzle migrations against the production database (Supabase).
# Safe to run multiple times — only pending migrations are applied.
#
# Usage (on EC2):
#   cd /opt/convy
#   ./docker/deploy/db-migrate.sh
#
# Or with custom paths:
#   REPO_DIR=/opt/convy DEPLOY_ENV_FILE=.env.prod ./docker/deploy/db-migrate.sh

set -e

REPO_DIR="${REPO_DIR:-/opt/convy}"
ENV_FILE="${DEPLOY_ENV_FILE:-.env.prod}"
COMPOSE_FILES="${DEPLOY_COMPOSE_FILES:-docker-compose.yml:docker-compose.prod.yml}"

cd "$REPO_DIR"

IFS=':'
set -- $COMPOSE_FILES
COMPOSE_ARGS=""
for file in "$@"; do
  COMPOSE_ARGS="$COMPOSE_ARGS -f $file"
done
unset IFS

echo "[db-migrate] Running migrations via Docker (env: $ENV_FILE)…"

COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-convy}" \
  docker compose $COMPOSE_ARGS --env-file "$ENV_FILE" \
  run --rm --no-deps --entrypoint "" \
  -v "$REPO_DIR/db/migrations:/app/db/migrations:ro" \
  -v "$REPO_DIR/scripts/run-db-migrate.ts:/app/scripts/run-db-migrate.ts:ro" \
  app \
  node ./node_modules/tsx/dist/cli.mjs scripts/run-db-migrate.ts

echo "[db-migrate] Complete."
