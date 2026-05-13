/* page-leaddrip.jsx — Lead Drip: sequences · outbox · rules · vendors · messaging
   Sources: AppData.SEQUENCES, SEQUENCE_ENROLLMENTS, FOLLOWUP_TEMPLATES,
            FOLLOWUP_RULES, VENDOR_WEBHOOKS; sms_outbox queried directly. */

const _DRIP_SECTION_ITEMS = [
  {k:"team",l:"Floor"},{k:"coaching",l:"Coaching"},{k:"nigo",l:"NIGO Queue"},
  {k:"recruiting",l:"Recruiting"},{k:"queue",l:"Dispatch"},
  {k:"downline",l:"Tree"},{k:"leaddrip",l:"Lead Drip"},
];

function useDripReady() {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const fn = () => force(n => n + 1);
    window.addEventListener("me:loaded",    fn);
    window.addEventListener("data:hydrated", fn);
    window.addEventListener("data:mutated",  fn);
    window.addEventListener("data:realtime", fn);
    return () => {
      window.removeEventListener("me:loaded",    fn);
      window.removeEventListener("data:hydrated", fn);
      window.removeEventListener("data:mutated",  fn);
      window.removeEventListener("data:realtime", fn);
    };
  }, []);
}

/* ─── SMS outbox hook ─────────────────────────────────────────────────── */
function useSmsOutbox() {
  const [outbox, setOutbox] = React.useState(null);
  React.useEffect(() => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb || !AppData.LIVE) { setOutbox([]); return; }
    const agencyId = window.getActiveAgencyId && window.getActiveAgencyId();
    let q = sb.from("sms_outbox")
      .select("id, to_number, body, status, created_at, rep_id, source, related_lead_id")
      .order("created_at", { ascending: false })
      .limit(200);
    if (agencyId) q = q.eq("agency_id", agencyId);
    q.then(({ data }) => setOutbox(Array.isArray(data) ? data : []))
     .catch(() => setOutbox([]));
  }, []);
  return outbox;
}

/* ─── Vendor webhooks hook ────────────────────────────────────────────── */
function useVendorWebhooks() {
  const [vendors, setVendors] = React.useState(null);
  const reload = React.useCallback(() => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) { setVendors(AppData.VENDOR_WEBHOOKS || []); return; }
    const agencyId = window.getActiveAgencyId && window.getActiveAgencyId();
    let q = sb.from("lead_vendor_webhooks")
      .select("id, vendor_name, endpoint_slug, hmac_secret, is_active, cost_per_lead_cents, notes, created_at")
      .order("created_at", { ascending: true });
    if (agencyId) q = q.eq("agency_id", agencyId);
    q.then(({ data }) => setVendors(Array.isArray(data) ? data : []))
     .catch(() => setVendors(AppData.VENDOR_WEBHOOKS || []));
  }, []);
  React.useEffect(() => { reload(); }, []);
  return [vendors, reload];
}

/* ─── Vendor spend hook ───────────────────────────────────────────────── */
function useVendorSpend() {
  const [spend, setSpend] = React.useState({});
  React.useEffect(() => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb || !AppData.LIVE) return;
    const agencyId = window.getActiveAgencyId && window.getActiveAgencyId();
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
    let q = sb.from("agency_expenses")
      .select("vendor, amount_cents")
      .eq("kind", "lead_spend")
      .gte("paid_at", monthStart.toISOString().slice(0, 10));
    if (agencyId) q = q.eq("agency_id", agencyId);
    q.then(({ data }) => {
      if (!Array.isArray(data)) return;
      const m = {};
      data.forEach(r => {
        if (!r.vendor) return;
        if (!m[r.vendor]) m[r.vendor] = { cents: 0, count: 0 };
        m[r.vendor].cents += r.amount_cents || 0;
        m[r.vendor].count += 1;
      });
      setSpend(m);
    }).catch(() => {});
  }, []);
  return spend;
}

const _STATUS_COLOR = {
  queued: "var(--text-tertiary)", pending: "var(--text-tertiary)",
  sent:   "var(--accent-money)", claimed: "var(--accent-status)",
  failed: "var(--state-danger)", expired: "var(--state-warning)",
};

function _enrollRate(enrollments, seqId) {
  const e = enrollments.filter(x => x.sequenceId === seqId);
  if (!e.length) return null;
  return Math.round((e.filter(x => x.status === "completed").length / e.length) * 100);
}

function _fmtCents(c) {
  const d = Math.round((c || 0) / 100);
  return d >= 1000 ? `$${(d/1000).toFixed(1)}k` : `$${d}`;
}

