#!/usr/bin/env bash
# Block until the local surfnet answers, or give up.
#
# Useful in a second terminal while the fork warms up, and as a guard before
# any script that assumes a chain is there.
set -uo pipefail

RPC_URL="${RPC_URL:-http://127.0.0.1:8899}"
ATTEMPTS="${ATTEMPTS:-60}"

for i in $(seq 1 "$ATTEMPTS"); do
  response=$(curl -s -m 3 -X POST \
    -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
    "$RPC_URL" 2>/dev/null || true)

  if [[ -n "$response" ]]; then
    echo "surfnet up after ${i}s: $response"
    exit 0
  fi
  sleep 1
done

echo "surfnet did not answer on $RPC_URL after ${ATTEMPTS}s" >&2
exit 1
