#!/usr/bin/env bash
# 在服务器上更新 Duet。
#
# 为什么不是简单的 git pull && npm run build：
# 这台机器只有 2G 内存，`next build` 会占满内存；
# 而且构建会边写 .next 边被正在运行的进程读取，页面就会一直卡住。
# 所以这里先停服务、限制构建内存、再启动。
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/5 拉代码"
git pull --ff-only

echo "==> 2/5 停服务（这几分钟页面打不开是正常的）"
sudo systemctl stop duet || true

echo "==> 3/5 生成 Prisma Client"
npx prisma generate

echo "==> 4/5 构建（限制内存到 1.5G，小内存机器必需）"
NODE_OPTIONS="--max-old-space-size=1536" NEXT_TELEMETRY_DISABLED=1 npx next build

echo "==> 5/5 启动服务"
sudo systemctl restart duet
sleep 3
systemctl --no-pager --lines=8 status duet || true

echo "✅ 更新完成"
