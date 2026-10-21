export default function Avatar({
  url,
  name,
  size = 36,
  radius = 12,
  className = "",
}: {
  url?: string | null;
  name?: string | null;
  size?: number;
  radius?: number;
  className?: string;
}) {
  const base = {
    width: size,
    height: size,
    borderRadius: radius,
    flex: "none" as const,
    overflow: "hidden" as const,
  };

  if (url) {
    return (
      <div className={`avatar ${className}`.trim()} style={{ ...base, padding: 0, position: "relative" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" className="img-fill" />
      </div>
    );
  }

  return (
    <div className={`avatar ${className}`.trim()} style={{ ...base, fontSize: Math.round(size * 0.42) }}>
      {(name ?? "?").slice(0, 1)}
    </div>
  );
}
