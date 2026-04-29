"use client";

import { useRole } from "@/lib/role-context";
import { DEMO_AGENTS, DEMO_CLIENTS, DEMO_DEALS } from "@/lib/mock-data";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { AiInsightBanner, AiInsight } from "@/components/AiInsightBanner";
import { formatCurrency } from "@/lib/format";

const OWNER_INSIGHTS: AiInsight[] = [
  {
    type: "warning",
    headline: "Shea Scott is silent — 48 hours, no activity",
    detail:
      "2 deals in Underwriting at risk of going cold. Draft a coaching message or call directly.",
    action: "Coach Shea",
  },
  {
    type: "warning",
    headline: "Kenji Yamamoto deal stuck in Pending — 3 days",
    detail:
      "AI close probability dropped from 82% → 54%. Carrier may need a nudge.",
    action: "View Deal",
  },
  {
    type: "opportunity",
    headline: "Referral leads closing at 3.2x your aged leads",
    detail:
      "Isaiah and Evan's referral pipeline is outperforming by 220%. Consider shifting budget.",
    action: "See Analytics",
  },
  {
    type: "warning",
    headline: "Nick Paolella conversion rate is 31% vs team avg 58%",
    detail:
      "2nd month of underperformance. Needs structured coaching or territory reassignment.",
    action: "Coach Nick",
  },
  {
    type: "info",
    headline: "Isaiah Auman on pace for $110K AP this month",
    detail:
      "Top of team by 37%. No action needed — recognition opportunity.",
    action: "View Stats",
  },
];

