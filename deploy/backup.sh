#!/usr/bin/env bash
# 每天备份数据库到 data/backup，保留 14 天
# 用法：bash deploy/backup.sh
set -euo pipefail

cd "$(dirname "$0")/.."
DIR="$(pwd)/data/backup"
mkdir -p "$DIR"

STAMP=$(date +%Y%m%d-%H%M%S)
FILE="$DIR/duet-$STAMP.sql"

if docker ps --format '{{.Names}}' | grep -qx duet-db-1; then
  docker exec duet-db-1 pg_dump -U duet -d duet --no-owner --no-privileges > "$FILE"
else
  echo "数据库容器 duet-db-1 没在运行" >&2
  exit 1
fi

gzip -f "$FILE"

# 只保留最近 14 份
find "$DIR" -name 'duet-*.sql.gz' -mtime +14 -delete 2>/dev/null || true

SIZE=$(du -h "$FILE.gz" | cut -f1)
COUNT=$(find "$DIR" -name 'duet-*.sql.gz' | wc -l | tr -d ' ')
echo "已备份 $FILE.gz ($SIZE)，当前共 $COUNT 份"
