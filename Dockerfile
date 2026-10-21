# 一条镜像跑完整应用：Next.js + 可选的内置 PostgreSQL
# 构建： docker build -t checkin .
# 运行： docker run -p 8080:8080 -v checkin-data:/data -e AUTH_SECRET=xxx checkin

FROM node:22-bookworm-slim AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable \
  && (pnpm install --frozen-lockfile --prod=false || npm install --no-audit --no-fund)

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# 构建阶段不需要真连数据库，占位即可
ENV DATABASE_URL="postgresql://postgres@127.0.0.1:5432/checkin?schema=public" \
    BUILD_STANDALONE=1
RUN node node_modules/prisma/build/index.js generate && npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/data \
    UPLOAD_DIR=/data/uploads

# PostgreSQL 用于「数据库也放容器里」的模式，不需要可以删掉这一行
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates postgresql postgresql-client tini \
  && rm -rf /var/lib/apt/lists/*

# Next 自带的 standalone 产物
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# 迁移文件和 prisma CLI（启动时跑 migrate deploy）
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.bin/prisma* ./node_modules/.bin/
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && mkdir -p /data/uploads

EXPOSE 8080
ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]
