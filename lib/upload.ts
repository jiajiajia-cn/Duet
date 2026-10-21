import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const MAX = 5 * 1024 * 1024;

/**
 * 图片存放目录。
 * 本地开发默认 public/uploads；部署到容器时用 UPLOAD_DIR 指向挂载的持久盘（比如 /data/uploads），
 * 由 app/uploads/[...path]/route.ts 负责对外提供访问。
 */
export const UPLOAD_DIR =
  process.env.UPLOAD_DIR ?? path.join(process.cwd(), "public", "uploads");

/** 保存奖品图片 / 头像，返回可以直接放进 <img src> 的地址 */
export async function saveImage(file: File): Promise<string> {
  const ext = ALLOWED[file.type];
  if (!ext) throw new Error("只支持 jpg / png / webp / gif");
  if (file.size > MAX) throw new Error("图片不能超过 5MB");

  const buf = Buffer.from(await file.arrayBuffer());
  await mkdir(UPLOAD_DIR, { recursive: true });

  const name = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
  await writeFile(path.join(UPLOAD_DIR, name), buf);
  return `/uploads/${name}`;
}
