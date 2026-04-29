import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { serverSupabase } from "@/lib/supabase";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import Link from "next/link";

const TIME_FILTERS = [
  { key: "day", label: "Day", days: 1 },
  { key: "week", label: "Week", days: 7 },
  { key: "month", label: "Month", days: 30 },
  { key: "ytd", label: "YTD", days: -1 },
  { key: "all", label: "All Time", days: 0 },
] as const;

interface DealRow {
  id: string;
  agent_name: string | null;
  client_name: string;
  source: string | null;
  carrier_name: string | null;
  product_name: string | null;
  annual_premium: number | null;
  expected_commission: number | null;
  status: string;
  policy_number: string | null;
  submitted_at: string | null;
  draft_date: string | null;
  deposits: number | null;
  outstanding: number | null;
}

function fromDate(filter: string): string | null {
  if (filter === "all") return null;
  if (filter === "ytd") return new Date(new Date().getFullYear(), 0, 1).toISOString();
  const days = TIME_FILTERS.find((f) => f.key === filter)?.days ?? 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function loadDeals(filter: string): Promise<DealRow[]> {
  try {
    const supa = await serverSupabase();
    let q = supa
      .from("deals")
      .select(`id, annual_premium, expected_commission, deposits, outstanding,
               status, policy_number, submitted_at, draft_date,
               clients ( full_name, source ),
               agents ( full_name ),
               carriers ( name ),
               products ( name )`)
      .order("submitted_at", { ascending: false })
      .limit(500);
    const since = fromDate(filter);
    if (since) q = q.gte("submitted_at", since);
    const { data } = await q;
    return (data ?? []).map((d: any) => ({
      id: d.id,
      agent_name: d.agents?.full_name ?? null,
      client_name: d.clients?.full_name ?? "—",
      source: d.clients?.source ?? null,
      carrier_name: d.carriers?.name ?? null,
      product_name: d.products?.name ?? null,
      annual_premium: d.annual_premium,
      expected_commission: d.expected_commission,
      status: d.status,
      policy_number: d.policy_number,
      submitted_at: d.submitted_at,
      draft_date: d.draft_date,
      deposits: d.deposits,
      outstanding: d.outstanding,
    }));
  } catch {
    return [];
  }
}

function statusPill(status: string) {
  const map: Record<string, string> = {
    submitted: "stage-new",
    underwriting: "stage-underwriting",
    approved: "stage-approved",
    issued: "stage-delivered",
    declined: "stage-lapsed",
    withdrawn: "stage-lapsed",
  };
  return map[status] ?? "stage-new";
}

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const params = await searchParams;
  const filter = params.filter ?? "month";
  const deals = await loadDeals(filter);

  const summary = deals.reduce(
    (acc, d) => {
      acc.activeDeals += d.status !== "declined" && d.status !== "withdrawn" ? 1 : 0;
      acc.issuedPaid += d.status === "issued" ? 1 : 0;
      acc.totalAP += d.annual_premium ?? 0;
      acc.totalCommission += d.expected_commission ?? 0;
      acc.deposits += d.deposits ?? 0;
      acc.outstanding += d.outstanding ?? 0;
      return acc;
    },
    { activeDeals: 0, issuedPaid: 0, totalAP: 0, totalCommission: 0, deposits: 0, outstanding: 0 },
  );

  return (
    <>
      <PageHeader
        title="Deals"
        subtitle={`${deals.length} deals · ${TIME_FILTERS.find((f) => f.key === filter)?.label}`}
        actions={
          <button type="button" className="btn-primary">+ New Deal</button>
        }
      />

      {/* Time filter tabs */}
      <div className="flex gap-1 mb-5">
        {TIME_FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/deals?filter=${f.key}`}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              filter === f.key
                ? "bg-accent text-bg"
                : "bg-bg-card text-ink-mute hover:text-ink"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label="Active Deals" value={formatNumber(summary.activeDeals)} />
        <StatCard label="Issued / Paid" value={formatNumber(summary.issuedPaid)} />
        <StatCard
          label="Total AP"
          value={formatCurrency(summary.totalAP, { abbreviate: true })}
          highlight
        />
        <StatCard
          label="Expected Commission"
          value={formatCurrency(summary.totalCommission, { abbreviate: true })}
        />
        <StatCard label="Deposits" value={formatCurrency(summary.deposits, { abbreviate: true })} />
        <StatCard
          label="Outstanding"
          value={formatCurrency(summary.outstanding, { abbreviate: true })}
        />
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg-elev border-b border-line text-ink-mute text-[11px] uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Agent</th>
              <th className="text-left px-4 py-3 font-semibold">Client</th>
              <th className="text-left px-4 py-3 font-semibold">Source</th>
              <th className="text-left px-4 py-3 font-semibold">Carrier</th>
              <th className="text-left px-4 py-3 font-semibold">Product</th>
              <th className="text-right px-4 py-3 font-semibold">AP</th>
              <th className="text-right px-4 py-3 font-semibold">Est. Comm.</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
              <th className="text-left px-4 py-3 font-semibold">Policy #</th>
              <th className="text-left px-4 py-3 font-semibold">Submitted</th>
              <th className="text-left px-4 py-3 font-semibold">Draft</th>
            </tr>
          </thead>
          <tbody>
            {deals.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-12 text-center text-ink-dim">
                  No deals in this time range. Adjust the filter or add your first deal.
                </td>
              </tr>
            )}
            {deals.map((d) => (
              <tr key={d.id} className="border-b border-line/50 hover:bg-bg-hover/30 transition-colors">
                <td className="px-4 py-3 text-ink-mute text-xs">{d.agent_name ?? "—"}</td>
                <td className="px-4 py-3 font-semibold">{d.client_name}</td>
                <td className="px-4 py-3 text-ink-mute text-xs">{d.source ?? "—"}</td>
                <td className="px-4 py-3 text-ink-mute text-xs">{d.carrier_name ?? "—"}</td>
                <td className="px-4 py-3 text-ink-mute text-xs">{d.product_name ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold text-accent">
                  {formatCurrency(d.annual_premium)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-ink-mute text-xs">
                  {formatCurrency(d.expected_commission)}
                </td>
                <td className="px-4 py-3">
                  <span className={statusPill(d.status)}>{d.status}</span>
                </td>
                <td className="px-4 py-3 text-ink-mute font-mono text-[11px]">
                  {d.policy_number ?? "—"}
                </td>
                <td className="px-4 py-3 text-ink-mute text-xs">{formatDate(d.submitted_at)}</td>
                <td className="px-4 py-3 text-ink-mute text-xs">{formatDate(d.draft_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
