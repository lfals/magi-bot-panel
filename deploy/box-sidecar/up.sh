#!/usr/bin/env bash
# Join Tailscale userspace (sem Docker) usando .env local.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${DIR}/.env"
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a
: "${TS_AUTHKEY:?TS_AUTHKEY vazio em $ENV_FILE}"
: "${TS_HOSTNAME:=grok-box-l2s}"
: "${TS_EXTRA_ARGS:=--advertise-tags=tag:grok-box}"

if ! command -v tailscaled >/dev/null 2>&1; then
  echo "tailscale não instalado neste box — instalar antes (ver README sidecar)." >&2
  exit 1
fi

mkdir -p /tmp/tailscale-grok-box
if ! pgrep -f 'tailscaled.*userspace-networking' >/dev/null 2>&1; then
  nohup tailscaled --tun=userspace-networking --state=/tmp/tailscale-grok-box/tailscaled.state \
    --socket=/tmp/tailscale-grok-box/tailscaled.sock \
    >/tmp/tailscale-grok-box/tailscaled.log 2>&1 &
  sleep 1
fi

tailscale --socket=/tmp/tailscale-grok-box/tailscaled.sock up \
  --authkey="${TS_AUTHKEY}" \
  --hostname="${TS_HOSTNAME}" \
  ${TS_EXTRA_ARGS} \
  --accept-dns=true

tailscale --socket=/tmp/tailscale-grok-box/tailscaled.sock status
