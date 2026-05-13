/* page-leaddrip.jsx — Lead Drip sequences + SMS outbox + follow-up rules
   Sources: AppData.SEQUENCES, SEQUENCE_ENROLLMENTS, FOLLOWUP_TEMPLATES,
            FOLLOWUP_RULES; sms_outbox queried directly from Supabase */

const _DRIP_SECTION_ITEMS = [
  {k:"team",l:"Floor"},{k:"coaching",l:"Coaching"},{k:"nigo",l:"NIGO Queue"},
  {k:"recruiting",l:"Recruiting"},{k:"queue",l:"Dispatch"},
  {k:"downline",l:"Tree"},{k:"leaddrip",l:"Lead Drip"},
];

function useDripReady() {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const fn = () => force(n => n + 1);
    window.addEventListener("me:loaded", fn);
    window.addEventListener("data:hydrated", fn);
    window.addEventListener("data:mutated", fn);
    return () => {
      window.removeEventListener("me:loaded", fn);
      window.removeEventListener("data:hydrated", fn);
      window.removeEventListener("data:mutated", fn);
    };
  }, []);
}

function useSmsOutbox() {
  const [outbox, setOutbox] = React.useState(null);
  React.useEffect(() => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb || !AppData.LIVE) { setOutbox([]); return; }
    const agencyId = window.getActiveAgencyId && window.getActiveAgencyId();
    let q = sb.from("sms_outbox").select("id, to_number, body, status, created_at, rep_id, source").order("created_at", { ascending: false }).limit(60);
    if (agencyId) q = q.eq("agency_id", agencyId);
    q.then(({ data }) => setOutbox(Array.isArray(data) ? data : [])).catch(() => setOutbox([]));
  }, []);
  return outbox;
}

const _STATUS_COLOR = {
  queued: "var(--text-tertiary)", pending: "var(--text-tertiary)",
  sent: "var(--accent-money)", claimed: "var(--accent-status)",
  failed: "var(--state-danger)", expired: "var(--state-warning)",
};

function _enrollRate(enrollments, seqId) {
  const e = enrollments.filter(x => x.sequenceId === seqId);
  if (!e.length) return null;
  return Math.round((e.filter(x => x.status === "completed").length / e.length) * 100);
}

