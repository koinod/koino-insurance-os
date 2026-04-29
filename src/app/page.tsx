"use client";

import React, { useState } from "react";
import { useRole } from "@/lib/role-context";
import { DEMO_AGENTS, DEMO_DEALS } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/format";

// ─────────────────────────────────────────────
// Shared primitives
// ─────────────────────────────────────────────

function Sparkle({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={`w-3.5 h-3.5 ${className}`}
    >
      <path d="M12 2l2.4 7.6H22l-6.4 4.6 2.4 7.8L12 17.4 6 22l2.4-7.8L2 9.6h7.6z" />
    </svg>
  );
}

function ScoreChip({ score }: { score: number }) {
  const cls =
    score >= 80
      ? "bg-emerald-400/15 text-emerald-400"
      : score >= 65
      ? "bg-amber-400/15 text-amber-400"
      : "bg-red-400/15 text-red-400";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${cls}`}>
      <Sparkle /> {score}
    </span>
  );
}

function TrendChip({
  you,
  avg,
}: {
  you: number;
  avg: number;
}) {
  const pct = avg === 0 ? 0 : Math.round(((you - avg) / avg) * 100);
  const up = pct >= 0;
  return (
    <span
      className={`text-xs font-bold ${up ? "text-emerald-400" : "text-red-400"}`}
    >
      {up ? "↑" : "↓"}&thinsp;{Math.abs(pct)}% vs avg
    </span>
  );
}

// ─────────────────────────────────────────────
// Morning Briefing — Rep view
// ─────────────────────────────────────────────

const ACTION_CARDS = [
  {
    priority: 1,
    client: "Leila Saadi",
    context: "Score 91 · Qualified · $2,400 AP",
    why: "High score, hasn't been contacted since qualifying call 3 days ago. Window closing.",
    message:
      "Hey Leila — great talking last week. I pulled the numbers on that F&G policy. For your coverage amount you're looking at $124/mo with day-1 benefits. Want to get the application in today?",
    tags: ["Referral", "$2,400 AP"],
  },
  {
    priority: 2,
    client: "Kenji Yamamoto",
    context: "Score 82 · Pending · $4,800 AP",
    why: "Application in Pending 3 days. Carrier likely waiting on a doc. AI close prob dropped 82% → 54%.",
    message:
      "Hi Kenji — following up on the application we submitted last week. Your coverage would start the 1st of next month. Just need to confirm your draft date — are we good with the 15th?",
    tags: ["Pending 3d", "$4,800 AP"],
  },
  {
    priority: 3,
    client: "Roy Tillman",
    context: "Score 74 · Quoted · $840 AP",
    why: "Quote sent 5 days ago with no response. Follow-up or lose the lead.",
    message:
      "Roy — following up on the Final Expense quote I sent. This Transamerica policy locks in your rate regardless of future health changes. Does today or tomorrow work for a quick 10-minute call?",
    tags: ["Aged FEX Lead", "$840 AP"],
  },
  {
    priority: 4,
    client: "Priya Venkatesh",
    context: "Score 88 · App Started · $3,600 AP",
    why: "Started application 2 days ago, not submitted. Usually means a question or hesitation.",
    message:
      "Hey Priya — saw you started the application earlier this week. Super common to have questions at this stage. What's the one thing holding you back? I can usually clear it up in 5 minutes.",
    tags: ["Referral", "$3,600 AP"],
  },
  {
    priority: 5,
    client: "Henry Okafor",
    context: "Score 69 · Contacted · $960 AP",
    why: "2 contact attempts, no answer. AI recommends SMS at this stage — higher open rate.",
    message:
      "Henry, this is Isaiah from KOINO. I tried calling a couple times and wanted to reach out here — is there a better time to connect about the coverage we discussed?",
    tags: ["Live Transfer", "$960 AP"],
  },
];

const LEAD_SOURCES = [
  { name: "Referral", close_rate: 34, cpa: 0, avg_ap: 2100, width: 100 },
  { name: "Live Transfer", close_rate: 22, cpa: 45, avg_ap: 1600, width: 65 },
  { name: "Direct Mail", close_rate: 11, cpa: 82, avg_ap: 1200, width: 32 },
  { name: "Aged FEX Lead", close_rate: 4, cpa: 47, avg_ap: 900, width: 12 },
  { name: "Web Form", close_rate: 3, cpa: 38, avg_ap: 750, width: 9 },
];

function ActionCard({ card, index }: { card: typeof ACTION_CARDS[0]; index: number }) {
  const [done, setDone] = useState(false);
  const [skipped, setSkipped] = useState(false);

  if (done)
    return (
      <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-4 mb-4 flex items-center gap-3">
        <span className="text-emerald-400 text-lg">✓</span>
        <span className="text-sm text-emerald-400 font-semibold">
          {card.client} marked done
        </span>
      </div>
    );

  if (skipped) return null;

  return (
    <div
      className="relative rounded-2xl border border-amber-400/25 mb-4 overflow-hidden"
      style={{ background: "linear-gradient(135deg, rgba(251,191,36,0.06) 0%, rgba(26,31,46,0) 60%)" }}
    >
      {/* priority stripe */}
      <div className="absolute top-0 left-0 w-1 h-full rounded-l-2xl bg-amber-400/60" />

      <div className="pl-5 pr-5 pt-4 pb-5">
        {/* header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkle className="text-amber-400" />
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-400">
              Priority {card.priority}
            </span>
          </div>
          <div className="flex gap-1.5">
            {card.tags.map((t) => (
              <span
                key={t}
                className="text-[10px] bg-bg-hover text-ink-dim px-2 py-0.5 rounded-full font-medium"
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* client + context */}
        <div className="text-xl font-extrabold text-ink tracking-tight mb-0.5">
          {card.client}
        </div>
        <div className="text-xs text-ink-dim mb-1">{card.context}</div>
        <div className="text-sm text-ink-mute mb-4 leading-snug">
          <span className="text-amber-400/80 font-semibold">Why now: </span>
          {card.why}
        </div>

        {/* AI message */}
        <div className="rounded-xl bg-bg border border-line/60 p-4 mb-4">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-400 mb-2">
            <Sparkle />
            AI-drafted opener
          </div>
          <p className="text-sm text-ink leading-relaxed">&ldquo;{card.message}&rdquo;</p>
        </div>

        {/* action buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => setDone(true)}
            className="flex-1 py-3 rounded-xl bg-emerald-400/15 text-emerald-400 font-bold text-sm hover:bg-emerald-400/25 transition-colors active:scale-95"
          >
            📞 Call
          </button>
          <button
            onClick={() => setDone(true)}
            className="flex-1 py-3 rounded-xl bg-amber-400/15 text-amber-400 font-bold text-sm hover:bg-amber-400/25 transition-colors active:scale-95"
          >
            💬 Text
          </button>
          <button
            onClick={() => setDone(true)}
            className="flex-1 py-3 rounded-xl bg-bg border border-line text-ink-mute font-semibold text-sm hover:bg-bg-hover transition-colors active:scale-95"
          >
            📧 Email
          </button>
          <button
            onClick={() => setSkipped(true)}
            className="px-4 py-3 rounded-xl text-ink-dim text-sm hover:text-ink-mute transition-colors"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}

function LeadIntelligence() {
  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-5">
        <Sparkle className="text-amber-400" />
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-ink">
          Lead Intelligence
        </h2>
      </div>

      {/* Big comparison */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div
          className="rounded-2xl border border-emerald-400/25 p-5 text-center"
          style={{ background: "rgba(34,197,94,0.06)" }}
        >
          <div className="text-5xl font-extrabold text-emerald-400 mb-1 tracking-tight">
            34%
          </div>
          <div className="text-sm font-bold text-ink mb-1">Referral Close Rate</div>
          <div className="text-xs text-ink-dim">avg $2,100 AP · $0 cost</div>
        </div>
        <div
          className="rounded-2xl border border-red-400/25 p-5 text-center"
          style={{ background: "rgba(239,68,68,0.06)" }}
        >
          <div className="text-5xl font-extrabold text-red-400 mb-1 tracking-tight">
            4%
          </div>
          <div className="text-sm font-bold text-ink mb-1">Paid Lead Close Rate</div>
          <div className="text-xs text-ink-dim">avg $900 AP · $47 cost</div>
        </div>
      </div>

      {/* Source bars */}
      <div className="rounded-2xl border border-line bg-bg-card p-5 mb-4">
        <div className="text-xs font-bold uppercase tracking-wider text-ink-dim mb-4">
          Close Rate by Source
        </div>
        <div className="space-y-3">
          {LEAD_SOURCES.map((src) => (
            <div key={src.name}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-ink">{src.name}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-ink-dim">
                    CPA: {src.cpa === 0 ? "Free" : `$${src.cpa}`}
                  </span>
                  <span className="text-sm font-bold text-ink tabular-nums w-10 text-right">
                    {src.close_rate}%
                  </span>
                </div>
              </div>
              <div className="h-2 rounded-full bg-bg-hover overflow-hidden">
                <div
                  className="h-full rounded-full bg-amber-400 transition-all"
                  style={{ width: `${src.width}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* AI recommendation */}
      <div
        className="rounded-2xl border border-amber-400/25 p-5"
        style={{ background: "rgba(251,191,36,0.04)" }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Sparkle className="text-amber-400" />
          <span className="text-xs font-extrabold uppercase tracking-wider text-amber-400">
            AI Recommendation
          </span>
        </div>
        <p className="text-sm text-ink leading-relaxed mb-4">
          Ask your last 3 delivered clients for referrals. You have{" "}
          <strong className="text-ink">Patricia Holloway, Maria Castillo, and Eloise Park</strong>
          {" "}— all issued in the last 30 days. A single referral from any of them is
          worth 8× a paid lead based on your close rates.
        </p>
        <button className="py-3 px-6 rounded-xl bg-amber-400 text-bg font-bold text-sm hover:bg-amber-300 transition-colors active:scale-95">
          ✦ Generate Referral Messages
        </button>
      </div>
    </section>
  );
}

