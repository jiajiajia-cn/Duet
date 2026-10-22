import Link from "next/link";

export default function Header({
  title,
  sub,
  avatar,
  back,
}: {
  title: string;
  sub?: string;
  avatar?: string;
  /** 二级页面用：左上角一个返回链接 */
  back?: { href: string; label: string };
}) {
  return (
    <header className="header">
      <div>
        {back ? (
          <Link href={back.href} className="tiny" style={{ display: "inline-block", marginBottom: 2 }}>
            ‹ {back.label}
          </Link>
        ) : null}
        <h1>{title}</h1>
        {sub ? <div className="sub">{sub}</div> : null}
      </div>
      {avatar ? <div className="avatar header-avatar">{avatar}</div> : null}
    </header>
  );
}
