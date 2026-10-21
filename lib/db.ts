import { PrismaClient } from "@prisma/client";

/**
 * Prisma 单例。开发模式热更新会反复执行模块，避免连接数暴涨。
 * 目前页面还在用 lib/data.ts 的占位数据，这里先把连接层搭好。
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
