export default function Header({
  title,
  sub,
  avatar,
}: {
  title: string;
  sub?: string;
  avatar?: string;
}) {
  return (
    <header className="header">
      <div>
        <h1>{title}</h1>
        {sub ? <div className="sub">{sub}</div> : null}
      </div>
      {avatar ? <div className="avatar header-avatar">{avatar}</div> : null}
    </header>
  );
}
