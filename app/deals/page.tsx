import PageHeader from "@/components/PageHeader";
import StatusPill from "@/components/StatusPill";
import { MOCK_DEALS, AGENTS } from "@/lib/mock-data";
import { fmtMoney, fmtDate } from "@/lib/format";
import { Plus, ChevronDown, MoreHorizontal } from "lucide-react";

export default function DealsPage() {
  const deals = MOCK_DEALS;

  // KPIs
  const active = deals.filter(d => !["Issued", "Declined", "Lapsed", "Chargeback"].includes(d.status)).length;
  const issuePaid = deals.filter(d => d.status === "Issued").length;
  const totalAP = deals.reduce((s, d) => s + d.ap_cents, 0);
  const totalEstComm = deals.reduce((s, d) => s + d.est_comm_cents, 0);
  const deposits = deals.reduce((s, d) => s + d.deposits_cents, 0);
  const outstanding = deals.reduce((s, d) => s + d.outstanding_cents, 0);

  return (
    <div className="px-8 py-6">
      <PageHeader
        title="Deals"
        subtitle="Log and track every deal from submission to commission paid."
        actions={
          <button className="btn-primary">
            <Plus className="w-4 h-4" />
            New Deal
          </button>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <Kpi label="Active Deals" value={String(active)} />
        <Kpi label="Issue Paid" value={String(issuePaid)} accent="green" />
        <Kpi label="Total AP" value={fmtMoney(totalAP)} />
        <Kpi label="Total Est. Commission" value={fmtMoney(totalEstComm)} accent="green" />
        <Kpi label="Deposits" value={fmtMoney(deposits)} />
        <Kpi label="Outstanding" value={fmtMoney(outstanding)} accent="gold" />
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-1 bg-bg-card border border-bg-border rounded-md p-1">
          {["Day", "Week", "Month", "YTD", "All Time", "Custom"].map((p, i) => (
            <button key={p} className={p === "All Time" ? "filter-pill-active" : "filter-pill border-0 bg-transparent"}>
              {p}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 bg-bg-card border border-bg-border rounded-md p-1 ml-auto">
          {["Entire Team", "My Downline", "My Deals"].map(p => (
            <button key={p} className={p === "My Deals" ? "filter-pill-active" : "filter-pill border-0 bg-transparent"}>
              {p}
            </button>
          ))}
        </div>

        <button className="filter-pill flex items-center gap-1">
          Specific Agent
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Table */}
      <div className="bg-bg-card border border-bg-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg-panel border-b border-bg-border text-ink-secondary text-xs uppercase tracking-wider">
                <Th>Agent</Th>
                <Th>Client</Th>
                <Th>Lead Source</Th>
                <Th>Carrier</Th>
                <Th>Product</Th>
                <Th align="right">AP</Th>
                <Th align="right">Est. Comm.</Th>
                <Th>Status</Th>
                <Th>Policy #</Th>
                <Th>Submitted</Th>
                <Th>Draft Date</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {deals.map(d => (
                <tr key={d.id} className="border-b border-bg-border last:border-0 hover:bg-bg-hover transition-colors">
                  <Td>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-blue to-brand-blueHover flex items-center justify-center text-[10px] font-bold text-white">
                        {d.agent_initials}
                      </div>
                      <span>{d.agent}</span>
                    </div>
                  </Td>
                  <Td className="font-medium text-ink-primary">{d.client}</Td>
                  <Td className="text-ink-secondary text-xs">{d.lead_source}</Td>
                  <Td>{d.carrier}</Td>
                  <Td>{d.product}</Td>
                  <Td align="right" className="font-mono">{fmtMoney(d.ap_cents)}</Td>
                  <Td align="right" className="font-mono text-status-green">{fmtMoney(d.est_comm_cents)}</Td>
                  <Td><StatusPill status={d.status} /></Td>
                  <Td className="font-mono text-xs text-ink-secondary">{d.policy_number ?? "—"}</Td>
                  <Td className="text-ink-secondary">{fmtDate(d.submitted_at)}</Td>
                  <Td className="text-ink-secondary">{fmtDate(d.draft_date)}</Td>
                  <Td>
                    <button className="p-1 rounded hover:bg-bg-hover text-ink-muted hover:text-ink-primary">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: "green" | "gold" }) {
  const valueCls =
    accent === "green" ? "text-status-green" : accent === "gold" ? "text-gold" : "text-ink-primary";
  return (
    <div className="kpi-card">
      <div className="text-[11px] uppercase tracking-wider text-ink-muted font-medium mb-1.5">{label}</div>
      <div className={"text-2xl font-bold " + valueCls}>{value}</div>
    </div>
  );
}

function Th({ children, align = "left" }: { children?: React.ReactNode; align?: "left" | "right" }) {
  return <th className={"px-4 py-3 font-medium " + (align === "right" ? "text-right" : "text-left")}>{children}</th>;
}
function Td({
  children,
  align = "left",
  className = "",
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return <td className={"px-4 py-3 " + (align === "right" ? "text-right " : "") + className}>{children}</td>;
}
