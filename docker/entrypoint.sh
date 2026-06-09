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

# Apply pending Drizzle SQL migrations before starting app processes.
# Set RUN_DB_MIGRATE=false to skip (not recommended in production).
if [ "${RUN_DB_MIGRATE:-true}" = "true" ]; then
  echo "Running database migrations (RUN_DB_MIGRATE=true)..."
  node ./node_modules/tsx/dist/cli.mjs scripts/run-db-migrate.ts
fi

# Legacy schema sync — only when no migration files exist yet.
# Prefer `pnpm db:generate` + committed migrations in db/migrations/.
if [ "${RUN_DB_PUSH:-false}" = "true" ]; then
  echo "Running drizzle-kit push (RUN_DB_PUSH=true)..."
  node ./node_modules/drizzle-kit/bin.cjs push
fi

export HOSTNAME="${HOSTNAME:-0.0.0.0}"
export PORT="${PORT:-3000}"
export WEBSOCKET_PORT="${WEBSOCKET_PORT:-3001}"

echo "Starting Next.js, workers, and WebSocket server..."
# Use standalone server (output: standalone in next.config). Avoid pnpm/corepack at runtime.
exec node ./node_modules/concurrently/dist/bin/concurrently.js -k \
  "node .next/standalone/server.js" \
  "node ./node_modules/tsx/dist/cli.mjs workers/index.ts" \
  "node ./node_modules/tsx/dist/cli.mjs websocket/server.ts"
