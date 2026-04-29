import { PageHeader } from "@/components/PageHeader";
import { serverSupabase } from "@/lib/supabase";

export default async function CarriersPage() {
  let carriers: { id: string; name: string; active: boolean; notes: string | null }[] = [];
  try {
    const supa = await serverSupabase();
    const { data } = await supa.from("carriers").select("*").order("name");
    carriers = data ?? [];
  } catch {
    carriers = [];
  }

  return (
    <>
      <PageHeader
        title="Carriers"
        subtitle={`${carriers.length} carriers configured`}
        actions={<button type="button" className="btn-primary">+ New Carrier</button>}
      />

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg-elev border-b border-line text-ink-mute text-[11px] uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Carrier</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
              <th className="text-left px-4 py-3 font-semibold">Notes</th>
            </tr>
          </thead>
          <tbody>
            {carriers.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-12 text-center text-ink-dim">
                  No carriers yet. The Supabase migration seeds Transamerica, ETHOS, F&G, Everlast, etc.
                </td>
              </tr>
            )}
            {carriers.map((c) => (
              <tr key={c.id} className="border-b border-line/50 hover:bg-bg-hover/30">
                <td className="px-4 py-3 font-semibold">{c.name}</td>
                <td className="px-4 py-3">
                  <span className={c.active ? "stage-approved" : "stage-lapsed"}>
                    {c.active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3 text-ink-mute text-xs">{c.notes ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
