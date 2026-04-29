"use client";

import { useState } from "react";
import { DEMO_DEALS } from "@/lib/mock-data";
import { AiInsightBanner, AiInsight } from "@/components/AiInsightBanner";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { formatCurrency } from "@/lib/format";

const INSIGHTS: AiInsight[] = [
  {
    type: "warning",
    headline: "3 deals in Underwriting 7+ days",
    detail:
      "Carriers typically need 5-7 days. These are overdue — call for status. A missing document is the most common cause.",
    action: "See Underwriting",
  },
  {
    type: "opportunity",
    headline: "Shea Scott has $48K in Underwriting — no recent contact",
    detail:
      "High risk of lapse. Consider assigning a check-in or having the agent call today.",
    action: "Assign Follow-up",
  },
  {
    type: "info",
    headline: "Isaiah Auman's deals close in avg 4.2 days",
    detail:
      "Fastest on the team. Consider having him document his carrier follow-up process.",
    action: "View Isaiah",
  },
];

const STATUS_FILTERS = ["All Time", "Day", "Week", "Month", "YTD"] as const;

const STATUS_COLORS: Record<string, string> = {
  Issued: "bg-emerald-400/10 text-emerald-400",
  Approved: "bg-blue-400/10 text-blue-400",
  Underwriting: "bg-purple-400/10 text-purple-400",
  Pending: "bg-amber-400/10 text-amber-400",
  Submitted: "bg-sky-400/10 text-sky-400",
  Declined: "bg-red-400/10 text-red-400",
};

export default function DealsPage() {
  const [activeFilter, setActiveFilter] = useState<string>("All Time");

  const deals = DEMO_DEALS;

  const totalAP = deals.reduce((s, d) => s + d.ap, 0);
  const totalCommission = deals.reduce((s, d) => s + d.commission, 0);
  const totalDeposits = deals.reduce((s, d) => s + d.deposits, 0);
  const issuedCount = deals.filter((d) => d.status === "Issued").length;

  return (
    <div>
      <PageHeader title="Deals" sub="All active and closed deals across the agency" />

      <AiInsightBanner insights={INSIGHTS} />

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Total AP" value={formatCurrency(totalAP)} highlight />
        <StatCard label="Total Commission" value={formatCurrency(totalCommission)} />
        <StatCard label="Deposits Collected" value={formatCurrency(totalDeposits)} />
        <StatCard label="Issued" value={String(issuedCount)} sub="policies issued" />
      </div>

      <div className="flex items-center gap-1 mb-4">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setActiveFilter(f)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeFilter === f
                ? "bg-accent text-bg"
                : "bg-bg-card text-ink-mute hover:text-ink border border-line"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-ink-dim text-xs uppercase tracking-wider">
              <th className="text-left px-4 py-3">Client</th>
              <th className="text-left px-4 py-3">Agent</th>
              <th className="text-left px-4 py-3">Carrier</th>
              <th className="text-left px-4 py-3">Product</th>
              <th className="text-right px-4 py-3">AP</th>
              <th className="text-right px-4 py-3">Commission</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">AI Close %</th>
              <th className="text-left px-4 py-3 max-w-xs">Next Action</th>
            </tr>
          </thead>
          <tbody>
            {deals.map((deal) => (
              <tr
                key={deal.id}
                className="border-b border-line last:border-0 hover:bg-bg-hover transition-colors"
              >
                <td className="px-4 py-3 font-medium text-ink">{deal.client}</td>
                <td className="px-4 py-3 text-ink-mute">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-bg-hover text-ink-dim text-[10px] font-bold flex items-center justify-center">
                      {deal.agent_initials}
                    </span>
                    {deal.agent.split(" ")[0]}
                  </div>
                </td>
                <td className="px-4 py-3 text-ink-mute">{deal.carrier}</td>
                <td className="px-4 py-3 text-ink-mute">{deal.product}</td>
                <td className="px-4 py-3 text-right font-semibold text-accent">
                  {formatCurrency(deal.ap)}
                </td>
                <td className="px-4 py-3 text-right text-ink-mute">
                  {formatCurrency(deal.commission)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      STATUS_COLORS[deal.status] ?? "bg-bg-hover text-ink-mute"
                    }`}
                  >
                    {deal.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span
                    className={`text-xs font-bold ${
                      deal.ai_close_prob >= 80
                        ? "text-emerald-400"
                        : deal.ai_close_prob >= 60
                        ? "text-amber-400"
                        : "text-red-400"
                    }`}
                  >
                    {deal.ai_close_prob}%
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-ink-mute max-w-xs leading-relaxed">
                  {deal.ai_next_action}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
