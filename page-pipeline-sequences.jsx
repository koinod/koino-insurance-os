/* page-pipeline-sequences.jsx — Sales follow-up sequence builder

   CRUD UI against public.sequences (RLS-scoped via viewer_agency_ids()).
   Reads AppData.SEQUENCES + AppData.SEQUENCE_ENROLLMENTS (hydrated by
   data.jsx). Writes through window.AppData.mutate.sequenceSave /
   sequenceDelete / sequenceToggleActive.

   The drip-runner (api/cron/drip-runner.js) consumes sequences.steps
   shape: [{ day: int, ch: "SMS"|"Email", template: text }]. We preserve
   that exact shape on save.

   Exposed as window.PipelineSequences (sub-tab of Pipeline). Also
   exposes window.PIPELINE_SEQUENCES as a snapshot of currently-active
   sequences for the LeadDetail "Enroll" picker in page-pipeline.jsx. */

(function () {

const TOKENS = ["{{first}}", "{{rep}}", "{{product}}", "{{state}}", "{{ap}}", "{{sig_url}}"];

/* ─── Re-render on data:hydrated / mutated / realtime ─────────────── */
function useDataReady() {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const fn = () => force(n => n + 1);
    window.addEventListener("me:loaded",      fn);
    window.addEventListener("data:hydrated",  fn);
    window.addEventListener("data:mutated",   fn);
    window.addEventListener("data:realtime",  fn);
    return () => {
      window.removeEventListener("me:loaded",      fn);
      window.removeEventListener("data:hydrated",  fn);
      window.removeEventListener("data:mutated",   fn);
      window.removeEventListener("data:realtime",  fn);
    };
  }, []);
}

/* ─── Channel inference from steps ────────────────────────────────── */
function deriveChannel(steps) {
  const chs = new Set();
  (Array.isArray(steps) ? steps : []).forEach(s => {
    const ch = (s.ch || s.channel || "SMS").toLowerCase();
    if (ch === "sms" || ch === "email" || ch === "task") chs.add(ch);
  });
  if (chs.size === 0) return "sms";
  if (chs.size === 1) return Array.from(chs)[0];
  if (chs.has("sms") && chs.has("email")) return "sms_email";
  return Array.from(chs).join("_");
}

function totalDays(steps) {
  const arr = Array.isArray(steps) ? steps : [];
  if (arr.length === 0) return 0;
  return arr.reduce((max, s) => Math.max(max, Number(s.day) || 0), 0);
}

