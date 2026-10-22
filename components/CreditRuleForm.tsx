"use client";

import { useState } from "react";

type Rule = {
  mode?: string;
  tiers?: { minutes: number; points: number }[];
  minutesPerUnit?: number | null;
  pointsPerUnit?: number | null;
  pointsPerSession?: number | null;
  minMinutes?: number;
  capPerSession?: number | null;
  capPerDay?: number | null;
};

export default function CreditRuleForm({
  action,
  rule,
  editable,
}: {
  action: (fd: FormData) => void | Promise<void>;
  rule: Rule | null;
  editable: boolean;
}) {
  const tiers = rule?.tiers ?? [];
  const [mode, setMode] = useState(rule?.mode ?? "TIER");

  return (
    <form action={action} className="stack">
      <label className="field">
        <span>用哪种方式给分</span>
        <select name="mode" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="TIER">阶梯表（推荐）：达到多少分钟给多少分</option>
          <option value="PER_MINUTE">按分钟：每 X 分钟给 Y 分</option>
          <option value="PER_SESSION">按次：达标一次给固定分</option>
        </select>
      </label>

      {mode === "TIER" ? (
        <div className="card" style={{ padding: 12 }}>
          <b style={{ fontSize: 14 }}>阶梯表</b>
          <div className="tiny" style={{ margin: "4px 0 10px" }}>取满足条件的最高一档，留空的行忽略。</div>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div className="field-row" key={i} style={{ marginBottom: 8 }}>
              <label className="field">
                <input name={`tierMin_${i}`} type="number" min={1} placeholder="分钟" defaultValue={tiers[i]?.minutes ?? ""} />
              </label>
              <label className="field">
                <input name={`tierPts_${i}`} type="number" min={0} placeholder="分数" defaultValue={tiers[i]?.points ?? ""} />
              </label>
            </div>
          ))}
        </div>
      ) : null}

      {mode === "PER_MINUTE" ? (
        <div className="field-row">
          <label className="field">
            <span>每多少分钟</span>
            <input name="minutesPerUnit" type="number" min={1} defaultValue={rule?.minutesPerUnit ?? 10} />
          </label>
          <label className="field">
            <span>给几分</span>
            <input name="pointsPerUnit" type="number" min={1} defaultValue={rule?.pointsPerUnit ?? 1} />
          </label>
        </div>
      ) : null}

      {mode === "PER_SESSION" ? (
        <label className="field">
          <span>达标一次给多少分</span>
          <input name="pointsPerSession" type="number" min={0} defaultValue={rule?.pointsPerSession ?? 10} />
        </label>
      ) : null}

      <label className="field">
        <span>最短有效时长（分钟，低于不给分）</span>
        <input name="minMinutes" type="number" min={0} defaultValue={rule?.minMinutes ?? 1} />
      </label>

      <div className="field-row">
        <label className="field">
          <span>单次上限（留空不限）</span>
          <input name="capPerSession" type="number" min={0} defaultValue={rule?.capPerSession ?? ""} placeholder="不限" />
        </label>
        <label className="field">
          <span>单日上限（留空不限）</span>
          <input name="capPerDay" type="number" min={0} defaultValue={rule?.capPerDay ?? ""} placeholder="不限" />
        </label>
      </div>

      {editable ? (
        <button className="btn" type="submit">
          保存
        </button>
      ) : (
        <div className="tiny">只有圈主能改。</div>
      )}
    </form>
  );
}
