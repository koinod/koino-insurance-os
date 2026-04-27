import PageHeader from "@/components/PageHeader";
import { MOCK_LEAD_VENDORS, MOCK_PIPELINE } from "@/lib/mock-data";
import { fmtMoney, fmtNumber } from "@/lib/format";
import { Plus, Database, ExternalLink } from "lucide-react";

export default function LeadVendorsPage() {
  const totalLeads = MOCK_LEAD_VENDORS.reduce((s, v) => s + v.leads_30d, 0);
  const totalClosed = MOCK_LEAD_VENDORS.reduce((s, v) => s + v.closed_30d, 0);
  const totalSpend = MOCK_LEAD_VENDORS.reduce((s, v) => s + v.cost_per_lead_cents * v.leads_30d, 0);
  const totalAP = MOCK_LEAD_VENDORS.reduce((s, v) => s + v.ap_30d_cents, 0);
  const roi = totalSpend > 0 ? Math.round((totalAP / totalSpend) * 100) : 0;

  return (
    <div className="px-8 py-6">
      <PageHeader
        title="Lead Vendors"
        subtitle="Where the leads come from, what they cost, what they close."
        actions={
          <>
            <button className="btn-ghost">
              <Database className="w-4 h-4" />
              Sync Sheets
            </button>
            <button className="btn-primary">
              <Plus className="w-4 h-4" />
              Add Vendor
            </button>
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Kpi label="Leads (30d)" value={fmtNumber(totalLeads)} />
        <Kpi label="Closed (30d)" value={fmtNumber(totalClosed)} accent="green" />
        <Kpi label="Close Rate" value={totalLeads ? `${Math.round((totalClosed / totalLeads) * 100)}%` : "0%"} />
        <Kpi label="Spend (30d)" value={fmtMoney(totalSpend)} />
        <Kpi label="AP / Spend ROI" value={`${roi}%`} accent="gold" />
      </div>

      {/* Vendors table */}
      <div className="bg-bg-card border border-bg-border rounded-lg overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-bg-border">
          <h3 className="text-sm font-semibold">Vendor Performance (Last 30 Days)</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bg-panel border-b border-bg-border text-ink-secondary text-xs uppercase tracking-wider">
              <th className="px-4 py-3 text-left font-medium">Vendor</th>
              <th className="px-4 py-3 text-left font-medium">Type</th>
              <th className="px-4 py-3 text-right font-medium">CPL</th>
              <th className="px-4 py-3 text-right font-medium">Leads</th>
              <th className="px-4 py-3 text-right font-medium">Closed</th>
              <th className="px-4 py-3 text-right font-medium">Close %</th>
              <th className="px-4 py-3 text-right font-medium">AP</th>
              <th className="px-4 py-3 text-right font-medium">ROI</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_LEAD_VENDORS.map(v => {
              const closeRate = v.leads_30d ? Math.round((v.closed_30d / v.leads_30d) * 100) : 0;
              const spend = v.cost_per_lead_cents * v.leads_30d;
              const r = spend > 0 ? Math.round((v.ap_30d_cents / spend) * 100) : null;
              return (
                <tr key={v.id} className="border-b border-bg-border last:border-0 hover:bg-bg-hover transition-colors">
                  <td className="px-4 py-3 font-medium">{v.name}</td>
                  <td className="px-4 py-3 text-ink-secondary">{v.type}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    {v.cost_per_lead_cents > 0 ? fmtMoney(v.cost_per_lead_cents, { showCents: true }) : "Free"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{fmtNumber(v.leads_30d)}</td>
                  <td className="px-4 py-3 text-right font-mono text-status-green">{fmtNumber(v.closed_30d)}</td>
                  <td className="px-4 py-3 text-right font-mono">{closeRate}%</td>
                  <td className="px-4 py-3 text-right font-mono text-gold">{fmtMoney(v.ap_30d_cents)}</td>
                  <td className="px-4 py-3 text-right font-mono">{r === null ? "∞" : `${r}%`}</td>
                  <td className="px-4 py-3">
                    <span className={v.active ? "pill-green" : "pill-gray"}>
                      {v.active ? "Active" : "Paused"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Recent inbound flow */}
      <div className="bg-bg-card border border-bg-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-bg-border flex items-center justify-between">
          <h3 className="text-sm font-semibold">Recent Lead Flow</h3>
          <button className="btn-ghost text-xs">
            View Pipeline <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bg-panel border-b border-bg-border text-ink-secondary text-xs uppercase tracking-wider">
              <th className="px-4 py-3 text-left font-medium">Lead</th>
              <th className="px-4 py-3 text-left font-medium">Source</th>
              <th className="px-4 py-3 text-left font-medium">Stage</th>
              <th className="px-4 py-3 text-left font-medium">Routed To</th>
              <th className="px-4 py-3 text-right font-medium">Attempts</th>
              <th className="px-4 py-3 text-right font-medium">Est. AP</th>
              <th className="px-4 py-3 text-left font-medium">Last Touch</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_PIPELINE.map(p => (
              <tr key={p.id} className="border-b border-bg-border last:border-0 hover:bg-bg-hover transition-colors">
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3 text-ink-secondary text-xs">{p.source}</td>
                <td className="px-4 py-3"><span className="pill-blue">{p.stage}</span></td>
                <td className="px-4 py-3 text-ink-secondary">{p.agent}</td>
                <td className="px-4 py-3 text-right font-mono">{p.attempts}</td>
                <td className="px-4 py-3 text-right font-mono text-gold">{fmtMoney(p.est_ap_cents)}</td>
                <td className="px-4 py-3 text-ink-secondary">{p.last_touch}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: "green" | "gold" }) {
  const cls = accent === "green" ? "text-status-green" : accent === "gold" ? "text-gold" : "text-ink-primary";
  return (
    <div className="kpi-card">
      <div className="text-[11px] uppercase tracking-wider text-ink-muted font-medium mb-1.5">{label}</div>
      <div className={"text-2xl font-bold " + cls}>{value}</div>
    </div>
  );
}