/* ─── Sequence editor modal (new + edit, same shape) ──────────────── */
function SequenceEditorModal({ seq, onClose }) {
  const isNew = !seq;
  const [name, setName]               = React.useState(seq?.name || "");
  const [description, setDescription] = React.useState(seq?.description || "");
  const [active, setActive]           = React.useState(seq ? seq.active !== false : true);
  const [steps, setSteps]             = React.useState(() => {
    const raw = Array.isArray(seq?.steps) ? seq.steps : [];
    if (raw.length === 0) {
      return [{ day: 0, ch: "SMS", template: "Hi {{first}}, this is {{rep}}. Quick follow-up on your quote." }];
    }
    return raw.map((s, i) => ({
      day:      s.day ?? i,
      ch:       s.ch || s.channel || "SMS",
      template: s.template || s.body || "",
    }));
  });
  const [saving, setSaving] = React.useState(false);

  const updateStep = (i, patch) =>
    setSteps(prev => prev.map((s, j) => j === i ? { ...s, ...patch } : s));
  const removeStep = (i) =>
    setSteps(prev => prev.filter((_, j) => j !== i));
  const addStep = () => setSteps(prev => {
    const lastDay = prev.length ? (Number(prev[prev.length - 1].day) || 0) : -2;
    return [...prev, { day: lastDay + 2, ch: "SMS", template: "" }];
  });
  const moveStep = (i, dir) => setSteps(prev => {
    const next = prev.slice();
    const j = i + dir;
    if (j < 0 || j >= next.length) return prev;
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  const channelDerived = deriveChannel(steps);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const cleanSteps = steps.map(s => ({
      day:      Math.max(0, parseInt(s.day, 10) || 0),
      ch:       s.ch || "SMS",
      template: (s.template || "").trim(),
    }));
    try {
      await window.AppData.mutate.sequenceSave({
        id: seq?.id || null,
        name: name.trim(),
        description: description.trim() || null,
        is_active: !!active,
        steps: cleanSteps,
      });
      window.toast && window.toast(`Sequence "${name.trim()}" ${isNew ? "created" : "saved"}`, "success");
      onClose();
    } catch (e) {
      window.toast && window.toast(`Save failed: ${e?.message || e}`, "error");
      setSaving(false);
    }
  };

  return (
    <Shared.Modal title={isNew ? "New sequence" : `Edit · ${seq.name}`} width={680} onClose={onClose} actions={
      <>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={!name.trim() || saving}>
          <Icons.Check size={11}/> {saving ? "Saving…" : (isNew ? "Create sequence" : "Save changes")}
        </button>
      </>
    }>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 10 }}>
          <Shared.Field label="Sequence name">
            <input className="text-input" autoFocus value={name} onChange={e => setName(e.target.value)}
              placeholder="Quote follow-up · Med Supp"/>
          </Shared.Field>
          <Shared.Field label="Channel (derived)">
            <div className="chip" style={{ alignSelf: "flex-start", marginTop: 4 }}>{channelDerived}</div>
          </Shared.Field>
        </div>
        <Shared.Field label="Description">
          <textarea className="text-input" rows={2} value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Optional internal note — when to use this sequence"/>
        </Shared.Field>
        <Shared.Field label="Status">
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
            <input type="checkbox" id="pseq-active" checked={active} onChange={e => setActive(e.target.checked)}/>
            <label htmlFor="pseq-active" style={{ fontSize: 12.5, cursor: "pointer" }}>
              Active (drip-runner advances enrollments)
            </label>
          </div>
        </Shared.Field>

        <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 10 }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Steps ({steps.length})
            </div>
            <button className="btn btn-ghost" style={{ marginLeft: "auto", fontSize: 11 }} onClick={addStep}>
              <Icons.Plus size={11}/> Add step
            </button>
          </div>

          {steps.length === 0 && (
            <div style={{ padding: 16, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12, border: "1px dashed var(--border-subtle)", borderRadius: 6 }}>
              No steps. Add one to start the cadence.
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {steps.map((step, i) => (
              <div key={i} style={{ padding: 10, background: "var(--bg-raised)", borderRadius: 7, border: "1px solid var(--border-subtle)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "70px 110px 1fr auto", gap: 8, alignItems: "end", marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginBottom: 2 }}>Day</div>
                    <input className="text-input" type="number" min={0} value={step.day}
                      onChange={e => updateStep(i, { day: e.target.value })}
                      style={{ fontSize: 12 }}/>
                  </div>
                  <div>
                    <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginBottom: 2 }}>Channel</div>
                    <Shared.Select value={step.ch} onChange={v => updateStep(i, { ch: v })}
                      options={[{ v: "SMS", l: "SMS" }, { v: "Email", l: "Email" }, { v: "Task", l: "Task" }]}/>
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", paddingBottom: 6 }}>
                    Step {i + 1} of {steps.length}
                  </div>
                  <div style={{ display: "flex", gap: 2, paddingBottom: 2 }}>
                    <button className="btn btn-ghost" style={{ padding: "3px 6px" }} disabled={i === 0}
                      title="Move up" onClick={() => moveStep(i, -1)}>↑</button>
                    <button className="btn btn-ghost" style={{ padding: "3px 6px" }} disabled={i === steps.length - 1}
                      title="Move down" onClick={() => moveStep(i, 1)}>↓</button>
                    <button className="btn btn-ghost" style={{ padding: "3px 6px", color: "var(--state-warning)" }}
                      title="Remove step" onClick={() => removeStep(i)}>
                      <Icons.X size={11}/>
                    </button>
                  </div>
                </div>
                <textarea className="text-input" rows={step.template && step.template.length > 80 ? 4 : 2}
                  style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, width: "100%", resize: "vertical" }}
                  value={step.template}
                  onChange={e => updateStep(i, { template: e.target.value })}
                  placeholder="Hi {{first}}, this is {{rep}} — …"/>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginTop: 8, lineHeight: 1.5 }}>
            Tokens: {TOKENS.map(t => <code key={t} style={{ marginRight: 6 }}>{t}</code>)}<br/>
            Day = days after enrollment. Day 0 = sent immediately on next drip-runner tick.
          </div>
        </div>
      </div>
    </Shared.Modal>
  );
}

