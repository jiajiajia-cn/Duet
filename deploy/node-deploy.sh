#!/usr/bin/env bash
# 服务器直接跑 Node（不用 Docker 构建应用），Docker 只留 PostgreSQL
# 用法：bash deploy/node-deploy.sh
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
NODE_VERSION="v22.20.0"
NODE_DIR="/opt/node"

echo "==> 项目目录: $ROOT"

# ---------- 1. Node ----------
if [ ! -x "$NODE_DIR/bin/node" ]; then
  echo "==> 安装 Node ${NODE_VERSION}（走国内镜像）"
  curl -fL "https://registry.npmmirror.com/-/binary/node/${NODE_VERSION}/node-${NODE_VERSION}-linux-x64.tar.xz" -o /tmp/node.tar.xz
  mkdir -p /opt
  tar xf /tmp/node.tar.xz -C /opt
  rm -rf "$NODE_DIR"
  mv "/opt/node-${NODE_VERSION}-linux-x64" "$NODE_DIR"
  ln -sf "$NODE_DIR/bin/node" /usr/local/bin/node
  ln -sf "$NODE_DIR/bin/npm" /usr/local/bin/npm
  ln -sf "$NODE_DIR/bin/npx" /usr/local/bin/npx
fi
node -v

# ---------- 2. 数据库（Docker 里那个） ----------
echo "==> 启动数据库容器"
docker compose up -d db
for i in $(seq 1 30); do
  if docker exec duet-db-1 pg_isready -U duet -d duet >/dev/null 2>&1; then break; fi
  sleep 2
done
docker compose ps db

# ---------- 3. 环境变量 ----------
if [ ! -f .env.node ]; then
  echo "==> 生成 .env.node"
  # 复用 docker 版 .env 里的密钥
  SECRET=$(grep '^AUTH_SECRET=' .env 2>/dev/null | cut -d= -f2- || true)
  DBPASS=$(grep '^DB_PASSWORD=' .env 2>/dev/null | cut -d= -f2- || true)
  [ -n "$SECRET" ] || SECRET=$(openssl rand -base64 32 | tr -d '\n/+=' | cut -c1-40)
  [ -n "$DBPASS" ] || DBPASS=$(openssl rand -hex 16)
  IP=$(curl -s --max-time 5 https://ipinfo.io/ip || echo "127.0.0.1")
  cat > .env.node <<EOF
NODE_ENV=production
PORT=80
DATABASE_URL=postgresql://duet:${DBPASS}@127.0.0.1:5432/duet?schema=public
AUTH_SECRET=${SECRET}
COOKIE_SECURE=false
UPLOAD_DIR=${ROOT}/data/uploads
NEXT_PUBLIC_APP_URL=http://${IP}
EOF
fi
mkdir -p data/uploads

# ---------- 4. 依赖 ----------
echo "==> 安装依赖（npmmirror）"
npm config set registry https://registry.npmmirror.com
npm install --no-audit --no-fund

echo "==> 生成 Prisma Client + 应用数据库迁移"
npx prisma generate
set -a
# shellcheck disable=SC1091
. ./.env.node
set +a
node node_modules/prisma/build/index.js migrate deploy

# ---------- 5. 构建 ----------
echo "==> 编译 Next.js"
npm run build

# ---------- 6. 停掉占 80 的 caddy，换成 systemd 服务 ----------
if docker compose ps --services --filter status=running 2>/dev/null | grep -qx caddy; then
  echo "==> 停掉 caddy 容器（80 端口给 Node 用）"
  docker compose stop caddy
fi
docker compose stop app 2>/dev/null || true

echo "==> 安装 systemd 服务"
cp deploy/duet.service /etc/systemd/system/duet.service
systemctl daemon-reload
systemctl enable duet >/dev/null 2>&1 || true
systemctl restart duet

sleep 3
systemctl --no-pager status duet | head -12

IP=$(grep -oP 'NEXT_PUBLIC_APP_URL=http://\K[0-9.]+' .env.node 2>/dev/null || curl -s --max-time 5 https://ipinfo.io/ip || echo "")
echo
echo "======================================"
echo " 部署完成： http://${IP:-<服务器IP>}"
echo " 看日志：   journalctl -u duet -f"
echo " 重启：     systemctl restart duet"
echo "======================================"
