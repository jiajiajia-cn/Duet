"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="page" style={{ padding: "60px 24px", textAlign: "center" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>😵</div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>这一页没加载出来</h1>
      <p className="tiny" style={{ lineHeight: 1.7, marginBottom: 20 }}>
        可能是网络抖动，也可能是刚更新过。点下面重试，一般就好了。
        <br />
        {error.digest ? `错误码：${error.digest}` : ""}
      </p>
      <button className="btn" type="button" onClick={() => reset()} style={{ maxWidth: 220, margin: "0 auto" }}>
        重试
      </button>
      <a
        href="/"
        className="btn ghost"
        style={{ maxWidth: 220, margin: "10px auto 0", display: "flex", justifyContent: "center" }}
      >
        回首页
      </a>
    </div>
  );
}
