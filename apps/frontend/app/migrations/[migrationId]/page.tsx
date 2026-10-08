"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

type Plan = { id: string; version: number; status: string; planSummary: string; mapping?: Array<{ sourceField: string; targetField: string; strategy?: string; reason?: string }>; transformations?: Array<{ sourceField: string; targetField: string; type: string; config?: Record<string, string>; reason?: string }>; risks?: Array<{ severity: string; field: string; message: string }>; questions?: Array<{ question: string; reason: string; blocking: boolean }>; validation?: { isValid?: boolean; errors?: unknown[]; warnings?: unknown[] } };
type Execution = { id: string; type: string; status: string; sourceCount: number; transformedCount: number; acceptedCount: number; rejectedCount: number; migratedCount: number };
type Workspace = { name?: string; sourceName?: string; targetName?: string; status?: string; plans: Plan[]; executions?: Execution[] };
type Reconciliation = { status: string; sourceCount: number; targetCount: number; matchedCount: number; missingCount: number; extraCount: number; mismatchCount: number };
type Rollback = { status: string; targetRecordsFound: number; targetRecordsDeleted: number; alreadyMissing: number; failed: number };

const statusHelp: Record<string, string> = {
  SETUP: "Analyze the migration to generate a draft plan.",
  PLAN_DRAFT: "Review the draft plan, then submit it for human approval.",
  PENDING_APPROVAL: "A reviewer must approve or reject the submitted plan.",
  READY_TO_EXECUTE: "The plan is approved. Run a deterministic dry run, then execute the migration.",
  COMPLETED: "The migration completed. Reconcile source and target records.",
  ROLLED_BACK: "The migration was rolled back.",
};

