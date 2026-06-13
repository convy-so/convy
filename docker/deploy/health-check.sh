#!/bin/sh
# Verify the app container is healthy after a deploy.
set -e

URL="${HEALTHCHECK_URL:-http://app:3000/api/health}"
ATTEMPTS="${HEALTHCHECK_ATTEMPTS:-12}"
INTERVAL="${HEALTHCHECK_INTERVAL_SECONDS:-10}"

echo "Health check: ${URL}"

attempt=1
while [ "$attempt" -le "$ATTEMPTS" ]; do
  if response="$(wget -qO- "$URL" 2>/dev/null)" && printf '%s' "$response" | grep -q '"status"'; then
    echo "Health check passed (attempt ${attempt}/${ATTEMPTS})."
    exit 0
  fi

  echo "  attempt ${attempt}/${ATTEMPTS} failed, retrying in ${INTERVAL}s..."
  attempt=$((attempt + 1))
  sleep "$INTERVAL"
done

echo "Health check failed after ${ATTEMPTS} attempts." >&2
exit 1