/* ─── Enrolled-leads drilldown panel ──────────────────────────────── */
function EnrollmentsPanel({ seq, enrollments }) {
  const reps = window.AppData.REPS || [];
  const leads = window.AppData.PIPELINE || [];
  const mine = enrollments.filter(e => e.sequenceId === seq.id);
  const active = mine.filter(e => e.status === "active");
  const paused = mine.filter(e => e.status === "paused");
  const done   = mine.filter(e => e.status === "completed");

  return (
    <div className="panel">
      <div className="panel-h">
        <Icons.Users size={13}/>
        <h3>Enrolled · {mine.length}</h3>
        <span style={{ marginLeft: 8, fontSize: 11.5, color: "var(--text-tertiary)" }}>
          {active.length} active · {paused.length} paused · {done.length} done
        </span>
      </div>
      <div className="list">
        <div className="list-h" style={{ gridTemplateColumns: "1.4fr 80px 80px 110px 100px" }}>
          <div>Lead</div>
          <div className="tabular" style={{ textAlign: "right" }}>Step</div>
          <div>Status</div>
          <div>Next send</div>
          <div>Owner</div>
        </div>
        {mine.length === 0 && (
          <div style={{ padding: 22, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
            No enrollments yet. Pipeline lead detail panel has an Enroll button per sequence.
          </div>
        )}
        {mine.slice(0, 50).map(e => {
          const lead  = leads.find(l => l.id === e.leadId);
          const owner = reps.find(r => r.id === e.owner);
          const nextRaw = e.nextStepAt || e.nextSendAt || null;
          let nextLabel = "—";
          if (nextRaw) {
            const ts = new Date(nextRaw).getTime();
            if (!isNaN(ts)) {
              const delta = ts - Date.now();
              if (delta < 0) nextLabel = "due";
              else if (delta < 36e5) nextLabel = `in ${Math.round(delta / 6e4)}m`;
              else if (delta < 864e5) nextLabel = `in ${Math.round(delta / 36e5)}h`;
              else nextLabel = `in ${Math.round(delta / 864e5)}d`;
            }
          }
          const stepCount = Array.isArray(seq.steps) ? seq.steps.length : 0;
          return (
            <div key={e.id} className="row" style={{ gridTemplateColumns: "1.4fr 80px 80px 110px 100px" }}>
              <div style={{ fontWeight: 500 }}>{lead?.lead || e.leadId || "—"}</div>
              <div className="tabular" style={{ textAlign: "right" }}>
                {(e.currentStep ?? 0) + 1} / {stepCount}
              </div>
              <div>
                <span className={`chip ${e.status === "active" ? "chip-money" : e.status === "paused" ? "chip-status" : ""}`}>
                  {e.status}
                </span>
              </div>
              <div className="tabular" style={{ color: nextLabel === "due" ? "var(--accent-money)" : "var(--text-tertiary)", fontSize: 11.5 }}>
                {nextLabel}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5 }}>
                {owner && <Shared.Avatar rep={owner} size={16}/>}
                <span>{owner?.name?.split(" ")[0] || "—"}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Step preview card (read-only) ───────────────────────────────── */
function StepPreview({ seq }) {
  const steps = Array.isArray(seq.steps) ? seq.steps : [];
  return (
    <div className="panel">
      <div className="panel-h">
        <Icons.Activity size={13}/>
        <h3>{seq.name}</h3>
        <span className="chip" style={{ fontSize: 10.5 }}>{deriveChannel(steps)}</span>
        {!seq.active && <span className="chip chip-status" style={{ fontSize: 10.5 }}>inactive</span>}
        <span style={{ marginLeft: 8, fontSize: 11.5, color: "var(--text-tertiary)" }}>
          · {steps.length} step{steps.length === 1 ? "" : "s"} over {totalDays(steps)}d
        </span>
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
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--bg-elevated)", border: "1px solid var(--border-strong)", display: "grid", placeItems: "center", fontSize: 10.5, fontWeight: 600 }}>
                {i + 1}
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--accent-money)", background: "color-mix(in oklch, var(--accent-money) 10%, transparent)", padding: "1px 6px", borderRadius: 4 }}>
                D+{step.day ?? i}
              </span>
              <span className="chip" style={{ fontSize: 10.5 }}>{step.ch || step.channel || "SMS"}</span>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.5, fontFamily: "var(--font-mono)", whiteSpace: "pre-wrap" }}>
              {step.template || step.body || "—"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Sequence list (left rail) ───────────────────────────────────── */
function SequenceList({ sequences, enrollments, activeId, onSelect, onNew, onEdit, onDelete, onToggle, canWrite }) {
  return (
    <div className="panel">
      <div className="panel-h">
        <h3>Sequences</h3>
        <span style={{ marginLeft: 6, fontSize: 11, color: "var(--text-tertiary)" }}>· {sequences.length}</span>
        {canWrite && (
          <button className="btn btn-primary" style={{ marginLeft: "auto", padding: "3px 8px", fontSize: 11 }} onClick={onNew} title="New sequence">
            <Icons.Plus size={11}/> New
          </button>
        )}
      </div>
      <div style={{ padding: 6, maxHeight: 560, overflowY: "auto" }}>
        {sequences.length === 0 && (
          <div style={{ padding: 16, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
            No sequences yet.{canWrite ? " Click New to build your first follow-up cadence." : ""}
          </div>
        )}
        {sequences.map(s => {
          const en = enrollments.filter(e => e.sequenceId === s.id && e.status === "active").length;
          const ch = deriveChannel(s.steps);
          const stepCount = Array.isArray(s.steps) ? s.steps.length : 0;
          return (
            <div key={s.id} style={{
              padding: 10, marginBottom: 4, borderRadius: 6,
              background: activeId === s.id ? "var(--bg-overlay)" : "transparent",
              border: activeId === s.id ? "1px solid var(--border-strong)" : "1px solid transparent",
              cursor: "pointer",
            }} onClick={() => onSelect(s.id)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
                <strong style={{ fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</strong>
                <span className="tabular" style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>
                  {stepCount} · {totalDays(s.steps)}d
                </span>
              </div>
              <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 4 }}>
                <span className="chip" style={{ fontSize: 10 }}>{ch}</span>
                {!s.active && <span className="chip chip-status" style={{ fontSize: 10 }}>inactive</span>}
                <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>· {en} active</span>
                {canWrite && (
                  <div style={{ marginLeft: "auto", display: "flex", gap: 2 }} onClick={ev => ev.stopPropagation()}>
                    <button className="btn btn-ghost" style={{ padding: "2px 6px", fontSize: 10.5 }}
                      title={s.active ? "Pause sequence" : "Activate sequence"}
                      onClick={() => onToggle(s)}>
                      {s.active ? <Icons.Pause size={10}/> : <Icons.Play size={10}/>}
                    </button>
                    <button className="btn btn-ghost" style={{ padding: "2px 6px", fontSize: 10.5 }}
                      title="Edit sequence" onClick={() => onEdit(s)}>
                      <Icons.Edit size={10}/>
                    </button>
                    <button className="btn btn-ghost" style={{ padding: "2px 6px", fontSize: 10.5, color: "var(--state-warning)" }}
                      title="Delete sequence" onClick={() => onDelete(s)}>
                      <Icons.X size={10}/>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Main component ──────────────────────────────────────────────── */
function PipelineSequences({ role = "owner" }) {
  useDataReady();

  const sequences   = (window.AppData.SEQUENCES || []).filter(s => (s.audience || "lead") === "lead");
  const enrollments = window.AppData.SEQUENCE_ENROLLMENTS || [];

  const [activeId, setActiveId] = React.useState(sequences[0]?.id || null);
  const [editTarget, setEditTarget] = React.useState(null); // null | "new" | seq object
  const [showDrilldown, setShowDrilldown] = React.useState(true);

  // Reseat activeId if the selected sequence vanishes (delete) or list changes
  React.useEffect(() => {
    if (sequences.length === 0) { if (activeId !== null) setActiveId(null); return; }
    if (!sequences.find(s => s.id === activeId)) setActiveId(sequences[0].id);
  }, [sequences.map(s => s.id).join(",")]);

  const canWrite = role === "owner" || role === "manager" || role === "admin";
  const seq = sequences.find(s => s.id === activeId) || null;

  const handleDelete = async (s) => {
    const activeEnrollments = enrollments.filter(e => e.sequenceId === s.id && e.status === "active").length;
    const msg = activeEnrollments > 0
      ? `Delete "${s.name}"? ${activeEnrollments} active enrollment${activeEnrollments === 1 ? " will be" : "s will be"} cancelled.`
      : `Delete "${s.name}"? This cannot be undone.`;
    if (!window.confirm(msg)) return;
    try {
      await window.AppData.mutate.sequenceDelete(s.id);
      window.toast && window.toast(`Deleted "${s.name}"`, "success");
    } catch (e) {
      window.toast && window.toast(`Delete failed: ${e?.message || e}`, "error");
    }
  };

  const handleToggle = async (s) => {
    const next = !s.active;
    try {
      await window.AppData.mutate.sequenceToggleActive(s.id, next);
      window.toast && window.toast(next ? `Activated "${s.name}"` : `Paused "${s.name}" — enrolled leads skip next sends`, next ? "success" : "info");
    } catch (e) {
      window.toast && window.toast(`Toggle failed: ${e?.message || e}`, "error");
    }
  };

  return (
    <div className="seq-grid" style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 14 }}>
      <SequenceList
        sequences={sequences}
        enrollments={enrollments}
        activeId={activeId}
        onSelect={setActiveId}
        onNew={() => setEditTarget("new")}
        onEdit={(s) => setEditTarget(s)}
        onDelete={handleDelete}
        onToggle={handleToggle}
        canWrite={canWrite}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {!seq && (
          <div className="panel" style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>
            <Icons.Workflow size={28} style={{ opacity: 0.5, marginBottom: 12 }}/>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>No sequence selected</div>
            <div style={{ fontSize: 12 }}>
              {sequences.length === 0
                ? (canWrite ? "Click “New” above to build your first follow-up cadence." : "Ask your manager to create a sequence.")
                : "Pick a sequence on the left."}
            </div>
          </div>
        )}

        {seq && (
          <>
            <div className="panel">
              <div className="panel-h">
                <h3>{seq.name}</h3>
                <span className="chip" style={{ fontSize: 10.5 }}>{deriveChannel(seq.steps)}</span>
                {!seq.active && <span className="chip chip-status" style={{ fontSize: 10.5 }}>inactive</span>}
                <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  <button className="btn btn-ghost" onClick={() => setShowDrilldown(d => !d)}>
                    <Icons.Users size={11}/> {showDrilldown ? "Hide enrollments" : "Show enrollments"}
                  </button>
                  {canWrite && (
                    <>
                      <button className="btn btn-ghost" onClick={() => handleToggle(seq)}>
                        {seq.active ? <><Icons.Pause size={11}/> Pause</> : <><Icons.Play size={11}/> Activate</>}
                      </button>
                      <button className="btn btn-primary" onClick={() => setEditTarget(seq)}>
                        <Icons.Edit size={11}/> Edit
                      </button>
                    </>
                  )}
                </div>
              </div>
              {seq.description && (
                <div style={{ padding: "10px 14px", fontSize: 12, color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)" }}>
                  {seq.description}
                </div>
              )}
            </div>

            <StepPreview seq={seq}/>

            {showDrilldown && (
              <EnrollmentsPanel seq={seq} enrollments={enrollments}/>
            )}
          </>
        )}
      </div>

      {editTarget && (
        <SequenceEditorModal
          seq={editTarget === "new" ? null : editTarget}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  );
}

window.PipelineSequences = PipelineSequences;

/* Snapshot for LeadDetail Enroll picker in page-pipeline.jsx.
   Kept lazy via getter so it always reflects current AppData. */
Object.defineProperty(window, "PIPELINE_SEQUENCES", {
  configurable: true,
  get() {
    const seqs = (window.AppData && window.AppData.SEQUENCES) || [];
    return seqs
      .filter(s => s.active !== false && (s.audience || "lead") === "lead")
      .map(s => ({
        id: s.id,
        name: s.name,
        steps: Array.isArray(s.steps) ? s.steps : [],
        days: totalDays(s.steps),
        channel: deriveChannel(s.steps),
      }));
  },
});

})();
