#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

case "${1:-}" in
  --lan)
    export CONTROL_CENTER_BIND=0.0.0.0
    echo "LAN mode: anyone with network access can operate this app; no login is implemented."
    ;;
  "") ;;
  *) echo "Usage: bash scripts/docker-start.sh [--lan]" >&2; exit 1 ;;
esac

command -v docker >/dev/null || { echo "Install Docker Engine and the Compose plugin, or enable Docker Desktop WSL integration." >&2; exit 1; }
docker compose version >/dev/null
docker info >/dev/null 2>&1 || { echo "Start the Docker service in Ubuntu (sudo service docker start), or start Docker Desktop if that is your engine." >&2; exit 1; }

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
if [[ "${CONTROL_CENTER_BIND:-127.0.0.1}" == "0.0.0.0" ]]; then
  echo "WSL2 NAT also needs Windows forwarding: see deploy/docker/README.md, LAN access."
  echo "Use --lan again on future starts. Starting without it returns to localhost-only."
fi
