"use client";

import { useState } from "react";
import type { RewardRow } from "@/lib/types";

export default function RewardDetailClient({
  reward,
  balance,
}: {
  reward: RewardRow;
  balance: number;
}) {
  const gap = Math.max(0, reward.points - balance);
  const [raised, setRaised] = useState(balance);
  const [joined, setJoined] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const funded = raised >= reward.points;
  const mine = Math.min(balance, reward.points);

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2000);
  }

  return (
    <>
      <div
        style={{
          height: 132,
          borderRadius: 18,
          display: "grid",
          placeItems: "center",
          fontSize: 56,
          background: "linear-gradient(135deg,#e9e7ff,#dff5ee)",
          margin: "4px 0 14px",
        }}
      >
        {reward.emoji}
      </div>

      <h1 style={{ margin: 0, fontSize: 21, letterSpacing: "-0.4px" }}>{reward.title}</h1>
      <div className="tiny" style={{ marginTop: 6 }}>
        一直想买的那副。换到就归你，运费我出。
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "14px 0" }}>
        <div style={{ fontSize: 30, fontWeight: 800, color: "var(--brand)", letterSpacing: "-1px" }}>
          {reward.points}
          <span style={{ fontSize: 13, color: "var(--ink3)", marginLeft: 2, fontWeight: 600 }}>分</span>
        </div>
        {gap > 0 ? <span className="pill warn">你还差 {gap} 分</span> : <span className="pill ok">积分够啦</span>}
      </div>

      <div style={{ background: "#f7f8fc", borderRadius: 16, padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600 }}>
          <span>合兑进度</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {raised} / {reward.points}
          </span>
        </div>
        <div className="bar" style={{ marginTop: 8 }}>
          <i style={{ width: `${Math.min(100, (raised / reward.points) * 100)}%` }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0" }}>
          <div className="avatar" style={{ width: 30, height: 30, borderRadius: 10, fontSize: 13 }}>
            我
          </div>
          <div style={{ flex: 1, fontSize: 13 }}>小满</div>
          <b style={{ fontSize: 13 }}>出 {mine}</b>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0" }}>
          <div
            className="avatar"
            style={{ width: 30, height: 30, borderRadius: 10, fontSize: 13, background: "#e8f8f2" }}
          >
            雨
          </div>
          <div style={{ flex: 1, fontSize: 13 }}>小雨</div>
          {joined ? (
            <span className="pill ok">已出 {gap}</span>
          ) : (
            <span className="tiny">待确认</span>
          )}
        </div>

        <div className="tiny" style={{ marginTop: 6 }}>
          {funded ? "已凑齐，生成兑换单" : `还差 ${reward.points - raised} 分 · 24 小时内有效`}
        </div>
      </div>

      <button
        type="button"
        className="btn"
        style={{ marginTop: 16 }}
        disabled={joined}
        onClick={() => {
          if (gap <= 0) {
            flash("积分够，直接兑换");
            return;
          }
          setJoined(true);
          setRaised(reward.points);
          flash(`小雨出了 ${gap} 分，凑齐！`);
        }}
      >
        {joined ? "凑齐了 · 等发货" : gap > 0 ? `让小雨出 ${gap} 分` : "直接兑换"}
      </button>

      <button
        type="button"
        className="btn ghost"
        style={{ marginTop: 10 }}
        disabled={joined}
        onClick={() => {
          flash("原型演示：取消合兑，已扣的分退回");
          setRaised(balance);
        }}
      >
        取消
      </button>


      <div className={`toast${toast ? " on" : ""}`}>{toast ?? ""}</div>
    </>
  );
}
