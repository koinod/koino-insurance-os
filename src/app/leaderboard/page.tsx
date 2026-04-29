"use client";

import { DEMO_AGENTS } from "@/lib/mock-data";
import { AiInsightBanner, AiInsight } from "@/components/AiInsightBanner";
import { PageHeader } from "@/components/PageHeader";
import { formatCurrency } from "@/lib/format";

const INSIGHTS: AiInsight[] = [
  {
    type: "opportunity",
    headline: "Isaiah is pulling away — 37% ahead of #2",
    detail:
      "Mid-month gap this wide usually widens further. A team incentive ($500 prize for #2 closing the gap) could lift everyone's numbers.",
    action: "Create Incentive",
  },
  {
    type: "warning",
    headline: "Bottom 2 agents are below team average for 2nd consecutive month",
    detail:
      "Shea Scott and Nick Paolella showing structural issues, not random variance. Coaching or restructuring needed.",
    action: "View Coaching",
  },
  {
    type: "info",
    headline: "Team AP pace: $254K — on track for record month",
    detail:
      "If current velocity holds, you'll hit $300K by month end. Last month was $218K.",
    action: "See Analytics",
  },
];

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-400/10 text-emerald-400",
  silent: "bg-amber-400/10 text-amber-400",
  at_risk: "bg-red-400/10 text-red-400",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  silent: "Silent",
  at_risk: "At Risk",
};

export default function LeaderboardPage() {
  const sorted = [...DEMO_AGENTS].sort((a, b) => b.ap_30d - a.ap_30d);

  const rankBadge = (i: number) => {
    if (i === 0)
      return (
        <span className="text-base font-black text-accent">1</span>
      );
    return (
      <span className="text-sm font-bold text-ink-dim">{i + 1}</span>
    );
  };

  return (
    <div>
      <PageHeader title="Leaderboard" sub="Agent performance rankings — 30-day rolling" />

      <AiInsightBanner insights={INSIGHTS} />

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-ink-dim text-xs uppercase tracking-wider">
              <th className="text-center px-4 py-3 w-12">#</th>
              <th className="text-left px-4 py-3">Agent</th>
              <th className="text-right px-4 py-3">AP (30d)</th>
              <th className="text-right px-4 py-3">Deals</th>
              <th className="text-right px-4 py-3">Won</th>
              <th className="text-right px-4 py-3">Win %</th>
              <th className="text-right px-4 py-3">Calls</th>
              <th className="text-left px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((agent, i) => (
              <tr
                key={agent.id}
                className={`border-b border-line last:border-0 transition-colors ${
                  i === 0
                    ? "bg-accent/5 hover:bg-accent/10"
                    : "hover:bg-bg-hover"
                }`}
              >
                <td className="px-4 py-4 text-center">{rankBadge(i)}</td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                        i === 0 ? "bg-accent text-bg" : "bg-bg-hover text-ink-mute"
                      }`}
                    >
                      {agent.initials}
                    </div>
                    <div>
                      <div className="font-semibold text-ink">{agent.name}</div>
                      <div className="text-xs text-ink-dim capitalize">{agent.role}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className={`font-bold ${i === 0 ? "text-accent text-base" : "text-ink"}`}>
                    {formatCurrency(agent.ap_30d)}
                  </span>
                </td>
                <td className="px-4 py-4 text-right text-ink-mute">{agent.deals_30d}</td>
                <td className="px-4 py-4 text-right text-ink-mute">{agent.deals_won}</td>
                <td className="px-4 py-4 text-right font-semibold text-ink">
                  {Math.round(agent.win_rate * 100)}%
                </td>
                <td className="px-4 py-4 text-right text-ink-mute">{agent.calls_30d}</td>
                <td className="px-4 py-4">
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      STATUS_COLORS[agent.status] ?? ""
                    }`}
                  >
                    {STATUS_LABELS[agent.status] ?? agent.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
