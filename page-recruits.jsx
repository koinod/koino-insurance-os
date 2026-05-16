/* page-recruits.jsx — Rookie of the Year Play: simple 4-stage kanban for
   tracking rep candidates through the canonical funnel:
       Applied → Discovery → Onboarding → Licensed.

   Sits alongside the heavier page-recruiting.jsx outreach workbench
   (campaigns + DMs). This is the funnel-of-record for individual rep
   candidates and reads/writes public.recruits directly.

   Drag-to-advance pattern copied from page-pipeline.jsx (kanban view).
   Empty state + "Add recruit" modal included. Manager + owner roles only;
   reps don't recruit. */
(function () {
  const { useState, useEffect, useCallback } = React;

  const STAGES = ["Applied", "Discovery", "Onboarding", "Licensed"];

  function PageRecruits({ role = "manager" }) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [drag, setDrag] = useState(null);
    const [showAdd, setShowAdd] = useState(false);
    const [error, setError] = useState(null);

    const me = (typeof window !== "undefined" && window.me && window.me()) || null;

    const refresh = useCallback(async () => {
      const sb = window.getSupabase && window.getSupabase();
      if (!sb || !me?.agency_id) { setLoading(false); return; }
      try {
        const { data, error } = await sb.from("recruits")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) throw error;
        setRows(data || []);
        setError(null);
      } catch (e) {
        setError(e.message || String(e));
      } finally { setLoading(false); }
    }, [me?.agency_id]);

    useEffect(() => { refresh(); }, [refresh]);

    // Re-fetch when auth/agency context flips in (initial me:loaded after
    // ?demo=1 hydrate, or post-sign-in).
    useEffect(() => {
      const fn = () => refresh();
      window.addEventListener("me:loaded", fn);
      window.addEventListener("data:hydrated", fn);
      return () => {
        window.removeEventListener("me:loaded", fn);
        window.removeEventListener("data:hydrated", fn);
      };
    }, [refresh]);

    const stampForStage = (stage) => {
      const now = new Date().toISOString();
      switch (stage) {
        case "Discovery":  return { discovery_at: now };
        case "Onboarding": return { onboarded_at: now };
        case "Licensed":   return { licensed_at: now };
        default:           return {};
      }
    };

    const moveTo = async (id, stage) => {
      // Optimistic: flip locally first so the card jumps instantly.
      const prev = rows;
      const next = rows.map(r => r.id === id ? { ...r, stage, ...stampForStage(stage) } : r);
      setRows(next);
      window.toast && window.toast(`Moved to ${stage}`, "success");
      const sb = window.getSupabase && window.getSupabase();
      if (!sb) return;
      try {
        const patch = { stage, updated_at: new Date().toISOString(), ...stampForStage(stage) };
        const { error } = await sb.from("recruits").update(patch).eq("id", id);
        if (error) throw error;
      } catch (e) {
        setRows(prev);
        window.toast && window.toast(`Save failed: ${e.message || e}`, "error");
      }
    };

    const addRecruit = async (form) => {
      const sb = window.getSupabase && window.getSupabase();
      if (!sb || !me?.agency_id) {
        window.toast && window.toast("Sign in first to add recruits", "warn");
        return false;
      }
      try {
        const row = {
          agency_id: me.agency_id,
          full_name: form.name.trim(),
          contact_email: form.email.trim() || null,
          contact_phone: form.phone.trim() || null,
          source: form.source.trim() || null,
          stage: "Applied",
          owner_rep_id: me.rep_id || null,
        };
        const { data, error } = await sb.from("recruits").insert(row).select().single();
        if (error) throw error;
        setRows(r => [data, ...r]);
        window.toast && window.toast("Recruit added", "success");
        return true;
      } catch (e) {
        window.toast && window.toast(`Add failed: ${e.message || e}`, "error");
        return false;
      }
    };

    if (loading) {
      return <div className="page-pad"><div className="panel" style={{ padding: 24, fontSize: 12, color: "var(--text-tertiary)" }}>Loading recruits…</div></div>;
    }

    const isEmpty = rows.length === 0;

    return (
      <div className="page-pad">
        <div className="page-h">
          <div>
            <div className="page-title">Recruits</div>
            <div className="page-sub">
              Rookie of the Year Play · Applied → Discovery → Onboarding → Licensed
              {" · "}{rows.length} total
            </div>
          </div>
          <div style={{ marginLeft: "auto" }}>
            <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
              <Icons.Plus size={13}/> Add recruit
            </button>
          </div>
        </div>

        {error && (
          <div className="panel" style={{ padding: 12, marginBottom: 12, fontSize: 12, color: "var(--state-danger)" }}>
            {error}
          </div>
        )}

        {showAdd && <AddRecruitModal onClose={() => setShowAdd(false)} onSubmit={addRecruit}/>}

        {isEmpty ? (
          <div className="panel" style={{ padding: 36, textAlign: "center" }}>
            <Icons.Users size={20} style={{ color: "var(--text-quaternary)" }}/>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8, fontWeight: 500 }}>No recruits yet</div>
            <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4, lineHeight: 1.5, maxWidth: 380, marginLeft: "auto", marginRight: "auto" }}>
              Add your first candidate to start the Rookie of the Year funnel.
              Drag cards left-to-right as they advance from Applied through Licensed.
            </div>
            <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => setShowAdd(true)}>
              <Icons.Plus size={13}/> Add the first recruit
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${STAGES.length}, 1fr)`, gap: 8 }}>
            {STAGES.map(s => {
              const items = rows.filter(r => r.stage === s);
              return (
                <div key={s} className="panel"
                  onDragOver={(e) => { e.preventDefault(); }}
                  onDrop={(e) => { e.preventDefault(); if (drag != null) { moveTo(drag, s); setDrag(null); } }}>
                  <div className="panel-h">
                    <h3>{s}</h3>
                    <span className="meta tabular" style={{ fontFamily: "var(--font-mono)" }}>{items.length}</span>
                  </div>
                  <div style={{ padding: 6, display: "flex", flexDirection: "column", gap: 4, minHeight: 200 }}>
                    {items.map(r => (
                      <div key={r.id}
                        draggable
                        onDragStart={() => setDrag(r.id)}
                        onDragEnd={() => setDrag(null)}
                        style={{
                          background: drag === r.id ? "var(--bg-overlay)" : "var(--bg-raised)",
                          border: "1px solid var(--border-subtle)",
                          borderRadius: "var(--radius-sm)",
                          padding: 8, cursor: "grab",
                          opacity: drag === r.id ? 0.5 : 1,
                        }}>
                        <div style={{ fontSize: 12, fontWeight: 500 }}>{r.full_name || r.name}</div>
                        {(r.contact_email || r.contact_phone || r.email || r.phone) && (
                          <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginTop: 2 }}>
                            {r.contact_email || r.contact_phone || r.email || r.phone}
                          </div>
                        )}
                        {r.source && (
                          <div style={{ fontSize: 10, color: "var(--text-quaternary)", marginTop: 2 }}>
                            via {r.source}
                          </div>
                        )}
                      </div>
                    ))}
                    {items.length === 0 && drag != null && (
                      <div style={{ padding: 10, border: "1px dashed var(--border-strong)", borderRadius: "var(--radius-sm)", color: "var(--text-tertiary)", fontSize: 11, textAlign: "center" }}>
                        Drop to move to {s}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function AddRecruitModal({ onClose, onSubmit }) {
    const [form, setForm] = useState({ name: "", email: "", phone: "", source: "" });
    const [busy, setBusy] = useState(false);
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const submit = async (e) => {
      e && e.preventDefault();
      if (!form.name.trim()) return;
      setBusy(true);
      const ok = await onSubmit(form);
      setBusy(false);
      if (ok) onClose();
    };

    return (
      <Shared.Modal title="Add recruit" width={480} onClose={onClose} actions={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !form.name.trim()} onClick={submit}>
            {busy ? "Adding…" : "Add recruit"}
          </button>
        </>
      }>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Shared.Field label="Full name *">
            <input className="text-input" value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus required/>
          </Shared.Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Shared.Field label="Email">
              <input className="text-input" type="email" value={form.email} onChange={(e) => set("email", e.target.value)}/>
            </Shared.Field>
            <Shared.Field label="Phone">
              <input className="text-input" type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)}/>
            </Shared.Field>
          </div>
          <Shared.Field label="Source">
            <input className="text-input" value={form.source} onChange={(e) => set("source", e.target.value)} placeholder="Referral · IG · LinkedIn · Event…"/>
          </Shared.Field>
        </form>
      </Shared.Modal>
    );
  }

  window.PageRecruits = PageRecruits;
})();
