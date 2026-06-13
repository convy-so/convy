#!/bin/sh
# Wait until GitHub reports a passing combined status for a commit SHA.
set -e

SHA="${1:?commit SHA required}"
REPO="${GITHUB_REPOSITORY:?Set GITHUB_REPOSITORY (owner/repo)}"
TOKEN="${GITHUB_DEPLOY_TOKEN:?Set GITHUB_DEPLOY_TOKEN}"

MAX_WAIT="${CI_WAIT_TIMEOUT_SECONDS:-1800}"
INTERVAL="${CI_POLL_INTERVAL_SECONDS:-30}"
elapsed=0

echo "Waiting for CI to pass on ${REPO}@${SHA}..."

while [ "$elapsed" -lt "$MAX_WAIT" ]; do
  response="$(curl -sf \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/${REPO}/commits/${SHA}/status")"

  state="$(printf '%s' "$response" | jq -r '.state // "pending"')"
  echo "  CI state: ${state} (${elapsed}s elapsed)"

  case "$state" in
    success)
      echo "CI passed for ${SHA}."
      exit 0
      ;;
    failure|error)
      echo "CI failed for ${SHA}." >&2
      exit 1
      ;;
  esac

  sleep "$INTERVAL"
  elapsed=$((elapsed + INTERVAL))
done

echo "Timed out waiting for CI on ${SHA} after ${MAX_WAIT}s." >&2
exit 1