function RepNumbers() {
  const myAgent = DEMO_AGENTS.find((a) => a.id === "a1")!;
  const teamAvgAP = Math.round(
    DEMO_AGENTS.reduce((s, a) => s + a.ap_30d, 0) / DEMO_AGENTS.length
  );
  const teamAvgWin = Math.round(
    (DEMO_AGENTS.reduce((s, a) => s + a.win_rate, 0) / DEMO_AGENTS.length) * 100
  );
  const teamAvgCalls = Math.round(
    DEMO_AGENTS.reduce((s, a) => s + a.calls_30d, 0) / DEMO_AGENTS.length
  );
  const teamAvgDeals = Math.round(
    DEMO_AGENTS.reduce((s, a) => s + a.deals_30d, 0) / DEMO_AGENTS.length
  );

  const myComm = Math.round(myAgent.ap_30d * 0.125);

  const metrics = [
    { label: "AP This Month", value: formatCurrency(myAgent.ap_30d), you: myAgent.ap_30d, avg: teamAvgAP },
    { label: "Est. Commission", value: formatCurrency(myComm), you: myComm, avg: Math.round(teamAvgAP * 0.125) },
    { label: "Win Rate", value: `${Math.round(myAgent.win_rate * 100)}%`, you: Math.round(myAgent.win_rate * 100), avg: teamAvgWin },
    { label: "Calls Made", value: String(myAgent.calls_30d), you: myAgent.calls_30d, avg: teamAvgCalls },
  ];

  return (
    <section className="mb-8">
      <h2 className="text-sm font-extrabold uppercase tracking-wider text-ink mb-4">
        Your Numbers
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="rounded-2xl border border-line bg-bg-card p-5"
          >
            <div className="text-xs text-ink-dim uppercase tracking-wider mb-2 font-medium">
              {m.label}
            </div>
            <div className="text-3xl font-extrabold text-ink tracking-tight mb-2">
              {m.value}
            </div>
            <TrendChip you={m.you} avg={m.avg} />
          </div>
        ))}
      </div>
    </section>
  );
}

