"use client";

/**
 * 计时结束的提醒。
 *
 * 浏览器通知（Notification API）要求「安全上下文」——HTTPS 或 localhost。
 * 现在网站是 http://IP，所以拿不到通知权限；这时退化成本地声音 + 标题闪烁。
 * 等上了域名和 HTTPS，同一个代码会自动开始弹系统通知。
 */

let audioCtx: AudioContext | null = null;

/** 必须在用户点击时调用一次，浏览器才允许之后自动播放声音 */
export function unlockAudio() {
  try {
    if (!audioCtx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      audioCtx = new Ctor();
    }
    if (audioCtx.state === "suspended") void audioCtx.resume();
  } catch {
    /* 忽略：拿不到音频上下文就不响，不影响计时 */
  }
}

/** 响三声「叮—叮—叮」 */
export function playAlarm(times = 3) {
  unlockAudio();
  if (!audioCtx) return;

  const ctx = audioCtx;
  const start = ctx.currentTime;

  for (let i = 0; i < times; i++) {
    const t = start + i * 0.45;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(1320, t + 0.12);

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);

    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.35);
  }
}

/** 标题闪一闪，切回标签页就恢复 */
let titleTimer: number | null = null;

export function flashTitle(text = "⏰ 时间到") {
  stopFlashTitle();
  const original = document.title;
  let on = true;
  titleTimer = window.setInterval(() => {
    document.title = on ? text : original;
    on = !on;
  }, 900);

  const restore = () => {
    stopFlashTitle();
    document.title = original;
    window.removeEventListener("focus", restore);
  };
  window.addEventListener("focus", restore);
}

export function stopFlashTitle() {
  if (titleTimer !== null) {
    window.clearInterval(titleTimer);
    titleTimer = null;
  }
}

export type NotifyState = "unsupported" | "default" | "granted" | "denied" | "insecure";

/** 当前环境能不能用系统通知 */
export function notifyState(): NotifyState {
  if (typeof window === "undefined") return "unsupported";
  if (!window.isSecureContext) return "insecure";
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission as NotifyState;
}

export async function askNotifyPermission(): Promise<NotifyState> {
  const state = notifyState();
  if (state !== "default") return state;
  try {
    const p = await Notification.requestPermission();
    return p as NotifyState;
  } catch {
    return "denied";
  }
}

/** 发一条系统通知（没权限就静默跳过） */
export function sendNotification(title: string, body: string, tag = "duet-timer") {
  if (notifyState() !== "granted") return false;
  try {
    new Notification(title, { body, tag, icon: "/icon-192.png" });
    return true;
  } catch {
    return false;
  }
}
