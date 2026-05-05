/* Page: Floor (rep) — single-page consolidation of:
   - Dial Queue   (was page-queue)
   - Pipeline     (was page-pipeline)
   - Calls        (was page-calls)
   - Lead mgmt    (was contextual everywhere)
   - Autodialer   (was admin-only on page-platform)

   The model: queue / pipeline / calls are VIEWS over the same lead dataset,
   not separate apps. The autodialer is a CAPABILITY toggled here. The lead
   inspector slides in from the right when a row is selected. The in-call
   panel (window.InCall) floats globally — shared with all other pages.

   Three modes:
     - "live"      → queue + autodialer + next-up (default landing)
     - "pipeline"  → kanban / list of MY pipeline
     - "history"   → recent calls + recordings + AI scoring

   v1 composes the existing PageQueue / PagePipeline / PageCalls in-place
   under a top mode-toggle. Lead inspector drawer ships in v2 once the
   underlying components emit a "lead:selected" event.
*/

(function(){
  const { useState, useEffect } = React;

  // ────────────────────────────────────────────────────────────────────────
  // Autodialer — local state pill; persists to localStorage so refresh keeps
  // the rep's dialer on/off setting. Real auto-dial wires to window.repflowCall
  // and the Vapi/Convoso connector when ON.
  // ────────────────────────────────────────────────────────────────────────
  function useAutodialer() {
    const [state, setState] = useState(() => {
      try {
        const raw = localStorage.getItem("repflow.autodialer");
        return raw ? JSON.parse(raw) : { on: false, paused: false, ratePerHr: 87 };
      } catch { return { on: false, paused: false, ratePerHr: 87 }; }
    });
    useEffect(() => {
      try { localStorage.setItem("repflow.autodialer", JSON.stringify(state)); } catch {}
    }, [state]);
    return [state, setState];
  }

  function AutodialerPill({ state, setState }) {
    const { on, paused, ratePerHr } = state;
    const status = !on ? "off" : paused ? "paused" : "on";
    const dotColor =
      status === "on"     ? "var(--accent-money)" :
      status === "paused" ? "var(--state-warning)" :
                            "var(--text-tertiary)";

    // FIX: previously the Start/Pause/Stop buttons only flipped localStorage.
    // Now they actually drive the global AutoDialBar via the autodial:* events
    // it already listens for. Queue is built from the rep's QUEUE rows.
    function buildAutodialQueue() {
      const me = (typeof window !== "undefined" && window.me && window.me()) || null;
      const myId = me?.rep_id || null;
      const queue = (AppData.QUEUE || []).slice();
      const mine = myId
        ? queue.filter(q => q.assignedRepId === myId || !q.assignedRepId)
        : queue;
      mine.sort((a, b) => (a.elapsed - b.elapsed) || (b.score - a.score));
      return mine.map(q => ({
        id: q.id, lead: q.lead, age: q.age, state: q.state, source: q.source,
        product: q.product, ap: 0, days: 0,
        heat: q.elapsed < 30 ? "hot" : q.elapsed < 90 ? "fresh" : "warm",
        phone: q.phone || null,
      }));
    }
    const startAutodial = () => {
      const queue = buildAutodialQueue();
      if (queue.length === 0) {
        window.toast && window.toast("Queue empty — nothing to autodial", "warn");
        return;
      }
      setState(s => ({ ...s, on: true, paused: false }));
      window.dispatchEvent(new CustomEvent("autodial:start", { detail: { queue } }));
    };
    const pauseAutodial  = () => { setState(s => ({ ...s, paused: true  })); window.dispatchEvent(new CustomEvent("autodial:pause")); };
    const resumeAutodial = () => { setState(s => ({ ...s, paused: false })); window.dispatchEvent(new CustomEvent("autodial:resume")); };
    const stopAutodial   = () => { setState(s => ({ ...s, on: false, paused: false })); window.dispatchEvent(new CustomEvent("autodial:stop")); };

    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "6px 12px",
        border: "1px solid var(--border-subtle)", borderRadius: 999,
        background: "var(--surface-elev)"
      }}>
        <span className="dot" style={{ background: dotColor }}></span>
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          Autodialer · <strong style={{ color: "var(--text-primary)" }}>{status.toUpperCase()}</strong>
          {on && <span style={{ color: "var(--text-tertiary)" }}> · {ratePerHr}/hr</span>}
        </span>
        {!on && (
          <button className="btn btn-ghost" style={{ padding: "3px 8px", fontSize: 11 }} onClick={startAutodial}>
            Start
          </button>
        )}
        {on && !paused && (
          <button className="btn btn-ghost" style={{ padding: "3px 8px", fontSize: 11 }} onClick={pauseAutodial}>
            Pause
          </button>
        )}
        {on && paused && (
          <button className="btn btn-ghost" style={{ padding: "3px 8px", fontSize: 11 }} onClick={resumeAutodial}>
            Resume
          </button>
        )}
        {on && (
          <button className="btn btn-ghost" style={{ padding: "3px 8px", fontSize: 11, color: "var(--state-danger)" }} onClick={stopAutodial}>
            Stop
          </button>
        )}
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────
  // Mode toggle — pill row at the top
  // ────────────────────────────────────────────────────────────────────────
  function ModeTabs({ mode, setMode }) {
    return (
      <Shared.SectionPill
        items={[
          { k: "live",      l: "Live" },
          { k: "pipeline",  l: "Pipeline" },
          { k: "deals",     l: "Deals" },
          { k: "history",   l: "History" },
          { k: "followups", l: "Follow-ups" },
        ]}
        value={mode}
        onChange={setMode}
        dense
      />
    );
  }
  function _LegacyModeTabs({ mode, setMode }) {
    const TABS = [
      { id: "live",     label: "Live",     hint: "Dial queue + autodialer" },
      { id: "pipeline", label: "Pipeline", hint: "Your book in motion" },
      { id: "history",  label: "History",  hint: "Recent calls + recordings" },
    ];
    return (
      <div style={{
        display: "inline-flex", gap: 2, padding: 3, borderRadius: 10,
        background: "var(--surface-elev)", border: "1px solid var(--border-subtle)"
      }}>
        {TABS.map(t => {
          const active = mode === t.id;
          return (
            <button
              key={t.id}
              type="button"
              className="btn"
              title={t.hint}
              onClick={() => setMode(t.id)}
              style={{
                padding: "6px 14px",
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                background: active ? "var(--accent-status)" : "transparent",
                color: active ? "var(--text-on-accent, #fff)" : "var(--text-primary)",
                border: "none",
                borderRadius: 8
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────
  // Quick-stats strip — always visible at top of Live mode
  // ────────────────────────────────────────────────────────────────────────
  function FloorTopStrip({ role }) {
    // GAP-D1 — resolve the actual signed-in viewer instead of REPS[0]=Marcus.
    const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
    const me = (meIdent?.rep_id && AppData.REPS?.find(r => r.id === meIdent.rep_id))
            || (AppData.REPS && AppData.REPS[0]);
    const tasksOpen = (AppData.TASKS || []).filter(t => t.status === "open" && (!me || !t.repId || t.repId === me.id)).length;
    const queueLen  = (AppData.QUEUE || []).length;
    const myPipeline = (AppData.PIPELINE || []).filter(p =>
      !me || p.owner === me.id
    ).length;
    return (
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        gap: 10, marginBottom: 12
      }}>
        <Shared.KpiCard label="Today's number"   value={me?.today != null ? `$${me.today.toLocaleString()}` : "—"} sub="vs $1,800 target"/>
        <Shared.KpiCard label="Dial queue"       value={queueLen}                       sub="speed-to-lead"/>
        <Shared.KpiCard label="Open tasks"       value={tasksOpen}                       sub="due today"/>
        <Shared.KpiCard label="My pipeline"      value={myPipeline}                      sub="active leads"/>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────
  // Live mode — embeds the existing PageQueue (which has queue + side panels)
  // and overlays the autodialer status. Falls back gracefully if PageQueue
  // hasn't compiled yet.
  // ────────────────────────────────────────────────────────────────────────
  function LiveMode({ onCall, role, autodialer, setAutodialer }) {
    const Queue = window.PageQueue;
    return (
      <div>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "10px 14px", marginBottom: 12,
          background: "var(--surface-elev)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 10
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 12, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>
              Live floor
            </span>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              The queue auto-advances when the autodialer is ON.
              Hit <strong style={{ color: "var(--text-primary)" }}>N</strong> to grab the next lead manually.
            </span>
          </div>
          <AutodialerPill state={autodialer} setState={setAutodialer}/>
        </div>
        {Queue ? <Queue role={role} onCall={onCall}/> : <div style={{ padding: 20, color: "var(--text-tertiary)" }}>Loading queue…</div>}
      </div>
    );
  }

  function PipelineMode({ role }) {
    const P = window.PagePipeline;
    return P ? <P role={role}/> : <div style={{ padding: 20, color: "var(--text-tertiary)" }}>Loading pipeline…</div>;
  }

  function HistoryMode({ role }) {
    const P = window.PageCalls;
    return P ? <P role={role}/> : <div style={{ padding: 20, color: "var(--text-tertiary)" }}>Loading call history…</div>;
  }

  function DealsMode({ role }) {
    const Form = window.DealWriteForm;
    const Recent = window.RecentDeals;
    const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
    const me = (meIdent?.rep_id && AppData.REPS?.find(r => r.id === meIdent.rep_id))
            || (AppData.REPS && AppData.REPS[0]);
    const [refreshKey, setRefreshKey] = useState(0);
    if (!Form || !Recent) {
      return <div style={{ padding: 20, color: "var(--text-tertiary)" }}>Loading deal-write form…</div>;
    }
    return (
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 14, alignItems: "start" }}>
        <Form key={refreshKey} onWritten={() => setRefreshKey(k => k + 1)}/>
        <Recent repId={me?.id} key={"recent-" + refreshKey}/>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────
  // Follow-ups mode — three sections:
  //   1. Templates — list of follow-up text templates. Owner edits any;
  //      manager edits only templates owned by their downline; rep is
  //      read-only.
  //   2. My workflows — workflow assignments for the current rep. Toggle
  //      on/off. Manager+owner see the per-rep matrix instead.
  //   3. Recent runs — scheduled / sent / pending_creds runs.
  // ────────────────────────────────────────────────────────────────────────
  const TRIGGER_LABEL = {
    after_call: "after call", after_appt: "after appt",
    after_app: "after app submitted", after_voicemail: "after voicemail",
    manual: "manual fire only",
  };

  function FollowupsMode({ role }) {
    const me = (typeof window !== "undefined" && window.me && window.me()) || null;
    const isOwner = role === "owner";
    const isManager = role === "manager";
    const isRep = role === "rep";

    // Re-render on mutation events so toggles + saves reflect immediately.
    const [, force] = useState(0);
    useEffect(() => {
      const h = () => force(n => n + 1);
      window.addEventListener("data:mutated", h);
      window.addEventListener("data:hydrated", h);
      return () => {
        window.removeEventListener("data:mutated", h);
        window.removeEventListener("data:hydrated", h);
      };
    }, []);

    const reps      = window.AppData?.REPS || [];
    const templates = window.AppData?.FOLLOWUP_TEMPLATES || [];
    const workflows = window.AppData?.WORKFLOWS || [];
    const assigns   = window.AppData?.WORKFLOW_ASSIGNMENTS || [];
    const runs      = window.AppData?.FOLLOWUP_RUNS || [];

    // Manager scope: filter templates to those owned by downline reps.
    const downlineIds = (window.scopeRepIds && window.scopeRepIds()) || null;
    const visibleTemplates = isManager && downlineIds
      ? templates.filter(t => downlineIds.includes(t.ownerRepId))
      : templates;
    const visibleAssigns = isManager && downlineIds
      ? assigns.filter(a => downlineIds.includes(a.repId))
      : assigns;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <TemplatesSection
          templates={visibleTemplates}
          reps={reps}
          me={me}
          canEdit={isOwner || isManager}
          isOwner={isOwner}
          downlineIds={downlineIds}
        />
        <WorkflowsSection
          workflows={workflows}
          assignments={visibleAssigns}
          reps={reps}
          me={me}
          role={role}
          downlineIds={downlineIds}
        />
        <RunsSection runs={runs} templates={templates}/>
      </div>
    );
  }

  function TemplatesSection({ templates, reps, me, canEdit, isOwner, downlineIds }) {
    const [editing, setEditing] = useState(null); // null = list, {} = new, {id,...} = edit

    if (editing !== null) {
      return <TemplateEditor
        initial={editing}
        reps={reps} me={me} isOwner={isOwner} downlineIds={downlineIds}
        onClose={() => setEditing(null)}
      />;
    }

    return (
      <div className="panel">
        <div className="panel-h">
          <Icons.MessageSquare size={13}/>
          <h3>Follow-up templates</h3>
          <span className="meta">{templates.length}</span>
          {canEdit && (
            <button className="btn btn-ghost" style={{ marginLeft: "auto", fontSize: 11 }}
              onClick={() => setEditing({})}>
              <Icons.Plus size={11}/> New template
            </button>
          )}
        </div>
        <div style={{ padding: "0 4px 8px" }}>
          {templates.length === 0 && (
            <div style={{ padding: 16, fontSize: 12, color: "var(--text-tertiary)" }}>
              No templates yet. {canEdit ? "Add one above." : "Ask your manager to set some up."}
            </div>
          )}
          {templates.map(t => {
            const owner = reps.find(r => r.id === t.ownerRepId);
            const editable = canEdit && (isOwner || (downlineIds || []).includes(t.ownerRepId));
            return (
              <div key={t.id} style={{
                padding: "10px 14px", borderBottom: "1px solid var(--border-subtle)",
                display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center"
              }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 500 }}>{t.name}</span>
                    <span className="chip" style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                      {t.channel} · {TRIGGER_LABEL[t.triggerEvent] || t.triggerEvent} · {t.delayMinutes}m
                    </span>
                    {!t.active && <span className="chip" style={{ fontSize: 10, color: "var(--state-warning)" }}>inactive</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{t.body}</div>
                  {owner && (
                    <div style={{ fontSize: 10.5, color: "var(--text-quaternary)", marginTop: 4 }}>
                      owner: {owner.name} · scope: {t.scope}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {editable && (
                    <button className="btn btn-ghost" onClick={() => setEditing(t)} style={{ fontSize: 11 }}>
                      <Icons.Edit size={11}/> Edit
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function TemplateEditor({ initial, reps, me, isOwner, downlineIds, onClose }) {
    const isNew = !initial.id;
    const [t, setT] = useState({
      id: initial.id || null,
      name: initial.name || "",
      body: initial.body || "",
      channel: initial.channel || "sms",
      delayMinutes: initial.delayMinutes ?? 30,
      triggerEvent: initial.triggerEvent || "after_call",
      scope: initial.scope || "rep",
      active: initial.active !== false,
      ownerRepId: initial.ownerRepId || (me && me.rep_id) || (reps[0] && reps[0].id),
    });
    const set = (k, v) => setT(x => ({ ...x, [k]: v }));

    const ownableReps = isOwner ? reps : reps.filter(r => (downlineIds || []).includes(r.id));

    const save = async () => {
      if (!t.name.trim() || !t.body.trim()) return;
      try { await window.AppData.mutate.followupTemplateSave({ ...t }); onClose(); }
      catch {}
    };
    const remove = async () => {
      if (!t.id) return;
      if (!confirm(`Delete template "${t.name}"?`)) return;
      try { await window.AppData.mutate.followupTemplateDelete(t.id); onClose(); }
      catch {}
    };

    return (
      <div className="panel" style={{ padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600 }}>{isNew ? "New template" : "Edit template"}</h3>
          <button className="btn btn-ghost" style={{ marginLeft: "auto" }} onClick={onClose}>
            <Icons.X size={11}/> Close
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Shared.Field label="Name">
            <input className="text-input" value={t.name} onChange={e => set("name", e.target.value)} placeholder="Post-call recap" />
          </Shared.Field>
          <Shared.Field label="Owner rep">
            <select className="text-input" value={t.ownerRepId || ""} onChange={e => set("ownerRepId", e.target.value)}>
              {ownableReps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Shared.Field>
          <Shared.Field label="Channel">
            <select className="text-input" value={t.channel} onChange={e => set("channel", e.target.value)}>
              <option value="sms">SMS (Twilio)</option>
              <option value="imessage">iMessage (SendBlue)</option>
              <option value="email">Email (Mailgun)</option>
              <option value="phone_link">Phone Link (local)</option>
            </select>
          </Shared.Field>
          <Shared.Field label="Trigger">
            <select className="text-input" value={t.triggerEvent} onChange={e => set("triggerEvent", e.target.value)}>
              <option value="after_call">After call ends</option>
              <option value="after_appt">After appt booked</option>
              <option value="after_app">After app submitted</option>
              <option value="after_voicemail">After voicemail drop</option>
              <option value="manual">Manual fire</option>
            </select>
          </Shared.Field>
          <Shared.Field label="Delay (min)">
            <input className="text-input" type="number" min="0" value={t.delayMinutes}
              onChange={e => set("delayMinutes", parseInt(e.target.value || "0", 10))}/>
          </Shared.Field>
          <Shared.Field label="Scope">
            <select className="text-input" value={t.scope} onChange={e => set("scope", e.target.value)}>
              <option value="rep">My reps only</option>
              <option value="manager">Manager downline</option>
              <option value="owner">Whole agency</option>
            </select>
          </Shared.Field>
          <div style={{ gridColumn: "1 / -1" }}>
            <Shared.Field label="Body (use {{first_name}}, {{agent_first}}, {{agent_phone}})">
              <textarea className="text-input" rows={3} value={t.body}
                onChange={e => set("body", e.target.value)}
                placeholder="Hey {{first_name}}, great chat — sending the plan summary now."/>
            </Shared.Field>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <input type="checkbox" checked={t.active} onChange={e => set("active", e.target.checked)}/>
            Active
          </label>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button className="btn btn-primary" onClick={save} disabled={!t.name.trim() || !t.body.trim()}>
            <Icons.Check size={11}/> {isNew ? "Create" : "Save"}
          </button>
          {!isNew && (
            <button className="btn btn-ghost" onClick={remove} style={{ color: "var(--state-danger)" }}>
              <Icons.X size={11}/> Delete
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose} style={{ marginLeft: "auto" }}>Cancel</button>
        </div>
      </div>
    );
  }

  function WorkflowsSection({ workflows, assignments, reps, me, role, downlineIds }) {
    const isRep = role === "rep";
    const myId = me && me.rep_id;
    const visibleReps = (role === "owner" || !downlineIds) ? reps
                       : reps.filter(r => downlineIds.includes(r.id));
    const targetReps = isRep ? reps.filter(r => r.id === myId) : visibleReps;

    if (isRep) {
      // Rep view: simple toggle list of workflows assigned to me.
      const myAssigns = assignments.filter(a => a.repId === myId);
      const items = workflows.map(w => {
        const a = myAssigns.find(x => x.workflowId === w.id);
        return { w, enabled: a ? !!a.enabled : !!w.active };
      });
      return (
        <div className="panel">
          <div className="panel-h">
            <Icons.Sparkles size={13}/>
            <h3>My workflows</h3>
            <span className="meta">{items.filter(i => i.enabled).length} of {items.length} on</span>
          </div>
          <div style={{ padding: "0 4px 8px" }}>
            {items.length === 0 && (
              <div style={{ padding: 16, fontSize: 12, color: "var(--text-tertiary)" }}>
                Your manager hasn't assigned any workflows yet.
              </div>
            )}
            {items.map(({ w, enabled }) => (
              <div key={w.id} style={{
                padding: "10px 14px", borderBottom: "1px solid var(--border-subtle)",
                display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center"
              }}>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 500 }}>{w.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>
                    {w.runs_per_day || w.runsPerDay || "—"} runs/day · {w.last_run_status || w.lastRunStatus || "—"}
                  </div>
                </div>
                <button
                  className="btn btn-ghost"
                  onClick={() => window.AppData.mutate.workflowAssignmentSetEnabled(w.id, myId, !enabled)}
                  style={{ fontSize: 11, color: enabled ? "var(--accent-money)" : "var(--text-tertiary)" }}>
                  {enabled ? <><Icons.Check size={11}/> on</> : <>off</>}
                </button>
              </div>
            ))}
          </div>
        </div>
      );
    }

    // Manager / owner view: per-rep × workflow matrix.
    return (
      <div className="panel">
        <div className="panel-h">
          <Icons.Sparkles size={13}/>
          <h3>Workflow assignments</h3>
          <span className="meta">{targetReps.length} reps · {workflows.length} workflows</span>
        </div>
        <div style={{ overflowX: "auto", padding: "0 8px 8px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "8px 6px", color: "var(--text-tertiary)", fontWeight: 500, position: "sticky", left: 0, background: "var(--bg-base)" }}>Rep</th>
                {workflows.map(w => (
                  <th key={w.id} style={{ textAlign: "center", padding: "8px 6px", color: "var(--text-tertiary)", fontWeight: 500 }}>{w.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {targetReps.map(r => (
                <tr key={r.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <td style={{ padding: "8px 6px", whiteSpace: "nowrap", position: "sticky", left: 0, background: "var(--bg-base)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Shared.Avatar rep={r} size={18}/>
                      <span>{r.name}</span>
                    </div>
                  </td>
                  {workflows.map(w => {
                    const a = assignments.find(x => x.workflowId === w.id && x.repId === r.id);
                    const enabled = a ? !!a.enabled : false;
                    return (
                      <td key={w.id} style={{ textAlign: "center", padding: "6px 4px" }}>
                        <button
                          className="btn btn-ghost"
                          style={{
                            padding: "4px 10px", fontSize: 11,
                            color: enabled ? "var(--accent-money)" : "var(--text-quaternary)",
                          }}
                          onClick={() => window.AppData.mutate.workflowAssignmentSetEnabled(w.id, r.id, !enabled)}>
                          {enabled ? "on" : "off"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {targetReps.length === 0 && (
            <div style={{ padding: 16, fontSize: 12, color: "var(--text-tertiary)" }}>
              No reps in scope.
            </div>
          )}
        </div>
      </div>
    );
  }

  function RunsSection({ runs, templates }) {
    const recent = runs.slice(0, 12);
    const ago = (iso) => {
      if (!iso) return "—";
      const ms = Date.now() - new Date(iso).getTime();
      if (ms < 60_000) return "just now";
      const m = Math.round(ms / 60000);
      if (m < 60) return `${m}m`;
      const h = Math.round(m / 60);
      if (h < 24) return `${h}h`;
      return `${Math.round(h / 24)}d`;
    };
    const TONE = {
      sent: "money", scheduled: undefined, sending: "info",
      pending_creds: "warn", failed: "danger", cancelled: undefined,
    };
    return (
      <div className="panel">
        <div className="panel-h">
          <Icons.Activity size={13}/>
          <h3>Recent follow-up runs</h3>
          <span className="meta">{recent.length}</span>
        </div>
        {recent.length === 0 && (
          <div style={{ padding: 16, fontSize: 12, color: "var(--text-tertiary)" }}>
            No runs yet — schedule a template after a call to see them here.
          </div>
        )}
        {recent.map(r => {
          const t = templates.find(x => x.id === r.templateId);
          const tone = TONE[r.status];
          return (
            <div key={r.id} style={{
              padding: "8px 14px", borderBottom: "1px solid var(--border-subtle)",
              display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, alignItems: "center"
            }}>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 500 }}>{t ? t.name : r.templateId}</div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                  {r.recipient || "(no recipient)"} · {r.channel}
                  {r.failureDetail && <span style={{ color: "var(--state-warning)", marginLeft: 6 }}>· {r.failureDetail}</span>}
                </div>
              </div>
              <span className="chip" style={{
                fontSize: 10.5,
                color: tone === "money" ? "var(--accent-money)"
                     : tone === "warn"  ? "var(--state-warning)"
                     : tone === "danger" ? "var(--state-danger)"
                     : tone === "info" ? "var(--accent-status)"
                     : "var(--text-tertiary)",
              }}>{r.status}</span>
              <span style={{ fontSize: 10.5, color: "var(--text-quaternary)", whiteSpace: "nowrap" }}>{ago(r.scheduledFor || r.createdAt)}</span>
            </div>
          );
        })}
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────
  // Page entry — picks the mode from URL ?floor=X (so deep links work) and
  // remembers the last mode in localStorage.
  // ────────────────────────────────────────────────────────────────────────
  function PageFloor({ onCall, role = "rep", defaultMode }) {
    const initialMode = (() => {
      // Explicit prop wins (used by legacy /pipeline, /queue, /calls routes)
      if (defaultMode && ["live","pipeline","deals","history","followups"].includes(defaultMode)) return defaultMode;
      try {
        const url = new URL(window.location.href);
        const m = url.searchParams.get("floor");
        if (m && ["live","pipeline","deals","history","followups"].includes(m)) return m;
        const stored = localStorage.getItem("repflow.floor.mode");
        if (stored && ["live","pipeline","deals","history","followups"].includes(stored)) return stored;
      } catch {}
      return "live";
    })();
    const [mode, setMode] = useState(initialMode);
    // If parent route changes (Pipeline → Dial Queue), follow it
    useEffect(() => {
      if (defaultMode && ["live","pipeline","deals","history","followups"].includes(defaultMode)) {
        setMode(defaultMode);
      }
    }, [defaultMode]);
    const [autodialer, setAutodialer] = useAutodialer();

    useEffect(() => {
      try { localStorage.setItem("repflow.floor.mode", mode); } catch {}
    }, [mode]);

    // Hotkey: N = next call (only in Live mode and only when autodialer is OFF)
    useEffect(() => {
      const handler = (e) => {
        if (mode !== "live") return;
        if (document.activeElement && /input|textarea|select/i.test(document.activeElement.tagName)) return;
        if ((e.key === "n" || e.key === "N") && !e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          onCall && onCall();
        }
      };
      window.addEventListener("keydown", handler);
      return () => window.removeEventListener("keydown", handler);
    }, [mode, onCall]);

    return (
      <div className="page-pad">
        <div className="page-h">
          <div>
            <div className="page-title">Floor</div>
            <div className="page-sub">
              Queue · pipeline · calls · autodialer — one workspace.
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <ModeTabs mode={mode} setMode={setMode}/>
            <button className="btn btn-primary" onClick={onCall} title="Hotkey: N">
              <Icons.Phone size={13}/> Next call
            </button>
          </div>
        </div>

        {mode === "live" && <FloorTopStrip role={role}/>}

        {mode === "live"      && <LiveMode      role={role} onCall={onCall} autodialer={autodialer} setAutodialer={setAutodialer}/>}
        {mode === "pipeline"  && <PipelineMode  role={role}/>}
        {mode === "deals"     && <DealsMode     role={role}/>}
        {mode === "history"   && <HistoryMode   role={role}/>}
        {mode === "followups" && <FollowupsMode role={role}/>}
      </div>
    );
  }

  window.PageFloor = PageFloor;
})();