function RepView() {
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="max-w-2xl mx-auto">
      {/* Greeting */}
      <div className="mb-7">
        <div className="flex items-center gap-2 mb-1">
          <Sparkle className="text-amber-400 w-4 h-4" />
          <span className="text-xs font-bold uppercase tracking-widest text-amber-400">
            Personal Briefing
          </span>
        </div>
        <h1 className="text-3xl font-extrabold text-ink tracking-tight">
          {greeting}, Isaiah.
        </h1>
        <p className="text-ink-mute mt-1">
          Here&apos;s your day — {ACTION_CARDS.length} follow-ups prioritized, AI messages ready.
        </p>
      </div>

      {/* Action cards */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-ink">
            Your Morning Briefing
          </h2>
          <span className="text-xs text-ink-dim">{ACTION_CARDS.length} actions today</span>
        </div>
        {ACTION_CARDS.map((card, i) => (
          <ActionCard key={card.client} card={card} index={i} />
        ))}
      </section>

      <LeadIntelligence />
      <RepNumbers />
    </div>
  );
}

// ─────────────────────────────────────────────
// Manager view
// ─────────────────────────────────────────────

const COACHING_MSGS: Record<string, string> = {
  a3: "Hey Shea — noticed you haven't logged activity in a couple of days. Your Underwriting deals are still live and that window won't stay open forever. A quick status call to the carrier takes 5 minutes. Let me know if you need anything from my end.",
  a5: "Hey Nick — pulled your numbers. Contact rate looks good, close rate is the gap. I want to block 30 minutes this week for a call review — I think there are 2-3 objection patterns we can close fast. Pick a slot on my calendar.",
};

