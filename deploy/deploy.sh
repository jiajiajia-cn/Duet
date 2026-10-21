#!/usr/bin/env bash
# Duet 部署脚本（Ubuntu 22.04 / Debian 12）
# 用法：sudo bash deploy/deploy.sh
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

echo "==> 项目目录: $ROOT"

# ---------- 1. Docker ----------
if ! command -v docker >/dev/null 2>&1; then
  echo "==> 安装 Docker"
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://mirrors.aliyun.com/docker-ce/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc || \
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://mirrors.aliyun.com/docker-ce/linux/${ID} ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi

# ---------- 2. 镜像加速 ----------
if [ ! -f /etc/docker/daemon.json ]; then
  echo "==> 配置镜像加速"
  mkdir -p /etc/docker
  cat > /etc/docker/daemon.json <<'EOF'
{
  "registry-mirrors": [
    "https://docker.m.daocloud.io",
    "https://dockerproxy.net",
    "https://docker.1ms.run"
  ],
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
EOF
  systemctl restart docker || true
fi

# ---------- 3. .env ----------
if [ ! -f .env ]; then
  echo "==> 生成 .env"
  SECRET=$(openssl rand -base64 32 | tr -d '\n/+=' | cut -c1-40)
  DBPASS=$(openssl rand -hex 16)
  IP=$(curl -s --max-time 5 https://ipinfo.io/ip || echo "127.0.0.1")
  cat > .env <<EOF
# 站点地址：先用 IP，有域名后改成域名
SITE_ADDRESS=:80
APP_URL=http://${IP}
# 用 HTTP（IP 直连）时必须为 false，否则浏览器不保存登录状态
COOKIE_SECURE=false

AUTH_SECRET=${SECRET}
DB_PASSWORD=${DBPASS}

# 国内加速（容器内 apt / npm 走国内源）
APT_MIRROR=mirrors.aliyun.com
NPM_REGISTRY=https://registry.npmmirror.com
EOF
  echo "    .env 已生成（AUTH_SECRET 随机）"
fi

mkdir -p data/pg data/uploads data/caddy data/caddy-config

# ---------- 4. 启动 ----------
echo "==> 构建并启动（第一次要几分钟）"
docker compose up -d --build

echo "==> 等待应用就绪"
for i in $(seq 1 60); do
  if curl -fsS -o /dev/null http://127.0.0.1/ ; then
    break
  fi
  sleep 3
done

docker compose ps
IP=$(curl -s --max-time 5 https://ipinfo.io/ip || echo "")
echo
echo "======================================"
echo " 部署完成： http://${IP:-<服务器IP>}"
echo " 查看日志： docker compose logs -f app"
echo " 重启：     docker compose restart app"
echo "======================================"