export default function MigrationWorkspace({ params }: { params: Promise<{ migrationId: string }> }) {
  const { migrationId } = React.use(params);
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [reconciliation, setReconciliation] = useState<Reconciliation | null>(null);
  const [rollback, setRollback] = useState<Rollback | null>(null);
  const [message, setMessage] = useState("Loading migration workspace...");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${api}/migrations/${migrationId}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "Unable to load migration workspace.");
      setWorkspace(data);
      setMessage(statusHelp[data.status] ?? "Review the current migration state.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load migration workspace.");
    }
  }, [api, migrationId]);

  useEffect(() => { void load(); }, [load]);

  const latestPlan = workspace?.plans[0];
  const approvedPlan = workspace?.plans.find((plan) => plan.status === "APPROVED");
  const latestDryRun = workspace?.executions?.find((execution) => execution.type === "DRY_RUN");
  const latestMigration = workspace?.executions?.find((execution) => execution.type === "MIGRATION");
  const validationErrors = latestPlan?.validation?.errors?.length ?? 0;
  const validationWarnings = latestPlan?.validation?.warnings?.length ?? 0;

  const run = async (key: string, action: () => Promise<Response>, success: string) => {
    setBusy(key); setMessage("Working...");
    try {
      const response = await action();
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message ?? "The request failed.");
      setMessage(success); await load(); return data;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The request failed.");
      return null;
    } finally { setBusy(null); }
  };

  const analyze = () => run("analyze", () => fetch(`${api}/migrations/${migrationId}/analyze`, { method: "POST" }), "Draft plan generated. Review it before submitting for approval.");
  const submit = () => latestPlan && run("submit", () => fetch(`${api}/migrations/${migrationId}/plans/${latestPlan.id}/submit`, { method: "POST" }), "Plan submitted. A human reviewer must approve it.");
  const approve = () => latestPlan && run("approve", () => fetch(`${api}/migrations/${migrationId}/plans/${latestPlan.id}/approve`, { method: "POST" }), "Plan approved. You can now run the dry run.");
  const reject = () => latestPlan && run("reject", () => fetch(`${api}/migrations/${migrationId}/plans/${latestPlan.id}/reject`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "Needs revision" }) }), "Plan rejected. Analyze again after revising the source or target definition.");
  const dryRun = () => approvedPlan && run("dry-run", () => fetch(`${api}/migrations/${migrationId}/plans/${approvedPlan.id}/dry-run`, { method: "POST" }), "Dry run completed. Review its results, then execute the migration.");
  const execute = () => approvedPlan && run("execute", () => fetch(`${api}/migrations/${migrationId}/plans/${approvedPlan.id}/execute`, { method: "POST" }), "Migration completed. Reconciliation is now available.");
  const reconcile = () => latestMigration && run("reconcile", () => fetch(`${api}/migrations/${migrationId}/executions/${latestMigration.id}/reconcile`, { method: "POST" }), "Reconciliation completed.").then((data) => data && setReconciliation(data));
  const doRollback = () => latestMigration && window.confirm("Rollback will remove only records created by this migration. Continue?") && run("rollback", () => fetch(`${api}/migrations/${migrationId}/executions/${latestMigration.id}/rollback`, { method: "POST" }), "Rollback completed.").then((data) => data && setRollback(data));
  const resetDemo = () => window.confirm("Reset the seeded demo workflow? This removes only demo-created target records and execution history.") && run("reset", () => fetch(`${api}/migrations/${migrationId}/reset-demo`, { method: "POST" }), "Demo reset. Submit the preserved plan for approval to restart.").then((data) => { if (data) { setReconciliation(null); setRollback(null); } });

  const button = (key: string, label: string, disabled: boolean, onClick: () => void, color = "bg-[#171717]") => <button disabled={disabled || busy !== null} onClick={onClick} className={`rounded-md ${color} px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40`}>{busy === key ? "Working..." : label}</button>;
  const planSummary = useMemo(() => latestPlan?.planSummary ?? "No plan has been generated yet.", [latestPlan]);

  return <main className="min-h-screen space-y-8 bg-[#f7f7f5] px-6 py-10 lg:px-10">
    <header className="mx-auto w-full max-w-6xl"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-mono text-xs uppercase tracking-[0.18em] text-[#8a8983]">Migration workspace</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">{workspace?.name ?? "Migration workspace"}</h1><p className="mt-2 font-mono text-xs text-[#6b6b6b]">{workspace?.sourceName} → {workspace?.targetName}</p></div>{workspace?.sourceName === "legacy_customers" && button("reset", "Reset demo", false, resetDemo, "bg-[#4b4b48]")}</div><p className="mt-5 border border-[#d8e9df] bg-[#eaf6f0] p-4 text-sm text-[#145c43]"><strong>Current state: {workspace?.status ?? "Loading"}</strong>{workspace?.status && ` — ${statusHelp[workspace.status] ?? "Review the current migration state."}`}</p></header>

    <section className="rounded-xl bg-white p-6 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-4"><h2 className="text-xl font-semibold">1. Plan review and human approval</h2>{!latestPlan && button("analyze", "Generate AI Plan", busy === "analyze", analyze)}</div><p className="mt-4 text-slate-700">{planSummary}</p>{latestPlan && <><div className="mt-4 flex flex-wrap gap-3 text-sm"><span className="rounded-full bg-slate-100 px-3 py-1">Version {latestPlan.version}</span><span className="rounded-full bg-slate-100 px-3 py-1">Status: {latestPlan.status}</span><span className={`rounded-full px-3 py-1 ${latestPlan.validation?.isValid === false ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>Validation: {latestPlan.validation?.isValid === false ? "Needs attention" : "Passed"}</span></div>
      <div className="mt-6 space-y-5"><div><h3 className="font-semibold">Field mappings</h3><div className="mt-2 divide-y rounded-lg border text-sm">{(latestPlan.mapping ?? []).map((mapping) => <div key={`${mapping.sourceField}-${mapping.targetField}`} className="grid gap-1 p-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center"><span>{mapping.sourceField}</span><span className="text-slate-400">→ {mapping.strategy ?? "DIRECT"} →</span><span>{mapping.targetField}<span className="block text-xs text-slate-500">{mapping.reason}</span></span></div>)}</div></div>
      {(latestPlan.transformations?.length ?? 0) > 0 && <div><h3 className="font-semibold">Transformations and quarantine rules</h3><div className="mt-2 space-y-2 text-sm">{latestPlan.transformations?.map((transformation, index) => <div key={`transformation-${index}`} className="rounded-lg border p-3"><div><strong>{transformation.sourceField}</strong> → <strong>{transformation.targetField}</strong> ({transformation.type})</div>{transformation.config && <pre className="mt-2 overflow-x-auto rounded bg-slate-50 p-2 text-xs">{JSON.stringify(transformation.config, null, 2)}</pre>}<p className="mt-1 text-slate-600">{transformation.reason}</p></div>)}</div></div>}
      <div><h3 className="font-semibold">Validation</h3>{validationErrors === 0 && validationWarnings === 0 ? <p className="mt-2 text-sm text-emerald-700">No validation errors or warnings.</p> : <div className="mt-2 space-y-2 text-sm">{(latestPlan.validation?.errors ?? []).map((error, index) => <p key={`error-${index}`} className="rounded bg-red-50 p-2 text-red-700">Error: {String(error)}</p>)}{(latestPlan.validation?.warnings ?? []).map((warning, index) => <p key={`warning-${index}`} className="rounded bg-amber-50 p-2 text-amber-800">Warning: {String(warning)}</p>)}</div>}</div>
      {(latestPlan.risks?.length ?? 0) > 0 && <div><h3 className="font-semibold">Risks</h3><div className="mt-2 space-y-2 text-sm">{latestPlan.risks?.map((risk, index) => <p key={`risk-${index}`} className="rounded bg-amber-50 p-2"><strong>{risk.severity} — {risk.field}:</strong> {risk.message}</p>)}</div></div>}
      {(latestPlan.questions?.length ?? 0) > 0 && <div><h3 className="font-semibold">Questions</h3><div className="mt-2 space-y-2 text-sm">{latestPlan.questions?.map((question, index) => <p key={`question-${index}`} className="rounded bg-slate-50 p-2"><strong>{question.blocking ? "Blocking: " : ""}{question.question}</strong><span className="block text-slate-600">{question.reason}</span></p>)}</div></div>}</div>
      <div className="mt-6 flex flex-wrap gap-3">{latestPlan.status === "DRAFT" && button("submit", "Submit for Approval", false, submit, "bg-indigo-600")}{latestPlan.status === "PENDING_APPROVAL" && <>{button("approve", "Approve Plan", validationErrors > 0, approve, "bg-emerald-700")}{button("reject", "Reject Plan", false, reject, "bg-amber-600")}</>}{(latestPlan.status === "REJECTED" || latestPlan.status === "SUPERSEDED") && button("analyze", "Generate New Plan", false, analyze)}</div></>}</section>

    <section className="rounded-xl bg-white p-6 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-4"><h2 className="text-xl font-semibold">2. Dry run and execution</h2>{button("dry-run", "Run Dry Run", !approvedPlan || latestDryRun?.status === "COMPLETED", dryRun)}</div><p className="mt-4 text-sm text-slate-600">Dry Run requires an approved plan and does not create target records.</p>{latestDryRun && <div className="mt-5 rounded-lg bg-slate-50 p-4"><p className="font-medium">Dry run: {latestDryRun.status}</p><div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{[["Source", latestDryRun.sourceCount], ["Transformed", latestDryRun.transformedCount], ["Accepted", latestDryRun.acceptedCount], ["Rejected", latestDryRun.rejectedCount]].map(([label, value]) => <div key={String(label)}><div className="text-xs text-slate-500">{label}</div><div className="font-semibold">{value}</div></div>)}</div></div>}{latestDryRun?.status === "COMPLETED" && button("execute", "Execute Migration", Boolean(latestMigration?.status === "COMPLETED"), execute, "bg-emerald-700")}</section>

    <section className="rounded-xl bg-white p-6 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-4"><h2 className="text-xl font-semibold">3. Reconciliation</h2>{button("reconcile", "Reconcile", !latestMigration || latestMigration.status !== "COMPLETED", reconcile, "bg-indigo-600")}</div><p className="mt-4 text-sm text-slate-600">Reconciliation requires a completed MIGRATION execution, not a DRY_RUN.</p>{latestMigration && <p className="mt-3 text-sm">Migration execution: <strong>{latestMigration.status}</strong> — migrated {latestMigration.migratedCount} record(s).</p>}{reconciliation && <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-6">{[["Status", reconciliation.status], ["Source", reconciliation.sourceCount], ["Target", reconciliation.targetCount], ["Matched", reconciliation.matchedCount], ["Missing", reconciliation.missingCount], ["Mismatched", reconciliation.mismatchCount]].map(([label, value]) => <div key={String(label)} className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">{label}</div><div className="font-semibold">{value}</div></div>)}</div>}</section>

    {latestMigration?.status === "COMPLETED" && <section className="rounded-xl border border-amber-200 bg-amber-50 p-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-xl font-semibold">4. Rollback</h2><p className="mt-2 text-sm text-amber-800">Rollback removes only records linked to this migration execution.</p></div>{button("rollback", "Rollback Migration", Boolean(rollback), doRollback, "bg-red-700")}</div>{rollback && <p className="mt-4 text-sm font-medium">{rollback.status}: deleted {rollback.targetRecordsDeleted}, already missing {rollback.alreadyMissing}, failed {rollback.failed}</p>}</section>}

    <p className="rounded-lg bg-slate-100 p-4 text-sm text-slate-700" role="status">{message}</p>
  </main>;
}