const TEAM_VELOCITY = [
  { name: "Isaiah Auman", deals: 12, ap: 92400, avgDays: 4.2, trend: "↑" },
  { name: "Evan Scott", deals: 9, ap: 67200, avgDays: 6.8, trend: "→" },
  { name: "Jason Rittman", deals: 5, ap: 34800, avgDays: 5.9, trend: "↑" },
  { name: "Shea Scott", deals: 7, ap: 48000, avgDays: 11.3, trend: "↓" },
  { name: "Nick Paolella", deals: 2, ap: 12000, avgDays: 14.1, trend: "↓" },
];

function ManagerView() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());

  const atRisk = DEMO_AGENTS.filter(
    (a) => a.status === "silent" || a.status === "at_risk"
  );

  return (
    <div>
      {/* Header */}
      <div className="mb-7">
        <div className="flex items-center gap-2 mb-1">
          <Sparkle className="text-amber-400 w-4 h-4" />
          <span className="text-xs font-bold uppercase tracking-widest text-amber-400">
            Manager Briefing
          </span>
        </div>
        <h1 className="text-3xl font-extrabold text-ink tracking-tight">
          Your Team&apos;s Morning.
        </h1>
        <p className="text-ink-mute mt-1">
          {atRisk.length} agent{atRisk.length !== 1 ? "s" : ""} need attention today.
        </p>
      </div>

      {/* Team status */}
      <section className="mb-8">
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-ink mb-4">
          Team Status
        </h2>
        <div className="space-y-3">
          {DEMO_AGENTS.sort((a, b) => b.ap_30d - a.ap_30d).map((agent) => {
            const dotCls =
              agent.status === "active"
                ? "bg-emerald-400"
                : agent.status === "silent"
                ? "bg-amber-400"
                : "bg-red-400";
            const isOpen = expanded === agent.id;

            return (
              <div
                key={agent.id}
                className={`rounded-2xl border p-4 transition-all ${
                  agent.status !== "active"
                    ? "border-amber-400/25 bg-amber-400/[0.03]"
                    : "border-line bg-bg-card"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotCls}`}
                    />
                    <div>
                      <div className="font-bold text-ink text-sm">{agent.name}</div>
                      <div className="text-xs text-ink-dim">{agent.last_active}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-5">
                    <div className="text-right">
                      <div className="text-[10px] text-ink-dim">AP</div>
                      <div className="text-sm font-bold text-accent">
                        {formatCurrency(agent.ap_30d)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-ink-dim">Deals</div>
                      <div className="text-sm font-bold text-ink">{agent.deals_30d}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-ink-dim">Win%</div>
                      <div className="text-sm font-bold text-ink">
                        {Math.round(agent.win_rate * 100)}%
                      </div>
                    </div>
                    {COACHING_MSGS[agent.id] && (
                      <button
                        onClick={() =>
                          setExpanded(isOpen ? null : agent.id)
                        }
                        className="py-2 px-4 rounded-xl bg-amber-400/15 text-amber-400 text-xs font-bold hover:bg-amber-400/25 transition-colors"
                      >
                        {isOpen ? "Close" : "Coach →"}
                      </button>
                    )}
                  </div>
                </div>

                {isOpen && COACHING_MSGS[agent.id] && (
                  <div className="mt-4 pt-4 border-t border-line/50">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-2">
                      <Sparkle />
                      AI-Drafted Coaching Message
                    </div>
                    <div className="rounded-xl bg-bg border border-line p-4 mb-3">
                      <p className="text-sm text-ink leading-relaxed">
                        &ldquo;{COACHING_MSGS[agent.id]}&rdquo;
                      </p>
                    </div>
                    {sent.has(agent.id) ? (
                      <span className="text-sm text-emerald-400 font-semibold">
                        ✓ Sent to {agent.name.split(" ")[0]}
                      </span>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() =>
                            setSent((prev) => new Set([...prev, agent.id]))
                          }
                          className="py-3 px-6 rounded-xl bg-amber-400 text-bg font-bold text-sm hover:bg-amber-300 transition-colors"
                        >
                          Send to {agent.name.split(" ")[0]}
                        </button>
                        <button className="py-3 px-4 rounded-xl border border-line text-ink-mute text-sm hover:bg-bg-hover transition-colors">
                          Edit
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Deal velocity */}
      <section className="mb-8">
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-ink mb-4">
          Deal Velocity
        </h2>
        <div className="space-y-2">
          {TEAM_VELOCITY.map((row) => (
            <div
              key={row.name}
              className="rounded-xl border border-line bg-bg-card px-5 py-3.5 flex items-center justify-between"
            >
              <span className="font-medium text-sm text-ink w-36">{row.name}</span>
              <span className="text-sm font-bold text-accent w-24 text-right">
                {formatCurrency(row.ap)}
              </span>
              <span className="text-xs text-ink-mute w-20 text-right">
                {row.deals} deals
              </span>
              <div className="flex items-center gap-1 w-28 text-right justify-end">
                <span
                  className={`text-sm ${
                    row.trend === "↑"
                      ? "text-emerald-400"
                      : row.trend === "↓"
                      ? "text-red-400"
                      : "text-ink-dim"
                  }`}
                >
                  {row.trend}
                </span>
                <span className="text-xs text-ink-mute">{row.avgDays}d avg</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Lead ROI for team */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Sparkle className="text-amber-400" />
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-ink">
            Lead ROI — Team View
          </h2>
        </div>
        <div
          className="rounded-2xl border border-amber-400/25 p-5"
          style={{ background: "rgba(251,191,36,0.04)" }}
        >
          <p className="text-sm text-ink leading-relaxed mb-4">
            Referral leads are closing at <strong className="text-emerald-400">8.5×</strong> the
            rate of aged leads across your team. Isaiah and Evan generate 73% of all referrals.
            Shea and Nick have zero referrals in the last 30 days.
          </p>
          <div className="flex items-center gap-2 text-sm text-amber-400 font-semibold">
            <Sparkle />
            Recommendation: Run a referral challenge this week — first agent to bring in 3
            referrals wins $200.
          </div>
        </div>
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────
// Owner view — 45-person org pulse
// ─────────────────────────────────────────────

const ATTENTION_ITEMS = [
  {
    type: "warning" as const,
    icon: "⚠",
    headline: "11 agents haven't logged activity in 48+ hours",
    detail:
      "24% of your team is dark. That's $127K in pipeline at risk of going cold before end of week.",
    action: "View Silent Agents",
    color: "amber",
  },
  {
    type: "warning" as const,
    icon: "⚠",
    headline: "Paid lead ROI dropped 31% this month",
    detail:
      "Aged FEX lead cost-per-acquisition is now $1,847 vs $1,241 last month. Quality shift detected — recommend pausing and redirecting budget to referral incentives.",
    action: "See Lead Analysis",
    color: "red",
  },
  {
    type: "opportunity" as const,
    icon: "✦",
    headline: "Top 5 agents drive 68% of all AP",
    detail:
      "Isaiah, Evan, Shea, Jason, and Marcus are carrying the team. The bottom 20 agents produced $0 in issues this month. Structural coaching problem.",
    action: "View Distribution",
    color: "amber",
  },
  {
    type: "info" as const,
    icon: "→",
    headline: "Team on pace for $2.1M AP — record month",
    detail:
      "If current velocity holds through month-end, you'll beat last month ($1.84M) by 14%. Referral pipeline is the driver — 34% close rate vs 4% paid.",
    action: "See Forecast",
    color: "emerald",
  },
  {
    type: "warning" as const,
    icon: "⚠",
    headline: "7 new recruits in onboarding — 3 haven't started training",
    detail:
      "Onboarding dropout is highest in weeks 1-2. Recruits Ethan W., Fatima A., and Garrett P. haven't opened the training portal. Automated reminder fired — no response.",
    action: "Contact Recruits",
    color: "amber",
  },
];

const ORG_LEAD_SOURCES = [
  { name: "Referral", close: 34, cpa: 0, ap: 2100, share: 22 },
  { name: "Live Transfer", close: 22, cpa: 45, ap: 1600, share: 18 },
  { name: "Direct Mail", close: 11, cpa: 82, ap: 1200, share: 15 },
  { name: "Aged FEX Lead", close: 4, cpa: 47, ap: 900, share: 31 },
  { name: "Web Form / FB Ad", close: 3, cpa: 38, ap: 750, share: 14 },
];

function OwnerView() {
  const totalAP = 2143600;
  const totalComm = Math.round(totalAP * 0.125);
  const issuedDeals = 47;
  const teamSize = 45;
  const activeAgents = 34;

  return (
    <div>
      {/* Greeting */}
      <div className="mb-7">
        <div className="flex items-center gap-2 mb-1">
          <Sparkle className="text-amber-400 w-4 h-4" />
          <span className="text-xs font-bold uppercase tracking-widest text-amber-400">
            Organization Pulse
          </span>
        </div>
        <h1 className="text-3xl font-extrabold text-ink tracking-tight">
          Morning, Ian.
        </h1>
        <p className="text-ink-mute mt-1">
          {teamSize} agents · {activeAgents} active today · {teamSize - activeAgents} need attention
        </p>
      </div>

      {/* Org KPIs — big, clean, no table */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {[
          { label: "Team AP (30d)", value: formatCurrency(totalAP, { abbreviate: true }), sub: "+14% vs last month", accent: true },
          { label: "Est. Commission", value: formatCurrency(totalComm, { abbreviate: true }), sub: "blended 12.5%" },
          { label: "Issued This Month", value: String(issuedDeals), sub: "policies delivered" },
        ].map((m) => (
          <div
            key={m.label}
            className={`rounded-2xl border p-5 ${
              m.accent
                ? "border-amber-400/30 bg-amber-400/[0.06]"
                : "border-line bg-bg-card"
            }`}
          >
            <div className="text-xs text-ink-dim uppercase tracking-wider mb-2 font-medium">
              {m.label}
            </div>
            <div
              className={`text-4xl font-extrabold tracking-tight mb-1 ${
                m.accent ? "text-amber-400" : "text-ink"
              }`}
            >
              {m.value}
            </div>
            <div className="text-xs text-ink-dim">{m.sub}</div>
          </div>
        ))}
      </div>

      {/* 5 attention items */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-5">
          <Sparkle className="text-amber-400" />
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-ink">
            5 Things That Need Your Attention
          </h2>
        </div>

        <div className="space-y-4">
          {ATTENTION_ITEMS.map((item, i) => {
            const borderCls =
              item.color === "amber"
                ? "border-amber-400/25"
                : item.color === "red"
                ? "border-red-400/25"
                : "border-emerald-400/25";
            const iconCls =
              item.color === "amber"
                ? "text-amber-400"
                : item.color === "red"
                ? "text-red-400"
                : "text-emerald-400";
            const bgCls =
              item.color === "amber"
                ? "rgba(251,191,36,0.04)"
                : item.color === "red"
                ? "rgba(239,68,68,0.04)"
                : "rgba(34,197,94,0.04)";

            return (
              <div
                key={i}
                className={`rounded-2xl border ${borderCls} p-5`}
                style={{ background: bgCls }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-sm ${iconCls}`}>{item.icon}</span>
                      <span className="font-bold text-ink text-sm">{item.headline}</span>
                    </div>
                    <p className="text-sm text-ink-mute leading-relaxed">{item.detail}</p>
                  </div>
                  <button
                    className={`flex-shrink-0 py-2 px-4 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
                      item.color === "amber"
                        ? "bg-amber-400/15 text-amber-400 hover:bg-amber-400/25"
                        : item.color === "red"
                        ? "bg-red-400/15 text-red-400 hover:bg-red-400/25"
                        : "bg-emerald-400/15 text-emerald-400 hover:bg-emerald-400/25"
                    }`}
                  >
                    {item.action}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Lead ROI */}
      <section>
        <div className="flex items-center gap-2 mb-5">
          <Sparkle className="text-amber-400" />
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-ink">
            Lead ROI — Where the Money Really Comes From
          </h2>
        </div>

        <div className="rounded-2xl border border-line bg-bg-card p-5 mb-4">
          <div className="text-xs font-bold uppercase tracking-wider text-ink-dim mb-5">
            Close rate vs budget share
          </div>
          <div className="space-y-4">
            {ORG_LEAD_SOURCES.map((src) => (
              <div key={src.name}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-ink w-32">{src.name}</span>
                    <span className="text-xs text-ink-dim">{src.share}% of budget</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-ink-dim">CPA: {src.cpa === 0 ? "Free" : `$${src.cpa}`}</span>
                    <span className="font-bold text-ink w-10 text-right">{src.close}%</span>
                  </div>
                </div>
                <div className="relative h-2.5 rounded-full bg-bg-hover overflow-hidden">
                  {/* close rate bar */}
                  <div
                    className="absolute left-0 top-0 h-full rounded-full bg-amber-400"
                    style={{ width: `${(src.close / 34) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          className="rounded-2xl border border-amber-400/25 p-5"
          style={{ background: "rgba(251,191,36,0.04)" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Sparkle className="text-amber-400" />
            <span className="text-xs font-extrabold uppercase tracking-wider text-amber-400">
              AI Recommendation
            </span>
          </div>
          <p className="text-sm text-ink leading-relaxed mb-4">
            You&apos;re spending 31% of lead budget on Aged FEX at a 4% close rate while Referrals
            close at 34% for <strong className="text-emerald-400">$0 cost</strong>.
            Reallocating $2,000/month from Aged FEX to a referral incentive program
            (e.g. $50/qualified referral) would generate an estimated{" "}
            <strong className="text-amber-400">$38,000 in additional AP</strong> per month.
          </p>
          <button className="py-3 px-6 rounded-xl bg-amber-400 text-bg font-bold text-sm hover:bg-amber-300 transition-colors">
            ✦ Build Referral Program
          </button>
        </div>
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────
// Root
// ─────────────────────────────────────────────

export default function HomePage() {
  const { role } = useRole();

  if (role === "manager") return <ManagerView />;
  if (role === "owner") return <OwnerView />;
  return <RepView />;
}
