import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { serverSupabase } from "@/lib/supabase";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import Link from "next/link";

const TIME_FILTERS = [
  { key: "week", label: "Week", days: 7 },
  { key: "month", label: "Month", days: 30 },
  { key: "quarter", label: "Quarter", days: 90 },
  { key: "ytd", label: "YTD", days: -1 },
] as const;

const VIEWS = [
  { key: "self", label: "Individual" },
  { key: "downline", label: "My Downline" },
  { key: "team", label: "Total Team" },
] as const;

interface FunnelRow {
  stage: string;
  count: number;
  total_ap: number;
}

async function loadAnalytics(filter: string) {
  const since =
    filter === "ytd"
      ? new Date(new Date().getFullYear(), 0, 1)
      : new Date(Date.now() - (TIME_FILTERS.find((f) => f.key === filter)?.days ?? 30) * 24 * 60 * 60 * 1000);

  try {
    const supa = await serverSupabase();
    const [{ count: clientCount }, { count: dealCount }, { data: deals }, { data: funnel }, { data: newClients }] = await Promise.all([
      supa.from("clients").select("*", { count: "exact", head: true }),
      supa.from("deals").select("*", { count: "exact", head: true }),
      supa
        .from("deals")
        .select("annual_premium, expected_commission, deposits, outstanding, status, submitted_at, issued_at")
        .gte("submitted_at", since.toISOString()),
      supa.from("v_pipeline_funnel").select("*"),
      supa
        .from("clients")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since.toISOString()),
    ]);
    const totalAP = (deals ?? []).reduce((s, d) => s + (Number(d.annual_premium) || 0), 0);
    const totalCommission = (deals ?? []).reduce((s, d) => s + (Number(d.expected_commission) || 0), 0);
    const deposits = (deals ?? []).reduce((s, d) => s + (Number(d.deposits) || 0), 0);
    const outstanding = (deals ?? []).reduce((s, d) => s + (Number(d.outstanding) || 0), 0);
    const issuedDeals = (deals ?? []).filter((d) => d.status === "issued" || d.status === "approved");
    const issueRate = deals && deals.length > 0 ? issuedDeals.length / deals.length : 0;
    const avgDaysToClose = (() => {
      const closed = issuedDeals.filter((d) => d.submitted_at && d.issued_at);
      if (closed.length === 0) return 0;
      const total = closed.reduce((s, d) => {
        const sub = new Date(d.submitted_at!).getTime();
        const iss = new Date(d.issued_at!).getTime();
        return s + (iss - sub) / (1000 * 60 * 60 * 24);
      }, 0);
      return total / closed.length;
    })();
    return {
      clientCount: clientCount ?? 0,
      dealCount: dealCount ?? 0,
      issuedPaid: issuedDeals.length,
      issueRate,
      totalAP,
      totalCommission,
      deposits,
      outstanding,
      avgDaysToClose,
      newClientsThisPeriod: newClients?.length ?? 0,
      funnel: (funnel ?? []) as FunnelRow[],
      ready: true,
    };
  } catch {
    return {
      clientCount: 0,
      dealCount: 0,
      issuedPaid: 0,
      issueRate: 0,
      totalAP: 0,
      totalCommission: 0,
      deposits: 0,
      outstanding: 0,
      avgDaysToClose: 0,
      newClientsThisPeriod: 0,
      funnel: [] as FunnelRow[],
      ready: false,
    };
  }
}

const STAGE_LABELS: Record<string, string> = {
  new: "Application Submitted",
  underwriting: "Underwriting",
  approved: "Approved",
  policy_delivered: "Policy Delivered",
  lapsed: "Lapsed",
};

const STAGE_COLORS: Record<string, string> = {
  new: "bg-stage-new",
  underwriting: "bg-stage-underwriting",
  approved: "bg-stage-approved",
  policy_delivered: "bg-stage-delivered",
  lapsed: "bg-stage-lapsed",
};

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; view?: string }>;
}) {
  const params = await searchParams;
  const filter = params.filter ?? "month";
  const view = params.view ?? "team";
  const a = await loadAnalytics(filter);

  const maxFunnel = Math.max(1, ...a.funnel.map((f) => f.count));

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="Key metrics, pipeline funnel, time-window comparisons."
      />

      {/* View + time tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        <div className="flex gap-1 p-1 bg-bg-card rounded-lg border border-line">
          {VIEWS.map((v) => (
            <Link
              key={v.key}
              href={`/analytics?filter=${filter}&view=${v.key}`}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                view === v.key ? "bg-accent text-bg" : "text-ink-mute hover:text-ink"
              }`}
            >
              {v.label}
            </Link>
          ))}
        </div>
        <div className="flex gap-1 p-1 bg-bg-card rounded-lg border border-line">
          {TIME_FILTERS.map((f) => (
            <Link
              key={f.key}
              href={`/analytics?filter=${f.key}&view=${view}`}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                filter === f.key ? "bg-accent text-bg" : "text-ink-mute hover:text-ink"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>
      </div>

      {!a.ready && (
        <div className="card p-5 mb-6 border-accent/40 bg-accent/5 text-sm">
          <strong>Setup required:</strong> add Supabase env vars + run the migration.
        </div>
      )}

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Clients" value={formatNumber(a.clientCount)} />
        <StatCard label="Total Deals" value={formatNumber(a.dealCount)} />
        <StatCard label="Issued / Paid" value={formatNumber(a.issuedPaid)} />
        <StatCard label="Issue Rate" value={formatPercent(a.issueRate)} highlight />

        <StatCard label="Total AP" value={formatCurrency(a.totalAP, { abbreviate: true })} highlight />
        <StatCard label="Expected Commission" value={formatCurrency(a.totalCommission, { abbreviate: true })} />
        <StatCard label="Deposits" value={formatCurrency(a.deposits, { abbreviate: true })} />
        <StatCard label="Outstanding" value={formatCurrency(a.outstanding, { abbreviate: true })} />

        <StatCard
          label="Avg Days to Close"
          value={a.avgDaysToClose > 0 ? `${a.avgDaysToClose.toFixed(1)}d` : "—"}
        />
        <StatCard
          label="New Clients (period)"
          value={formatNumber(a.newClientsThisPeriod)}
        />
      </div>

      {/* Pipeline Funnel — pure CSS bars (no recharts dependency to keep build slim) */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">Pipeline Funnel</h3>
          <div className="text-xs text-ink-mute">All-time client distribution</div>
        </div>
        {a.funnel.length === 0 ? (
          <div className="text-ink-dim text-sm py-8 text-center">No pipeline data yet.</div>
        ) : (
          <div className="space-y-3">
            {a.funnel.map((f) => {
              const pct = (f.count / maxFunnel) * 100;
              return (
                <div key={f.stage}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-ink-mute">{STAGE_LABELS[f.stage] ?? f.stage}</span>
                    <span className="text-ink-mute tabular-nums">
                      {f.count} · {formatCurrency(f.total_ap, { abbreviate: true })} AP
                    </span>
                  </div>
                  <div className="bg-bg-elev rounded-md overflow-hidden h-7">
                    <div
                      className={`h-full ${STAGE_COLORS[f.stage] ?? "bg-stage-new"} flex items-center px-3`}
                      style={{ width: `${Math.max(pct, 5)}%` }}
                    >
                      <span className="text-xs font-bold text-bg tabular-nums">{f.count}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
