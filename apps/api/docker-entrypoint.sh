#!/bin/sh
# L2S-43: volume /data pode montar root-owned. Se root, ajusta dono e dropa pra app (10001).
set -eu
DB_PATH="${DATABASE_PATH:-/data/events.sqlite}"
DATA_DIR="$(dirname "$DB_PATH")"
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  chown -R app:app "$DATA_DIR"
  exec su-exec app:app "$@"
fi
exec "$@"
