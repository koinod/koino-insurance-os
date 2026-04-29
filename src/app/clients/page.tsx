"use client";

import { DEMO_CLIENTS } from "@/lib/mock-data";
import { AiInsightBanner, AiInsight } from "@/components/AiInsightBanner";
import { PageHeader } from "@/components/PageHeader";
import { formatDate, stageColor, stageLabel } from "@/lib/format";

const INSIGHTS: AiInsight[] = [
  {
    type: "warning",
    headline: "6 clients with AI score 70+ haven't been contacted in 3+ days",
    detail:
      "That's $28K in AP sitting idle. High-score leads go cold fast — prioritize these today.",
    action: "Sort by Score",
  },
  {
    type: "opportunity",
    headline: "Referral clients convert at 3.1x vs web form leads",
    detail:
      "14 referral clients in pipeline. Make sure each has an active follow-up this week.",
    action: "Filter Referrals",
  },
  {
    type: "info",
    headline: "5 clients in Underwriting stage — avg 8 days",
    detail:
      "Industry benchmark is 7 days. Run a quick status check with carriers.",
    action: "View Underwriting",
  },
];

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80
      ? "bg-emerald-400/15 text-emerald-400"
      : score >= 60
      ? "bg-amber-400/15 text-amber-400"
      : "bg-red-400/15 text-red-400";
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${color}`}>
      {score}
    </span>
  );
}

export default function ClientsPage() {
  return (
    <div>
      <PageHeader title="Clients" sub="All clients across the agency pipeline" />

      <AiInsightBanner insights={INSIGHTS} />

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-ink-dim text-xs uppercase tracking-wider">
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Phone</th>
              <th className="text-left px-4 py-3">Stage</th>
              <th className="text-left px-4 py-3">Source</th>
              <th className="text-right px-4 py-3">AI Score</th>
              <th className="text-right px-4 py-3">AP</th>
              <th className="text-left px-4 py-3">Agent</th>
              <th className="text-left px-4 py-3">Received</th>
            </tr>
          </thead>
          <tbody>
            {DEMO_CLIENTS.sort((a, b) => b.ai_score - a.ai_score).map((client) => (
              <tr
                key={client.id}
                className="border-b border-line last:border-0 hover:bg-bg-hover transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-ink">{client.name}</div>
                  <div className="text-xs text-ink-dim">{client.email}</div>
                </td>
                <td className="px-4 py-3 text-ink-mute text-xs">{client.phone}</td>
                <td className="px-4 py-3">
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full ${stageColor(client.stage)}`}
                  >
                    {stageLabel(client.stage)}
                  </span>
                </td>
                <td className="px-4 py-3 text-ink-mute text-xs">{client.source}</td>
                <td className="px-4 py-3 text-right">
                  <ScoreBadge score={client.ai_score} />
                </td>
                <td className="px-4 py-3 text-right font-semibold text-accent text-xs">
                  ${client.ap.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-ink-mute text-xs">{client.agent}</td>
                <td className="px-4 py-3 text-ink-mute text-xs">
                  {formatDate(client.received)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
