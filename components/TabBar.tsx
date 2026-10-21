"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "今天", icon: "☀️" },
  { href: "/habits", label: "习惯", icon: "✅" },
  { href: "/timer", label: "计时", icon: "⏱" },
  { href: "/rooms", label: "自习室", icon: "👥" },
  { href: "/rewards", label: "奖品", icon: "🎁" },
  { href: "/me", label: "我的", icon: "🙂" },
];

const HIDDEN = ["/login", "/register", "/welcome", "/join"];

export default function TabBar({ alert = false }: { alert?: boolean }) {
  const pathname = usePathname();
  if (HIDDEN.some((p) => pathname.startsWith(p))) return null;

  return (
    <nav className="tabbar">
      {TABS.map((t) => {
        const on = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} className={`tab${on ? " on" : ""}`}>
            <span className="i">{t.icon}</span>
            {t.href === "/" && alert ? <b className="tabdot" aria-label="有待确认" /> : null}
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
