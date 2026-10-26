"use client";

import { useRef } from "react";

/** 危险操作按钮：先弹浏览器原生确认框，确认后才提交表单 */
export default function ConfirmSubmit({
  children,
  message,
  className = "btn ghost",
  style,
}: {
  children: React.ReactNode;
  message: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  return (
    <button
      ref={ref}
      type="submit"
      className={className}
      style={style}
      onClick={(e) => {
        if (!window.confirm(message)) {
          e.preventDefault();
        }
      }}
    >
      {children}
    </button>
  );
}
