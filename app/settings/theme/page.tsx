import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/queries";
import { setThemeAction } from "@/app/actions/theme";
import { THEME_META } from "@/lib/theme";
import Mascot from "@/components/Mascot";

export default async function ThemePage() {
  const ctx = await getContext();
  if (!ctx) redirect("/login");

  const current = (await cookies()).get("ck_theme")?.value ?? "default";

  return (
    <>
      <header className="header">
        <Link href="/settings" className="tiny">‹ 设置</Link>
        <h1 style={{ fontSize: 19 }}>主题</h1>
      </header>

      <p className="tiny" style={{ marginBottom: 4 }}>
        选一个，立即生效，记在这台设备上。
      </p>

      <div className="theme-grid">
        {THEME_META.map((t) => (
          <form key={t.key} action={setThemeAction}>
            <input type="hidden" name="theme" value={t.key} />
            <button
              type="submit"
              className={`theme-card${current === t.key ? " on" : ""}`}
              style={{ width: "100%" }}
              aria-label={`使用${t.name}主题`}
            >
              <div className="theme-preview" style={{ background: t.bg }}>
                <div className="pv-card" style={{ background: t.card, opacity: 0.95 }} />
                <div className="pv-card small" style={{ background: t.card, opacity: 0.7 }} />
                <div className="pv-dot" style={{ background: t.dot }} />
                {t.key === "maltese" ? (
                  <Mascot pose="happy" style={{ width: 36, height: 36, position: "absolute", right: 8, bottom: 4, color: "#241f19" }} />
                ) : null}
              </div>
              <div className="theme-name">{t.name}</div>
              <div className="theme-sub">{t.sub}</div>
            </button>
          </form>
        ))}
      </div>

    </>
  );
}
