import type { NextConfig } from "next";

// 云托管在反向代理后面，Server Action 的 Origin 校验会拦请求。
// 用 ALLOWED_ORIGINS 环境变量补上（逗号分隔，写域名即可，不带协议）。
const extraOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim().replace(/^https?:\/\//, "").replace(/\/$/, ""))
  .filter(Boolean);

const nextConfig: NextConfig = {
  // 开发时的左下角小圆点会挡住底部导航，关掉
  devIndicators: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
      ...(extraOrigins.length ? { allowedOrigins: extraOrigins } : {}),
    },
  },
  // 打包成自包含的 server.js，只在 Docker / 云托管构建时打开
  // （Windows 上 pnpm 软链会报 EPERM，本地构建保持普通模式）
  ...(process.env.BUILD_STANDALONE === "1" ? { output: "standalone" as const } : {}),
};

export default nextConfig;
