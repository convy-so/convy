#!/bin/sh
set -e

# Wait for infrastructure dependencies before starting app processes.
wait_for() {
  host="$1"
  port="$2"
  name="$3"
  echo "Waiting for ${name} at ${host}:${port}..."
  i=0
  while [ "$i" -lt 60 ]; do
    if nc -z "$host" "$port" 2>/dev/null; then
      echo "${name} is ready."
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done
  echo "Timed out waiting for ${name} at ${host}:${port}" >&2
  exit 1
}

DB_HOST="${DATABASE_HOST:-postgres}"
DB_PORT="${DATABASE_PORT:-5432}"
REDIS_HOST="${REDIS_HOST:-redis}"
REDIS_PORT="${REDIS_PORT:-6379}"

if [ "${SKIP_DB_WAIT:-false}" != "true" ]; then
  wait_for "$DB_HOST" "$DB_PORT" "PostgreSQL"
fi
wait_for "$REDIS_HOST" "$REDIS_PORT" "Redis"

# Optional first-time schema sync for self-hosted Postgres.
# Set RUN_DB_PUSH=true on first deploy, then disable.
if [ "${RUN_DB_PUSH:-false}" = "true" ]; then
  echo "Running drizzle-kit push (RUN_DB_PUSH=true)..."
  node ./node_modules/drizzle-kit/bin.cjs push
fi

export HOSTNAME="${HOSTNAME:-0.0.0.0}"
export PORT="${PORT:-3000}"
export WEBSOCKET_PORT="${WEBSOCKET_PORT:-3001}"

echo "Starting Next.js, workers, and WebSocket server..."
# Avoid pnpm/corepack at runtime — the convy user has no writable home directory.
exec node ./node_modules/concurrently/dist/bin/concurrently.js -k \
  "node node_modules/next/dist/bin/next start" \
  "node ./node_modules/tsx/dist/cli.mjs workers/index.ts" \
  "node ./node_modules/tsx/dist/cli.mjs websocket/server.ts"
