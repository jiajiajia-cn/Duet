#!/usr/bin/env bash
# 手动执行数据库迁移（Node 直跑部署用）
# 用法：bash deploy/db-migrate.sh
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env.node ]; then
  echo "找不到 .env.node，请先运行 deploy/node-deploy.sh" >&2
  exit 1
fi

# 把 .env.node 里的变量 export 出来，Prisma CLI 才读得到 DATABASE_URL
set -a
# shellcheck disable=SC1091
. ./.env.node
set +a

if [ -z "${DATABASE_URL:-}" ]; then
  echo ".env.node 里没有 DATABASE_URL" >&2
  exit 1
fi

echo "==> 当前数据库：$(echo "$DATABASE_URL" | sed 's/:[^:@]*@/:***@/')"
node node_modules/prisma/build/index.js migrate deploy
