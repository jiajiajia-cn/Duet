import Link from "next/link";

export type SkillDefaults = {
  id?: string;
  name?: string;
  icon?: string;
  color?: string;
  description?: string | null;
  targetHours?: number | null;
};

const ICONS = ["🎯", "🎸", "📖", "🏃", "🎨", "💻", "🗣️", "🧘", "🎹", "✍️"];
const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#0ea5e9", "#8b5cf6"];

export default function SkillForm({
  action,
  defaults = {},
  submitLabel,
}: {
  action: (fd: FormData) => void | Promise<void>;
  defaults?: SkillDefaults;
  submitLabel: string;
}) {
  return (
    <form action={action} className="stack">
      {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}

      <div className="field-row">
        <label className="field" style={{ width: 88, flex: "none" }}>
          <span>图标</span>
          <input name="icon" defaultValue={defaults.icon ?? "🎯"} maxLength={4} />
        </label>
        <label className="field">
          <span>技能名字</span>
          <input name="name" defaultValue={defaults.name} maxLength={20} placeholder="比如：吉他" required />
        </label>
      </div>

      <div className="tiny" style={{ marginTop: -6 }}>{ICONS.join(" ")} ← 复制一个到图标框</div>

      <label className="field">
        <span>颜色</span>
        <select name="color" defaultValue={defaults.color ?? "#6366f1"}>
          {COLORS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>描述（可选）</span>
        <textarea
          name="description"
          rows={3}
          maxLength={200}
          defaultValue={defaults.description ?? ""}
          placeholder="想练成什么样、跟谁学、练到哪了"
        />
      </label>

      <label className="field">
        <span>长期目标小时数（可选）</span>
        <input name="targetHours" type="number" min={1} defaultValue={defaults.targetHours ?? ""} placeholder="比如 1000" />
      </label>

      <button className="btn" type="submit" style={{ marginTop: 4 }}>
        {submitLabel}
      </button>
      <Link href="/skills" className="btn ghost" style={{ marginTop: 10, textAlign: "center" }}>
        返回
      </Link>
    </form>
  );
}
