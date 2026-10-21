import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { UPLOAD_DIR } from "@/lib/upload";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/** 把 UPLOAD_DIR 里的图片对外提供出去（容器部署时挂在持久盘上） */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: parts } = await params;
  const rel = parts.join("/");

  if (!rel || rel.includes("..") || rel.includes("\\")) {
    return new Response("bad request", { status: 400 });
  }

  const file = path.join(UPLOAD_DIR, rel);
  try {
    const info = await stat(file);
    if (!info.isFile()) return new Response("not found", { status: 404 });

    const buf = await readFile(file);
    return new Response(new Uint8Array(buf), {
      headers: {
        "content-type": MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream",
        "content-length": String(info.size),
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
