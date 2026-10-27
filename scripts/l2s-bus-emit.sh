#!/usr/bin/env bash
# Best-effort Magi ingest. Usage:
#   l2s-bus-emit.sh sending <from_uuid> <to_uuid> <from_name>
#   l2s-bus-emit.sh message <from_uuid> <to_uuid> <from_name> <body>
#   l2s-bus-emit.sh group <from_uuid> <group_id> <from_name> <body>
#   l2s-bus-emit.sh status <agent_uuid> <from_name> <idle|busy|offline> <status_text>
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
set -a; source "$ROOT/.env"; set +a
INGEST="${L2S_BUS_INGEST_URL:-http://100.77.52.14:8787/v1/events}"
case "$INGEST" in
  *magi:8787*|*127.0.0.1:8787*) INGEST="http://100.77.52.14:8787/v1/events" ;;
esac
: "${L2S_BUS_HMAC_SECRET:?missing L2S_BUS_HMAC_SECRET}"

post() {
  local BODY="$1"
  local TS SIG
  TS=$(date +%s)
  SIG=$(printf '%s' "${TS}.${BODY}" | openssl dgst -sha256 -hmac "$L2S_BUS_HMAC_SECRET" | awk '{print $2}')
  curl -fsS -X POST "$INGEST" \
    -H "Content-Type: application/json" \
    -H "X-L2S-Timestamp: $TS" \
    -H "X-L2S-Signature: $SIG" \
    -d "$BODY"
  echo
}

cmd="${1:-}"
shift || true
TS=$(date +%s)
COARSE=$((TS/10))
case "$cmd" in
  sending)
    FROM="$1"; TO="$2"; NAME="$3"
    BODY=$(printf '{"type":"edge.sending","from_agent_id":"%s","from_name":"%s","to_agent_id":"%s","channel_type":"dm","dedupe_key":"sending:%s:%s:%s"}' "$FROM" "$NAME" "$TO" "$FROM" "$TO" "$COARSE")
    post "$BODY"
    ;;
  message)
    FROM="$1"; TO="$2"; NAME="$3"; MSG="$4"
    DK=$(printf '%s' "${FROM}|${TO}|dm|${TS}|${MSG}" | openssl dgst -sha256 | awk '{print $2}')
    # escape JSON string minimally
    MSG_JSON=$(printf '%s' "$MSG" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')
    BODY=$(printf '{"type":"message","channel_type":"dm","from_agent_id":"%s","from_name":"%s","to_agent_id":"%s","body":%s,"source":"emit","dedupe_key":"%s"}' "$FROM" "$NAME" "$TO" "$MSG_JSON" "$DK")
    post "$BODY"
    ;;
  group)
    FROM="$1"; GID="$2"; NAME="$3"; MSG="$4"
    DK=$(printf '%s' "${FROM}|${GID}|group|${TS}|${MSG}" | openssl dgst -sha256 | awk '{print $2}')
    MSG_JSON=$(printf '%s' "$MSG" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')
    BODY=$(printf '{"type":"message","channel_type":"group","from_agent_id":"%s","from_name":"%s","group_id":"%s","body":%s,"source":"emit","dedupe_key":"%s"}' "$FROM" "$NAME" "$GID" "$MSG_JSON" "$DK")
    post "$BODY"
    ;;
  status)
    AID="$1"; NAME="$2"; ST="$3"; TXT="$4"
    BODY=$(printf '{"type":"agent.status","agent_id":"%s","from_name":"%s","status":"%s","status_text":"%s","dedupe_key":"status:%s:%s:%s"}' "$AID" "$NAME" "$ST" "$TXT" "$AID" "$ST" "$COARSE")
    post "$BODY"
    ;;
  *)
    echo "usage: $0 sending|message|group|status ..." >&2
    exit 2
    ;;
esac
