#!/usr/bin/env bash
# Run Magi-side l2s-bus-emit.sh over SSH. No HMAC on this machine.
set -euo pipefail
exec ssh -o BatchMode=yes -o ConnectTimeout=15 felps@magi "/home/felps/magi-bot-panel/scripts/l2s-bus-emit.sh $(printf '%q ' "$@")"
