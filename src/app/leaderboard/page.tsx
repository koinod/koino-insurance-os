import { PageHeader } from "@/components/PageHeader";
import { serverSupabase } from "@/lib/supabase";
import { formatCurrency, formatNumber } from "@/lib/format";
import Link from "next/link";

const TABS = [
  { key: "deals", label: "Deal Rankings" },
  { key: "activity", label: "Activity Rankings" },
] as const;

interface DealRanking {
  agent_id: string;
  full_name: string;
  deals_won: number;
  deals_total: number;
  total_ap: number;
  total_commission: number;
}

interface ActivityRanking {
  agent_id: string;
  full_name: string;
  call_count: number;
  followup_count: number;
  ai_runs: number;
  total_score: number;
}

async function loadDealRankings(): Promise<DealRanking[]> {
  try {
    const supa = await serverSupabase();
    const { data } = await supa.from("v_leaderboard").select("*");
    return (data ?? []) as DealRanking[];
  } catch {
    return [];
  }
}

async function loadActivityRankings(): Promise<ActivityRanking[]> {
  try {
    const supa = await serverSupabase();
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: agents } = await supa.from("agents").select("id, full_name").eq("status", "active");
    const { data: activities } = await supa
      .from("activities")
      .select("agent_id, kind")
      .gte("created_at", since);
    const byAgent: Record<string, ActivityRanking> = {};
    (agents ?? []).forEach((a: any) => {
      byAgent[a.id] = {
        agent_id: a.id,
        full_name: a.full_name,
        call_count: 0,
        followup_count: 0,
        ai_runs: 0,
        total_score: 0,
      };
    });
    (activities ?? []).forEach((act: any) => {
      const r = act.agent_id ? byAgent[act.agent_id] : null;
      if (!r) return;
      if (act.kind === "call") r.call_count += 1;
      if (act.kind === "stage_change" || act.kind === "note") r.followup_count += 1;
      if (act.kind?.startsWith("ai_")) r.ai_runs += 1;
      r.total_score += act.kind === "call" ? 3 : act.kind?.startsWith("ai_") ? 1 : 2;
    });
    return Object.values(byAgent).sort((a, b) => b.total_score - a.total_score);
  } catch {
    return [];
  }
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  const view = params.view === "activity" ? "activity" : "deals";

  const dealRows = view === "deals" ? await loadDealRankings() : [];
  const activityRows = view === "activity" ? await loadActivityRankings() : [];

  return (
    <>
      <PageHeader
        title="Leaderboard"
        subtitle="Agent rankings — last 30 days for activity; all-time for deals."
      />

      <div className="flex gap-1 mb-5 border-b border-line">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/leaderboard?view=${t.key}`}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              view === t.key
                ? "border-accent text-accent"
                : "border-transparent text-ink-mute hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {view === "deals" && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg-elev border-b border-line text-ink-mute text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3 font-semibold w-10">#</th>
                <th className="text-left px-4 py-3 font-semibold">Agent</th>
                <th className="text-right px-4 py-3 font-semibold">Total AP</th>
                <th className="text-right px-4 py-3 font-semibold">Total Deals</th>
                <th className="text-right px-4 py-3 font-semibold">Won</th>
                <th className="text-right px-4 py-3 font-semibold">Win %</th>
                <th className="text-right px-4 py-3 font-semibold">Est. Commission</th>
              </tr>
            </thead>
            <tbody>
              {dealRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-ink-dim">
                    No deals data yet. Add agents and deals to see the rankings.
                  </td>
                </tr>
              )}
              {dealRows.map((r, i) => {
                const winRate = r.deals_total > 0 ? r.deals_won / r.deals_total : 0;
                return (
                  <tr key={r.agent_id} className="border-b border-line/50 hover:bg-bg-hover/30">
                    <td className="px-4 py-3 font-bold text-accent tabular-nums">
                      {i + 1}
                    </td>
                    <td className="px-4 py-3 font-semibold">{r.full_name}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-accent font-bold">
                      {formatCurrency(r.total_ap, { abbreviate: true })}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.deals_total}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-stage-approved">
                      {r.deals_won}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-mute">
                      {Math.round(winRate * 100)}%
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-mute">
                      {formatCurrency(r.total_commission, { abbreviate: true })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {view === "activity" && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg-elev border-b border-line text-ink-mute text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3 font-semibold w-10">#</th>
                <th className="text-left px-4 py-3 font-semibold">Agent</th>
                <th className="text-right px-4 py-3 font-semibold">Calls</th>
                <th className="text-right px-4 py-3 font-semibold">Notes / Updates</th>
                <th className="text-right px-4 py-3 font-semibold">AI Runs</th>
                <th className="text-right px-4 py-3 font-semibold">Score</th>
              </tr>
            </thead>
            <tbody>
              {activityRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-ink-dim">
                    No activity in the last 30 days yet.
                  </td>
                </tr>
              )}
              {activityRows.map((r, i) => (
                <tr key={r.agent_id} className="border-b border-line/50 hover:bg-bg-hover/30">
                  <td className="px-4 py-3 font-bold text-accent tabular-nums">{i + 1}</td>
                  <td className="px-4 py-3 font-semibold">{r.full_name}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.call_count}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.followup_count}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-accent">
                    {r.ai_runs}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink font-bold">
                    {formatNumber(r.total_score)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