/* ─── New sequence modal ──────────────────────────────────────────────── */
function NewSeqModal({ onClose, onCreated }) {
  const [name, setName]               = React.useState("");
  const [firstTemplate, setFirst]     = React.useState("");
  const [cadenceDays, setCadence]     = React.useState("2");
  const [steps, setSteps]             = React.useState("5");
  const [saving, setSaving]           = React.useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const sb = window.getSupabase && window.getSupabase();
    const numSteps = Math.max(1, Math.min(10, parseInt(steps) || 5));
    const cadence  = Math.max(1, parseInt(cadenceDays) || 2);
    const builtSteps = Array.from({ length: numSteps }, (_, i) => ({
      day: i * cadence,
      ch:  "SMS",
      template: i === 0 ? (firstTemplate.trim() || "Hi {{first}}, following up — {{rep}}") : `Follow-up #${i + 1} for {{first}}`,
    }));
    try {
      if (sb && AppData.LIVE) {
        const { data } = await sb.from("sequences")
          .insert({ id: "seq_" + Date.now().toString(36), name: name.trim(), steps: builtSteps, is_active: true })
          .select().single();
        if (data) onCreated && onCreated(data.id);
      } else {
        onCreated && onCreated(null);
      }
      window.toast && window.toast(`Sequence "${name.trim()}" created`, "success");
      onClose();
    } catch (_e) { setSaving(false); }
  };

  return (
    <Shared.Modal title="New sequence" width={520} onClose={onClose} actions={
      <>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={!name.trim() || saving}>
          <Icons.Check size={11}/> {saving ? "Creating…" : "Create"}
        </button>
      </>
    }>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Shared.Field label="Sequence name">
          <input className="text-input" autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Quote follow-up · Med Supp"/>
        </Shared.Field>
        <Shared.Field label="First SMS body">
          <textarea className="text-input" rows={3} value={firstTemplate} onChange={e => setFirst(e.target.value)} placeholder="Hi {{first}}, this is {{rep}} — just sent over your quote. Any questions?"/>
        </Shared.Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Shared.Field label="Steps">
            <input className="text-input" type="number" min={1} max={10} value={steps} onChange={e => setSteps(e.target.value)}/>
          </Shared.Field>
          <Shared.Field label="Cadence (days between steps)">
            <input className="text-input" type="number" min={1} max={30} value={cadenceDays} onChange={e => setCadence(e.target.value)}/>
          </Shared.Field>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
          Will create {Math.max(1, parseInt(steps) || 5)} SMS steps every {Math.max(1, parseInt(cadenceDays) || 2)} day(s). Edit step bodies after creation.
        </div>
      </div>
    </Shared.Modal>
  );
}

/* ─── Enroll lead modal ──────────────────────────────────────────────── */
function EnrollModal({ seqId, sequences, onClose }) {
  const [leadId, setLeadId] = React.useState("");
  const [seqSel, setSeqSel] = React.useState(seqId || (sequences[0]?.id || ""));
  const [saving, setSaving] = React.useState(false);
  const leads   = AppData.PIPELINE || [];
  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;

  const enroll = async () => {
    if (!leadId || !seqSel) return;
    setSaving(true);
    try {
      const sb = window.getSupabase && window.getSupabase();
      if (sb && AppData.LIVE) {
        await sb.from("sequence_enrollments").insert({
          lead_pipeline_id: leadId,
          sequence_id:      seqSel,
          owner_rep_id:     meIdent?.rep_id || null,
          status:           "active",
          current_step:     0,
          enrolled_at:      new Date().toISOString(),
          next_step_at:     new Date().toISOString(), // fire immediately on first run
        });
      }
      const leadName = leads.find(l => l.id === leadId)?.lead || "Lead";
      window.toast && window.toast(`${leadName} enrolled in sequence`, "success");
      onClose();
    } catch (_e) { setSaving(false); }
  };

  return (
    <Shared.Modal title="Enroll lead in sequence" width={480} onClose={onClose} actions={
      <>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={enroll} disabled={!leadId || !seqSel || saving}>
          <Icons.Check size={11}/> {saving ? "Enrolling…" : "Enroll"}
        </button>
      </>
    }>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Shared.Field label="Lead">
          <Shared.Select value={leadId} onChange={setLeadId}
            options={[{ v: "", l: "— pick a lead —" }, ...leads.map(l => ({ v: l.id, l: `${l.lead} · ${l.stage} · ${l.product || "—"}` }))]}/>
        </Shared.Field>
        <Shared.Field label="Sequence">
          <Shared.Select value={seqSel} onChange={setSeqSel}
            options={sequences.map(s => ({ v: s.id, l: s.name }))}/>
        </Shared.Field>
      </div>
    </Shared.Modal>
  );
}

