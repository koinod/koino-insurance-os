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
    // Default rate-per-hour comes from agency config so a single owner-side
    // edit propagates to every rep's dialer. Falls back to 87 only when the
    // helper isn't loaded yet.
    const _defaultRate = (window.AgencyConfig && window.AgencyConfig.get && window.AgencyConfig.get().autodial_rate_per_hr) || 87;
    const [state, setState] = useState(() => {
      try {
        const raw = localStorage.getItem("repflow.autodialer");
        return raw ? JSON.parse(raw) : { on: false, paused: false, ratePerHr: _defaultRate };
      } catch { return { on: false, paused: false, ratePerHr: _defaultRate }; }
    });
    useEffect(() => {
      try { localStorage.setItem("repflow.autodialer", JSON.stringify(state)); } catch {}
    }, [state]);
    return [state, setState];
  }

  // Build the autodial source list. Three sources merge in priority order:
  //   1. Manual autodial queue (AutodialQueue.list()) — leads the rep pinned
  //      from CRM / Pipeline / Lead Drip. These dial first.
  //   2. The rep's own pipeline rows in dialable stages (New + Contacted)
  //      with a phone number.
  //   3. Inbound QUEUE leads assigned to the rep or unassigned.
  // Deduplicated by id. Phoneless leads are dropped so the dialer never
  // wastes a slot on something it can't ring.
  function buildAutodialQueue() {
    const me   = (typeof window !== "undefined" && window.me && window.me()) || null;
    const myId = me?.rep_id || null;
    const seen = new Set();
    const out  = [];

    const push = (q) => {
      if (!q || !q.id || seen.has(q.id)) return;
      if (!q.phone) return;
      seen.add(q.id);
      out.push(q);
    };

    // 1. Manual pinned queue first — explicit user intent wins.
    const pinned = (window.AutodialQueue && window.AutodialQueue.list()) || [];
    pinned.forEach(p => push({
      id: p.id, lead: p.lead, age: p.age, state: p.state, source: p.source || "pinned",
      product: p.product, ap: p.ap || 0, days: 0,
      heat: "fresh", phone: p.phone || null, score: p.score || 80,
    }));

    // 2. My pipeline (New + Contacted).
    if (myId) {
      (AppData.PIPELINE || []).forEach(p => {
        if (p.owner !== myId) return;
        if (p.stage !== "New" && p.stage !== "Contacted") return;
        push({
          id: "p-" + p.id, lead: p.lead, age: p.age, state: p.state, source: p.source || "pipeline",
          product: p.product, ap: p.ap || 0, days: p.days || 0,
          heat: p.heat || "warm", phone: p.phone || null,
          score: p.heat === "hot" ? 92 : p.heat === "fresh" ? 88 : p.heat === "warm" ? 78 : 60,
        });
      });
    }

    // 3. Inbound queue assigned-to-me or unassigned.
    (AppData.QUEUE || []).forEach(q => {
      if (myId && q.assignedRepId && q.assignedRepId !== myId) return;
      push({
        id: q.id, lead: q.lead, age: q.age, state: q.state, source: q.source || "inbound",
        product: q.product, ap: 0, days: 0,
        heat: q.elapsed < 30 ? "hot" : q.elapsed < 90 ? "fresh" : "warm",
        phone: q.phone || null, score: q.score || 75,
      });
    });

    out.sort((a, b) => (b.score - a.score));
    return out;
  }

  function AutodialBar({ state, setState }) {
    const { on, paused, ratePerHr } = state;
    const [, force] = useState(0);

    // Re-render when the manual queue or pipeline mutates so the count stays live.
    useEffect(() => {
      const fn = () => force(n => n + 1);
      ["autodial:queue:changed", "data:hydrated", "data:mutated", "data:realtime"].forEach(e => window.addEventListener(e, fn));
      return () => ["autodial:queue:changed", "data:hydrated", "data:mutated", "data:realtime"].forEach(e => window.removeEventListener(e, fn));
    }, []);

    const queue = buildAutodialQueue();
    const total = queue.length;
    const status = !on ? "off" : paused ? "paused" : "on";

    const start = () => {
      if (queue.length === 0) {
        window.toast && window.toast("No dialable leads — pin some from CRM / Pipeline / Lead Drip first", "warn");
        return;
      }
      setState(s => ({ ...s, on: true, paused: false }));
      window.dispatchEvent(new CustomEvent("autodial:start", { detail: { queue } }));
    };
    const pause  = () => { setState(s => ({ ...s, paused: true  })); window.dispatchEvent(new CustomEvent("autodial:pause")); };
    const resume = () => { setState(s => ({ ...s, paused: false })); window.dispatchEvent(new CustomEvent("autodial:resume")); };
    const stop   = () => { setState(s => ({ ...s, on: false, paused: false })); window.dispatchEvent(new CustomEvent("autodial:stop")); };

    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
          <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>Autodialer</span>
          <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
            <strong style={{ color: "var(--text-primary)" }}>{total}</strong> dialable · <strong style={{ color: on ? "var(--accent-money)" : "var(--text-tertiary)" }}>{status.toUpperCase()}</strong>
            {on && <span style={{ color: "var(--text-tertiary)" }}> · {ratePerHr}/hr</span>}
          </span>
        </div>

        {!on && (
          <button className="btn btn-primary" onClick={start} disabled={total === 0}
            style={{ background: total === 0 ? "var(--bg-raised)" : "var(--accent-money)", color: total === 0 ? "var(--text-tertiary)" : "#022", fontSize: 13, padding: "8px 16px", fontWeight: 600 }}>
            <Icons.Phone size={13}/> Start calling{total > 0 ? ` ${total}` : ""}
          </button>
        )}
        {on && !paused && (
          <>
            <button className="btn" onClick={pause} style={{ background: "var(--state-warning)", color: "#022", fontWeight: 600 }}><Icons.Pause size={12}/> Pause</button>
            <button className="btn" onClick={stop} style={{ color: "var(--state-danger)" }}><Icons.X size={12}/> Stop</button>
          </>
        )}
        {on && paused && (
          <>
            <button className="btn btn-primary" onClick={resume} style={{ background: "var(--accent-money)", color: "#022", fontWeight: 600 }}><Icons.Play size={12}/> Resume</button>
            <button className="btn" onClick={stop} style={{ color: "var(--state-danger)" }}><Icons.X size={12}/> Stop</button>
          </>
        )}
      </div>
    );
  }

  /* Pinned autodial queue panel — shows what the rep has manually queued up
     from CRM / Pipeline / Lead Drip with per-row remove + clear-all. */
  function PinnedAutodialPanel() {
    const [, force] = useState(0);
    useEffect(() => {
      const fn = () => force(n => n + 1);
      window.addEventListener("autodial:queue:changed", fn);
      return () => window.removeEventListener("autodial:queue:changed", fn);
    }, []);
    const items = (window.AutodialQueue && window.AutodialQueue.list()) || [];
    if (items.length === 0) return null;
    return (
      <div className="panel" style={{ marginBottom: 12 }}>
        <div className="panel-h">
          <Icons.Phone size={13} style={{ color: "var(--accent-money)" }}/>
          <h3>Pinned to autodial</h3>
          <span className="meta">{items.length}</span>
          <button className="btn btn-ghost" style={{ marginLeft: "auto", fontSize: 11 }}
            onClick={() => window.AutodialQueue.clear()}>Clear all</button>
        </div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1.5fr 1fr 1fr 90px 30px" }}>
            <div>Lead</div><div>Source</div><div>Product</div><div>Phone</div><div></div>
          </div>
          {items.map(it => (
            <div key={it.id} className="row" style={{ gridTemplateColumns: "1.5fr 1fr 1fr 90px 30px" }}>
              <div style={{ fontWeight: 500, fontSize: 12.5 }}>{it.lead || "—"}</div>
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{it.source || "—"}</div>
              <div style={{ fontSize: 11.5 }}><span className="chip">{it.product || "—"}</span></div>
              <div className="tabular" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{it.phone || <span style={{ color: "var(--state-warning)" }}>no phone</span>}</div>
              <button className="icon-btn" onClick={() => window.AutodialQueue.remove(it.id)} title="Remove" style={{ color: "var(--state-danger)" }}>
                <Icons.X size={11}/>
              </button>
            </div>
          ))}
        </div>
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
  // ────────────────────────────────────────────────────────────────────────
  // Quick-stats strip — always visible at top of Live mode
  // ────────────────────────────────────────────────────────────────────────
  /* ─── CallRecorderPanel ────────────────────────────────────────────────
   * Always-on call recorder for any role on the Floor.
   *  • Rec/Pause/Stop with live timer + mic level meter
   *  • Toggle: mic-only vs mic+system audio (system grabs the lead's voice
   *    via tab-share — Chrome/Edge only)
   *  • Recent recordings list scoped by RLS:
   *      rep    → own only
   *      manager→ own + downline
   *      owner  → whole agency
   *  • Click a row → playback in-place via signed URL (live) or
   *    objectURL (demo/local)
   *  • Set outcome dropdown (sale / callback / voicemail / no-answer / DNC)
   */
  function CallRecorderPanel({ role }) {
    const [state, setState] = useState("idle");
    const [elapsed, setElapsed] = useState(0);
    const [level, setLevel]     = useState(0);
    const [mode, setMode]       = useState(() => {
      try { return localStorage.getItem("repflow.recorder.mode") || "mic"; } catch { return "mic"; }
    });
    const [recordings, setRecordings] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [playUrl, setPlayUrl]       = useState(null);
    const [scope, setScope]           = useState(role === "rep" ? "self" : "team");

    const recorderRef = React.useRef(null);
    const me = window.me && window.me();
    const repId = me?.rep_id || "demo-rep";

    useEffect(() => { try { localStorage.setItem("repflow.recorder.mode", mode); } catch {} }, [mode]);

    // Load recent recordings + refresh on mutation
    const refresh = React.useCallback(async () => {
      const list = await (window.CallRecorderUtils?.listRecentCalls?.({ scope, limit: 25 }) || Promise.resolve([]));
      setRecordings(list);
    }, [scope]);
    useEffect(() => {
      refresh();
      const h = (e) => { if (e.detail?.table === "call_recordings") refresh(); };
      window.addEventListener("data:mutated", h);
      return () => window.removeEventListener("data:mutated", h);
    }, [refresh]);

    // Auto-record on autodial. When the autodialer fires a dial, capture audio
    // for the duration — covers both pickup and voicemail without needing the
    // agent to differentiate. Skip if the rep is already recording (manual or
    // a prior leg of the same multi-dial). Per-commandId guard avoids re-arming
    // when a multi-dial sequence sleeps + redials.
    const armedCommandRef = React.useRef(null);
    useEffect(() => {
      const onStart = async (e) => {
        const commandId = e?.detail?.commandId || null;
        if (!commandId) return;
        if (armedCommandRef.current === commandId) return;
        if (state !== "idle") return;
        if (!window.CallRecorder) return;
        armedCommandRef.current = commandId;
        try {
          const rec = new window.CallRecorder({
            mode, repId,
            leadId: e.detail.leadId || null,
            onTick:  (s) => setElapsed(s),
            onState: (s) => setState(s),
            onLevel: (l) => setLevel(l),
          });
          recorderRef.current = rec;
          await rec.start();
        } catch (err) {
          armedCommandRef.current = null;
          window.toast && window.toast(`Auto-record failed: ${err?.message || err}`, "warn");
        }
      };
      const onEnd = (e) => {
        const commandId = e?.detail?.commandId || null;
        if (!commandId || armedCommandRef.current !== commandId) return;
        armedCommandRef.current = null;
        // Only stop if we're still in an auto-armed recording — if the rep
        // manually hit Stop already, recorderRef.current?.stop() is a no-op.
        try { recorderRef.current?.stop(); } catch {}
      };
      window.addEventListener("autodial:call:start", onStart);
      window.addEventListener("autodial:call:end",   onEnd);
      return () => {
        window.removeEventListener("autodial:call:start", onStart);
        window.removeEventListener("autodial:call:end",   onEnd);
      };
    }, [state, mode, repId]);

    const start = async () => {
      if (!window.CallRecorder) return window.toast?.("Recorder not loaded — refresh the page", "warn");
      const rec = new window.CallRecorder({
        mode, repId,
        onTick: (s) => setElapsed(s),
        onState: (s) => setState(s),
        onLevel: (l) => setLevel(l),
      });
      recorderRef.current = rec;
      await rec.start();
    };
    const pause   = () => recorderRef.current?.pause();
    const resume  = () => recorderRef.current?.resume();
    const stop    = () => recorderRef.current?.stop();
    const cancel  = () => { recorderRef.current?.cancel(); setElapsed(0); setLevel(0); };

    const play = async (call) => {
      if (selectedId === call.id) { setSelectedId(null); setPlayUrl(null); return; }
      setSelectedId(call.id);
      setPlayUrl(null);
      const url = await (window.CallRecorderUtils?.getPlaybackUrl?.(call) || Promise.resolve(null));
      setPlayUrl(url);
    };

    const setOutcome = async (callId, outcome) => {
      await window.CallRecorderUtils?.setOutcome?.(callId, outcome, null);
      refresh();
    };

    const fmtTime = window.CallRecorderUtils?.fmtTime || ((s) => `${Math.floor((s || 0) / 60)}:${String(Math.floor((s || 0) % 60)).padStart(2, "0")}`);

    const recording = state === "recording";
    const paused    = state === "paused";
    const uploading = state === "uploading";

    return (
      <div className="panel" style={{ marginBottom: 12 }}>
        {/* Single-row header. flexWrap:nowrap + explicit flex:"0 0 auto" on
            children keeps Start button on the same line as the title, even
            on narrower viewports where it previously wrapped to a second row
            (extra padding showed up because of that wrap). */}
        <div className="panel-h" style={{ flexWrap: "nowrap" }}>
          <Icons.Phone size={13} style={{ color: recording ? "var(--state-danger)" : (paused ? "var(--state-warning)" : "var(--text-secondary)"), flex: "0 0 auto" }}/>
          <h3 style={{ flex: "0 0 auto" }}>Call recorder</h3>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)", flex: "0 0 auto", whiteSpace: "nowrap" }}>
            {recording ? <><span className="dot" style={{ background: "var(--state-danger)", animation: "pulse 1.4s infinite", marginRight: 4 }}/>recording · {fmtTime(elapsed)}</>
              : paused ? `paused · ${fmtTime(elapsed)}`
              : uploading ? "uploading…"
              : "idle"}
          </span>
          {recording && (
            <div style={{ width: 70, height: 6, background: "var(--bg-raised)", borderRadius: 3, overflow: "hidden", flex: "0 0 auto" }}>
              <div style={{ width: `${Math.min(100, level * 200)}%`, height: "100%", background: "var(--accent-money)", transition: "width 80ms linear" }}/>
            </div>
          )}
          {!recording && !paused && !uploading && (
            <button className="btn btn-primary" onClick={start} style={{ background: "var(--state-danger)", color: "white", flex: "0 0 auto" }}>
              <span className="dot" style={{ background: "white", marginRight: 6 }}/>Start recording
            </button>
          )}
          {recording && (<>
            <button className="btn" onClick={pause} style={{ flex: "0 0 auto" }}><Icons.Pause size={12}/> Pause</button>
            <button className="btn btn-primary" onClick={stop} style={{ background: "var(--accent-money)", color: "white", flex: "0 0 auto" }}>
              <Icons.Check size={12}/> Stop &amp; save
            </button>
            <button className="btn btn-ghost" onClick={cancel} style={{ color: "var(--text-tertiary)", flex: "0 0 auto" }}>
              <Icons.X size={12}/> Discard
            </button>
          </>)}
          {paused && (<>
            <button className="btn btn-primary" onClick={resume} style={{ flex: "0 0 auto" }}><Icons.Play size={12}/> Resume</button>
            <button className="btn" onClick={stop} style={{ flex: "0 0 auto" }}><Icons.Check size={12}/> Stop &amp; save</button>
            <button className="btn btn-ghost" onClick={cancel} style={{ color: "var(--text-tertiary)", flex: "0 0 auto" }}>
              <Icons.X size={12}/> Discard
            </button>
          </>)}
          <div style={{ flex: 1, minWidth: 0 }}/>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flex: "0 0 auto" }}>
            <Shared.Select value={mode} onChange={setMode}
              options={[{ v: "mic", l: "Mic only" }, { v: "mic+system", l: "Mic + system audio" }]}/>
            {role !== "rep" && (
              <Shared.Select value={scope} onChange={setScope}
                options={role === "owner"
                  ? [{ v: "self", l: "My calls" }, { v: "team", l: "Whole agency" }]
                  : [{ v: "self", l: "My calls" }, { v: "team", l: "Downline" }]}/>
            )}
          </div>
        </div>

        {/* Recent recordings list */}
        <div className="list" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <div className="list-h" style={{ gridTemplateColumns: "1fr 90px 130px 120px 110px" }}>
            <div>When · who</div>
            <div>Length</div>
            <div>Outcome</div>
            <div>Channels</div>
            <div></div>
          </div>
          {recordings.length === 0 ? (
            <div style={{ padding: 16, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
              No recordings yet. Click <strong>Start recording</strong> to capture your next call.
            </div>
          ) : recordings.map(r => {
            const isOpen = selectedId === r.id;
            const fromOther = r.rep_id !== repId;
            return (
              <React.Fragment key={r.id}>
                <div className="row" style={{ gridTemplateColumns: "1fr 90px 130px 120px 110px", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 12.5 }}>
                      {new Date(r.started_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                      {fromOther && <span className="chip" style={{ marginLeft: 6, fontSize: 9.5 }}>{r.rep_id}</span>}
                    </div>
                    {r.notes && <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{r.notes}</div>}
                  </div>
                  <div className="tabular" style={{ fontSize: 12 }}>{fmtTime(r.duration_sec || 0)}</div>
                  <div>
                    <Shared.Select value={r.outcome || ""} onChange={(v) => setOutcome(r.id, v)}
                      options={[
                        { v: "",         l: "—" },
                        { v: "answered", l: "Answered" },
                        { v: "voicemail",l: "Voicemail" },
                        { v: "no-answer",l: "No answer" },
                        { v: "callback", l: "Callback" },
                        { v: "sale",     l: "Sale" },
                        { v: "dnc",      l: "DNC" },
                      ]}/>
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>
                    {r.channels === "mic+system" ? "mic + tab" : "mic"}
                  </div>
                  <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                    <button className="btn btn-ghost" onClick={() => play(r)} style={{ padding: "4px 10px", fontSize: 11 }}>
                      <Icons.Play size={11}/> {isOpen ? "Close" : "Play"}
                    </button>
                  </div>
                </div>
                {isOpen && (
                  <div className="row" style={{
                    gridColumn: "1 / -1",
                    gridTemplateColumns: "1fr",
                    height: "auto",
                    minHeight: 64,
                    padding: "14px 18px",
                    background: "var(--bg-raised)",
                  }}>
                    {playUrl
                      ? <audio controls autoPlay src={playUrl} style={{ width: "100%", height: 36 }}/>
                      : <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>Loading playback…</div>}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    );
  }

  function FloorTopStrip({ role }) {
    // Re-render on data:mutated so kanban stage moves + deal writes flip
    // Today's number live without a refresh.
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

    // Resolve the actual signed-in viewer. Fall back to REPS[0] only in demo.
    const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
    const me = (meIdent?.rep_id && AppData.REPS?.find(r => r.id === meIdent.rep_id))
            || (window.isDemoAgency && window.isDemoAgency() ? (AppData.REPS && AppData.REPS[0]) : null);
    const tasksOpen = (AppData.TASKS || []).filter(t => t.status === "open" && (!me || !t.repId || t.repId === me.id))?.length;
    const queueLen  = (AppData.QUEUE || []).length;
    const myPipeline = (AppData.PIPELINE || []).filter(p =>
      !me || p.owner === me.id
    ).length;

    // Live Today's number: seed value PLUS expected commission on any policies
    // issued today owned by this rep. _syncPolicyFromPipeline (data.jsx) appends
    // POLICIES rows when a kanban deal flips to App In / Issued, so this
    // recomputes the moment the rep clicks the chip.
    // TARGET: prefer rep-tier-specific monthly target / 22 working days, falling
    // back to agency-wide daily_target_default (1800), then 1800.
    const _cfg = (window.AgencyConfig && window.AgencyConfig.get && window.AgencyConfig.get()) || null;
    const _tierTargets = _cfg?.tier_targets || {};
    const _monthlyTarget = (me?.tier && _tierTargets[me.tier]) || 0;
    const TARGET = _monthlyTarget > 0
      ? Math.round(_monthlyTarget / 22)
      : (_cfg?.daily_target_default || 1800);
    const todayISO = new Date().toISOString().slice(0, 10);
    const myPolicies = (AppData.POLICIES || []).filter(p => !me || p.owner === me.id);
    const todayBumped = myPolicies
      .filter(p => (p.status === "issued" || p.status === "active") && (p.issuedAt || "").slice(0, 10) === todayISO)
      .reduce((a, p) => a + (p.expectedCommission || Math.round((p.ap || 0) * (p.compRatePct || 22) / 100) || 0), 0);
    const today = (me?.today || 0) + todayBumped;
    const aheadBy = today - TARGET;
    const todaySub = aheadBy >= 0
      ? `$${aheadBy.toLocaleString()} ahead of $${TARGET.toLocaleString()}`
      : `$${(TARGET - today).toLocaleString()} to target`;

    return (
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        gap: 10, marginBottom: 12
      }}>
        <Shared.KpiCard label="Today's number"
          value={`$${today.toLocaleString()}`}
          sub={todaySub}
          trend={aheadBy >= 0 ? "up" : undefined}/>
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
  // Probe /api/twilio-token once on mount. If 503 (env vars missing), show a
  // CTA so the rep knows why dials are routing to system dialer + transcription
  // is mic-only. Cached on window so we don't re-probe across page changes.
  function useTwilioStatus() {
    const [status, setStatus] = useState(() => window.__twilioStatus || "unknown"); // unknown | ready | unconfigured | error
    useEffect(() => {
      if (window.__twilioStatus && window.__twilioStatus !== "unknown") { setStatus(window.__twilioStatus); return; }
      let cancelled = false;
      (async () => {
        try {
          const r = await fetch("/api/twilio-token", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
          if (cancelled) return;
          const next = r.status === 503 ? "unconfigured" : r.ok ? "ready" : "error";
          window.__twilioStatus = next;
          setStatus(next);
        } catch {
          if (cancelled) return;
          window.__twilioStatus = "error"; setStatus("error");
        }
      })();
      return () => { cancelled = true; };
    }, []);
    return status;
  }

  function TwilioCTA() {
    const goSettings = () => window.dispatchEvent(new CustomEvent("nav:goto", { detail: { page: "settings" }}));
    return (
      <button onClick={goSettings} className="btn"
        title="Click to open Settings → Calling and configure Twilio"
        style={{
          padding: "6px 12px", borderRadius: 999,
          background: "color-mix(in oklch, var(--state-warning) 12%, var(--surface-elev))",
          border: "1px solid color-mix(in oklch, var(--state-warning) 40%, transparent)",
          color: "var(--state-warning)", fontSize: 12, fontWeight: 500,
          display: "flex", alignItems: "center", gap: 6,
        }}>
        <Icons.AlertTriangle size={12}/> Twilio not configured
        <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>· dials route to system dialer · transcription mic-only</span>
        <Icons.ArrowRight size={11}/>
      </button>
    );
  }

  function LiveMode({ onCall, role }) {
    const Queue = window.PageQueue;
    const Redial = window.RedialQueuePanel;
    const Pacing = window.PacingBadge;
    const twStatus = useTwilioStatus();

    // Hot-key R = pull due retries into autodial
    useEffect(() => {
      const onKey = (e) => {
        if (document.activeElement && /input|textarea|select/i.test(document.activeElement.tagName)) return;
        if ((e.key === "r" || e.key === "R") && !e.metaKey && !e.ctrlKey && !e.altKey) {
          if (window.pullDueRetries) {
            e.preventDefault();
            window.pullDueRetries();
          }
        }
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, []);

    return (
      <div>
        <div style={{
          display: "flex", justifyContent: "flex-end", alignItems: "center",
          padding: "8px 0 12px",
          gap: 10, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>press <span className="kbd mono" style={{ fontSize: 10 }}>R</span> to pull due retries</span>
          {Pacing && (() => { const P = Pacing; return <P/>; })()}
          {twStatus === "unconfigured" && <TwilioCTA/>}
        </div>

        <PinnedAutodialPanel/>

        {/* Rep gets a two-col (queue + redial). Manager/owner views drop the
            redial column — DispatchView already has its own 320px Producer
            Insights side panel, and stacking both squeezes the queue list to
            ~80px wide (header text wraps one letter per line). */}
        {(() => {
          const isQueueOwnSidebar = role !== "rep";
          const cols = isQueueOwnSidebar ? "minmax(0, 1fr)" : "minmax(0, 1fr) 360px";
          return (
            <div style={{ display: "grid", gridTemplateColumns: cols, gap: 14, alignItems: "start" }}>
              <div style={{ minWidth: 0 }}>
                {Queue ? <Queue role={role} onCall={onCall}/> : <div style={{ padding: 20, color: "var(--text-tertiary)" }}>Loading queue…</div>}
              </div>
              {!isQueueOwnSidebar && (
                <div>
                  {Redial ? <Redial compact/> : null}
                </div>
              )}
            </div>
          );
        })()}
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
            || (window.isDemoAgency && window.isDemoAgency() ? (AppData.REPS && AppData.REPS[0]) : null);
    const [refreshKey, setRefreshKey] = useState(0);
    // "Won → Write deal" on the in-call panel stashes the active lead id
    // before navigating here. Consume + clear so the same lead isn't
    // re-bound on the next visit.
    const defaultLeadId = React.useMemo(() => {
      try {
        const v = sessionStorage.getItem("repflow.dealwrite.leadId");
        if (v) sessionStorage.removeItem("repflow.dealwrite.leadId");
        return v || "";
      } catch { return ""; }
    }, [refreshKey]);
    if (!Form || !Recent) {
      return <div style={{ padding: 20, color: "var(--text-tertiary)" }}>Loading deal-write form…</div>;
    }
    return (
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 14, alignItems: "start" }}>
        <Form key={refreshKey + ":" + (defaultLeadId || "")} defaultLeadId={defaultLeadId} onWritten={() => setRefreshKey(k => k + 1)}/>
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

    // Reps don't author follow-up systems — they execute them. Show an action
    // queue (recent calls + active deals → 1-click trigger) plus today's
    // queued runs. Managers/owners keep the template + workflow authoring UI.
    if (isRep) {
      return <RepActionQueue templates={templates} runs={runs} workflows={workflows} assignments={assigns} me={me}/>;
    }

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

  // ────────────────────────────────────────────────────────────────────────
  // Rep action queue — replaces the templates editor for reps.
  //
  // Design: reps execute, they don't build. The page shows three things:
  //   1. Calls that just ended → "Send recap" / "Voicemail dropoff" / "Confirm appt"
  //   2. Active deals owned by me → stage-aware next action ("Day-2 nudge" on App In, etc.)
  //   3. Already-queued automations today → read-only proof that things are firing
  //
  // Every action chip calls AppData.mutate.followupDispatch(templateId, phone, leadId, repId)
  // which inserts into FOLLOWUP_RUNS and broadcasts data:mutated, so the
  // "Today's queued" panel updates instantly.
  // ────────────────────────────────────────────────────────────────────────
  function RepActionQueue({ templates, runs, workflows, assignments, me }) {
    const repId = me?.rep_id;
    const RECORDINGS = window.AppData?.RECORDINGS || [];
    const PIPELINE   = window.AppData?.PIPELINE   || [];

    // Filter to me. RECORDINGS often have no repId (demo seed), so fall back to "show all".
    const myCalls = repId
      ? (RECORDINGS.filter(r => r.repId === repId).length > 0
          ? RECORDINGS.filter(r => r.repId === repId)
          : RECORDINGS.slice(0, 5))
      : RECORDINGS.slice(0, 5);
    const myPipe = repId ? PIPELINE.filter(p => p.owner === repId) : PIPELINE;
    const myRuns = (repId ? runs.filter(r => !r.repId || r.repId === repId) : runs).slice(0, 8);

    // Active workflow assignments for me — read-only count, no toggle.
    const myAssigns = (assignments || []).filter(a => a.repId === repId && a.enabled);
    const myWorkflowCount = workflows.filter(w => myAssigns.some(a => a.workflowId === w.id))?.length;

    // Match templates to a triggering event, plus any "manual" templates as universal options.
    const active = templates.filter(t => t.active !== false);
    const tmplFor = (event) => [
      ...active.filter(t => t.triggerEvent === event),
      ...active.filter(t => t.triggerEvent === "manual"),
    ];
    const stageMap = {
      // Suggested template event per pipeline stage
      "New":        "after_voicemail",
      "Contacted":  "after_call",
      "Quoted":     "after_appt",
      "App In":     "after_call",
      "Issued":     "after_app",
    };

    const fire = async (template, lead) => {
      if (!template) return;
      const phone = lead.phone || lead.phoneNumber || null;
      if (!phone) {
        window.toast && window.toast(`Add a phone to ${lead.lead || lead.name} first — dial / SMS will skip this lead`, "warn");
        return;
      }
      const leadKey = lead.id || lead.leadId || lead.lead;
      try {
        await AppData.mutate.followupDispatch(template.id, phone, leadKey, repId);
        window.toast && window.toast(`${template.name} queued for ${lead.lead || lead.name}`, "success");
      } catch (e) {
        window.toast && window.toast(`Queue failed: ${e?.message || e}`, "error");
      }
    };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Just-ended calls — fire post-call automations */}
        <div className="panel">
          <div className="panel-h">
            <Icons.Headset size={13}/>
            <h3>Just-ended calls</h3>
            <span className="meta">{myCalls.length} recent</span>
            <span className="meta" style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-tertiary)" }}>
              Click to fire the automation — no manager approval needed
            </span>
          </div>
          {myCalls.length === 0 && (
            <div style={{ padding: 16, fontSize: 12, color: "var(--text-tertiary)" }}>No recent calls.</div>
          )}
          {myCalls.map(call => {
            const callTmpls = tmplFor("after_call");
            const vmTmpls   = tmplFor("after_voicemail");
            const apptTmpls = tmplFor("after_appt");
            return (
              <div key={call.id} style={{
                padding: "12px 14px", borderTop: "1px solid var(--border-subtle)",
                display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center"
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{call.lead}</div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>
                    {call.date} · score <span style={{ color: call.score >= 80 ? "var(--accent-money)" : call.score >= 60 ? "var(--state-warning)" : "var(--state-danger)" }}>{call.score}</span>
                    {call.flags?.soa && call.flags.soa !== "n/a" && <> · SOA {call.flags.soa}</>}
                  </div>
                  {call.ai && <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.4 }}>{call.ai}</div>}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 360 }}>
                  {callTmpls[0] && (
                    <button className="btn btn-primary" style={{ fontSize: 11.5 }} onClick={() => fire(callTmpls[0], call)}>
                      <Icons.Send size={11}/> {callTmpls[0].name}
                    </button>
                  )}
                  {vmTmpls[0] && vmTmpls[0].id !== callTmpls[0]?.id && (
                    <button className="btn" style={{ fontSize: 11.5 }} onClick={() => fire(vmTmpls[0], call)}>
                      <Icons.Phone size={11}/> {vmTmpls[0].name}
                    </button>
                  )}
                  {apptTmpls[0] && apptTmpls[0].id !== callTmpls[0]?.id && (
                    <button className="btn" style={{ fontSize: 11.5 }} onClick={() => fire(apptTmpls[0], call)}>
                      <Icons.Calendar size={11}/> {apptTmpls[0].name}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Active deals — stage-aware next action */}
        <div className="panel">
          <div className="panel-h">
            <Icons.Pipeline size={13}/>
            <h3>Active deals · suggested next action</h3>
            <span className="meta">{myPipe.length}</span>
          </div>
          {myPipe.length === 0 && (
            <div style={{ padding: 16, fontSize: 12, color: "var(--text-tertiary)" }}>No active deals — go grab one from the queue.</div>
          )}
          {myPipe.slice(0, 8).map(p => {
            const event = stageMap[p.stage] || "after_call";
            const matches = tmplFor(event);
            const primary = matches[0];
            const secondary = matches[1] && matches[1].id !== primary?.id ? matches[1] : null;
            return (
              <div key={p.id} style={{
                padding: "10px 14px", borderTop: "1px solid var(--border-subtle)",
                display: "grid", gridTemplateColumns: "1.4fr 1fr auto", gap: 10, alignItems: "center"
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{p.lead}</div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>
                    {p.product} · {p.state} · {p.ap ? `$${p.ap.toLocaleString()}` : "—"}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span className="chip" style={{ alignSelf: "flex-start", fontSize: 10.5 }}>{p.stage}</span>
                  <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>next: {p.next}</span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {primary && (
                    <button className="btn btn-primary" style={{ fontSize: 11.5 }} onClick={() => fire(primary, p)}>
                      <Icons.Send size={11}/> {primary.name}
                    </button>
                  )}
                  {secondary && (
                    <button className="btn" style={{ fontSize: 11.5 }} onClick={() => fire(secondary, p)}>
                      {secondary.name}
                    </button>
                  )}
                  {!primary && (
                    <span style={{ fontSize: 11, color: "var(--text-quaternary)" }}>no template wired</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Today's queued runs — read-only */}
        <div className="panel">
          <div className="panel-h">
            <Icons.Clock size={13}/>
            <h3>Queued for me today</h3>
            <span className="meta">{myRuns.length}</span>
            <span className="meta" style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-tertiary)" }}>
              {myWorkflowCount} workflow{myWorkflowCount === 1 ? "" : "s"} running for you
            </span>
          </div>
          {myRuns.length === 0 && (
            <div style={{ padding: 16, fontSize: 12, color: "var(--text-tertiary)" }}>
              Nothing queued yet. Fire one above and it'll show up here.
            </div>
          )}
          {myRuns.map(r => {
            const t = templates.find(x => x.id === r.templateId);
            const when = r.scheduledFor ? new Date(r.scheduledFor) : null;
            const whenLbl = when ? `${when.getMonth()+1}/${when.getDate()} ${when.getHours()}:${String(when.getMinutes()).padStart(2,"0")}` : "—";
            return (
              <div key={r.id} style={{
                padding: "8px 14px", borderTop: "1px solid var(--border-subtle)",
                display: "grid", gridTemplateColumns: "1fr 100px 90px 80px", gap: 10, alignItems: "center", fontSize: 12
              }}>
                <div>{t?.name || r.templateId} <span style={{ color: "var(--text-tertiary)" }}>· {r.recipient}</span></div>
                <div style={{ color: "var(--text-tertiary)" }}>{r.channel}</div>
                <div style={{ color: "var(--text-tertiary)" }} className="tabular">{whenLbl}</div>
                <div>
                  <span className={`chip ${r.status === "sent" ? "chip-money" : r.status === "scheduled" ? "chip-info" : r.status === "failed" ? "" : ""}`}
                        style={r.status === "failed" ? { color: "var(--state-danger)", borderColor: "var(--state-danger)" } : undefined}>
                    {r.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
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
          </div>
        </div>

        {/* Autodialer strip — the headline capability of the Floor. Always
            visible regardless of mode so the rep can start, pause, resume,
            or stop the dialer without leaving Pipeline / Deals / History.
            Auto-record is wired in CallRecorderPanel via autodial:call:start
            and autodial:call:end events. */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", marginBottom: 12,
          background: "var(--surface-elev)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 10,
          gap: 14, flexWrap: "wrap",
        }}>
          <AutodialBar state={autodialer} setState={setAutodialer}/>
          <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", textAlign: "right", flex: "0 1 auto" }}>
            Auto-records every dial · pickup or voicemail
          </span>
        </div>

        {/* Always-visible call recorder + recent-calls list (role-aware via RLS) */}
        <CallRecorderPanel role={role}/>

        {mode === "live" && <FloorTopStrip role={role}/>}

        {mode === "live"      && <LiveMode      role={role} onCall={onCall}/>}
        {mode === "pipeline"  && <PipelineMode  role={role}/>}
        {mode === "deals"     && <DealsMode     role={role}/>}
        {mode === "history"   && <HistoryMode   role={role}/>}
        {mode === "followups" && <FollowupsMode role={role}/>}
      </div>
    );
  }

  window.PageFloor = PageFloor;
})();
