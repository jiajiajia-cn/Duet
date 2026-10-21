import Link from "next/link";

export type RewardDefaults = {
  id?: string;
  title?: string;
  description?: string | null;
  pointsCost?: number;
  stock?: number | null;
  limitPerUser?: number;
  cooldownDays?: number;
  category?: string;
  fulfillmentType?: string;
  image?: string | null;
};

export default function RewardForm({
  action,
  defaults = {},
  categories,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  defaults?: RewardDefaults;
  categories: string[];
  submitLabel: string;
}) {
  return (
    <form action={action} encType="multipart/form-data" className="stack">
      {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}

      <label className="field">
        <span>奖品名字</span>
        <input name="title" defaultValue={defaults.title} maxLength={40} placeholder="比如：周末一杯奶茶" required />
      </label>

      <label className="field">
        <span>描述（可选）</span>
        <textarea
          name="description"
          defaultValue={defaults.description ?? ""}
          maxLength={500}
          rows={3}
          placeholder="什么时候能换、怎么领、有没有限制"
        />
      </label>

      <label className="field">
        <span>需要多少积分</span>
        <input
          name="pointsCost"
          type="number"
          min={1}
          defaultValue={defaults.pointsCost ?? 100}
          required
        />
        <em>定价完全由你定，系统不给建议。</em>
      </label>

      <label className="field">
        <span>图片（可选，jpg/png/webp，≤5MB）</span>
        <input name="image" type="file" accept="image/*" />
        {defaults.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={defaults.image} alt="当前图片" style={{ marginTop: 8, width: 96, height: 96, objectFit: "cover", borderRadius: 12 }} />
        ) : null}
      </label>

      <label className="field">
        <span>分类（自己起名，比如 吃的 / 体验 / 特权）</span>
        <input name="category" defaultValue={defaults.category ?? "奖励"} list="cat-list" maxLength={16} />
        <datalist id="cat-list">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>

      <div className="field-row">
        <label className="field">
          <span>库存（留空 = 不限量）</span>
          <input name="stock" type="number" min={0} defaultValue={defaults.stock ?? ""} placeholder="不限" />
        </label>
        <label className="field">
          <span>每人限兑</span>
          <input name="limitPerUser" type="number" min={1} defaultValue={defaults.limitPerUser ?? 1} />
        </label>
      </div>

      <label className="field">
        <span>履约方式</span>
        <select name="fulfillmentType" defaultValue={defaults.fulfillmentType ?? "OFFLINE"}>
          <option value="VIRTUAL">虚拟（自动发放）</option>
          <option value="PHYSICAL">实物（需要交付）</option>
          <option value="OFFLINE">线下领取 / 体验</option>
        </select>
      </label>

      <button className="btn" type="submit" style={{ marginTop: 6 }}>
        {submitLabel}
      </button>
      <Link href="/admin/rewards" className="btn ghost" style={{ marginTop: 10, textAlign: "center" }}>
        取消
      </Link>
    </form>
  );
}
