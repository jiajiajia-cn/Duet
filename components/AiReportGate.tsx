"use client";

import { useEffect, useState, useTransition } from "react";
import { fetchUnreadReport, markReportReadAction } from "@/app/actions/ai";

type Report = { id: string; date: string; content: string; model: string | null };

/** 每天第一次打开时，弹出 AI 写好的回顾；关掉才算读过 */
export default function AiReportGate() {
  const [report, setReport] = useState<Report | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [, start] = useTransition();

  useEffect(() => {
    let alive = true;
    const timer = window.setTimeout(() => {
      fetchUnreadReport()
        .then((r) => {
          if (!alive || !r) return;
          setReport(r);
        })
        .catch(() => {});
    }, 800);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, []);

  if (!report || dismissed) return null;

  function close() {
    const fd = new FormData();
    fd.set("id", report!.id);
    setDismissed(true);
    start(async () => {
      await markReportReadAction(fd);
    });
  }

  return (
    <div className="ai-overlay" role="dialog" aria-modal="true">
      <div className="ai-sheet">
        <div className="ai-head">
          <span className="ai-badge">今日回顾</span>
          <span className="tiny">{report.date}</span>
        </div>

        <div className="ai-body">
          {report.content.split("\n").filter(Boolean).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>

        {report.model === "fallback" ? (
          <div className="tiny" style={{ marginTop: 10, opacity: 0.7 }}>
            AI 暂时没连上，这是系统按你的记录生成的简版。
          </div>
        ) : null}

        <button className="btn" type="button" onClick={close} style={{ marginTop: 16 }}>
          看完了
        </button>
      </div>
    </div>
  );
}
