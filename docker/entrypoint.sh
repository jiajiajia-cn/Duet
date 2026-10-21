#!/bin/sh
set -e

DATA_DIR="${DATA_DIR:-/data}"
UPLOAD_DIR="${UPLOAD_DIR:-$DATA_DIR/uploads}"
mkdir -p "$UPLOAD_DIR"
export UPLOAD_DIR

PG_BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | head -n1 || true)"

if [ "${LOCAL_PG:-0}" = "1" ] && [ -n "$PG_BIN" ]; then
  PGDATA="${DATA_DIR}/pg"
  export DATABASE_URL="${DATABASE_URL:-postgresql://postgres@127.0.0.1:5432/checkin?schema=public}"

  mkdir -p "$PGDATA"
  chown -R postgres:postgres "$DATA_DIR"

  if [ ! -s "$PGDATA/PG_VERSION" ]; then
    echo "[entrypoint] 初始化 PostgreSQL 数据目录 $PGDATA"
    su postgres -c "$PG_BIN/initdb -D $PGDATA -A trust -E UTF8 --locale=C" >/dev/null
  fi

  echo "[entrypoint] 启动 PostgreSQL"
  su postgres -c "$PG_BIN/pg_ctl -D $PGDATA -o '-c listen_addresses=127.0.0.1 -p 5432 -c max_connections=50' -w -t 60 start"

  # 数据库不存在就建一个
  if ! su postgres -c "$PG_BIN/psql -h 127.0.0.1 -p 5432 -tAc \"SELECT 1 FROM pg_database WHERE datname='checkin'\"" | grep -q 1; then
    su postgres -c "$PG_BIN/createdb -h 127.0.0.1 -p 5432 checkin"
  fi
fi

if [ -n "$DATABASE_URL" ]; then
  echo "[entrypoint] 执行数据库迁移"
  node node_modules/prisma/build/index.js migrate deploy || echo "[entrypoint] 迁移失败，继续启动（请检查 DATABASE_URL）"
fi

echo "[entrypoint] 启动应用 :${PORT:-8080}"
exec node server.js
