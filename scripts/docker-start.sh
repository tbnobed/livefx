#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

command -v docker >/dev/null || { echo "Install Docker Desktop with WSL2 integration first." >&2; exit 1; }
docker compose version >/dev/null
docker info >/dev/null 2>&1 || { echo "Start Docker Desktop and enable integration for this WSL distribution." >&2; exit 1; }

if [[ ! -f .env ]]; then
  command -v openssl >/dev/null || { echo "The WSL openssl command is required to generate the database password." >&2; exit 1; }
  # Generate locally, never print it, and never replace an existing credential.
  password="$(openssl rand -hex 32)"
  (umask 077; set -o noclobber; printf 'POSTGRES_PASSWORD=%s\nCONTROL_CENTER_PORT=8088\n' "$password" > .env)
  unset password
  echo "Initialized private local configuration."
fi

docker compose up --build --detach --wait --wait-timeout 180
echo "Live FX Control is running. Default address: http://localhost:8088"
echo "If you changed the port, use that port instead. Configure both servers in Settings."
