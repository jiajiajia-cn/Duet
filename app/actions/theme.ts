"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { THEMES } from "@/lib/theme";

export async function setThemeAction(formData: FormData) {
  const raw = String(formData.get("theme") ?? "default");
  const theme = (THEMES as readonly string[]).includes(raw) ? raw : "default";

  const store = await cookies();
  store.set("ck_theme", theme, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  redirect("/settings/theme");
}
