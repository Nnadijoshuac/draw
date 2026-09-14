#!/usr/bin/env bash
# Start the local mainnet fork.
#
# Reads HELIUS_API_KEY from .env.local rather than taking it as an argument, so
# the key never lands in shell history or a process list.
#
# On Windows run this through WSL — surfpool has no native Windows build:
#   wsl -d Ubuntu -- bash /mnt/c/path/to/Draw/packages/scripts/start-surfnet.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$ROOT/.env.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "No .env.local at $ENV_FILE — copy .env.example and fill it in." >&2
  exit 1
fi

# shellcheck disable=SC1090
HELIUS_API_KEY="$(grep -E '^HELIUS_API_KEY=' "$ENV_FILE" | cut -d= -f2- | tr -d '"'"'"' \r')"

if [[ -z "$HELIUS_API_KEY" ]]; then
  echo "HELIUS_API_KEY is empty in .env.local. Get a free key at https://dashboard.helius.dev" >&2
  exit 1
fi

SURFPOOL="${SURFPOOL_BIN:-$HOME/.local/bin/surfpool}"
if [[ ! -x "$SURFPOOL" ]]; then
  SURFPOOL="$(command -v surfpool || true)"
fi
if [[ -z "$SURFPOOL" ]]; then
  echo "surfpool not found. Install it: curl -sL https://run.surfpool.run/ | bash" >&2
  exit 1
fi

# The fee payer sponsors every draw, so it needs SOL before anything else runs.
FEE_PAYER="${FEE_PAYER_ADDRESS:-12SB1RzAufFsGdDK4AtezQazkQ2SyxaBhcfsE9r5no9u}"

echo "Forking mainnet via Helius. RPC on :8899, websocket on :8900."

# Bind to 0.0.0.0 so the Next app running on Windows can reach the fork inside
# WSL. --no-tui because this is meant to run unattended in a second terminal.
exec "$SURFPOOL" start \
  --no-tui \
  --host 0.0.0.0 \
  --rpc-url "https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}" \
  --airdrop "$FEE_PAYER"
