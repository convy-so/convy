#!/bin/sh
# Run on the EC2 server to deploy the latest prod2 branch manually.
set -e

REPO_DIR="${REPO_DIR:-/opt/convy}"
BRANCH="${DEPLOY_BRANCH:-prod2}"
ENV_FILE="${DEPLOY_ENV_FILE:-.env.prod}"

cd "$REPO_DIR"

git fetch origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/${BRANCH}"

COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-convy}" \
  docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  --env-file "$ENV_FILE" up -d --build --remove-orphans

wget -qO- http://127.0.0.1:3000/api/health
echo ""
echo "Deploy complete: $(git rev-parse --short HEAD)"
