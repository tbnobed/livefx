#!/usr/bin/env bash
# Run locally in WSL. Keys are not passed as command-line arguments.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
[[ -f .env ]] || { echo "Run bash scripts/docker-start.sh first." >&2; exit 1; }
[[ -t 0 ]] || { echo "Run this command in an interactive terminal." >&2; exit 1; }
umask 077
temp="$(mktemp .env.keys.XXXXXX)"
trap 'rm -f "$temp"; unset key_a key_b' EXIT

echo "Enter the optional raw Assimilate access keys. Empty input clears that server's key."
read -r -s -p "Server A access key: " key_a; printf '\n'
read -r -s -p "Server B access key: " key_b; printf '\n'
# Compose single-quoted values preserve $, #, spaces and backslashes literally.
# Escape single quotes according to Compose .env syntax.
key_a="${key_a//\'/\\\'}"
key_b="${key_b//\'/\\\'}"
grep -vE '^(LIVE_FX_SERVER_A_KEY|LIVE_FX_SERVER_B_KEY)=' .env > "$temp" || [[ $? == 1 ]]
printf "\nLIVE_FX_SERVER_A_KEY='%s'\nLIVE_FX_SERVER_B_KEY='%s'\n" "$key_a" "$key_b" >> "$temp"
mv "$temp" .env
unset key_a key_b
docker compose up --detach --no-deps --force-recreate --wait api
echo "Access keys updated locally; the API bridge has restarted."
