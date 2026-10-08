"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Migration = { id: string; name: string; sourceName: string; targetName: string; status: string };

export default function HomePage() {
  const [migrations, setMigrations] = useState<Migration[]>([]);
  const [error, setError] = useState("");
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

  useEffect(() => {
    void fetch(`${api}/migrations`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`API request failed (${response.status}).`);
        return response.json();
      })
      .then((data) => setMigrations(data.migrations ?? []))
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Unable to load migrations."));
  }, [api]);

  return <div className="min-h-screen lg:grid lg:grid-cols-[220px_1fr]">
    <aside className="hidden border-r border-[#e7e5e0] bg-[#fbfbf9] px-4 py-5 lg:flex lg:flex-col"><Link href="/" className="flex items-center gap-2 px-3 text-sm font-semibold tracking-tight"><span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#171717] text-xs text-white shadow-sm">M</span><span>MigrateFlow</span></Link><nav className="mt-10 space-y-1 text-sm"><Link href="/" className="flex items-center gap-2 rounded-md bg-[#eaf6f0] px-3 py-2 font-medium text-[#145c43]"><span className="h-1.5 w-1.5 rounded-full bg-[#167a5a]" />Dashboard</Link><Link href="#migrations" className="flex items-center gap-2 rounded-md px-3 py-2 text-[#6b6b6b] hover:bg-[#f0f0ed] hover:text-[#171717]"><span className="h-1.5 w-1.5 rounded-full border border-[#9a9992]" />Migrations</Link></nav><div className="mt-auto border-t border-[#e7e5e0] px-3 pt-4 text-xs leading-5 text-[#8a8983]">Workspace<br /><span className="font-mono text-[#171717]">production</span></div></aside>
    <main className="min-w-0"><header className="border-b border-[#e7e5e0] bg-[#fbfbf9] px-6 py-4 lg:px-10"><div className="mx-auto flex max-w-7xl items-center justify-between"><span className="text-sm text-[#6b6b6b] lg:hidden">MigrateFlow</span><span className="hidden text-xs font-medium uppercase tracking-[0.18em] text-[#8a8983] lg:block">Migration operations</span><span className="font-mono text-xs text-[#6b6b6b]">ENV / production</span></div></header><div className="mx-auto max-w-7xl px-6 py-10 lg:px-10"><div className="flex flex-wrap items-end justify-between gap-6"><div><p className="font-mono text-xs uppercase tracking-[0.18em] text-[#8a8983]">Overview</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Migration operations</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[#6b6b6b]">Controlled data movement with explicit approval, deterministic execution, and an auditable trail.</p></div><Link href="/migrations/new" className="rounded-md bg-[#171717] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#30302e]">+ New migration</Link></div>
      <section id="migrations" className="mt-10">{error && <p className="mb-4 border border-[#f0c9c5] bg-[#fff5f3] p-3 text-sm text-[#8f2119]">{error} Check the backend URL and CORS_ORIGIN settings.</p>}<div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">Recent migrations</h2><span className="font-mono text-xs text-[#8a8983]">{migrations.length} records</span></div>{migrations.length === 0 ? <div className="border border-dashed border-[#d7d5cf] bg-white px-6 py-14 text-center"><h3 className="font-semibold">No migrations yet</h3><p className="mt-2 text-sm text-[#6b6b6b]">Upload schemas and source records to start a controlled migration.</p><Link href="/migrations/new" className="mt-5 inline-block rounded-md bg-[#167a5a] px-4 py-2 text-sm font-medium text-white">Create migration</Link></div> : <div className="overflow-hidden border border-[#e7e5e0] bg-white">{migrations.map((migration) => <Link key={migration.id} href={`/migrations/${migration.id}`} className="block border-b border-[#e7e5e0] px-5 py-4 last:border-b-0 hover:bg-[#fafaf8]"><div className="flex flex-wrap items-center justify-between gap-4"><div><h3 className="font-medium">{migration.name}</h3><p className="mt-1 font-mono text-xs text-[#6b6b6b]">{migration.sourceName} → {migration.targetName}</p></div><div className="flex items-center gap-4"><span className="rounded-full border border-[#d8e9df] bg-[#eaf6f0] px-2.5 py-1 font-mono text-[11px] text-[#145c43]">{migration.status}</span><span className="text-sm text-[#6b6b6b]">Open →</span></div></div></Link>)}</div>}</section></div></main>
  </div>;
}
