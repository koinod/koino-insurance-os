import { PageHeader } from "@/components/PageHeader";
import { serverSupabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/format";
import Link from "next/link";

const STAGE_COLUMNS = [
  { key: "new", label: "Application Submitted", accent: "text-stage-new", bar: "bg-stage-new" },
  { key: "underwriting", label: "Underwriting", accent: "text-stage-underwriting", bar: "bg-stage-underwriting" },
  { key: "approved", label: "Approved", accent: "text-stage-approved", bar: "bg-stage-approved" },
] as const;

const TABS = [
  { key: "working", label: "Working" },
  { key: "active", label: "Active Clients" },
  { key: "closed", label: "Closed" },
] as const;

interface PipelineCard {
  id: string;
  client_id: string;
  client_name: string;
  client_phone: string | null;
  source: string | null;
  agent_name: string | null;
  annual_premium: number | null;
  ai_score: number | null;
  client_stage: string;
  pipeline_tab: string;
}

async function loadPipeline(tab: string): Promise<PipelineCard[]> {
  try {
    const supa = await serverSupabase();
    const { data } = await supa
      .from("deals")
      .select(
        `id, client_id, annual_premium, pipeline_tab,
         clients!inner ( full_name, phone, source, stage, ai_score ),
         agents ( full_name )`,
      )
      .eq("pipeline_tab", tab)
      .order("updated_at", { ascending: false });
    return (data ?? []).map((row: any) => ({
      id: row.id,
      client_id: row.client_id,
      client_name: row.clients?.full_name ?? "—",
      client_phone: row.clients?.phone ?? null,
      source: row.clients?.source ?? null,
      agent_name: row.agents?.full_name ?? null,
      annual_premium: row.annual_premium,
      ai_score: row.clients?.ai_score ?? null,
      client_stage: row.clients?.stage ?? "new",
      pipeline_tab: row.pipeline_tab,
    }));
  } catch {
    return [];
  }
}

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const tab = params.tab && TABS.some((t) => t.key === params.tab) ? params.tab : "working";
  const cards = await loadPipeline(tab);

  return (
    <>
      <PageHeader
        title="Pipeline"
        subtitle="Drag deals through stages. AI score on each card flags hot leads."
        actions={<Link href="/clients?new=1" className="btn-primary">+ New Client</Link>}
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-line">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/pipeline?tab=${t.key}`}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
              tab === t.key
                ? "border-accent text-accent"
                : "border-transparent text-ink-mute hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* Kanban columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {STAGE_COLUMNS.map((col) => {
          const colCards = cards.filter((c) => c.client_stage === col.key);
          const colAP = colCards.reduce((s, c) => s + (c.annual_premium ?? 0), 0);
          return (
            <div key={col.key} className="card p-4 min-h-[400px]">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${col.bar}`} />
                  <h3 className={`font-bold text-sm ${col.accent}`}>
                    {col.label}
                  </h3>
                </div>
                <div className="text-xs text-ink-mute">
                  {colCards.length} · {formatCurrency(colAP, { abbreviate: true })}
                </div>
              </div>
              <div className="space-y-2">
                {colCards.length === 0 && (
                  <div className="text-xs text-ink-dim italic py-8 text-center">
                    No deals in this stage
                  </div>
                )}
                {colCards.map((card) => (
                  <Link
                    key={card.id}
                    href={`/deals/${card.id}`}
                    className="block bg-bg-elev border border-line hover:border-accent/40 rounded-lg p-3 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-sm truncate">{card.client_name}</div>
                      {card.ai_score && (
                        <div
                          className={`shrink-0 ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            card.ai_score >= 7
                              ? "bg-stage-approved/20 text-stage-approved"
                              : card.ai_score >= 4
                                ? "bg-accent/20 text-accent"
                                : "bg-bg-hover text-ink-mute"
                          }`}
                        >
                          AI {card.ai_score}/10
                        </div>
                      )}
                    </div>
                    {card.client_phone && (
                      <div className="text-xs text-ink-mute mt-0.5">{card.client_phone}</div>
                    )}
                    <div className="flex items-center justify-between mt-2 text-[11px]">
                      <span className="text-ink-dim">{card.source ?? "—"}</span>
                      <span className="text-ink-mute">
                        {card.agent_name ?? "Unassigned"}
                      </span>
                    </div>
                    {card.annual_premium && (
                      <div className="mt-1 text-xs font-semibold text-accent">
                        {formatCurrency(card.annual_premium)} AP
                      </div>
                    )}
                  </Link>
                ))}
              </div>
              <button
                type="button"
                className="w-full mt-3 text-xs text-ink-dim border border-dashed border-line rounded-lg py-2 hover:bg-bg-hover hover:text-ink-mute transition-colors"
              >
                + Add deal
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-6 text-xs text-ink-dim">
        Tip: cards update in real-time once Supabase + RLS are wired. Server actions for stage moves
        live in <code>src/app/api/deals/[id]/move/route.ts</code> (TODO — wire on day 2).
      </div>
    </>
  );
}
