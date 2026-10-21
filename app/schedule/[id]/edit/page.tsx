import Link from "next/link";
import { redirect } from "next/navigation";
import EntryForm from "@/components/EntryForm";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";
import { deleteEntryAction, updateEntryAction } from "@/app/actions/schedule";

export default async function EditEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");

  const { id } = await params;
  const { error } = await searchParams;

  const entry = await prisma.entry.findFirst({ where: { id, userId: ctx.user.id } });
  if (!entry) redirect("/schedule");

  return (
    <>
      <header className="header">
        <Link href="/schedule" className="tiny">‹ 日程</Link>
        <h1 style={{ fontSize: 19 }}>编辑安排</h1>
      </header>
      {error ? <div className="alert" style={{ marginBottom: 12 }}>{error}</div> : null}

      <EntryForm action={updateEntryAction} entry={entry} submitLabel="保存" />

      <form action={deleteEntryAction} style={{ marginTop: 12 }}>
        <input type="hidden" name="id" value={entry.id} />
        <button className="btn ghost" type="submit" style={{ width: "100%", padding: 11, fontSize: 14, color: "var(--danger)" }}>
          删除这个安排
        </button>
      </form>
    </>
  );
}
