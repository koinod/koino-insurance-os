/* page-pipeline-sequences.jsx — Sales follow-up sequences

   The Recruiting workbench pattern, applied to sales pipeline.
   A lead enrolled in a sequence gets multi-touch SMS+email follow-up
   automatically; replies pause the sequence and flag the rep.

   Live data flow:
     AppData.SEQUENCES               → reference rows (id, name, description, steps[])
     AppData.SEQUENCE_ENROLLMENTS    → tenant-scoped enrollments (lead, owner, status, currentStep)
     AppData.PIPELINE                → lead lookup for enrollment list
     AppData.REPS                    → owner avatar + name resolution

   Demo seed (the SEQ_DEMO + ENROLLED_DEMO arrays below) only renders for
   the demo agency or when no live sequences exist on the tenant. Real
   agencies see the empty state with a "create sequence" CTA, never
   fake names like "Cheryl Hampton".

   Exposed as window.PipelineSequences (sub-tab of Pipeline). */

(function () {

const SEQ_DEMO = [
  { id: "ps1", name: "Quote follow-up · Med Supp", channel: "sms_email",  active: 28, days: 12, steps: [
    { day: 0,  ch: "SMS",   template: "Hi {{first}}, this is {{rep}} with Atlas. I just texted you the Plan G quote — check your messages. Q's? Reply here." },
    { day: 1,  ch: "Email", template: "Subject: Your Plan G quote\n\n{{first}}, here's the breakdown of your Plan G estimate. Hospital max out-of-pocket = Part B deductible. PDF attached." },
    { day: 3,  ch: "SMS",   template: "Hey {{first}} — most folks have one specific question after seeing the quote. What's yours?" },
    { day: 7,  ch: "Email", template: "Subject: Quick check-in\n\nSometimes life gets busy. If now isn't right, I get it. Want me to reach out in 30 days instead?" },
    { day: 12, ch: "SMS",   template: "Last text from me, {{first}}. If you'd rather connect with someone else or you're set, just reply STOP and I'll close out." },
  ]},
  { id: "ps2", name: "Final Expense nurture",       channel: "sms",        active: 14, days: 10, steps: [
    { day: 0,  ch: "SMS",   template: "Hi {{first}}, {{rep}} from Atlas. The $15K final expense plan we discussed comes to $${ap}/mo. Want me to email the full breakdown?" },
    { day: 2,  ch: "SMS",   template: "Quick reminder, {{first}} — if you'd like, I can also pull a $10K version for comparison. Just reply with which one." },
    { day: 5,  ch: "SMS",   template: "Hey {{first}} — thinking about you. Funeral costs in {{state}} averaged $9,840 last year. Plan locks in your rate today." },
    { day: 10, ch: "SMS",   template: "Last note. If you want to revisit, text me. If not, no hard feelings — wishing you the best." },
  ]},
  { id: "ps3", name: "App In · sigs missing",        channel: "sms_email",  active: 4,  days: 5,  steps: [
    { day: 0,  ch: "SMS",   template: "Hey {{first}} — saw a couple sigs are missing on your application. Quick docusign in 90 seconds? I'll text the link." },
    { day: 1,  ch: "SMS",   template: "Hey {{first}}, sending the sig link again — let me know if you're not getting it." },
    { day: 3,  ch: "Email", template: "Subject: Need 60 seconds — application waiting\n\n{{first}}, the carrier's holding your application until I get the last two signatures. Here's the link: {{sig_url}}" },
    { day: 5,  ch: "SMS",   template: "Final note — without sigs the app expires Friday. Two clicks: {{sig_url}}" },
  ]},
  { id: "ps4", name: "Cross-sell · FE issued → Med Supp", channel: "email", active: 9, days: 60, steps: [
    { day: 30, ch: "Email", template: "Subject: Quick check-in 30 days post-issue\n\nHow's the new policy treating you? Any questions on what's covered?" },
    { day: 45, ch: "Email", template: "Subject: One more option for you\n\nFolks who chose final expense often also benefit from a Medicare Supplement. 3-min explainer attached." },
    { day: 60, ch: "Email", template: "Subject: Want me to run the numbers?\n\nIf you've thought about Med Supp, I can pull a quote in your zip in 5 minutes." },
  ]},
];

const ENROLLED_DEMO = [
  { id: "e1", lead: "Cheryl Hampton",  seq: "ps1", step: 2, status: "active",   nextSendIn: "in 14h", lastReply: "—",       owner: "marc" },
  { id: "e2", lead: "Robert Mendez",    seq: "ps3", step: 1, status: "paused",   nextSendIn: "—",      lastReply: "5m ago",  owner: "dani" },
  { id: "e3", lead: "Patricia Volker", seq: "ps1", step: 3, status: "active",   nextSendIn: "in 2d",  lastReply: "—",       owner: "kira" },
  { id: "e4", lead: "Ramona Diaz",     seq: "ps3", step: 0, status: "active",   nextSendIn: "now",     lastReply: "—",       owner: "kira" },
  { id: "e5", lead: "Don Phelps",       seq: "ps2", step: 2, status: "active",   nextSendIn: "in 3d",  lastReply: "—",       owner: "sade" },
  { id: "e6", lead: "Naomi Reese",      seq: "ps4", step: 0, status: "complete", nextSendIn: "—",      lastReply: "1mo ago", owner: "jada" },
];

// Project the live AppData.SEQUENCES + SEQUENCE_ENROLLMENTS into the shape
// the prototype originally used (steps array, channel hint, active count).
// Falls back to demo seed for demo agencies; real agencies with no live
// sequences get the empty state.
function _liveSeqList() {
  const rawSeq = (window.AppData && window.AppData.SEQUENCES) || [];
  const enrollments = (window.AppData && window.AppData.SEQUENCE_ENROLLMENTS) || [];
  if (rawSeq.length === 0) {
    const isDemo = !!(window.Shared && window.Shared.isDemoAgency && window.Shared.isDemoAgency());
    return isDemo ? SEQ_DEMO : [];
  }
  return rawSeq.filter(s => s.active !== false).map(s => {
    const steps = Array.isArray(s.steps) ? s.steps : [];
    const channels = new Set(steps.map(st => (st.ch || st.channel || "").toLowerCase()).filter(Boolean));
    const channel = channels.size === 0 ? "sms_email"
      : channels.size === 1 ? Array.from(channels)[0]
      : "sms_email";
    const last = steps.length > 0 ? (steps[steps.length - 1].day || 0) : 0;
    const active = enrollments.filter(e => e.sequenceId === s.id && e.status === "active").length;
    return {
      id: s.id, name: s.name, channel, active, days: last,
      steps: steps.map(st => ({
        day: st.day || 0,
        ch: (st.ch || st.channel || "SMS").toUpperCase(),
        template: st.template || st.body || "",
      })),
    };
  });
}

function _liveEnrolledList(seqId) {
  const enrollments = (window.AppData && window.AppData.SEQUENCE_ENROLLMENTS) || [];
  if (enrollments.length === 0) {
    const isDemo = !!(window.Shared && window.Shared.isDemoAgency && window.Shared.isDemoAgency());
    return isDemo ? ENROLLED_DEMO.filter(e => e.seq === seqId) : [];
  }
  const leadById = Object.fromEntries((window.AppData?.PIPELINE || []).map(l => [l.id, l]));
  const fmtAgo = (iso) => {
    if (!iso) return "—";
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 60000) return "now";
    if (ms < 3600000) return `${Math.round(ms / 60000)}m ago`;
    if (ms < 86400000) return `${Math.round(ms / 3600000)}h ago`;
    return `${Math.round(ms / 86400000)}d ago`;
  };
  const fmtIn = (iso) => {
    if (!iso) return "—";
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return "now";
    if (ms < 3600000) return `in ${Math.round(ms / 60000)}m`;
    if (ms < 86400000) return `in ${Math.round(ms / 3600000)}h`;
    return `in ${Math.round(ms / 86400000)}d`;
  };
  return enrollments
    .filter(e => e.sequenceId === seqId)
    .map(e => ({
      id: e.id,
      lead: leadById[e.leadId]?.lead || (e.leadId ? `Lead ${String(e.leadId).slice(0, 8)}` : "—"),
      seq: e.sequenceId,
      step: e.currentStep || 0,
      status: e.status || "active",
      nextSendIn: fmtIn(e.nextStepAt),
      lastReply: fmtAgo(e.lastReplyAt),
      owner: e.owner,
    }));
}

function PipelineSequences({ role = "owner" }) {
  // Re-render when realtime hydrate ticks (new enrollments, status flips).
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const fn = () => force(n => n + 1);
    window.addEventListener("data:hydrated", fn);
    window.addEventListener("data:mutated", fn);
    return () => {
      window.removeEventListener("data:hydrated", fn);
      window.removeEventListener("data:mutated", fn);
    };
  }, []);

  const SEQ = _liveSeqList();
  const [activeId, setActiveId] = React.useState(SEQ[0]?.id || null);
  const [edits, setEdits] = React.useState({});
  React.useEffect(() => {
    if (!activeId && SEQ.length > 0) setActiveId(SEQ[0].id);
  }, [SEQ.length, activeId]);

  if (SEQ.length === 0) {
    return (
      <div className="koino-ds">
        <div className="koino-empty">
          <div className="koino-empty-icon"><Icons.Sparkles size={16}/></div>
          <h4>No sequences yet</h4>
          <p>Create a multi-touch SMS+email follow-up your producers can drop leads into. New quote · App-In sigs missing · cross-sell — pick one to start.</p>
          <button
            className="koino-btn koino-btn-primary"
            onClick={() => window.toast && window.toast("Sequence builder coming next pass — enroll via lead detail rail for now", "info")}
          ><Icons.Plus size={11}/> New sequence</button>
        </div>
      </div>
    );
  }

  // Working copy of the active sequence's steps. Hydrates from the live
  // SEQ row but holds in-flight edits (text, channel, condition, day,
  // add / delete) until the operator hits Save -> sequenceSave RPC.
  const seq = SEQ.find(s => s.id === activeId) || SEQ[0];
  const [draft, setDraft] = React.useState(null);
  React.useEffect(() => {
    setDraft({
      name: seq.name,
      channel: seq.channel,
      active: seq.activeFlag !== false,  // sequences.is_active hydrated as s.active inside _liveSeqList
      steps: (seq.steps || []).map(s => ({ ...s })),
    });
  }, [seq.id]);
  const [saving, setSaving] = React.useState(false);
  const [newSeqOpen, setNewSeqOpen] = React.useState(false);

  const enrolled = _liveEnrolledList(seq.id);

  if (!draft) return null;

  const updateStep = (i, patch) => {
    setDraft(d => {
      const next = { ...d, steps: d.steps.map((s, idx) => idx === i ? { ...s, ...patch } : s) };
      // Auto-recompute channel hint when a single step's channel changes
      const chans = new Set(next.steps.map(st => (st.ch || "").toLowerCase()).filter(Boolean));
      next.channel = chans.size === 0 ? "sms_email" : chans.size === 1 ? Array.from(chans)[0] : "sms_email";
      return next;
    });
  };
  const addStep = () => setDraft(d => ({
    ...d,
    steps: [...d.steps, { day: (d.steps[d.steps.length - 1]?.day || 0) + 1, ch: "SMS", template: "", condition: "any" }],
  }));
  const deleteStep = (i) => setDraft(d => ({ ...d, steps: d.steps.filter((_, idx) => idx !== i) }));
  const save = async () => {
    setSaving(true);
    try {
      await AppData.mutate.sequenceSave({
        id: seq.id, name: draft.name,
        steps: draft.steps, active: draft.active,
      });
      window.toast && window.toast(`Saved: ${draft.name}${AppData.LIVE ? "" : " (demo)"}`, "success");
    } catch (_e) {} finally { setSaving(false); }
  };
  const togglePaused = async () => {
    const next = !draft.active;
    setDraft(d => ({ ...d, active: next }));
    try {
      await AppData.mutate.sequenceToggleActive(seq.id, next);
      window.toast && window.toast(next ? "Sequence resumed" : "Sequence paused", "info");
    } catch (_e) { setDraft(d => ({ ...d, active: !next })); }
  };

  return (
    <div className="seq-grid" style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 14 }}>
      <div className="panel">
        <div className="panel-h"><h3>Sequences</h3>
          <button
            className="btn btn-ghost"
            style={{ marginLeft: "auto" }}
            title="Create new sequence"
            onClick={() => setNewSeqOpen(true)}
          ><Icons.Plus size={11}/></button>
        </div>
        <div style={{ padding: 6 }}>
          {SEQ.map(s => {
            const en = s.active || 0;
            return (
              <button key={s.id} onClick={() => setActiveId(s.id)} className="btn btn-ghost" style={{ width: "100%", padding: 10, marginBottom: 4, justifyContent: "stretch", flexDirection: "column", alignItems: "stretch", gap: 4, background: activeId === s.id ? "var(--bg-overlay)" : "transparent" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <strong style={{ fontSize: 12.5 }}>{s.name}</strong>
                  <span className="tabular" style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{(s.steps || []).length} · {s.days}d</span>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <span className="chip" style={{ fontSize: 10 }}>{s.channel}</span>
                  <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>· {en} active</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="panel">
          <div className="panel-h">
            <input
              className="text-input"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              style={{ background: "transparent", border: 0, fontSize: 14, fontWeight: 600, color: "var(--text-primary)", padding: 0, width: 280 }}
              placeholder="Sequence name"
            />
            <span className="chip">{draft.channel}</span>
            <span style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>
              · {enrolled.filter(e => e.status === "active").length} leads in flight
              {!draft.active && <span style={{ color: "var(--state-warning)", marginLeft: 6 }}>· paused</span>}
            </span>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <button className="btn btn-ghost" onClick={togglePaused} title={draft.active ? "Pause this sequence" : "Resume this sequence"}>
                {draft.active ? <><Icons.Pause size={11}/> Pause</> : <><Icons.Play size={11}/> Resume</>}
              </button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                <Icons.Check size={11}/> {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
          <div style={{ padding: 12 }}>
            {draft.steps.length === 0 && (
              <div style={{ padding: 18, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
                No steps yet. Add the first one to define when and what to send.
              </div>
            )}
            {draft.steps.map((s, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "60px 1fr 30px", gap: 14, padding: "12px 0", borderBottom: i < draft.steps.length - 1 ? "1px solid var(--border-subtle)" : 0 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--bg-raised)", border: "1px solid var(--border-strong)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 600 }}>{i + 1}</div>
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={s.day || 0}
                    onChange={(e) => updateStep(i, { day: Math.max(0, +e.target.value || 0) })}
                    style={{ width: 50, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 10.5, background: "transparent", color: "var(--text-tertiary)", border: 0, padding: 0 }}
                    title="Days after enrollment"
                  />
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <Shared.Select
                      value={String(s.ch || "SMS").toLowerCase()}
                      onChange={(v) => updateStep(i, { ch: v.toUpperCase() })}
                      options={[{ v: "sms", l: "SMS" }, { v: "email", l: "Email" }, { v: "call", l: "Call task" }]}
                    />
                    <Shared.Select
                      value={s.condition || "any"}
                      onChange={(v) => updateStep(i, { condition: v })}
                      options={[
                        { v: "any",       l: "Send to anyone" },
                        { v: "no_reply",  l: "Only if no reply" },
                        { v: "no_book",   l: "Only if not closed" },
                        { v: "no_open",   l: "Only if email unopened" },
                      ]}
                    />
                  </div>
                  <textarea
                    className="text-input"
                    rows={(s.template || "").length > 80 ? 4 : 2}
                    value={s.template || ""}
                    onChange={(e) => updateStep(i, { template: e.target.value })}
                    style={{ width: "100%", resize: "vertical", fontFamily: "var(--font-ui)" }}
                    placeholder="Hi {{first}}, this is {{rep}} from {{agency}}…"
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 6, fontSize: 11, color: "var(--text-tertiary)" }}>
                    <span>Vars: {`{{first}}`} {`{{rep}}`} {`{{state}}`} {`{{ap}}`} {`{{sig_url}}`} {`{{agency}}`}</span>
                  </div>
                </div>
                <button
                  className="icon-btn"
                  onClick={() => deleteStep(i)}
                  title="Delete step"
                  style={{ alignSelf: "start", color: "var(--state-danger)" }}
                ><Icons.X size={12}/></button>
              </div>
            ))}
            <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={addStep}>
              <Icons.Plus size={11}/> Add step
            </button>
          </div>
        </div>

        <div className="panel">
          <div className="panel-h"><Icons.Users size={13}/><h3>Enrolled leads · {enrolled.length}</h3></div>
          <div className="list">
            <div className="list-h" style={{ gridTemplateColumns: "1.4fr 70px 80px 90px 80px 100px 80px" }}>
              <div>Lead</div>
              <div className="tabular" style={{ textAlign: "right" }}>Step</div>
              <div>Status</div>
              <div>Next send</div>
              <div>Last reply</div>
              <div>Owner</div>
              <div></div>
            </div>
            {enrolled.length === 0 && (
              <div style={{ padding: 18, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
                No leads enrolled yet. Enroll from any lead's detail rail.
              </div>
            )}
            {enrolled.map(e => {
              const owner = (AppData.REPS || []).find(r => r.id === e.owner);
              const toggle = async () => {
                const next = e.status === "active" ? "paused" : "active";
                try {
                  await AppData.mutate.enrollmentStatus(e.id, next);
                  window.toast && window.toast(`${e.lead}: ${next}${AppData.LIVE ? " · saved" : ""}`, "info");
                } catch (_e) {}
              };
              return (
                <div key={e.id} className="row" style={{ gridTemplateColumns: "1.4fr 70px 80px 90px 80px 100px 80px" }}>
                  <div style={{ fontWeight: 500 }}>{e.lead}</div>
                  <div className="tabular" style={{ textAlign: "right" }}>{(e.step || 0) + 1} / {draft.steps.length || (seq.steps || []).length}</div>
                  <div><span className={`chip ${e.status === "active" ? "chip-money" : e.status === "paused" ? "chip-status" : ""}`}>{e.status}</span></div>
                  <div className="tabular" style={{ color: e.nextSendIn === "now" ? "var(--accent-money)" : "var(--text-tertiary)", fontSize: 11.5 }}>{e.nextSendIn}</div>
                  <div style={{ color: e.lastReply !== "—" ? "var(--accent-status)" : "var(--text-quaternary)", fontSize: 11.5 }}>{e.lastReply}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5 }}>
                    {owner && <Shared.Avatar rep={owner} size={16}/>}
                    <span>{owner?.name?.split(" ")[0] || "—"}</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {e.status !== "complete" && (
                      <button className="btn btn-ghost" style={{ padding: "3px 6px", fontSize: 10.5 }} onClick={toggle} title={e.status === "active" ? "Pause this enrollment" : "Resume this enrollment"}>
                        {e.status === "active" ? "Pause" : "Resume"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {newSeqOpen && (
        <NewSequenceModal onClose={() => setNewSeqOpen(false)} onCreated={(id) => { setNewSeqOpen(false); setActiveId(id); }}/>
      )}
    </div>
  );
}

// Inline modal that creates a sequence skeleton (a "name + first step"
// shell). Once saved, the operator edits it inline. Was: the "+" button
// did nothing.
function NewSequenceModal({ onClose, onCreated }) {
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const submit = async () => {
    if (!name.trim()) { window.toast && window.toast("Name required", "warn"); return; }
    setBusy(true);
    try {
      const created = await AppData.mutate.sequenceSave({
        name: name.trim(),
        active: true,
        steps: [{ day: 0, ch: "SMS", template: "Hi {{first}}, this is {{rep}} from {{agency}}…", condition: "any" }],
      });
      window.toast && window.toast(`Created: ${name}${AppData.LIVE ? "" : " (demo)"}`, "success");
      onCreated && onCreated(created.id);
    } catch (_e) {} finally { setBusy(false); }
  };
  return (
    <Shared.Modal title="New sequence" width={460} onClose={onClose} actions={
      <>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy || !name.trim()}>
          <Icons.Plus size={11}/> {busy ? "Creating…" : "Create sequence"}
        </button>
      </>
    }>
      <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 10, lineHeight: 1.55 }}>
        Creates a sequence with one starter SMS step on day 0. Edit the steps + add more after it's created.
      </div>
      <Shared.Field label="Sequence name">
        <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Quote follow-up · Med Supp" autoFocus/>
      </Shared.Field>
    </Shared.Modal>
  );
}

window.PipelineSequences = PipelineSequences;

// Helper used by LeadDetail to pick / preview a sequence to enroll into.
// Returns a *function* that returns the live list, so callers always read
// the freshest hydrate (was a static snapshot of the demo seed before).
window.PIPELINE_SEQUENCES = _liveSeqList;

})();
