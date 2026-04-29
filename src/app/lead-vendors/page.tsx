import { PageHeader } from "@/components/PageHeader";
import { serverSupabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/format";

export default async function LeadVendorsPage() {
  let vendors: { id: string; name: string; cost_per_lead: number | null; active: boolean; notes: string | null }[] = [];
  try {
    const supa = await serverSupabase();
    const { data } = await supa.from("lead_vendors").select("*").order("name");
    vendors = data ?? [];
  } catch {
    vendors = [];
  }

  return (
    <>
      <PageHeader
        title="Lead Vendors"
        subtitle={`${vendors.length} sources configured`}
        actions={<button type="button" className="btn-primary">+ New Vendor</button>}
      />

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg-elev border-b border-line text-ink-mute text-[11px] uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Vendor</th>
              <th className="text-right px-4 py-3 font-semibold">Cost / Lead</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
              <th className="text-left px-4 py-3 font-semibold">Notes</th>
            </tr>
          </thead>
          <tbody>
            {vendors.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-ink-dim">
                  No vendors yet. Migration seeds Referral, Life Jacket Vet, FB Lead Form, etc.
                </td>
              </tr>
            )}
            {vendors.map((v) => (
              <tr key={v.id} className="border-b border-line/50 hover:bg-bg-hover/30">
                <td className="px-4 py-3 font-semibold">{v.name}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(v.cost_per_lead)}</td>
                <td className="px-4 py-3">
                  <span className={v.active ? "stage-approved" : "stage-lapsed"}>
                    {v.active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3 text-ink-mute text-xs">{v.notes ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
