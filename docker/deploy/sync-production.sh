#!/bin/sh
# Pull latest production branch, deploy only if CI passed, rollback on failed health check.
set -e

REPO_DIR="${REPO_DIR:-/repo}"
BRANCH="${DEPLOY_BRANCH:-prod2}"
COMPOSE_FILES="${DEPLOY_COMPOSE_FILES:-docker-compose.yml:docker-compose.prod.yml}"
ENV_FILE="${DEPLOY_ENV_FILE:-.env.prod}"
LOCK_FILE="${DEPLOY_LOCK_FILE:-/tmp/convy-deploy.lock}"

cd "$REPO_DIR"

if [ -f "$LOCK_FILE" ]; then
  echo "Deploy already in progress (lock: ${LOCK_FILE}). Skipping."
  exit 0
fi

touch "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT INT TERM

IFS=':'
set -- $COMPOSE_FILES
unset IFS
compose_args=""
for file in "$@"; do
  compose_args="${compose_args} -f ${file}"
done

# shellcheck disable=SC2086
compose() {
  COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-convy}" \
    docker compose --env-file "$ENV_FILE" $compose_args "$@"
}

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not a git repository: ${REPO_DIR}" >&2
  exit 1
fi

git fetch origin "$BRANCH" --prune

REMOTE_SHA="$(git rev-parse "origin/${BRANCH}")"
LOCAL_SHA="$(git rev-parse HEAD)"

if [ "$REMOTE_SHA" = "$LOCAL_SHA" ]; then
  echo "Already on latest ${BRANCH} (${REMOTE_SHA})."
  exit 0
fi

echo "New commit on ${BRANCH}: ${LOCAL_SHA} -> ${REMOTE_SHA}"

if [ "${REQUIRE_CI_PASS:-true}" = "true" ]; then
  if [ -z "${GITHUB_DEPLOY_TOKEN:-}" ] || [ -z "${GITHUB_REPOSITORY:-}" ]; then
    echo "REQUIRE_CI_PASS=true but GITHUB_DEPLOY_TOKEN or GITHUB_REPOSITORY is missing." >&2
    exit 1
  fi
  /usr/local/bin/wait-for-ci.sh "$REMOTE_SHA"
fi

PREVIOUS_SHA="$LOCAL_SHA"

git checkout "$BRANCH"
git reset --hard "origin/${BRANCH}"

echo "Building app image for ${REMOTE_SHA}..."
if ! compose build app; then
  echo "Build failed. Rolling back to ${PREVIOUS_SHA}."
  git reset --hard "$PREVIOUS_SHA"
  exit 1
fi

echo "Starting updated containers..."
if ! compose up -d --remove-orphans; then
  echo "Compose up failed. Rolling back to ${PREVIOUS_SHA}."
  git reset --hard "$PREVIOUS_SHA"
  compose build app
  compose up -d --remove-orphans
  exit 1
fi

if ! /usr/local/bin/health-check.sh; then
  echo "Health check failed. Rolling back to ${PREVIOUS_SHA}."
  git reset --hard "$PREVIOUS_SHA"
  compose build app
  compose up -d --remove-orphans
  exit 1
fi

echo "Deploy complete: ${REMOTE_SHA}"
