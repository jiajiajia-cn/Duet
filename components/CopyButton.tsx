"use client";

import { useState } from "react";

/** 复制文本：优先用剪贴板 API，HTTP 环境下降级到 textarea + execCommand */
export default function CopyButton({
  text,
  label = "复制 markdown",
}: {
  text: string;
  label?: string;
}) {
  const [done, setDone] = useState(false);

  async function copy() {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setDone(true);
      window.setTimeout(() => setDone(false), 1800);
    } catch {
      setDone(false);
    }
  }

  return (
    <button className="btn ghost" type="button" onClick={copy} style={{ height: 46, fontSize: 14 }}>
      {done ? "已复制 ✓" : label}
    </button>
  );
}
