import { PageHeader } from "@/components/PageHeader";
import { serverSupabase } from "@/lib/supabase";
import { formatDate, stageColor, stageLabel } from "@/lib/format";

interface ClientRow {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  stage: string;
  source: string | null;
  agent_name: string | null;
  received_at: string | null;
  follow_up_at: string | null;
  created_at: string;
  ai_score: number | null;
}

async function loadClients(query: string): Promise<ClientRow[]> {
  try {
    const supa = await serverSupabase();
    let q = supa
      .from("clients")
      .select(`id, full_name, phone, email, stage, source, received_at, follow_up_at, created_at, ai_score, agents ( full_name )`)
      .order("created_at", { ascending: false })
      .limit(200);
    if (query) q = q.ilike("full_name", `%${query}%`);
    const { data } = await q;
    return (data ?? []).map((c: any) => ({
      ...c,
      agent_name: c.agents?.full_name ?? null,
    }));
  } catch {
    return [];
  }
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const query = params.q ?? "";
  const clients = await loadClients(query);

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle={`${clients.length} loaded · search by name`}
        actions={
          <button type="button" className="btn-primary">+ New Client</button>
        }
      />

      {/* Search + filter row */}
      <form className="flex gap-2 mb-4">
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="Search clients..."
          className="flex-1 bg-bg-card border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/50"
        />
        <button type="submit" className="btn-ghost">Search</button>
      </form>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg-elev border-b border-line text-ink-mute text-[11px] uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Name</th>
              <th className="text-left px-4 py-3 font-semibold">Phone</th>
              <th className="text-left px-4 py-3 font-semibold">Email</th>
              <th className="text-left px-4 py-3 font-semibold">Stage</th>
              <th className="text-left px-4 py-3 font-semibold">Source</th>
              <th className="text-left px-4 py-3 font-semibold">AI</th>
              <th className="text-left px-4 py-3 font-semibold">Agent</th>
              <th className="text-left px-4 py-3 font-semibold">Received</th>
              <th className="text-left px-4 py-3 font-semibold">Follow-up</th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-ink-dim">
                  No clients yet. Click <strong>+ New Client</strong> to add the first one — or run the Supabase migration if this is a fresh deploy.
                </td>
              </tr>
            )}
            {clients.map((c) => (
              <tr key={c.id} className="border-b border-line/50 hover:bg-bg-hover/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-semibold">{c.full_name}</div>
                </td>
                <td className="px-4 py-3 text-ink-mute font-mono text-xs">{c.phone ?? "—"}</td>
                <td className="px-4 py-3 text-ink-mute text-xs truncate max-w-[180px]">{c.email ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className={stageColor(c.stage)}>{stageLabel(c.stage)}</span>
                </td>
                <td className="px-4 py-3 text-ink-mute text-xs">{c.source ?? "—"}</td>
                <td className="px-4 py-3">
                  {c.ai_score != null ? (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      c.ai_score >= 7 ? "bg-stage-approved/20 text-stage-approved"
                      : c.ai_score >= 4 ? "bg-accent/20 text-accent"
                      : "bg-bg-hover text-ink-mute"
                    }`}>
                      {c.ai_score}/10
                    </span>
                  ) : (
                    <span className="text-ink-dim text-xs">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-ink-mute text-xs">{c.agent_name ?? "Unassigned"}</td>
                <td className="px-4 py-3 text-ink-mute text-xs">{formatDate(c.received_at)}</td>
                <td className="px-4 py-3 text-ink-mute text-xs">{formatDate(c.follow_up_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