/* ─── Sequence step detail panel ──────────────────────────────────────── */
function SeqDetail({ seq, enrollments, onEnroll }) {
  const enrolled = enrollments.filter(e => e.sequenceId === seq.id);
  const active   = enrolled.filter(e => e.status === "active").length;
  const done     = enrolled.filter(e => e.status === "completed").length;
  const rate     = enrolled.length ? Math.round((done / enrolled.length) * 100) : null;
  const steps    = Array.isArray(seq.steps) ? seq.steps : [];

  return (
    <div className="panel" style={{ flex: 1 }}>
      <div className="panel-h">
        <Icons.Activity size={13}/>
        <h3>{seq.name}</h3>
        {!seq.active && <span className="chip" style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>inactive</span>}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={onEnroll}><Icons.Plus size={11}/> Enroll lead</button>
        </div>
      </div>

      <div style={{ padding: "8px 14px 0", display: "flex", gap: 14, fontSize: 12, color: "var(--text-tertiary)", borderBottom: "1px solid var(--border-subtle)", paddingBottom: 10 }}>
        <span>Active: <strong style={{ color: "var(--text-primary)" }}>{active}</strong></span>
        <span>Completed: <strong style={{ color: "var(--text-primary)" }}>{done}</strong></span>
        {rate !== null && <span>Conv: <strong style={{ color: "var(--accent-money)" }}>{rate}%</strong></span>}
        <span>Steps: <strong style={{ color: "var(--text-primary)" }}>{steps.length}</strong></span>
      </div>

      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
        {steps.length === 0 && (
          <div style={{ padding: 20, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
            No steps defined. Edit the sequence to add steps.
          </div>
        )}
        {steps.map((step, i) => (
          <div key={i} style={{ padding: 12, background: "var(--bg-raised)", borderRadius: 7, border: "1px solid var(--border-subtle)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--accent-money)", background: "color-mix(in oklch, var(--accent-money) 10%, transparent)", padding: "1px 6px", borderRadius: 4 }}>
                Day {step.day ?? i}
              </span>
              <span className="chip" style={{ fontSize: 10.5 }}>{step.ch || step.channel || "SMS"}</span>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.5, fontFamily: "var(--font-mono)" }}>
              {step.template || step.body || "—"}
            </div>
          </div>
        ))}

        {enrolled.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 8 }}>Active enrollments</div>
            {enrolled.slice(0, 8).map(e => {
              const lead = (AppData.PIPELINE || []).find(p => p.id === e.leadId);
              return (
                <div key={e.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "5px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                  <span style={{ fontWeight: 500 }}>{lead?.lead || e.leadId || "Lead"}</span>
                  <span style={{ color: "var(--text-tertiary)" }}>step {e.currentStep + 1} · {e.status}</span>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Add / Edit vendor modal ────────────────────────────────────────── */
function VendorModal({ vendor, onClose, onSaved }) {
  const isEdit = !!vendor;
  const [name,    setName]    = React.useState(vendor?.vendor_name || "");
  const [cost,    setCost]    = React.useState(vendor ? String(Math.round((vendor.cost_per_lead_cents || 0) / 100)) : "");
  const [notes,   setNotes]   = React.useState(vendor?.notes || "");
  const [active,  setActive]  = React.useState(vendor ? vendor.is_active : false);
  const [secret,  setSecret]  = React.useState(vendor?.hmac_secret || _genSecret());
  const [saving,  setSaving]  = React.useState(false);

  function _genSecret() {
    const arr = new Uint8Array(24);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
  }

  const agencyId = window.getActiveAgencyId && window.getActiveAgencyId();
  const slug = vendor?.endpoint_slug || (agencyId
    ? agencyId.slice(0, 8) + "-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 20)
    : "new-vendor");

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const sb = window.getSupabase && window.getSupabase();
    const row = {
      vendor_name:         name.trim(),
      hmac_secret:         secret,
      is_active:           active,
      cost_per_lead_cents: Math.round(parseFloat(cost || "0") * 100),
      notes:               notes.trim() || null,
      updated_at:          new Date().toISOString(),
    };
    try {
      if (sb && AppData.LIVE) {
        if (isEdit) {
          await sb.from("lead_vendor_webhooks").update(row).eq("id", vendor.id);
        } else {
          await sb.from("lead_vendor_webhooks").insert({
            ...row,
            agency_id:      agencyId,
            endpoint_slug:  slug,
          });
        }
      }
      window.toast && window.toast(`Vendor ${isEdit ? "updated" : "created"}`, "success");
      onSaved && onSaved();
      onClose();
    } catch (e) {
      window.toast && window.toast("Save failed: " + e.message, "error");
      setSaving(false);
    }
  };

  return (
    <Shared.Modal title={isEdit ? `Edit · ${vendor.vendor_name}` : "Add vendor webhook"} width={560} onClose={onClose} actions={
      <>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={!name.trim() || saving}>
          <Icons.Check size={11}/> {saving ? "Saving…" : (isEdit ? "Save changes" : "Add vendor")}
        </button>
      </>
    }>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Shared.Field label="Vendor name">
          <input className="text-input" autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Hometown Quotes"/>
        </Shared.Field>
        <Shared.Field label="HMAC secret (share with vendor)">
          <div style={{ display: "flex", gap: 6 }}>
            <input className="text-input" style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 11.5 }}
              value={secret} onChange={e => setSecret(e.target.value)} placeholder="Paste or generate"/>
            <button className="btn btn-ghost" style={{ fontSize: 11, whiteSpace: "nowrap" }}
              onClick={() => setSecret(_genSecret())}>
              <Icons.Refresh size={11}/> Rotate
            </button>
            <button className="btn btn-ghost" style={{ fontSize: 11 }}
              onClick={() => { navigator.clipboard?.writeText(secret); window.toast && window.toast("Secret copied", "info"); }}>
              <Icons.Copy size={11}/>
            </button>
          </div>
          <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginTop: 4 }}>
            Vendor sends: <code>x-webhook-signature: sha256=HMAC(body, secret)</code>
          </div>
        </Shared.Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Shared.Field label="Cost per lead ($)">
            <input className="text-input" type="number" step="0.01" min={0} value={cost} onChange={e => setCost(e.target.value)} placeholder="18.00"/>
          </Shared.Field>
          <Shared.Field label="Status">
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0" }}>
              <input type="checkbox" id="vend-active" checked={active} onChange={e => setActive(e.target.checked)}/>
              <label htmlFor="vend-active" style={{ fontSize: 12.5, cursor: "pointer" }}>Active (accept leads)</label>
            </div>
          </Shared.Field>
        </div>
        <Shared.Field label="Notes">
          <input className="text-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Lead type, volume tier, special routing…"/>
        </Shared.Field>
        {!isEdit && (
          <div style={{ padding: 10, background: "var(--bg-raised)", borderRadius: 6, fontSize: 11.5 }}>
            <span style={{ color: "var(--text-tertiary)" }}>Endpoint URL: </span>
            <code style={{ color: "var(--accent-money)", wordBreak: "break-all" }}>
              {typeof window !== "undefined" ? window.location.origin : ""}/api/leads/vendor-webhook?slug={slug}
            </code>
          </div>
        )}
      </div>
    </Shared.Modal>
  );
}

/* ─── Vendors tab ──────────────────────────────────────────────────────── */
function VendorsTab() {
  const [vendors, reloadVendors] = useVendorWebhooks();
  const spend  = useVendorSpend();
  const [addOpen,  setAddOpen]  = React.useState(false);
  const [editVend, setEditVend] = React.useState(null);
  const [testing,  setTesting]  = React.useState(null);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  const copyUrl = (v) => {
    const url = `${baseUrl}/api/leads/vendor-webhook?slug=${v.endpoint_slug}`;
    navigator.clipboard?.writeText(url);
    window.toast && window.toast("Webhook URL copied", "info");
  };

  const testWebhook = async (v) => {
    setTesting(v.id);
    try {
      const url = `${baseUrl}/api/leads/vendor-webhook?slug=${encodeURIComponent(v.endpoint_slug)}`;
      const r = await fetch(url, { method: "GET" });
      const data = await r.json();
      window.toast && window.toast(r.ok ? `${v.vendor_name}: alive ✓` : `${v.vendor_name}: ${data.error}`, r.ok ? "success" : "error");
    } catch (e) {
      window.toast && window.toast(`Test failed: ${e.message}`, "error");
    } finally {
      setTesting(null);
    }
  };

  const toggleActive = async (v) => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb || !AppData.LIVE) return;
    await sb.from("lead_vendor_webhooks").update({ is_active: !v.is_active, updated_at: new Date().toISOString() }).eq("id", v.id);
    window.toast && window.toast(v.is_active ? "Vendor paused" : "Vendor activated", "info");
    reloadVendors();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Vendor list */}
      <div className="panel">
        <div className="panel-h">
          <Icons.Globe size={13}/>
          <h3>Vendor webhooks</h3>
          <span className="meta">{vendors?.length ?? "…"}</span>
          <div style={{ marginLeft: "auto" }}>
            <button className="btn btn-primary" onClick={() => setAddOpen(true)}><Icons.Plus size={12}/> Add vendor</button>
          </div>
        </div>
        {vendors === null && <div style={{ padding: 20, color: "var(--text-tertiary)", fontSize: 12 }}>Loading…</div>}
        {vendors && vendors.length === 0 && (
          <div style={{ padding: 28, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>
            No vendors configured. Add Hometown Quotes, EverQuote, or any custom vendor above.
          </div>
        )}
        {vendors && vendors.length > 0 && (
          <div className="list">
            <div className="list-h" style={{ gridTemplateColumns: "160px 1fr 90px 80px 110px 120px" }}>
              <div>Vendor</div><div>Webhook URL</div><div>Status</div><div>Cost/lead</div><div>MTD spend</div><div>Actions</div>
            </div>
            {vendors.map(v => {
              const url     = `${baseUrl}/api/leads/vendor-webhook?slug=${v.endpoint_slug}`;
              const vSpend  = spend[v.vendor_name] || { cents: 0, count: 0 };
              const cpl     = vSpend.count ? Math.round(vSpend.cents / vSpend.count) : v.cost_per_lead_cents;
              return (
                <div key={v.id} className="row" style={{ gridTemplateColumns: "160px 1fr 90px 80px 110px 120px" }}>
                  <div style={{ fontWeight: 500, fontSize: 12.5 }}>{v.vendor_name}</div>
                  <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    …/vendor-webhook?slug={v.endpoint_slug}
                  </div>
                  <div>
                    <span className="chip" style={{ fontSize: 10.5, color: v.is_active ? "var(--accent-money)" : "var(--text-tertiary)" }}>
                      {v.is_active ? "active" : "paused"}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    {_fmtCents(v.cost_per_lead_cents)}
                  </div>
                  <div style={{ fontSize: 12 }}>
                    <span style={{ color: "var(--accent-money)", fontWeight: 500 }}>{_fmtCents(vSpend.cents)}</span>
                    {vSpend.count > 0 && <span style={{ color: "var(--text-tertiary)", fontSize: 10.5, marginLeft: 4 }}>{vSpend.count} leads</span>}
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button className="btn btn-ghost" style={{ fontSize: 10.5, padding: "3px 7px" }}
                      onClick={() => copyUrl(v)} title="Copy URL">
                      <Icons.Copy size={10}/>
                    </button>
                    <button className="btn btn-ghost" style={{ fontSize: 10.5, padding: "3px 7px" }}
                      onClick={() => testWebhook(v)} disabled={testing === v.id} title="GET test">
                      {testing === v.id ? "…" : <Icons.Play size={10}/>}
                    </button>
                    <button className="btn btn-ghost" style={{ fontSize: 10.5, padding: "3px 7px" }}
                      onClick={() => toggleActive(v)} title={v.is_active ? "Pause" : "Activate"}>
                      {v.is_active ? <Icons.Pause size={10}/> : <Icons.Play size={10}/>}
                    </button>
                    <button className="btn btn-ghost" style={{ fontSize: 10.5, padding: "3px 7px" }}
                      onClick={() => setEditVend(v)} title="Edit">
                      <Icons.Edit size={10}/>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* How-to integration note */}
      <div className="panel" style={{ padding: 14 }}>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.7 }}>
          <strong>Integration guide:</strong> Share the webhook URL + HMAC secret with your vendor.
          Vendor sends <code>POST</code> with JSON lead payload and <code>x-webhook-signature: sha256=&lt;hex&gt;</code> header.
          Supported fields: <code>lead_name</code>, <code>phone</code>, <code>email</code>, <code>age</code>, <code>state</code>, <code>product</code>.
          Lead lands in Pipeline (stage New · heat fresh) and Floor auto-refreshes via realtime.
        </div>
      </div>

      {addOpen  && <VendorModal onClose={() => setAddOpen(false)} onSaved={reloadVendors}/>}
      {editVend && <VendorModal vendor={editVend} onClose={() => setEditVend(null)} onSaved={reloadVendors}/>}
    </div>
  );
}

/* ─── Messaging tab ────────────────────────────────────────────────────── */
function MessagingTab({ outbox }) {
  const [selPhone, setSelPhone] = React.useState(null);
  const [composer, setComposer] = React.useState("");
  const [sending,  setSending]  = React.useState(false);
  const streamRef = React.useRef(null);

  const messages = Array.isArray(outbox) ? outbox : [];

  // Group by to_number → thread list
  const threads = React.useMemo(() => {
    const map = {};
    messages.forEach(m => {
      if (!m.to_number) return;
      if (!map[m.to_number]) map[m.to_number] = [];
      map[m.to_number].push(m);
    });
    return Object.entries(map)
      .map(([phone, msgs]) => ({
        phone,
        msgs: msgs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
        last: msgs.reduce((best, m) => new Date(m.created_at) > new Date(best.created_at) ? m : best),
      }))
      .sort((a, b) => new Date(b.last.created_at) - new Date(a.last.created_at));
  }, [messages]);

  const activeThread = threads.find(t => t.phone === selPhone) || threads[0] || null;
  const activePhone  = activeThread?.phone || null;

  React.useEffect(() => {
    if (!selPhone && threads.length) setSelPhone(threads[0].phone);
  }, [threads.length]);

  React.useEffect(() => {
    if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
  }, [activePhone, activeThread?.msgs.length]);

  const fmtTime = iso => {
    if (!iso) return "";
    const d = new Date(iso), now = Date.now(), m = Math.round((now - d) / 60000);
    if (m < 1)    return "now";
    if (m < 60)   return `${m}m`;
    if (m < 1440) return `${Math.round(m / 60)}h`;
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const resolveLeadName = phone => {
    const lead = (AppData.PIPELINE || []).find(l => l.phone === phone);
    return lead?.lead || null;
  };

  const sendReply = async () => {
    if (!composer.trim() || !activePhone) return;
    setSending(true);
    try {
      const sb = window.getSupabase && window.getSupabase();
      const agencyId = window.getActiveAgencyId && window.getActiveAgencyId();
      const meIdent  = window.me && window.me();
      if (sb && AppData.LIVE && agencyId) {
        await sb.from("sms_outbox").insert({
          agency_id:  agencyId,
          rep_id:     meIdent?.rep_id || null,
          to_number:  activePhone,
          body:       composer.trim(),
          status:     "pending",
          source:     "manual",
        });
        window.toast && window.toast("Message queued", "success");
      } else {
        window.toast && window.toast("Not connected — message not sent", "error");
      }
      setComposer("");
    } catch (e) {
      window.toast && window.toast("Send failed: " + e.message, "error");
    } finally {
      setSending(false);
    }
  };

  if (messages.length === 0) {
    return (
      <div className="panel" style={{ padding: 40, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>
        No SMS messages yet. Messages appear here once sequences or follow-ups fire, or when leads reply.
      </div>
    );
  }

  return (
    <div className="panel" style={{ display: "grid", gridTemplateColumns: "240px 1fr", height: "calc(100vh - 280px)", overflow: "hidden", padding: 0 }}>
      {/* Thread list */}
      <div style={{ borderRight: "1px solid var(--border-subtle)", overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "9px 12px", borderBottom: "1px solid var(--border-subtle)", fontSize: 10.5, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          SMS threads · {threads.length}
        </div>
        {threads.map(t => {
          const name    = resolveLeadName(t.phone);
          const active  = t.phone === activePhone;
          return (
            <div key={t.phone} onClick={() => setSelPhone(t.phone)} style={{
              padding: "10px 12px", cursor: "pointer", borderBottom: "1px solid var(--border-subtle)",
              background: active ? "var(--bg-raised)" : "transparent",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Icons.MessageSquare size={11} style={{ color: "var(--text-tertiary)", flexShrink: 0 }}/>
                <span style={{ fontSize: 12.5, fontWeight: 500, flex: 1, minWidth: 0 }} className="cell-truncate">
                  {name || t.phone}
                </span>
                <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", flexShrink: 0 }}>{fmtTime(t.last.created_at)}</span>
              </div>
              <div style={{ marginTop: 2, fontSize: 11, color: "var(--text-tertiary)" }} className="cell-truncate">
                {t.last.body}
              </div>
            </div>
          );
        })}
      </div>

      {/* Active thread */}
      {!activeThread ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>
          Select a conversation.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: 8 }}>
            <Icons.Phone size={13} style={{ color: "var(--text-secondary)" }}/>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {resolveLeadName(activePhone) || activePhone}
              </div>
              <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>
                {activePhone} · {activeThread.msgs.length} messages
              </div>
            </div>
            {/* Sequence enrollment badge */}
            {(() => {
              const lead = (AppData.PIPELINE || []).find(l => l.phone === activePhone);
              const enroll = lead && (AppData.SEQUENCE_ENROLLMENTS || []).find(e => e.leadId === lead.id && e.status === "active");
              const seq    = enroll && (AppData.SEQUENCES || []).find(s => s.id === enroll.sequenceId);
              return seq ? (
                <span className="chip" style={{ fontSize: 10.5, marginLeft: "auto", color: "var(--accent-money)" }}>
                  <Icons.Activity size={10}/> {seq.name} · step {(enroll.currentStep || 0) + 1}
                </span>
              ) : null;
            })()}
          </div>

          <div ref={streamRef} style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            {activeThread.msgs.map(m => (
              <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginBottom: 2, paddingRight: 4 }}>
                  {m.source || "outbound"} · {fmtTime(m.created_at)}
                </div>
                <div style={{
                  padding: "7px 11px", borderRadius: 12, maxWidth: "80%", fontSize: 12.5,
                  lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word",
                  background: "var(--accent-money)", color: "white",
                  borderTopRightRadius: 4,
                }}>
                  {m.body}
                </div>
                <div style={{ fontSize: 10, color: _STATUS_COLOR[m.status] || "var(--text-tertiary)", marginTop: 2, paddingRight: 4 }}>
                  {m.status}
                </div>
              </div>
            ))}
          </div>

          <div style={{ borderTop: "1px solid var(--border-subtle)", padding: 10, display: "flex", gap: 8 }}>
            <textarea className="text-input" rows={1} value={composer}
              onChange={e => setComposer(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
              placeholder="Reply · Enter to queue · Shift+Enter for newline"
              style={{ flex: 1, resize: "none", minHeight: 36 }}
            />
            <button className="btn btn-primary" disabled={!composer.trim() || sending} onClick={sendReply}>
              {sending ? "…" : <Icons.Send size={11}/>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Main page ───────────────────────────────────────────────────────── */
function PageLeadDrip({ role = "owner" }) {
  useDripReady();
  const outbox = useSmsOutbox();
  const [inner,    setInner]    = React.useState("sequences");
  const [seqSel,   setSeqSel]   = React.useState(null);
  const [newOpen,  setNewOpen]  = React.useState(false);
  const [enrollFor, setEnrollFor] = React.useState(null);

  const sequences   = AppData.SEQUENCES           || [];
  const enrollments = AppData.SEQUENCE_ENROLLMENTS || [];
  const templates   = AppData.FOLLOWUP_TEMPLATES  || [];
  const rules       = AppData.FOLLOWUP_RULES       || [];

  const activeSeq = sequences.find(s => s.id === seqSel) || sequences[0] || null;

  // role==="owner": full vendor admin tab. role==="manager": vendors hidden.
  const innerTabs = [
    { k: "sequences", l: "Sequences" },
    { k: "outbox",    l: `Outbox${outbox?.length ? ` (${outbox.length})` : ""}` },
    { k: "rules",     l: "Rules" },
    ...(role === "owner" ? [{ k: "vendors", l: "Vendors" }] : []),
    { k: "messaging", l: "Messaging" },
  ];

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Lead Drip</div>
          <div className="page-sub">Sequences · outbox · rules · vendor webhooks · messaging</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {inner === "sequences" && (
            <>
              <button className="btn" onClick={() => setEnrollFor("any")}><Icons.Plus size={12}/> Enroll lead</button>
              <button className="btn btn-primary" onClick={() => setNewOpen(true)}><Icons.Plus size={12}/> New sequence</button>
            </>
          )}
        </div>
      </div>

      <Shared.SectionPill
        items={_DRIP_SECTION_ITEMS}
        value="leaddrip"
        onChange={k => window.dispatchEvent(new CustomEvent("nav:goto", { detail: { page: k } }))}
      />

      {/* Inner tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 14, marginTop: 4, borderBottom: "1px solid var(--border-subtle)" }}>
        {innerTabs.map(t => (
          <button
            key={t.k}
            onClick={() => setInner(t.k)}
            style={{
              padding: "6px 14px", fontSize: 12.5, background: "none", border: "none",
              borderBottom: inner === t.k ? "2px solid var(--accent-money)" : "2px solid transparent",
              color: inner === t.k ? "var(--text-primary)" : "var(--text-tertiary)",
              cursor: "pointer", fontWeight: inner === t.k ? 600 : 400,
            }}
          >
            {t.l}
          </button>
        ))}
      </div>

      {/* ── Sequences tab ── */}
      {inner === "sequences" && (
        <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 14 }}>
          <div className="panel" style={{ alignSelf: "start" }}>
            <div className="panel-h"><Icons.Activity size={13}/><h3>Sequences</h3><span className="meta">{sequences.length}</span></div>
            <div style={{ padding: "4px 0" }}>
              {sequences.length === 0 && (
                <div style={{ padding: 20, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>
                  No sequences yet. Create your first one →
                </div>
              )}
              {sequences.map(s => {
                const rate = _enrollRate(enrollments, s.id);
                const cnt  = enrollments.filter(e => e.sequenceId === s.id).length;
                return (
                  <div key={s.id}
                    onClick={() => setSeqSel(s.id)}
                    style={{
                      padding: "10px 14px", cursor: "pointer",
                      borderLeft: s.id === (activeSeq?.id) ? "3px solid var(--accent-money)" : "3px solid transparent",
                      background: s.id === (activeSeq?.id) ? "var(--bg-raised)" : "transparent",
                      borderBottom: "1px solid var(--border-subtle)",
                    }}
                  >
                    <div style={{ fontSize: 12.5, fontWeight: 500 }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 3, display: "flex", gap: 8 }}>
                      <span>{cnt} enrolled</span>
                      {rate !== null && <span style={{ color: "var(--accent-money)" }}>{rate}% conv</span>}
                      {!s.active && <span style={{ color: "var(--state-warning)" }}>inactive</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {activeSeq
            ? <SeqDetail seq={activeSeq} enrollments={enrollments} onEnroll={() => setEnrollFor(activeSeq.id)}/>
            : (
              <div className="panel" style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>
                Select a sequence or <button className="btn btn-primary" style={{ marginLeft: 6 }} onClick={() => setNewOpen(true)}>create one</button>
              </div>
            )
          }
        </div>
      )}

      {/* ── Outbox tab ── */}
      {inner === "outbox" && (
        <div className="panel">
          <div className="panel-h"><Icons.Send size={13}/><h3>SMS outbox</h3><span className="meta">{outbox?.length ?? "…"}</span></div>
          {outbox === null && <div style={{ padding: 20, color: "var(--text-tertiary)", fontSize: 12 }}>Loading…</div>}
          {outbox && outbox.length === 0 && (
            <div style={{ padding: 28, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>
              No SMS in outbox. Messages appear here once sequences or follow-ups fire.
            </div>
          )}
          {outbox && outbox.length > 0 && (
            <div className="list">
              <div className="list-h" style={{ gridTemplateColumns: "130px 1fr 90px 70px" }}>
                <div>To</div><div>Body</div><div>Source</div><div>Status</div>
              </div>
              {outbox.map(m => (
                <div key={m.id} className="row" style={{ gridTemplateColumns: "130px 1fr 90px 70px" }}>
                  <div className="cell-truncate" style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{m.to_number}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.body}</div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{m.source || "—"}</div>
                  <div><span className="chip" style={{ fontSize: 10.5, color: _STATUS_COLOR[m.status] || "var(--text-tertiary)" }}>{m.status}</span></div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Rules tab ── */}
      {inner === "rules" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div className="panel">
            <div className="panel-h"><Icons.Sparkles size={13}/><h3>Follow-up rules</h3><span className="meta">{rules.length}</span></div>
            {rules.length === 0 && (
              <div style={{ padding: 24, color: "var(--text-tertiary)", fontSize: 12.5, textAlign: "center" }}>
                No rules yet. Rules auto-enroll leads when triggers fire.
              </div>
            )}
            {rules.map(r => (
              <div key={r.id} style={{ padding: "10px 14px", borderBottom: "1px solid var(--border-subtle)", fontSize: 12.5 }}>
                <div style={{ fontWeight: 500 }}>{r.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 3, display: "flex", gap: 8 }}>
                  <span>trigger: <span style={{ color: "var(--text-secondary)" }}>{typeof r.trigger === "object" ? JSON.stringify(r.trigger) : r.trigger}</span></span>
                  {!r.active && <span style={{ color: "var(--state-warning)" }}>inactive</span>}
                </div>
              </div>
            ))}
          </div>

          <div className="panel">
            <div className="panel-h"><Icons.MessageSquare size={13}/><h3>Follow-up templates</h3><span className="meta">{templates.length}</span></div>
            {templates.length === 0 && (
              <div style={{ padding: 24, color: "var(--text-tertiary)", fontSize: 12.5, textAlign: "center" }}>
                No templates yet. Create one from Admin → Follow-up.
              </div>
            )}
            {templates.map(t => (
              <div key={t.id} style={{ padding: "10px 14px", borderBottom: "1px solid var(--border-subtle)", fontSize: 12.5 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 500 }}>{t.name}</span>
                  <span className="chip" style={{ fontSize: 10.5 }}>{t.channel}</span>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                  {t.body}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginTop: 3 }}>
                  {t.triggerEvent} · +{t.delayMinutes}min · {t.scope}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Vendors tab ── */}
      {inner === "vendors" && <VendorsTab/>}

      {/* ── Messaging tab ── */}
      {inner === "messaging" && <MessagingTab outbox={outbox}/>}

      {newOpen && (
        <NewSeqModal onClose={() => setNewOpen(false)} onCreated={id => { setSeqSel(id); setInner("sequences"); }}/>
      )}
      {enrollFor && (
        <EnrollModal seqId={enrollFor !== "any" ? enrollFor : null} sequences={sequences} onClose={() => setEnrollFor(null)}/>
      )}
    </div>
  );
}

window.PageLeadDrip = PageLeadDrip;