function statusPill(status: string) {
  const map: Record<string, string> = {
    active: "bg-emerald-400/10 text-emerald-400",
    silent: "bg-amber-400/10 text-amber-400",
    at_risk: "bg-red-400/10 text-red-400",
  };
  const labels: Record<string, string> = {
    active: "Active",
    silent: "Silent",
    at_risk: "At Risk",
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${map[status] ?? ""}`}>
      {labels[status] ?? status}
    </span>
  );
}

function OwnerDashboard() {
  const totalAP = DEMO_AGENTS.reduce((s, a) => s + a.ap_30d, 0);
  const totalCommission = Math.round(totalAP * 0.125);
  const issuedDeals = DEMO_DEALS.filter((d) => d.status === "Issued").length;

  return (
    <div>
      <PageHeader title="Agency Overview" sub="Owner view — all agents, all deals" />

      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-dim mb-3">
          5 Things That Need Your Attention
        </h2>
        <AiInsightBanner insights={OWNER_INSIGHTS} />
      </section>

      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-dim mb-3">
          Team This Month
        </h2>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-ink-dim text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-3">Agent</th>
                <th className="text-right px-4 py-3">AP</th>
                <th className="text-right px-4 py-3">Deals</th>
                <th className="text-right px-4 py-3">Win %</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Last Active</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_AGENTS.sort((a, b) => b.ap_30d - a.ap_30d).map((agent, i) => (
                <tr
                  key={agent.id}
                  className="border-b border-line last:border-0 hover:bg-bg-hover transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-ink">{agent.name}</td>
                  <td className="px-4 py-3 text-right font-semibold text-accent">
                    {formatCurrency(agent.ap_30d)}
                  </td>
                  <td className="px-4 py-3 text-right text-ink-mute">{agent.deals_30d}</td>
                  <td className="px-4 py-3 text-right text-ink-mute">
                    {Math.round(agent.win_rate * 100)}%
                  </td>
                  <td className="px-4 py-3">{statusPill(agent.status)}</td>
                  <td className="px-4 py-3 text-ink-mute text-xs">{agent.last_active}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-dim mb-3">
          Revenue Snapshot
        </h2>
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Total AP (30d)" value={formatCurrency(totalAP)} highlight />
          <StatCard
            label="Expected Commission"
            value={formatCurrency(totalCommission)}
            sub="est. based on blended rate"
          />
          <StatCard
            label="Issued This Month"
            value={String(issuedDeals)}
            sub="policies delivered"
          />
        </div>
      </section>
    </div>
  );
}

function ManagerDashboard() {
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const coachingAgents = DEMO_AGENTS.filter((a) => a.coaching_note);

  const VELOCITY = [
    { name: "Isaiah Auman", deals: 12, ap: 92400, avgDays: 4.2 },
    { name: "Evan Scott", deals: 9, ap: 67200, avgDays: 6.8 },
    { name: "Shea Scott", deals: 7, ap: 48000, avgDays: 11.3 },
    { name: "Jason Rittman", deals: 5, ap: 34800, avgDays: 5.9 },
    { name: "Nick Paolella", deals: 2, ap: 12000, avgDays: 14.1 },
  ];

  const COACHING_MESSAGES: Record<string, string> = {
    a3: "Hey Shea — noticed you haven't logged activity in a couple days. Wanted to check in. Your Underwriting deals are still live — a quick status call to the carrier could keep them moving. Let me know if you need anything from my end.",
    a5: "Hey Nick — I pulled your numbers for this week. Your contact rate is solid but close rate is running low. I want to do a 30-min call review with you — pick any time on my calendar. I think there are 2-3 objection patterns we can tighten up fast.",
  };

  return (
    <div>
      <PageHeader title="Team Dashboard" sub="Manager view — your agents and pipeline" />

      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-dim mb-3">
          Your Team Today
        </h2>
        <div className="grid grid-cols-1 gap-3">
          {DEMO_AGENTS.map((agent) => {
            const dotColor =
              agent.status === "active"
                ? "bg-emerald-400"
                : agent.status === "silent"
                ? "bg-amber-400"
                : "bg-red-400";
            return (
              <div key={agent.id} className="card px-5 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
                    <div>
                      <div className="font-semibold text-ink text-sm">{agent.name}</div>
                      <div className="text-xs text-ink-dim">{agent.last_active}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="text-xs text-ink-dim">AP</div>
                      <div className="text-sm font-semibold text-accent">
                        {formatCurrency(agent.ap_30d)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-ink-dim">Deals</div>
                      <div className="text-sm font-semibold text-ink">{agent.deals_30d}</div>
                    </div>
                    {agent.coaching_note && (
                      <button
                        onClick={() =>
                          setExpanded(expanded === agent.id ? null : agent.id)
                        }
                        className="text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors"
                      >
                        Coach →
                      </button>
                    )}
                  </div>
                </div>
                {expanded === agent.id && agent.coaching_note && (
                  <div className="mt-3 pt-3 border-t border-line">
                    <p className="text-xs text-amber-400/80 italic">{agent.coaching_note}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-dim mb-3">
          Coaching Alerts
        </h2>
        <div className="grid grid-cols-1 gap-4">
          {coachingAgents.map((agent) => (
            <div key={agent.id} className="card px-5 py-4 border-l-4 border-l-amber-400">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-semibold text-ink text-sm">{agent.name}</div>
                  <div className="text-xs text-amber-400 mt-0.5">{agent.coaching_note}</div>
                </div>
                <span className="text-[10px] uppercase tracking-wider bg-amber-400/10 text-amber-400 px-2 py-0.5 rounded-full font-semibold">
                  Coaching Alert
                </span>
              </div>
              <div className="bg-bg rounded-lg p-3 border border-line mb-3">
                <div className="text-[10px] uppercase tracking-wider text-ink-dim mb-1">
                  AI-Drafted Message
                </div>
                <p className="text-sm text-ink-mute italic leading-relaxed">
                  &ldquo;{COACHING_MESSAGES[agent.id]}&rdquo;
                </p>
              </div>
              <button className="btn-primary text-xs py-1.5 px-4">
                Send to {agent.name.split(" ")[0]}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-dim mb-3">
          Deal Velocity
        </h2>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-ink-dim text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-3">Agent</th>
                <th className="text-right px-4 py-3">Deals (30d)</th>
                <th className="text-right px-4 py-3">AP</th>
                <th className="text-right px-4 py-3">Avg Days to Close</th>
              </tr>
            </thead>
            <tbody>
              {VELOCITY.map((row) => (
                <tr
                  key={row.name}
                  className="border-b border-line last:border-0 hover:bg-bg-hover transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-ink">{row.name}</td>
                  <td className="px-4 py-3 text-right text-ink-mute">{row.deals}</td>
                  <td className="px-4 py-3 text-right font-semibold text-accent">
                    {formatCurrency(row.ap)}
                  </td>
                  <td className="px-4 py-3 text-right text-ink-mute">{row.avgDays}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function RepDashboard() {
  const myAgent = DEMO_AGENTS.find((a) => a.id === "a1")!;
  const myClients = DEMO_CLIENTS.filter((c) => c.agent_id === "a1");

  const FOLLOW_UPS = [
    {
      client: "Kenji Yamamoto",
      stage: "Pending",
      ap: 4800,
      score: 82,
      message:
        "Hi Kenji — following up on the application we submitted last week. Your coverage would start on the 1st of next month. I just need to confirm your draft date — are we good with the 15th?",
    },
    {
      client: "Leila Saadi",
      stage: "Qualified",
      ap: 2400,
      score: 91,
      message:
        "Hey Leila — great talking last week. I ran the numbers on the F&G policy we discussed. For your coverage amount, you're looking at $124/mo. Want to move forward with the application today?",
    },
    {
      client: "Roy Tillman",
      stage: "Quoted",
      ap: 840,
      score: 74,
      message:
        "Roy, following up on the Final Expense quote. This Transamerica policy locks in your rate regardless of future health changes. Ready to get you started — does today or tomorrow work for a quick call?",
    },
  ];

  const HOT_LEADS = DEMO_CLIENTS.filter((c) => c.agent_id === "a1")
    .sort((a, b) => b.ai_score - a.ai_score)
    .slice(0, 4);

  const TEAM_AVG = {
    ap: Math.round(
      DEMO_AGENTS.reduce((s, a) => s + a.ap_30d, 0) / DEMO_AGENTS.length
    ),
    win_rate: Math.round(
      (DEMO_AGENTS.reduce((s, a) => s + a.win_rate, 0) / DEMO_AGENTS.length) * 100
    ),
    calls: Math.round(
      DEMO_AGENTS.reduce((s, a) => s + a.calls_30d, 0) / DEMO_AGENTS.length
    ),
    deals: Math.round(
      DEMO_AGENTS.reduce((s, a) => s + a.deals_30d, 0) / DEMO_AGENTS.length
    ),
  };

  function scoreBadge(score: number) {
    const color =
      score >= 80 ? "bg-emerald-400/15 text-emerald-400" : score >= 60 ? "bg-amber-400/15 text-amber-400" : "bg-red-400/15 text-red-400";
    return (
      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${color}`}>
        {score}
      </span>
    );
  }

  return (
    <div>
      <PageHeader title="Your Day" sub="Rep view · Isaiah Auman" />

      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-dim mb-3">
          Follow-Ups Due Today
        </h2>
        <div className="grid grid-cols-1 gap-4">
          {FOLLOW_UPS.map((fu, i) => (
            <div key={i} className="card px-5 py-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-ink text-sm">{fu.client}</span>
                  <span className="text-xs bg-bg-hover text-ink-mute px-2 py-0.5 rounded">
                    {fu.stage}
                  </span>
                  <span className="text-xs font-semibold text-accent">
                    {formatCurrency(fu.ap)} AP
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink-dim">Score:</span>
                  {scoreBadge(fu.score)}
                </div>
              </div>
              <div className="bg-bg rounded-lg p-3 border border-line mb-3">
                <div className="text-[10px] uppercase tracking-wider text-ink-dim mb-1">
                  AI-Drafted Message
                </div>
                <p className="text-sm text-ink-mute italic leading-relaxed">
                  &ldquo;{fu.message}&rdquo;
                </p>
              </div>
              <div className="flex gap-2">
                <button className="btn-primary text-xs py-1.5 px-4">Mark Done</button>
                <button className="btn-ghost text-xs py-1.5 px-4">Edit</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-dim mb-3">
          Your Hot Leads
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {HOT_LEADS.map((lead) => (
            <div key={lead.id} className="card px-4 py-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-ink text-sm">{lead.name}</div>
                  <div className="text-xs text-ink-mute mt-0.5">{lead.source}</div>
                </div>
                {scoreBadge(lead.ai_score)}
              </div>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-xs bg-bg-hover text-ink-mute px-2 py-0.5 rounded capitalize">
                  {lead.stage.replace("_", " ")}
                </span>
                <span className="text-xs font-semibold text-accent">
                  {formatCurrency(lead.ap)} AP
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-dim mb-3">
          Your Stats vs Team
        </h2>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-ink-dim text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-3">Metric</th>
                <th className="text-right px-4 py-3 text-accent">You</th>
                <th className="text-right px-4 py-3">Team Avg</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-line hover:bg-bg-hover transition-colors">
                <td className="px-4 py-3 text-ink-mute">AP This Month</td>
                <td className="px-4 py-3 text-right font-semibold text-accent">
                  {formatCurrency(myAgent.ap_30d)}
                </td>
                <td className="px-4 py-3 text-right text-ink-mute">
                  {formatCurrency(TEAM_AVG.ap)}
                </td>
              </tr>
              <tr className="border-b border-line hover:bg-bg-hover transition-colors">
                <td className="px-4 py-3 text-ink-mute">Win Rate</td>
                <td className="px-4 py-3 text-right font-semibold text-accent">
                  {Math.round(myAgent.win_rate * 100)}%
                </td>
                <td className="px-4 py-3 text-right text-ink-mute">{TEAM_AVG.win_rate}%</td>
              </tr>
              <tr className="border-b border-line hover:bg-bg-hover transition-colors">
                <td className="px-4 py-3 text-ink-mute">Calls Made</td>
                <td className="px-4 py-3 text-right font-semibold text-accent">
                  {myAgent.calls_30d}
                </td>
                <td className="px-4 py-3 text-right text-ink-mute">{TEAM_AVG.calls}</td>
              </tr>
              <tr className="hover:bg-bg-hover transition-colors">
                <td className="px-4 py-3 text-ink-mute">Deals Active</td>
                <td className="px-4 py-3 text-right font-semibold text-accent">
                  {myAgent.deals_30d}
                </td>
                <td className="px-4 py-3 text-right text-ink-mute">{TEAM_AVG.deals}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

import React from "react";

export default function HomePage() {
  const { role } = useRole();

  if (role === "manager") return <ManagerDashboard />;
  if (role === "rep") return <RepDashboard />;
  return <OwnerDashboard />;
}
