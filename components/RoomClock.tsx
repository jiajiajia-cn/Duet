"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export default function RoomClock({
  startedAtMs,
  endsAtMs,
  durationMinutes,
}: {
  startedAtMs: number | null;
  endsAtMs: number | null;
  durationMinutes: number;
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(() => {
      setRefreshing(true);
      router.refresh();
      setTimeout(() => setRefreshing(false), 600);
    }, 5000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [router]);

  const { pct, label, state } = useMemo(() => {
    if (!startedAtMs || !endsAtMs) {
      return { pct: 0, label: `${String(durationMinutes).padStart(2, "0")}:00`, state: "waiting" as const };
    }
    const total = endsAtMs - startedAtMs;
    const left = Math.max(0, endsAtMs - now);
    const p = total > 0 ? Math.min(100, ((total - left) / total) * 100) : 100;
    const m = Math.floor(left / 60000);
    const s = Math.floor((left % 60000) / 1000);
    return {
      pct: p,
      label: `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`,
      state: left === 0 ? ("done" as const) : ("running" as const),
    };
  }, [startedAtMs, endsAtMs, now, durationMinutes]);

  return (
    <div className="ring-wrap">
      <div className="ring" style={{ ["--p" as string]: pct.toFixed(1) }}>
        <div className="inner">
          <div>
            <div className="time">{label}</div>
            <div className="cap">
              {state === "waiting" ? "等房主开始" : state === "done" ? "这一轮结束了" : refreshing ? "同步中…" : "一起专注中"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
