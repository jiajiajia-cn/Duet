"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Mascot from "@/components/Mascot";
import {
  askNotifyPermission,
  flashTitle,
  notifyState,
  playAlarm,
  sendNotification,
  unlockAudio,
} from "@/lib/alarm";
import { startTimer, pauseTimer, resumeTimer, finishTimer } from "@/app/actions/timer";

export type ActiveSession = {
  id: string;
  mode: "STOPWATCH" | "COUNTDOWN" | "POMODORO";
  phase: "FOCUS" | "BREAK" | "LONG_BREAK";
  status: "RUNNING" | "PAUSED";
  plannedSeconds: number | null;
  startedAtMs: number;
  pausedTotalSeconds: number;
  pausedAtMs: number | null;
  skillId: string | null;
  skillName: string | null;
  round: number;
};

export type SkillOption = { id: string; name: string; icon: string };
export type HabitOption = { id: string; title: string };
export type PomoConfig = { focus: number; short: number; long: number; every: number; roundsToday: number };

const PRESETS = [5, 25, 45, 90];
const PHASE_TEXT: Record<string, string> = {
  FOCUS: "专注",
  BREAK: "短休",
  LONG_BREAK: "长休",
};

export default function TimerClient({
  active,
  skills,
  timedHabits,
  pomo,
  initialHabitId = "",
}: {
  active: ActiveSession | null;
  skills: SkillOption[];
  timedHabits: HabitOption[];
  pomo: PomoConfig;
  initialHabitId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [now, setNow] = useState(() => Date.now());
  const [minutes, setMinutes] = useState(25);
  const [stopwatch, setStopwatch] = useState(false);
  const [pomoMode, setPomoMode] = useState(false);
  const [skillId, setSkillId] = useState<string>(active?.skillId ?? skills[0]?.id ?? "");
  const [habitId, setHabitId] = useState<string>(initialHabitId);
  const [toast, setToast] = useState<string | null>(null);
  const [next, setNext] = useState<{ phase: "FOCUS" | "BREAK" | "LONG_BREAK"; minutes: number; round: number } | null>(null);
  const [notify, setNotify] = useState<string>("default");
  const firedRef = useRef<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setNotify(notifyState());
  }, []);

  const elapsed = useMemo(() => {
    if (!active) return 0;
    const paused =
      active.pausedTotalSeconds +
      (active.pausedAtMs ? (now - active.pausedAtMs) / 1000 : 0);
    return Math.max(0, Math.floor((now - active.startedAtMs) / 1000 - paused));
  }, [active, now]);

  const planned = active?.plannedSeconds ?? 0;
  const remaining = planned ? planned - elapsed : 0;

  // 到点了：响铃 + 标题闪烁 + 系统通知（后者要 HTTPS 才会真正弹）
  useEffect(() => {
    if (!active || active.mode === "STOPWATCH") return;
    if (active.status !== "RUNNING") return;
    if (!planned || remaining > 0) return;
    if (firedRef.current === active.id) return;

    firedRef.current = active.id;
    playAlarm(3);
    flashTitle("⏰ 时间到");
    sendNotification("专注结束", `${active.skillName ?? "这段时间"}已完成`, active.id);
  }, [active, planned, remaining]);
  const overtime = planned && remaining < 0 ? -remaining : 0;
  const shown = active
    ? active.mode === "STOPWATCH"
      ? elapsed
      : Math.abs(remaining)
    : pomoMode
      ? pomo.focus * 60
      : stopwatch
        ? 0
        : minutes * 60;
  const pct = planned ? Math.min(100, (elapsed / planned) * 100) : 0;

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  }

  function run(fn: () => Promise<void>) {
    unlockAudio();
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  const mm = String(Math.floor(shown / 60)).padStart(2, "0");
  const ss = String(shown % 60).padStart(2, "0");

  const isBreak = active?.mode === "POMODORO" && active.phase !== "FOCUS";
  const roundNow = pomo.roundsToday + 1;

  function startPomoFocus(round: number) {
    run(async () => {
      const r = await startTimer({
        mode: "POMODORO",
        plannedMinutes: pomo.focus,
        phase: "FOCUS",
        round,
        skillId: skillId || null,
        habitId: habitId || null,
      });
      if (!r?.ok) flash(r?.error ?? "启动失败");
    });
  }

  function startPomoBreak(phase: "BREAK" | "LONG_BREAK") {
    run(async () => {
      const r = await startTimer({
        mode: "POMODORO",
        plannedMinutes: phase === "LONG_BREAK" ? pomo.long : pomo.short,
        phase,
        round: pomo.roundsToday,
      });
      if (!r?.ok) flash(r?.error ?? "启动失败");
    });
  }

  return (
    <>
      <div className="ring-wrap">
        <div className="ring" style={{ ["--p" as string]: pct.toFixed(1) }}>
          <div className="inner">
            <div>
              <Mascot
                className={`mascot ring-mascot${active && active.status === "PAUSED" ? " sleeping" : ""}${
                  active && active.status === "RUNNING" ? " bobbing" : ""
                }`}
                pose={active && (isBreak || active.status === "PAUSED") ? "sleep" : "hello"}
              />
              <div className="time">
                {mm}:{ss}
              </div>
              <div className="cap">
                {active
                  ? `${active.mode === "POMODORO" ? `第 ${active.round} 轮 · ${PHASE_TEXT[active.phase]}` : active.skillName ?? "未分类"}${
                      overtime ? " · 超时" : ""
                    }${active.status === "PAUSED" ? " · 已暂停" : ""}`
                  : pomoMode
                    ? `番茄 · 第 ${roundNow} 轮专注`
                    : "选个时长开始"}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ textAlign: "center", marginTop: -4, marginBottom: 10 }}>
        {notify === "granted" ? (
          <span className="tiny">🔔 结束时会弹系统通知</span>
        ) : notify === "insecure" ? (
          <span className="tiny">🔔 结束后会响铃 + 标题闪烁（上 HTTPS 后才能弹系统通知）</span>
        ) : notify === "unsupported" ? (
          <span className="tiny">🔔 结束后会响铃 + 标题闪烁</span>
        ) : notify === "denied" ? (
          <span className="tiny">🔔 通知被拒绝，结束时会响铃</span>
        ) : (
          <button
            type="button"
            className="chip"
            onClick={async () => {
              unlockAudio();
              const s = await askNotifyPermission();
              setNotify(s);
            }}
          >
            🔔 开启提醒
          </button>
        )}
      </div>

      {!active ? (
        <>
          {next ? (
            <div className="card" style={{ marginBottom: 12 }}>
              <b style={{ fontSize: 14 }}>
                上一段结束了，接下来：{PHASE_TEXT[next.phase]} {next.minutes} 分钟
              </b>
              <button
                className="btn"
                type="button"
                style={{ marginTop: 10 }}
                disabled={pending}
                onClick={() => {
                  const n = next;
                  setNext(null);
                  if (n.phase === "FOCUS") startPomoFocus(n.round);
                  else startPomoBreak(n.phase);
                }}
              >
                开始{PHASE_TEXT[next.phase]}
              </button>
              <button
                className="btn ghost"
                type="button"
                style={{ width: "100%", marginTop: 8, padding: 10, fontSize: 13 }}
                onClick={() => setNext(null)}
              >
                先跳过
              </button>
            </div>
          ) : null}

          <div className="chips">
            {PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                className={`chip${!stopwatch && !pomoMode && minutes === m ? " on" : ""}`}
                onClick={() => {
                  setStopwatch(false);
                  setPomoMode(false);
                  setMinutes(m);
                }}
                disabled={pending}
              >
                {m} 分
              </button>
            ))}
            <button
              type="button"
              className={`chip${stopwatch && !pomoMode ? " on" : ""}`}
              onClick={() => {
                setStopwatch(true);
                setPomoMode(false);
              }}
              disabled={pending}
            >
              正计时
            </button>
            <button
              type="button"
              className={`chip${pomoMode ? " on" : ""}`}
              onClick={() => {
                setStopwatch(false);
                setPomoMode(true);
              }}
              disabled={pending}
            >
              🍅 番茄
            </button>
          </div>

          <label className="field" style={{ marginBottom: 12 }}>
            <span>归到哪个技能</span>
            <select value={skillId} onChange={(e) => setSkillId(e.target.value)} disabled={pending}>
              <option value="">不归类（之后再说）</option>
              {skills.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.icon} {s.name}
                </option>
              ))}
            </select>
          </label>

          {timedHabits.length > 0 ? (
            <label className="field" style={{ marginBottom: 12 }}>
              <span>关联习惯（可选）</span>
              <select value={habitId} onChange={(e) => setHabitId(e.target.value)} disabled={pending}>
                <option value="">不关联</option>
                {timedHabits.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.title}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <button
            className="btn"
            type="button"
            disabled={pending}
            onClick={() => {
              if (pomoMode) {
                startPomoFocus(roundNow);
                return;
              }
              run(async () => {
                const r = await startTimer({
                  mode: stopwatch ? "STOPWATCH" : "COUNTDOWN",
                  plannedMinutes: minutes,
                  skillId: skillId || null,
                  habitId: habitId || null,
                });
                if (!r?.ok) flash(r?.error ?? "启动失败");
              });
            }}
          >
            {pending ? "启动中…" : pomoMode ? `开始第 ${roundNow} 轮专注` : "开始专注"}
          </button>

          {pomoMode ? (
            <div className="tiny" style={{ textAlign: "center", marginTop: 8 }}>
              {pomo.focus} 分钟专注 + {pomo.short} 分钟休息，每 {pomo.every} 轮长休 {pomo.long} 分钟
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div className="row2">
            <button
              className="btn"
              type="button"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  if (active.status === "RUNNING") await pauseTimer(active.id);
                  else await resumeTimer(active.id);
                })
              }
            >
              {active.status === "RUNNING" ? "暂停" : "继续"}
            </button>
            <button
              className="btn dark"
              type="button"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const r = await finishTimer(active.id, false);
                  if (r?.discarded) {
                    flash("不到 1 分钟，已丢弃");
                    return;
                  }
                  if (r?.isBreak) {
                    flash("休息结束，来一轮专注吧");
                    setNext({ phase: "FOCUS", minutes: pomo.focus, round: pomo.roundsToday + 1 });
                    return;
                  }
                  if (r?.points) flash(`完成 ${r.minutes} 分钟 · +${r.points} 分`);
                  else flash(`完成 ${r?.minutes ?? 0} 分钟`);

                  if (r?.phase === "FOCUS" && r?.round) {
                    const round = r.round;
                    const long = round % pomo.every === 0;
                    setNext({
                      phase: long ? "LONG_BREAK" : "BREAK",
                      minutes: long ? pomo.long : pomo.short,
                      round,
                    });
                  }
                })
              }
            >
              {isBreak ? "结束休息" : "结束"}
            </button>
          </div>
          <button
            className="btn ghost"
            type="button"
            style={{ marginTop: 10 }}
            disabled={pending}
            onClick={() =>
              run(async () => {
                const r = await finishTimer(active.id, true);
                flash(r?.discarded ? "不到 1 分钟，已丢弃" : "已放弃（计时长、不给分）");
              })
            }
          >
            放弃
          </button>
        </>
      )}

      <div className={`toast${toast ? " on" : ""}`}>{toast ?? ""}</div>
    </>
  );
}
