import PageHeader from "@/components/PageHeader";
import { MOCK_PIPELINE } from "@/lib/mock-data";
import { fmtMoney } from "@/lib/format";
import { Plus, Phone, Mail, MessageSquare } from "lucide-react";
import { PipelineLead } from "@/lib/types";

const STAGES: PipelineLead["stage"][] = ["New", "Contacted", "Qualified", "Quoted", "App Started", "Submitted"];

export default function PipelinePage() {
  const byStage = STAGES.map(s => ({
    stage: s,
    items: MOCK_PIPELINE.filter(p => p.stage === s),
  }));

  return (
    <div className="px-8 py-6">
      <PageHeader
        title="Pipeline"
        subtitle="Top-of-funnel prospects, pre-policy. Move them right."
        actions={
          <button className="btn-primary">
            <Plus className="w-4 h-4" />
            New Lead
          </button>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
        {byStage.map(col => {
          const count = col.items.length;
          const ap = col.items.reduce((s, i) => s + i.est_ap_cents, 0);
          return (
            <div key={col.stage} className="kpi-card">
              <div className="text-[11px] uppercase tracking-wider text-ink-muted font-medium mb-1.5">{col.stage}</div>
              <div className="text-2xl font-bold text-ink-primary">{count}</div>
              <div className="text-xs text-ink-secondary mt-1">{fmtMoney(ap)} pot.</div>
            </div>
          );
        })}
      </div>

      {/* Kanban */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {byStage.map(col => (
          <div key={col.stage} className="bg-bg-panel border border-bg-border rounded-lg p-2 min-h-[400px]">
            <div className="flex items-center justify-between px-2 py-2 mb-1">
              <span className="text-xs uppercase tracking-wider font-semibold text-ink-secondary">{col.stage}</span>
              <span className="text-xs text-ink-muted">{col.items.length}</span>
            </div>
            <div className="space-y-2">
              {col.items.map(p => (
                <div key={p.id} className="bg-bg-card border border-bg-border rounded-md p-3 hover:border-ink-dim transition-colors cursor-pointer">
                  <div className="font-medium text-ink-primary text-sm mb-1">{p.name}</div>
                  <div className="text-[11px] text-ink-secondary mb-2">{p.source}</div>
                  <div className="text-[11px] text-ink-muted mb-2">Agent: {p.agent}</div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-mono text-gold">{fmtMoney(p.est_ap_cents)}</span>
                    <span className="text-ink-muted">{p.attempts} att.</span>
                  </div>
                  <div className="flex items-center gap-1 mt-2 pt-2 border-t border-bg-border">
                    <button className="btn-ghost p-1.5"><Phone className="w-3.5 h-3.5" /></button>
                    <button className="btn-ghost p-1.5"><Mail className="w-3.5 h-3.5" /></button>
                    <button className="btn-ghost p-1.5"><MessageSquare className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))}
              {col.items.length === 0 ? (
                <div className="text-center text-xs text-ink-muted py-8">Empty</div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