/* ─── New sequence modal ──────────────────────────────────────────── */
function NewSeqModal({ onClose, onCreated }) {
  const [name, setName] = React.useState("");
  const [firstTemplate, setFirstTemplate] = React.useState("");
  const [cadenceDays, setCadenceDays] = React.useState("2");
  const [steps, setSteps] = React.useState("5");
  const [saving, setSaving] = React.useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const sb = window.getSupabase && window.getSupabase();
    const numSteps = Math.max(1, Math.min(10, parseInt(steps) || 5));
    const cadence = Math.max(1, parseInt(cadenceDays) || 2);
    const builtSteps = Array.from({ length: numSteps }, (_, i) => ({
      day: i * cadence, ch: "SMS", template: i === 0 ? (firstTemplate.trim() || "Hi {{first}}, following up — {{rep}}") : `Follow-up #${i + 1} for {{first}}`,
    }));
    try {
      if (sb && AppData.LIVE) {
        const { data } = await sb.from("sequences").insert({ id: "seq_" + Date.now().toString(36), name: name.trim(), steps: builtSteps, is_active: true }).select().single();
        if (data) { onCreated && onCreated(data.id); }
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
          <textarea className="text-input" rows={3} value={firstTemplate} onChange={e => setFirstTemplate(e.target.value)} placeholder="Hi {{first}}, this is {{rep}} — just sent over your quote. Any questions?"/>
        </Shared.Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Shared.Field label="Steps">
            <input className="text-input" type="number" min={1} max={10} value={steps} onChange={e => setSteps(e.target.value)}/>
          </Shared.Field>
          <Shared.Field label="Cadence (days between steps)">
            <input className="text-input" type="number" min={1} max={30} value={cadenceDays} onChange={e => setCadenceDays(e.target.value)}/>
          </Shared.Field>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
          Will create {Math.max(1, parseInt(steps) || 5)} SMS steps every {Math.max(1, parseInt(cadenceDays) || 2)} day(s). You can edit each step body after creation.
        </div>
      </div>
    </Shared.Modal>
  );
}

/* ─── Enroll lead modal ──────────────────────────────────────────── */
function EnrollModal({ seqId, sequences, onClose }) {
  const [leadId, setLeadId] = React.useState("");
  const [seqSel, setSeqSel] = React.useState(seqId || (sequences[0]?.id || ""));
  const [saving, setSaving] = React.useState(false);
  const leads = AppData.PIPELINE || [];
  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;

  const enroll = async () => {
    if (!leadId || !seqSel) return;
    setSaving(true);
    try {
      const sb = window.getSupabase && window.getSupabase();
      if (sb && AppData.LIVE) {
        await sb.from("sequence_enrollments").insert({
          lead_pipeline_id: leadId,
          sequence_id: seqSel,
          owner_rep_id: meIdent?.rep_id || null,
          status: "active",
          current_step: 0,
          enrolled_at: new Date().toISOString(),
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
          <Shared.Select
            value={leadId}
            onChange={setLeadId}
            options={[{ v: "", l: "— pick a lead —" }, ...leads.map(l => ({ v: l.id, l: `${l.lead} · ${l.stage} · ${l.product || "—"}` }))]}
          />
        </Shared.Field>
        <Shared.Field label="Sequence">
          <Shared.Select
            value={seqSel}
            onChange={setSeqSel}
            options={sequences.map(s => ({ v: s.id, l: s.name }))}
          />
        </Shared.Field>
      </div>
    </Shared.Modal>
  );
}

/* ─── Sequence step editor panel ──────────────────────────────────── */
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
          <div key={i} style={{ padding: 12, background: "var(--bg-raised)", borderRadius: 7, border: "1px solid var(--border-subtle)", position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--accent-money)", background: "color-mix(in oklch, var(--accent-money) 10%, transparent)", padding: "1px 6px", borderRadius: 4 }}>
                Day {step.day ?? i}
              </span>
              <span className="chip" style={{ fontSize: 10.5 }}>{step.ch || step.channel || "SMS"}</span>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5, fontFamily: "var(--font-mono)", fontSize: 11.5 }}>
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

/* ─── Main page ──────────────────────────────────────────────────── */
function PageLeadDrip() {
  useDripReady();
  const outbox      = useSmsOutbox();
  const [inner, setInner] = React.useState("sequences");
  const [seqSel, setSeqSel]   = React.useState(null);
  const [newOpen, setNewOpen] = React.useState(false);
  const [enrollFor, setEnrollFor] = React.useState(null);

  const sequences   = AppData.SEQUENCES           || [];
  const enrollments = AppData.SEQUENCE_ENROLLMENTS || [];
  const templates   = AppData.FOLLOWUP_TEMPLATES  || [];
  const rules       = AppData.FOLLOWUP_RULES       || [];

  const activeSeq = sequences.find(s => s.id === seqSel) || sequences[0] || null;

  const innerTabs = [
    { k: "sequences", l: "Sequences" },
    { k: "outbox",    l: `Outbox ${outbox?.length ? `(${outbox.length})` : ""}` },
    { k: "rules",     l: "Rules" },
  ];

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Lead Drip</div>
          <div className="page-sub">Sequences · outbox · follow-up rules</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => setEnrollFor("any")}><Icons.Plus size={12}/> Enroll lead</button>
          <button className="btn btn-primary" onClick={() => setNewOpen(true)}><Icons.Plus size={12}/> New sequence</button>
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
                      padding: "10px 14px", cursor: "pointer", borderLeft: s.id === (activeSeq?.id) ? "3px solid var(--accent-money)" : "3px solid transparent",
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
                  <div>
                    <span className="chip" style={{ fontSize: 10.5, color: _STATUS_COLOR[m.status] || "var(--text-tertiary)" }}>{m.status}</span>
                  </div>
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
