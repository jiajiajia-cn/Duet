#!/usr/bin/env bash
# 在服务器上更新 Duet。
#
# 为什么不是简单的 git pull && npm run build：
# 这台机器只有 2G 内存，`next build` 会占满内存；
# 而且构建会边写 .next 边被正在运行的进程读取，页面就会一直卡住。
# 所以这里先停服务、限制构建内存、再启动。
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 0/6 环境检查"

# 没有 swap 的话，2G 机器构建时很容易把机器压死
if ! swapon --show 2>/dev/null | grep -q .; then
  echo "⚠️  没有启用 swap。构建可能把机器压到连 SSH 都连不上。"
  echo "   建议先执行一次（只需一次）："
  echo "     sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile"
  echo "     sudo mkswap /swapfile && sudo swapon /swapfile"
  echo "     echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab"
  echo "   继续构建？10 秒后开始，Ctrl+C 可以中止..."
  sleep 10
fi

# 上一次卡死的构建进程先清掉，否则会一起抢内存
if pgrep -f "next build" > /dev/null 2>&1; then
  echo "发现残留的 next build 进程，先结束它们"
  pkill -f "next build" || true
  sleep 2
fi

echo "==> 1/6 拉代码"
git pull --ff-only

echo "==> 2/6 停服务（这几分钟页面打不开是正常的）"
sudo systemctl stop duet || true

echo "==> 3/6 生成 Prisma Client"
npx prisma generate

echo "==> 4/6 构建（限制内存到 1.5G，小内存机器必需）"
if ! NODE_OPTIONS="--max-old-space-size=1536" NEXT_TELEMETRY_DISABLED=1 npx next build; then
  echo ""
  echo "❌ 构建失败，服务目前是停止状态。"
  echo "   清理后重试："
  echo "     rm -rf .next"
  echo "     NODE_OPTIONS=\"--max-old-space-size=1536\" npx next build"
  echo "     sudo systemctl restart duet"
  exit 1
fi

echo "==> 5/6 启动服务"
sudo systemctl restart duet

echo "==> 6/6 自检"
sleep 3
if curl -fsS -o /dev/null http://127.0.0.1/login; then
  echo "✅ 应用返回 200，更新完成"
else
  echo "⚠️  应用没有正常响应，看看日志："
  journalctl -u duet -n 30 --no-pager
  exit 1
fi
