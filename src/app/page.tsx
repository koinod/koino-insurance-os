import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { serverSupabase } from "@/lib/supabase";
import { formatCurrency, formatNumber } from "@/lib/format";
import Link from "next/link";

async function loadDashboardData() {
  try {
    const supa = await serverSupabase();
    const [{ count: clientCount }, { count: dealCount }, { data: deals }] = await Promise.all([
      supa.from("clients").select("*", { count: "exact", head: true }),
      supa.from("deals").select("*", { count: "exact", head: true }),
      supa
        .from("deals")
        .select("annual_premium, expected_commission, deposits, status, submitted_at")
        .gte("submitted_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    ]);
    const totalAP = (deals ?? []).reduce((s, d) => s + (Number(d.annual_premium) || 0), 0);
    const totalComm = (deals ?? []).reduce((s, d) => s + (Number(d.expected_commission) || 0), 0);
    const issued = (deals ?? []).filter((d) => d.status === "issued" || d.status === "approved").length;
    const issueRate = deals && deals.length > 0 ? issued / deals.length : 0;
    return {
      clientCount: clientCount ?? 0,
      dealCount: dealCount ?? 0,
      totalAP,
      totalComm,
      issueRate,
      ready: true,
    };
  } catch {
    return { clientCount: 0, dealCount: 0, totalAP: 0, totalComm: 0, issueRate: 0, ready: false };
  }
}

export default async function HomePage() {
  const d = await loadDashboardData();
  return (
    <>
      <PageHeader
        title="KOINO Agency"
        subtitle="The insurance team OS — built by an operator, for operators."
        actions={
          <Link href="/clients" className="btn-primary">
            + New Client
          </Link>
        }
      />

      {!d.ready && (
        <div className="card p-5 mb-6 border-accent/40 bg-accent/5">
          <div className="text-sm text-ink">
            <strong>Setup required.</strong> Add Supabase env vars to <code>.env.local</code>{" "}
            and run the migration in <code>supabase/migrations/0001_init.sql</code>. Until then,
            the dashboard shows zeros.
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Clients" value={formatNumber(d.clientCount)} sub="all time" />
        <StatCard label="Total Deals" value={formatNumber(d.dealCount)} sub="all time" />
        <StatCard
          label="Total AP (30d)"
          value={formatCurrency(d.totalAP, { abbreviate: true })}
          sub="annual premium written"
          highlight
        />
        <StatCard
          label="Expected Commission (30d)"
          value={formatCurrency(d.totalComm, { abbreviate: true })}
          sub="forecasted"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link href="/pipeline" className="card p-6 hover:border-accent/40 transition-colors">
          <div className="text-xs uppercase tracking-wider text-ink-mute mb-1">Quick action</div>
          <div className="text-lg font-bold mb-1">Move deals through pipeline →</div>
          <div className="text-sm text-ink-mute">
            Drag-drop kanban: New → Underwriting → Approved.
          </div>
        </Link>
        <Link href="/leaderboard" className="card p-6 hover:border-accent/40 transition-colors">
          <div className="text-xs uppercase tracking-wider text-ink-mute mb-1">Quick action</div>
          <div className="text-lg font-bold mb-1">See agent rankings →</div>
          <div className="text-sm text-ink-mute">
            Top producers by AP, deals, and activity score.
          </div>
        </Link>
      </div>
    </>
  );
}
