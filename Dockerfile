# 一条镜像跑完整应用：Next.js + 可选的内置 PostgreSQL
# 构建： docker build -t checkin .
# 运行： docker run -p 8080:8080 -v checkin-data:/data -e AUTH_SECRET=xxx -e LOCAL_PG=1 checkin
#
# 国内网络拉不动官方镜像时，可以换镜像源：
#   docker build \
#     --build-arg BASE_IMAGE=docker.m.daocloud.io/library/node:22-bookworm-slim \
#     --build-arg APT_MIRROR=mirrors.tencent.com \
#     --build-arg NPM_REGISTRY=https://registry.npmmirror.com \
#     -t checkin .

ARG BASE_IMAGE=node:22-bookworm-slim

FROM ${BASE_IMAGE} AS deps
ARG APT_MIRROR=""
ARG NPM_REGISTRY=""
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN if [ -n "$APT_MIRROR" ]; then \
      sed -i "s|deb.debian.org|$APT_MIRROR|g" /etc/apt/sources.list.d/debian.sources 2>/dev/null || true; \
    fi \
  && apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable \
  && if [ -n "$NPM_REGISTRY" ]; then \
       export COREPACK_NPM_REGISTRY="$NPM_REGISTRY" npm_config_registry="$NPM_REGISTRY"; \
     fi \
  && (pnpm install --frozen-lockfile --prod=false || npm install --no-audit --no-fund)

FROM ${BASE_IMAGE} AS builder
ARG APT_MIRROR=""
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    BUILD_STANDALONE=1 \
    DATABASE_URL="postgresql://postgres@127.0.0.1:5432/checkin?schema=public"
RUN if [ -n "$APT_MIRROR" ]; then \
      sed -i "s|deb.debian.org|$APT_MIRROR|g" /etc/apt/sources.list.d/debian.sources 2>/dev/null || true; \
    fi \
  && apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN node node_modules/prisma/build/index.js generate && npm run build

FROM ${BASE_IMAGE} AS runner
ARG APT_MIRROR=""
ARG NPM_REGISTRY=""
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/data \
    UPLOAD_DIR=/data/uploads

# PostgreSQL 用于「数据库也放容器里」的模式；只用外部数据库可以删掉 postgresql
RUN if [ -n "$APT_MIRROR" ]; then \
      sed -i "s|deb.debian.org|$APT_MIRROR|g" /etc/apt/sources.list.d/debian.sources 2>/dev/null || true; \
    fi \
  && apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates postgresql postgresql-client tini \
  && rm -rf /var/lib/apt/lists/*

# 迁移用的 Prisma CLI 单独装一份（pnpm 的软链结构没法直接拷进容器）
RUN if [ -n "$NPM_REGISTRY" ]; then npm config set registry "$NPM_REGISTRY"; fi \
  && npm install --prefix /opt/prisma --no-audit --no-fund prisma@6.19.3 \
  && npm config delete registry || true

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && mkdir -p /data/uploads

EXPOSE 8080
ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]
