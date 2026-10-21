import Link from "next/link";
import { redirect } from "next/navigation";
import EntryForm from "@/components/EntryForm";
import { getContext } from "@/lib/queries";
import { createEntryAction } from "@/app/actions/schedule";

export default async function NewEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  const { error } = await searchParams;

  return (
    <>
      <header className="header">
        <Link href="/schedule" className="tiny">‹ 日程</Link>
        <h1 style={{ fontSize: 19 }}>加安排</h1>
      </header>
      {error ? <div className="alert" style={{ marginBottom: 12 }}>{error}</div> : null}
      <EntryForm action={createEntryAction} submitLabel="加上" />
    </>
  );
}
