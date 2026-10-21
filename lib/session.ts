import crypto from "node:crypto";

const NAME = "ck_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 天
const SECRET = process.env.AUTH_SECRET ?? "dev-secret-change-me";

function sign(value: string) {
  return crypto.createHmac("sha256", SECRET).update(value).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** 只能在 Server Action / Route Handler 里调用 */
export async function createSession(userId: string) {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  store.set(NAME, `${userId}.${sign(userId)}`, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
    // 用 IP 直连（没有 HTTPS）时要把这个关掉，否则浏览器不会带上 cookie
    secure: process.env.COOKIE_SECURE === "false" ? false : process.env.NODE_ENV === "production",
  });
}

export async function destroySession() {
  const { cookies } = await import("next/headers");
  (await cookies()).delete(NAME);
}

export async function getUserId(): Promise<string | null> {
  const { cookies } = await import("next/headers");
  const raw = (await cookies()).get(NAME)?.value;
  if (!raw) return null;
  const i = raw.lastIndexOf(".");
  if (i <= 0) return null;
  const id = raw.slice(0, i);
  const sig = raw.slice(i + 1);
  if (!safeEqual(sig, sign(id))) return null;
  return id;
}
