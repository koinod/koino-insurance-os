import PageHeader from "@/components/PageHeader";
import { MOCK_RECRUITING } from "@/lib/mock-data";
import { fmtDate } from "@/lib/format";
import { Plus, Link as LinkIcon, Copy } from "lucide-react";
import { RecruitingCandidate } from "@/lib/types";

const STAGES: RecruitingCandidate["stage"][] = [
  "Invited", "Onboarding", "Contracted", "Licensed", "Appointed", "Active", "Dropped",
];

const STAGE_COLOR: Record<RecruitingCandidate["stage"], string> = {
  Invited: "pill-gray",
  Onboarding: "pill-blue",
  Contracted: "pill-blue",
  Licensed: "pill-yellow",
  Appointed: "pill-yellow",
  Active: "pill-green",
  Dropped: "pill-red",
};

export default function RecruitingPage() {
  const counts = STAGES.reduce<Record<string, number>>((acc, s) => {
    acc[s] = MOCK_RECRUITING.filter(c => c.stage === s).length;
    return acc;
  }, {});

  const active = MOCK_RECRUITING.filter(c => c.stage === "Active").length;
  const inFunnel = MOCK_RECRUITING.filter(c => !["Active", "Dropped"].includes(c.stage)).length;
  const dropoff = MOCK_RECRUITING.filter(c => c.stage === "Dropped").length;
  const conversion = MOCK_RECRUITING.length ? Math.round((active / MOCK_RECRUITING.length) * 100) : 0;

  return (
    <div className="px-8 py-6">
      <PageHeader
        title="Recruiting"
        subtitle="Invite → Onboard → License → Appoint → Activate. The agent factory."
        actions={
          <>
            <button className="btn-ghost">
              <Copy className="w-4 h-4" />
              Copy Invite Link
            </button>
            <button className="btn-primary">
              <Plus className="w-4 h-4" />
              Invite Recruit
            </button>
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Active Agents" value={active} accent="green" />
        <KpiCard label="In Funnel" value={inFunnel} />
        <KpiCard label="Dropped (30d)" value={dropoff} accent="red" />
        <KpiCard label="Invite → Active %" value={`${conversion}%`} accent="gold" />
      </div>

      {/* Stage funnel strip */}
      <div className="grid grid-cols-7 gap-2 mb-6">
        {STAGES.map(s => (
          <div key={s} className="kpi-card text-center">
            <div className="text-[10px] uppercase tracking-wider text-ink-muted mb-1">{s}</div>
            <div className="text-xl font-bold text-ink-primary">{counts[s] ?? 0}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-bg-card border border-bg-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-bg-border flex items-center justify-between">
          <h3 className="text-sm font-semibold">Candidates</h3>
          <div className="flex items-center gap-2 text-xs text-ink-secondary">
            <LinkIcon className="w-3.5 h-3.5" />
            <span className="font-mono">koino.insurance/join/im-2026</span>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bg-panel border-b border-bg-border text-ink-secondary text-xs uppercase tracking-wider">
              <th className="px-4 py-3 text-left font-medium">Candidate</th>
              <th className="px-4 py-3 text-left font-medium">Stage</th>
              <th className="px-4 py-3 text-left font-medium">Source</th>
              <th className="px-4 py-3 text-left font-medium">State</th>
              <th className="px-4 py-3 text-left font-medium">Recruiter</th>
              <th className="px-4 py-3 text-left font-medium">Invited</th>
              <th className="px-4 py-3 text-left font-medium">Next Step</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_RECRUITING.map(c => (
              <tr key={c.id} className="border-b border-bg-border last:border-0 hover:bg-bg-hover transition-colors">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3"><span className={STAGE_COLOR[c.stage]}>{c.stage}</span></td>
                <td className="px-4 py-3 text-ink-secondary">{c.source}</td>
                <td className="px-4 py-3 font-mono text-xs">{c.state}</td>
                <td className="px-4 py-3 text-ink-secondary">{c.recruiter}</td>
                <td className="px-4 py-3 text-ink-secondary">{fmtDate(c.invited_at)}</td>
                <td className="px-4 py-3 text-ink-secondary text-xs">{c.next_step}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KpiCard({ label, value, accent }: { label: string; value: string | number; accent?: "green" | "red" | "gold" }) {
  const cls =
    accent === "green" ? "text-status-green" :
    accent === "red" ? "text-status-red" :
    accent === "gold" ? "text-gold" :
    "text-ink-primary";
  return (
    <div className="kpi-card">
      <div className="text-[11px] uppercase tracking-wider text-ink-muted font-medium mb-1.5">{label}</div>
      <div className={"text-2xl font-bold " + cls}>{value}</div>
    </div>
  );
}
