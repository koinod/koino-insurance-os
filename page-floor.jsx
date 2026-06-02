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
    const seenById    = new Set();
    const seenByLead  = new Set();
    const seenByPhone = new Set();
    const out  = [];

    // Dedup across all three sources. Each source prefixes the display id
    // ("pipe-X" / "crm-X" / "p-X" / raw queue id) so id-only dedup misses a
    // lead that's both pinned (from Pipeline drawer → "pipe-X") and also
    // auto-included from the rep's PIPELINE rows ("p-X") — the rep would
    // burn two dial slots on the same person. Fall back to phone-only when
    // leadId is absent (e.g. CSV-imported pinned numbers).
    const push = (q) => {
      if (!q || !q.id || !q.phone) return;
      if (seenById.has(q.id)) return;
      const leadKey  = q.leadId || null;
      const phoneKey = String(q.phone).replace(/\D/g, "");
      if (leadKey && seenByLead.has(leadKey)) return;
      if (!leadKey && phoneKey && seenByPhone.has(phoneKey)) return;
      seenById.add(q.id);
      if (leadKey) seenByLead.add(leadKey);
      if (phoneKey) seenByPhone.add(phoneKey);
      out.push(q);
    };

    // 1. Manual pinned queue first — explicit user intent wins.
    const pinned = (window.AutodialQueue && window.AutodialQueue.list()) || [];
    pinned.forEach(p => push({
      id: p.id,
      leadId: p.lead_id || p.leadId || null,
      lead: p.lead, age: p.age, state: p.state, source: p.source || "pinned",
      product: p.product, ap: p.ap || 0, days: 0,
      heat: "fresh", phone: p.phone || null, score: p.score || 80,
    }));

    // 2. My pipeline (New + Contacted).
    if (myId) {
      (AppData.PIPELINE || []).forEach(p => {
        if (p.owner !== myId) return;
        if (p.stage !== "New" && p.stage !== "Contacted") return;
        push({
          id: "p-" + p.id,
          leadId: p.id,
          lead: p.lead, age: p.age, state: p.state, source: p.source || "pipeline",
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
        id: q.id,
        leadId: q.lead_id || q.leadId || null,
        lead: q.lead, age: q.age, state: q.state, source: q.source || "inbound",
        product: q.product, ap: 0, days: 0,
        heat: q.elapsed < 30 ? "hot" : q.elapsed < 90 ? "fresh" : "warm",
        phone: q.phone || null, score: q.score || 75,
      });
    });

    out.sort((a, b) => (b.score - a.score));
    return out;
  }

  const FLOOR_POWER_TOGGLES = {
    record: true,
    sms_pre: false,
    sms_post: true,
    email: false,
    ai_voicemail: true,
    ai_assistant: true,
    whisper: true,
    sms_lane: "sendblue_then_twilio",
  };

  // Editable SMS bodies the dialer can send. {name}/{rep}/{agency} are
  // substituted at send time. Persisted per-rep (localStorage mirror +
  // rep_settings upsert) so the rep owns the exact words that go out —
  // not just an on/off switch. Physical-phone dialing fires pre_call from
  // the browser before the tel: handoff; the cloud worker honours the rest.
  const DEFAULT_SMS_TEMPLATES = {
    pre_call:  "Hi {name}, it's {rep} with {agency} — giving you a quick call right now about your coverage options.",
    post_call: "Thanks for your time, {name}! I'll follow up with the options we discussed. — {rep}",
  };

  function loadSmsTemplates() {
    try {
      const stored = JSON.parse(localStorage.getItem("repflow.floor.sms_templates") || "{}");
      return { ...DEFAULT_SMS_TEMPLATES, ...stored };
    } catch { return { ...DEFAULT_SMS_TEMPLATES }; }
  }

  function renderSmsTemplate(body, lead) {
    const me = (typeof window !== "undefined" && window.me && window.me()) || {};
    const rep = me.full_name || me.name || "your agent";
    const agency = (window.__agencyName) || me.agency_name || "our agency";
    const name = (lead && (lead.lead || lead.name || lead.first_name)) || "there";
    return String(body || "")
      .replace(/\{name\}/g, String(name).split(" ")[0])
      .replace(/\{rep\}/g, rep)
      .replace(/\{agency\}/g, agency);
  }

  // Physical-phone providers dial one call at a time through the rep's own
  // device, so parallel "lines" and cloud-leg AI features don't apply.
  function isPhoneHandoffProvider(p) {
    return p === "phone_link" || p === "bluetooth_phone";
  }

  function isManagerRole(role) {
    return ["manager", "owner", "admin", "imo_owner", "super_admin"].includes(role);
  }

  function money(n) {
    const v = Number(n || 0);
    return `$${Math.round(v).toLocaleString()}`;
  }

  function resolveFloorRep() {
    const ident = (typeof window !== "undefined" && window.me && window.me()) || null;
    return (ident?.rep_id && AppData.REPS?.find(r => r.id === ident.rep_id))
        || (window.isDemoAgency && window.isDemoAgency() ? (AppData.REPS && AppData.REPS[0]) : null)
        || null;
  }

  function heatScore(h) {
    return h === "hot" ? 40 : h === "fresh" ? 32 : h === "warm" ? 22 : 8;
  }

  function stageScore(s) {
    return s === "New" ? 34 : s === "Contacted" ? 30 : s === "Quoted" ? 24 : s === "App In" ? 10 : 0;
  }

  function buildFloorDialerLeads(role, filters) {
    const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
    const myRepId = meIdent?.rep_id || resolveFloorRep()?.id || null;
    const f = filters || {};
    const matchesFilter = (p) => {
      if (f.source && (p.source || "") !== f.source) return false;
      if (f.state && (p.state || "").toUpperCase() !== f.state.toUpperCase()) return false;
      if (f.product && (p.product || "") !== f.product) return false;
      if (f.stage && (p.stage || "") !== f.stage) return false;
      if (f.heat && (p.heat || "") !== f.heat) return false;
      return true;
    };
    const seen = new Set();
    const rows = [];
    const push = (p, sourceRank) => {
      if (!p || !p.phone || !p.id || seen.has(p.id)) return;
      if (p.stage === "Issued" || p.stage === "Lost") return;
      if (!isManagerRole(role) && myRepId && p.owner && p.owner !== myRepId) return;
      if (!matchesFilter(p)) return;
      seen.add(p.id);
      const expectedAp = Number(p.ap || 0);
      const score = sourceRank + heatScore(p.heat) + stageScore(p.stage) + Math.min(22, expectedAp / 180) - Math.min(12, Number(p.days || 0));
      rows.push({ ...p, expectedAp, dialScore: score });
    };

    (AppData.PIPELINE || []).forEach(p => push(p, 10));

    // Queue rows are useful for the rail, but the power dialer session should
    // prefer pipeline UUIDs. Only add queue rows that already point at a lead.
    (AppData.QUEUE || []).forEach(q => {
      const leadId = q.lead_id || q.leadId;
      if (!leadId) return;
      push({
        id: leadId,
        lead: q.lead,
        age: q.age,
        state: q.state,
        stage: "New",
        product: q.product,
        ap: 0,
        days: 0,
        last: q.elapsed ? `${q.elapsed}s` : "",
        next: "First dial",
        source: q.source || "inbound",
        owner: q.assignedRepId || myRepId,
        consent: "verified",
        heat: q.elapsed < 30 ? "hot" : "fresh",
        phone: q.phone || null,
      }, 24);
    });

    return rows.sort((a, b) => b.dialScore - a.dialScore);
  }

  function buildFloorPowerQueue(leads) {
    if (window.PowerDialerApi?.buildDialQueue) return window.PowerDialerApi.buildDialQueue(leads);
    return (leads || []).map(l => {
      const raw = String(l.phone || "").trim();
      const digits = raw.replace(/\D/g, "");
      const phone = raw.startsWith("+") ? raw.replace(/[^\d+]/g, "")
        : digits.length === 10 ? `+1${digits}`
        : digits.length === 11 && digits.startsWith("1") ? `+${digits}`
        : raw.replace(/[^\d+]/g, "");
      return {
        lead_id: /^[0-9a-f-]{36}$/i.test(String(l.id || "")) ? l.id : null,
        phone,
        state: l.state || null,
        name: l.lead || l.name || "Lead",
        product: l.product || null,
        source: l.source || null,
      };
    }).filter(l => l.phone && l.phone.replace(/\D/g, "").length >= 10);
  }

  async function floorDialerFetch(path, opts = {}) {
    if (window.PowerDialerApi?.dialerFetch) return window.PowerDialerApi.dialerFetch(path, opts);
    const headers = { ...(opts.headers || {}) };
    try {
      const sb = window.getSupabase && window.getSupabase();
      const { data } = await sb.auth.getSession();
      const jwt = data?.session?.access_token || null;
      if (jwt) headers.authorization = `Bearer ${jwt}`;
    } catch {}
    return fetch(path, { ...opts, headers });
  }

  function useRecentPowerAttempts(repId) {
    const [rows, setRows] = useState([]);
    useEffect(() => {
      const sb = window.getSupabase && window.getSupabase();
      if (!sb || !repId) return;
      let alive = true;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const load = async () => {
        try {
          const { data, error } = await sb.from("call_attempts")
            .select("id,session_id,lead_id,to_number,fired_at,answered_at,disposition,amd_result,duration_sec,ai_summary,ai_outcome")
            .eq("rep_id", repId)
            .gte("fired_at", today.toISOString())
            .order("fired_at", { ascending: false })
            .limit(8);
          if (!error && alive) setRows(data || []);
        } catch {}
      };
      load();
      const ch = sb.channel(`floor-attempts:${repId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "call_attempts", filter: `rep_id=eq.${repId}` }, load)
        .subscribe();
      return () => { alive = false; try { sb.removeChannel(ch); } catch {} };
    }, [repId]);
    return rows;
  }

  function useDialerReadiness(agencyId) {
    const [state, setState] = useState({ status: "checking", ready: null, blocked: null });
    useEffect(() => {
      if (!agencyId || (window.isDemoAgency && window.isDemoAgency())) {
        setState({ status: "demo", ready: null, blocked: null });
        return;
      }
      let cancelled = false;
      (async () => {
        try {
          const r = await fetch(`/api/system/dial-readiness?agency_id=${encodeURIComponent(agencyId)}`);
          const j = await r.json();
          if (!cancelled) setState({ status: r.ok ? "ok" : "error", ready: j.ready_reps, blocked: j.blocked_reps, blockers: j.blockers || [] });
        } catch {
          if (!cancelled) setState({ status: "error", ready: null, blocked: null });
        }
      })();
      return () => { cancelled = true; };
    }, [agencyId]);
    return state;
  }

  function useViewportWidth() {
    const [width, setWidth] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 1440));
    useEffect(() => {
      const onResize = () => setWidth(window.innerWidth || 1440);
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }, []);
    return width;
  }

  function AutodialBar({ state, setState }) {
    const { on, paused, ratePerHr } = state;
    const [, force] = useState(0);
    const [settingsOpen, setSettingsOpen] = useState(false);

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
        <button className="icon-btn" onClick={() => setSettingsOpen(true)} title="Customize outcome auto-actions">
          <Icons.Settings size={13}/>
        </button>
        {settingsOpen && window.AutodialOutcomeSettings && (() => {
          const M = window.AutodialOutcomeSettings;
          return <M onClose={() => setSettingsOpen(false)}/>;
        })()}
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
  function ModeTabs({ mode, setMode, role }) {
    // Floor is the dialer cockpit — power dialer / autodialer ONLY.
    // Deals → Pipeline / Book. Follow-ups → Today. Dispatch (manager) → Today
    // team panel. Keeping Floor single-purpose so the dial loop never competes
    // with closing forms or task queues for screen real estate.
    return null;
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
          // CallRecorder.start() doesn't throw on mic-denied / HTTPS / quota
          // failures — it surfaces them via setState("error") + an internal
          // toast. Catch that here so the end-event handler doesn't try to
          // stop a dead recorder and the next dial can re-arm cleanly.
          if (rec.state === "error") {
            armedCommandRef.current = null;
            recorderRef.current = null;
          }
        } catch (err) {
          armedCommandRef.current = null;
          recorderRef.current = null;
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

    // Slim horizontal chip bar — Floor is dialer-first; team/manager KPIs live
    // in Today. This bar surfaces the 4 numbers that affect whether the rep
    // should keep dialing right now.
    const chip = (label, value, sub, tone) => (
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "6px 12px", borderRadius: 999,
        background: "var(--bg-raised)", border: "1px solid var(--border-subtle)",
        fontSize: 12, lineHeight: 1.2, whiteSpace: "nowrap",
      }}>
        <span style={{ color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.4, fontSize: 10 }}>{label}</span>
        <strong style={{ color: tone || "var(--text-primary)", fontWeight: 600 }}>{value}</strong>
        {sub && <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>· {sub}</span>}
      </div>
    );
    return (
      <div style={{
        display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center"
      }}>
        {chip("Today", `$${today.toLocaleString()}`, todaySub, aheadBy >= 0 ? "var(--accent-money)" : undefined)}
        {chip("Queue", queueLen, queueLen > 0 ? "speed-to-lead" : null)}
        {chip("Tasks", tasksOpen, tasksOpen > 0 ? "due" : null)}
        {chip("Pipeline", myPipeline, "active")}
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

  function DialMetric({ label, value, sub, tone }) {
    return (
      <div style={{
        minWidth: 0,
        padding: "10px 12px",
        background: "var(--surface-elev)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 8,
      }}>
        <div style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
        <div style={{ marginTop: 4, fontSize: 20, lineHeight: 1, fontWeight: 700, color: tone || "var(--text-primary)" }}>{value}</div>
        {sub && <div style={{ marginTop: 5, fontSize: 11, color: "var(--text-tertiary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>}
      </div>
    );
  }

  function DialQueueRail({ leads, activeId }) {
    return (
      <div style={{
        background: "var(--surface-elev)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 8,
        overflow: "hidden",
      }}>
        <div className="panel-h">
          <Icons.PhoneCall size={13} style={{ color: "var(--accent-money)" }}/>
          <h3>Call queue</h3>
          <span className="meta">{leads.length}</span>
        </div>
        <div style={{ maxHeight: 612, overflowY: "auto" }}>
          {leads.length === 0 && (
            <div style={{ padding: 16, fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
              <strong style={{ display: "block", color: "var(--text-secondary)", marginBottom: 4 }}>No dialable phone leads yet.</strong>
              Add phone numbers in Pipeline or Book, then come back here to start the power dialer.
            </div>
          )}
          {leads.slice(0, 28).map((l, i) => {
            const active = l.id === activeId;
            return (
              <div key={l.id} style={{
                padding: "10px 12px",
                borderTop: "1px solid var(--border-subtle)",
                background: active ? "color-mix(in oklch, var(--accent-money) 12%, transparent)" : "transparent",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span className="mono" style={{ fontSize: 10.5, color: active ? "var(--accent-money)" : "var(--text-quaternary)", width: 18 }}>{i + 1}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.lead || "Lead"}</div>
                    <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {l.stage || "New"} · {l.product || "No product"} · {l.state || "—"}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: l.heat === "hot" || l.heat === "fresh" ? "var(--accent-money)" : "var(--text-tertiary)" }}>{l.heat || "warm"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 7, fontSize: 10.5, color: "var(--text-tertiary)" }}>
                  <span>{l.source || "pipeline"}</span>
                  <span>{l.expectedAp ? `${money(l.expectedAp)} AP` : "AP open"}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function CallStageAssist({ lead }) {
    const stages = [
      { k: "connect", label: "Connect", main: lead ? `${lead.source || "Lead"} · ${lead.state || "state open"}` : "Waiting" },
      { k: "discover", label: "Discovery", main: "goal · budget · beneficiary" },
      { k: "health", label: "Health", main: "tobacco · meds · conditions" },
      { k: "quote", label: "Quote", main: lead?.age && lead?.state ? "ready for rating" : "age + state needed" },
      { k: "app", label: "Application", main: "rep-controlled carrier app" },
      { k: "wrap", label: "Wrap", main: "outcome · summary · follow-up" },
    ];
    return (
      <div style={{
        background: "var(--surface-elev)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 8,
        overflow: "hidden",
      }}>
        <div className="panel-h">
          <Icons.Sparkles size={13} style={{ color: "var(--accent-money)" }}/>
          <h3>Call assist</h3>
          <span className="meta">stage-aware</span>
        </div>
        <div style={{ padding: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(112px, 1fr))", gap: 8 }}>
          {stages.map((s, idx) => (
            <div key={s.k} style={{
              minHeight: 76,
              padding: 10,
              borderRadius: 7,
              background: idx === 0 ? "color-mix(in oklch, var(--accent-money) 12%, var(--bg-raised))" : "var(--bg-raised)",
              border: idx === 0 ? "1px solid color-mix(in oklch, var(--accent-money) 35%, transparent)" : "1px solid var(--border-subtle)",
            }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: idx === 0 ? "var(--accent-money)" : "var(--text-primary)" }}>{s.label}</div>
              <div style={{ marginTop: 7, fontSize: 11, lineHeight: 1.35, color: "var(--text-tertiary)" }}>{s.main}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function RecentAttemptsStrip({ attempts }) {
    const label = (a) => a.disposition || a.amd_result || (a.answered_at ? "answered" : "dialed");
    return (
      <div style={{
        background: "var(--surface-elev)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 8,
        overflow: "hidden",
      }}>
        <div className="panel-h">
          <Icons.Activity size={13}/>
          <h3>Recent dials</h3>
          <span className="meta">today</span>
        </div>
        {attempts.length === 0 ? (
          <div style={{ padding: 14, fontSize: 12, color: "var(--text-tertiary)" }}>No power-dialer attempts yet today.</div>
        ) : attempts.slice(0, 5).map(a => (
          <div key={a.id} style={{ padding: "9px 12px", borderTop: "1px solid var(--border-subtle)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <span className="mono" style={{ fontSize: 11, color: "var(--text-secondary)" }}>{a.to_number}</span>
              <span className="chip" style={{ fontSize: 10.5, color: a.disposition === "connected" ? "var(--accent-money)" : "var(--text-tertiary)" }}>{label(a)}</span>
            </div>
            {(a.ai_summary || a.ai_outcome) && (
              <div style={{ marginTop: 5, fontSize: 10.5, color: "var(--text-tertiary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {a.ai_outcome || a.ai_summary}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  /* Distinct values for the filter dropdowns. Built off PIPELINE + QUEUE
     pre-filter so the user always sees the full set of options, not just
     the survivors of the current filter. */
  function buildFloorFilterOptions(role) {
    const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
    const myRepId = meIdent?.rep_id || resolveFloorRep()?.id || null;
    const sources = new Set(), states = new Set(), products = new Set(), stages = new Set();
    const consider = (p) => {
      if (!p || !p.phone) return;
      if (p.stage === "Issued" || p.stage === "Lost") return;
      if (!isManagerRole(role) && myRepId && p.owner && p.owner !== myRepId) return;
      if (p.source) sources.add(p.source);
      if (p.state)  states.add(String(p.state).toUpperCase());
      if (p.product) products.add(p.product);
      if (p.stage) stages.add(p.stage);
    };
    (AppData.PIPELINE || []).forEach(consider);
    (AppData.QUEUE || []).forEach(q => consider({ ...q, stage: q.stage || "New", owner: q.assignedRepId || myRepId }));
    const sortAlpha = (a, b) => String(a).localeCompare(String(b));
    return {
      sources:  [...sources].sort(sortAlpha),
      states:   [...states].sort(sortAlpha),
      products: [...products].sort(sortAlpha),
      stages:   [...stages].sort(sortAlpha),
    };
  }

  /* Floor lead filter strip. Renders above the cockpit. Filters drive
     buildFloorDialerLeads(). Source = "FB Lead Form" / "T65 list" / CSV
     source label / etc — anything an admin or rep set via CSV import. */
  function FloorLeadFilters({ filters, setFilters, options, leadCount, onUploadCsv }) {
    const active = Object.values(filters).filter(Boolean).length;
    const set = (k, v) => setFilters(s => ({ ...s, [k]: v || "" }));
    const Sel = ({ k, label, opts }) => (
      <select
        value={filters[k] || ""}
        onChange={(e) => set(k, e.target.value)}
        className="text-input"
        style={{ padding: "6px 8px", fontSize: 12, minWidth: 0, width: "auto", background: filters[k] ? "color-mix(in oklch, var(--accent-money) 16%, var(--surface-elev))" : "var(--surface-elev)" }}
      >
        <option value="">{label}: any</option>
        {opts.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
    const listLabel = filters.source || "All lists";
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {/* Primary: Lead list selector — dominant control. The dialer
            queue is built strictly from rows that match this list. */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          padding: "12px 14px",
          background: "color-mix(in oklch, var(--accent-money) 8%, var(--surface-elev))",
          border: "1px solid color-mix(in oklch, var(--accent-money) 35%, var(--border-subtle))",
          borderRadius: 10,
        }}>
          <Icons.ListChecks size={15} style={{ color: "var(--accent-money)" }}/>
          <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>Lead list</span>
          <select
            value={filters.source || ""}
            onChange={(e) => set("source", e.target.value)}
            className="text-input"
            style={{ padding: "7px 10px", fontSize: 13, fontWeight: 600, minWidth: 220, background: "var(--surface-elev)" }}
          >
            <option value="">All lists (everything dialable)</option>
            {options.sources.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <div style={{ flex: 1 }}/>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            <span style={{ color: "var(--text-tertiary)" }}>Dialing</span>
            <strong style={{ color: "var(--accent-money)", fontSize: 16, fontWeight: 700 }}>{leadCount}</strong>
            <span style={{ color: "var(--text-tertiary)" }}>from</span>
            <strong style={{ color: "var(--text-primary)" }}>{listLabel}</strong>
          </div>
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: "5px 10px" }} onClick={onUploadCsv}>
            <Icons.ArrowUpRight size={11}/> Import CSV
          </button>
        </div>
        {/* Secondary: narrowing filters within the selected list. */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
          padding: "8px 12px",
          background: "var(--surface-elev)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 8,
        }}>
          <Icons.Filter size={12} style={{ color: "var(--text-tertiary)" }}/>
          <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.4 }}>Narrow by</span>
          <Sel k="state"   label="State"   opts={options.states}/>
          <Sel k="product" label="Product" opts={options.products}/>
          <Sel k="stage"   label="Stage"   opts={options.stages}/>
          <select
            value={filters.heat || ""}
            onChange={(e) => set("heat", e.target.value)}
            className="text-input"
            style={{ padding: "6px 8px", fontSize: 12, width: "auto", background: filters.heat ? "color-mix(in oklch, var(--accent-money) 16%, var(--surface-elev))" : "var(--surface-elev)" }}
          >
            <option value="">Heat: any</option>
            <option value="hot">hot</option>
            <option value="fresh">fresh</option>
            <option value="warm">warm</option>
            <option value="cold">cold</option>
          </select>
          {active > 0 && (
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: "4px 8px" }} onClick={() => setFilters({ source: "", state: "", product: "", stage: "", heat: "" })}>
              Clear ({active})
            </button>
          )}
        </div>
      </div>
    );
  }

  const DIAL_PROVIDERS = [
    { key: "twilio",          label: "Twilio",        desc: "Bridge dial via cloud",          mac: false, win: false },
    { key: "phone_link",      label: "Phone Link",    desc: "Windows Bluetooth → iPhone",     mac: false, win: true  },
    { key: "bluetooth_phone", label: "macOS BT",      desc: "FaceTime Continuity → iPhone",   mac: true,  win: false },
    { key: "sendblue",        label: "SendBlue",      desc: "iMessage SMS only · not voice",  mac: false, win: false, warn: true },
  ];

  function DialProviderChips({ provider, onChange }) {
    const ua = navigator.userAgent.toLowerCase();
    const isMac = ua.includes("mac");
    const isWin = ua.includes("win");
    return (
      <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.4 }}>Dial via</span>
        {DIAL_PROVIDERS.map(p => {
          const active = provider === p.key;
          const recommended = (p.mac && isMac) || (p.win && isWin);
          return (
            <button
              key={p.key}
              className="btn btn-ghost"
              onClick={() => onChange(p.key)}
              title={p.desc + (p.warn ? " — experimental" : "")}
              style={{
                fontSize: 11,
                padding: "3px 10px",
                background: active ? "color-mix(in oklch, var(--accent-money) 15%, transparent)" : "var(--bg-raised)",
                color: active ? "var(--accent-money)" : p.warn ? "var(--text-tertiary)" : "var(--text-secondary)",
                border: active ? "1px solid color-mix(in oklch, var(--accent-money) 40%, transparent)" : "1px solid var(--border-subtle)",
                opacity: p.warn ? 0.65 : 1,
              }}
            >
              {p.label}
              {recommended && <span style={{ marginLeft: 4, fontSize: 9, color: "var(--accent-money)", fontWeight: 700 }}>✓ you</span>}
            </button>
          );
        })}
      </div>
    );
  }

  /* DialerModeStrip — toggle between Solo (one lead, click-to-call via
     repflowCall cascade — works with the upstream-shipped Phone Link /
     macOS BT / Twilio provider chips) and Power (parallel SignalWire
     worker session). The carrier choice itself lives in DialProviderChips
     above, so Mode is a single axis here. */
  function DialerModeStrip({ mode, setMode }) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        padding: "8px 12px",
        background: "var(--bg-raised)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 8,
        fontSize: 12,
      }}>
        <span style={{ color: "var(--text-tertiary)", textTransform: "uppercase", fontSize: 10, letterSpacing: 0.6 }}>Dialer</span>
        {["solo", "power"].map(m => (
          <button key={m} className="btn btn-ghost" onClick={() => setMode(m)}
            style={{
              padding: "4px 10px", fontSize: 12,
              background: mode === m ? "var(--accent-money)" : "transparent",
              color: mode === m ? "#022" : "var(--text-secondary)",
              fontWeight: mode === m ? 700 : 500,
            }}>
            {m === "solo" ? "Solo (one at a time)" : "Power (parallel lines)"}
          </button>
        ))}
        <span style={{ marginLeft: 12, color: "var(--text-tertiary)", fontSize: 11 }}>
          Solo = click-to-call via your provider (Phone Link / macOS BT / Twilio). Power = SignalWire worker session.
        </span>
      </div>
    );
  }

  /* SoloDialerPanel — replaces the Power Dialer banner when dialMode='solo'.
     Walks the filtered queue one at a time. Dial fires window.repflowCall
     which already cascades: REST bridge → Twilio Voice SDK → repflow:// →
     tel: (macOS Continuity routes that to the paired iPhone). The recorder
     toggle from the session controls starts CallRecorder for the call's
     duration; the existing /api/transcribe cron picks it up. */
  function SoloDialerPanel({ leads, repId, provider, onProviderChange, record, onDoneCount }) {
    const [idx, setIdx] = useState(0);
    const [autoNext, setAutoNext] = useState(false);
    const [delaySec, setDelaySec] = useState(8);
    const [running, setRunning] = useState(false);
    // Capture both sides: mic (you) + system audio (the lead's voice coming
    // out of your PC/phone-link output). Needed because a phone-link/Continuity
    // call's far-end audio lives in your system output, not the mic. Persisted.
    const [recordBoth, setRecordBoth] = useState(() => {
      try { return localStorage.getItem("repflow.floor.recordBoth") !== "0"; } catch { return true; }
    });
    useEffect(() => {
      try { localStorage.setItem("repflow.floor.recordBoth", recordBoth ? "1" : "0"); } catch {}
    }, [recordBoth]);
    const recorderRef = React.useRef(null);
    const advanceTimerRef = React.useRef(null);
    const current = leads[idx] || null;

    useEffect(() => () => {
      try { recorderRef.current?.stop?.(); } catch {}
      clearTimeout(advanceTimerRef.current);
    }, []);

    const stopRecorder = () => {
      try { recorderRef.current?.stop?.(); } catch {}
      recorderRef.current = null;
    };

    const dial = async () => {
      if (!current) return window.toast?.("No lead to dial", "warn");
      if (!current.phone) return window.toast?.("Lead has no phone", "warn");
      setRunning(true);
      stopRecorder();
      if (record && window.CallRecorder) {
        try {
          const rec = new window.CallRecorder({ mode: recordBoth ? "mic+system" : "mic", repId, leadId: current.id });
          await rec.start();
          recorderRef.current = rec;
        } catch (e) { console.warn("[SoloDialer] recorder start failed:", e); }
      }
      try {
        if (typeof window.repflowCall === "function") {
          await window.repflowCall(current.phone, current.lead, {
            lead_id: current.id,
            source: "solo_floor",
            provider_hint: provider,
          });
        } else {
          window.location.href = `tel:${String(current.phone).replace(/[^\d+]/g, "")}`;
        }
        onDoneCount?.();
      } catch (e) {
        window.toast?.(`Dial failed: ${e.message || e}`, "error");
      } finally {
        setRunning(false);
      }
    };
    const skip   = () => { stopRecorder(); setIdx(i => Math.min(i + 1, leads.length - 1)); };
    const back   = () => { stopRecorder(); setIdx(i => Math.max(i - 1, 0)); };
    const stopAll = () => { stopRecorder(); setRunning(false); clearTimeout(advanceTimerRef.current); };

    // Auto-advance: when a dial ends (via the existing rba-dial 'autodial:call:end'
    // event OR a manual stopRecorder), wait delaySec then dial next.
    useEffect(() => {
      if (!autoNext) return;
      const onEnd = () => {
        clearTimeout(advanceTimerRef.current);
        advanceTimerRef.current = setTimeout(() => {
          if (idx + 1 >= leads.length) return;
          setIdx(i => i + 1);
        }, delaySec * 1000);
      };
      window.addEventListener("autodial:call:end", onEnd);
      return () => {
        window.removeEventListener("autodial:call:end", onEnd);
        clearTimeout(advanceTimerRef.current);
      };
    }, [autoNext, delaySec, idx, leads.length]);

    if (leads.length === 0) {
      return (
        <div style={{ padding: 18, background: "var(--surface-elev)", border: "1px solid var(--border-subtle)", borderRadius: 8, color: "var(--text-tertiary)", fontSize: 13 }}>
          No dialable leads match the current filter. Clear filters or import a CSV.
        </div>
      );
    }
    return (
      <div style={{
        background: "var(--surface-elev)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 8,
        padding: 18,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--accent-money)", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
              <span className="dot" style={{ background: "var(--accent-money)" }}/> Solo dialer · via {(DIAL_PROVIDERS.find(p => p.key === provider) || {}).label || provider}
            </div>
            <div style={{ marginTop: 8, fontSize: 28, lineHeight: 1.1, fontWeight: 750 }}>{current?.lead || "—"}</div>
            <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-tertiary)", display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span>{current?.age || "—"} age</span><span>·</span>
              <span>{current?.state || "—"}</span><span>·</span>
              <span>{current?.phone || "no phone"}</span><span>·</span>
              <span>{current?.product || "no product"}</span><span>·</span>
              <span>{current?.source || "pipeline"}</span>
            </div>
            <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-quaternary)" }}>
              {idx + 1} of {leads.length} · {record ? "recording on" : "recording off"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button className="btn" onClick={back} disabled={idx === 0}>
              <Icons.ChevronRight size={11} style={{ transform: "rotate(180deg)" }}/> Back
            </button>
            <button className="btn btn-primary" onClick={dial} disabled={running || !current?.phone}
              style={{ minWidth: 160, background: "var(--accent-money)", color: "#022", fontWeight: 800 }}>
              <Icons.PhoneCall size={13}/> {running ? "Dialing…" : `Dial ${current?.lead?.split(" ")[0] || "lead"}`}
            </button>
            <button className="btn" onClick={skip} disabled={idx >= leads.length - 1}>
              Skip <Icons.ChevronRight size={11}/>
            </button>
            <button className="btn btn-ghost" onClick={stopAll} title="Stop recording / cancel auto-advance">
              <Icons.X size={11}/> Stop
            </button>
          </div>
        </div>
        {onProviderChange && <DialProviderChips provider={provider} onChange={onProviderChange}/>}
        <div style={{ marginTop: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", fontSize: 12, color: "var(--text-secondary)" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={autoNext} onChange={e => setAutoNext(e.target.checked)}/>
            Auto-advance after call ends
          </label>
          {record && (
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}
              title="Captures both sides: your mic + your computer's system audio (the lead's voice from Phone Link / Continuity). On the screen-share prompt, pick your screen and tick 'Share system audio'.">
              <input type="checkbox" checked={recordBoth} onChange={e => setRecordBoth(e.target.checked)}/>
              Record both sides (system + mic)
            </label>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            Delay
            <input type="number" min="2" max="60" value={delaySec}
              onChange={e => setDelaySec(Math.max(2, Math.min(60, Number(e.target.value) || 8)))}
              className="text-input" style={{ width: 60, padding: "3px 6px", fontSize: 12 }}/>
            s
          </label>
          {provider === "bluetooth_phone" && (
            <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>
              macOS will prompt "Call with iPhone?" — approve once, then it stays approved per call.
            </span>
          )}
          {provider === "phone_link" && (
            <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>
              Routes through the Repflow Agent on this machine (Windows Phone Link → paired iPhone).
            </span>
          )}
          {provider === "sendblue" && (
            <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>
              SendBlue is SMS only — voice dials fall back to Twilio. Pick another provider for calls.
            </span>
          )}
        </div>
      </div>
    );
  }

  // Inline editor for the SMS bodies the dialer sends. Reps edit the exact
  // words (with {name}/{rep}/{agency} tokens) — not just an on/off switch.
  function MessageEditor({ templates, onSave, onClose }) {
    const Modal = window.Shared.Modal;
    const [draft, setDraft] = useState({ ...DEFAULT_SMS_TEMPLATES, ...(templates || {}) });
    const sampleLead = { lead: "Jordan Vega" };
    const ta = { width: "100%", minHeight: 72, padding: "9px 11px", background: "var(--bg-raised)", border: "1px solid var(--border-subtle)", borderRadius: 7, fontSize: 13, color: "var(--text-primary)", lineHeight: 1.5, resize: "vertical", fontFamily: "inherit" };
    const fields = [
      ["pre_call",  "SMS before the call", "Sent right before the phone rings (when “SMS before” is on)."],
      ["post_call", "SMS after the call",  "Sent after you wrap the call (when “SMS after” is on)."],
    ];
    return (
      <Modal title="Edit dialer messages" width={520} onClose={onClose} actions={
        <>
          <button className="btn" onClick={() => setDraft({ ...DEFAULT_SMS_TEMPLATES })}>Reset</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onSave(draft)}>Save messages</button>
        </>
      }>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
            Tokens: <span className="mono">{"{name}"}</span> <span className="mono">{"{rep}"}</span> <span className="mono">{"{agency}"}</span> — swapped in when the text is sent.
          </div>
          {fields.map(([key, label, hint]) => (
            <div key={key}>
              <div style={{ fontSize: 12.5, fontWeight: 650, marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 6 }}>{hint}</div>
              <textarea style={ta} value={draft[key] || ""} maxLength={320}
                onChange={(e) => setDraft(d => ({ ...d, [key]: e.target.value }))}/>
              <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-tertiary)" }}>
                Preview: <span style={{ color: "var(--text-secondary)" }}>{renderSmsTemplate(draft[key], sampleLead) || "—"}</span>
                <span style={{ float: "right" }}>{(draft[key] || "").length}/320</span>
              </div>
            </div>
          ))}
        </div>
      </Modal>
    );
  }

  function FloorDialerCockpit({ role }) {
    const [, force] = useState(0);
    useEffect(() => {
      const h = () => force(n => n + 1);
      ["data:hydrated", "data:mutated", "data:realtime", "autodial:queue:changed"].forEach(e => window.addEventListener(e, h));
      return () => ["data:hydrated", "data:mutated", "data:realtime", "autodial:queue:changed"].forEach(e => window.removeEventListener(e, h));
    }, []);

    const meIdent = (typeof window !== "undefined" && window.me && window.me()) || {};
    const repId = meIdent.rep_id || meIdent.id || resolveFloorRep()?.id || "";
    const agencyId = meIdent.agency_id || "";
    const isDemo = !!(window.isDemoAgency && window.isDemoAgency());
    const [filters, setFilters] = useState(() => {
      try { return { source: "", state: "", product: "", stage: "", heat: "", ...(JSON.parse(localStorage.getItem("repflow.floor.filters") || "{}")) }; }
      catch { return { source: "", state: "", product: "", stage: "", heat: "" }; }
    });
    useEffect(() => {
      try { localStorage.setItem("repflow.floor.filters", JSON.stringify(filters)); } catch {}
    }, [filters]);
    const [csvOpen, setCsvOpen] = useState(false);
    const [dialMode, setDialMode] = useState(() => {
      try { return localStorage.getItem("repflow.floor.dialMode") || "power"; } catch { return "power"; }
    });
    useEffect(() => {
      try { localStorage.setItem("repflow.floor.dialMode", dialMode); } catch {}
    }, [dialMode]);
    const filterOptions = buildFloorFilterOptions(role);
    const leads = buildFloorDialerLeads(role, filters);
    const queue = buildFloorPowerQueue(leads);
    const activeLead = leads[0] || null;
    const attempts = useRecentPowerAttempts(repId);
    const readiness = useDialerReadiness(agencyId);
    const viewportWidth = useViewportWidth();
    const stacked = viewportWidth < 1120;
    const [running, setRunning] = useState(null);
    const [busy, setBusy] = useState(false);
    // Session-level dial provider override (not persisted — use Settings → Agents for the default).
    // Seeded from window.__agentSettings on mount; re-seeds when agent_settings:loaded fires.
    const [dialProvider, setDialProvider] = useState(() =>
      window.__agentSettings?.default_dial_provider || "twilio"
    );
    useEffect(() => {
      const h = () => setDialProvider(window.__agentSettings?.default_dial_provider || "twilio");
      window.addEventListener("agent_settings:loaded", h);
      return () => window.removeEventListener("agent_settings:loaded", h);
    }, []);
    // Publish to window so repflowCall can read the active session provider without prop-drilling.
    useEffect(() => {
      window.__dialProviderSession = dialProvider;
      return () => { window.__dialProviderSession = null; };
    }, [dialProvider]);
    const [maxLines, setMaxLines] = useState(() => {
      try { return Number(localStorage.getItem("repflow.floor.power.maxLines") || 3); } catch { return 3; }
    });
    const [toggles, setToggles] = useState(() => {
      try { return { ...FLOOR_POWER_TOGGLES, ...(JSON.parse(localStorage.getItem("repflow_power_toggles") || "{}")) }; }
      catch { return FLOOR_POWER_TOGGLES; }
    });
    useEffect(() => {
      try {
        localStorage.setItem("repflow.floor.power.maxLines", String(maxLines));
        localStorage.setItem("repflow_power_toggles", JSON.stringify(toggles));
      } catch {}
    }, [maxLines, toggles]);

    // Double dial — call each lead back-to-back this many times (1 = single).
    const [redialAttempts, setRedialAttempts] = useState(() => {
      try { return Math.min(4, Math.max(1, Number(localStorage.getItem("repflow.floor.redialAttempts") || 1))); }
      catch { return 1; }
    });
    useEffect(() => {
      try { localStorage.setItem("repflow.floor.redialAttempts", String(redialAttempts)); } catch {}
    }, [redialAttempts]);

    // Editable SMS bodies + the message editor modal.
    const [smsTemplates, setSmsTemplates] = useState(loadSmsTemplates);
    const [msgEditorOpen, setMsgEditorOpen] = useState(false);
    useEffect(() => {
      try { localStorage.setItem("repflow.floor.sms_templates", JSON.stringify(smsTemplates)); } catch {}
    }, [smsTemplates]);

    const isPhoneProvider = isPhoneHandoffProvider(dialProvider);
    // Physical-phone dialing is single-line, period.
    const effectiveLines = isPhoneProvider ? 1 : maxLines;

    // Publish session dial config so repflowCall (page-platform.jsx) can read
    // pre-call SMS + redial settings without prop-drilling — mirrors the
    // existing window.__dialProviderSession pattern.
    useEffect(() => {
      // Publish (don't null on unmount) so an autodial session that outlives a
      // nav away from Floor keeps the rep's pre-call SMS + redial config.
      window.__dialToggles = toggles;
      window.__smsTemplates = smsTemplates;
      window.__dialRedialAttempts = redialAttempts;
    }, [toggles, smsTemplates, redialAttempts]);

    const calls = attempts.length;
    const connects = attempts.filter(a => a.disposition === "connected" || a.answered_at).length;
    const apQueued = leads.reduce((a, l) => a + Number(l.expectedAp || 0), 0);
    const connectRate = calls ? Math.round((connects / calls) * 100) : 0;
    const readinessText = readiness.status === "ok"
      ? `${readiness.ready ?? 0} ready · ${readiness.blocked ?? 0} blocked`
      : readiness.status === "checking" ? "checking" : readiness.status;

    const startSession = async () => {
      if (busy) return;
      if (isDemo) return window.toast?.("Demo mode previews the Floor; sign in to a real agency to start dialing.", "info");
      if (!repId || !agencyId) return window.toast?.("Power Dialer: sign in with an agency session", "error");
      if (!queue.length) return window.toast?.("No dialable leads with phone numbers", "warn");
      // Physical-phone providers dial one lead at a time through the rep's own
      // phone — not the cloud bridge. Run the single-line autodial loop, which
      // routes each lead through window.repflowCall (Phone Link / tel: handoff
      // + pre-call SMS + double-dial). Never hits the Twilio worker.
      if (isPhoneProvider) {
        window.dispatchEvent(new CustomEvent("autodial:start", { detail: { queue, redialAttempts, smsTemplates, toggles } }));
        window.toast?.(`Dialing through ${dialProvider === "phone_link" ? "Phone Link" : "your iPhone"} · ${queue.length} leads`, "info");
        return;
      }
      setBusy(true);
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 10000);
      try {
        let r, j;
        try {
          r = await floorDialerFetch("/api/dial/start", {
            signal: ctrl.signal,
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ agencyId, repId, maxLines: effectiveLines, leadQueue: queue, toggles, redialAttempts, smsTemplates, dialProvider }),
          });
          j = await r.json().catch(() => ({}));
        } catch (fetchErr) {
          const aborted = fetchErr?.name === "AbortError";
          const msg = aborted
            ? "Dial timed out — check Settings → Agents → Dial Provider"
            : `Network error starting session: ${fetchErr?.message || fetchErr}`;
          console.error("[startSession]", fetchErr);
          window.toast?.(msg, "error");
          return;
        }
        // Power Dialer worker not configured → fall back to the existing AutoDialBar queue.
        if (!r.ok && (j?.error === "power_dialer_unconfigured" || r.status === 503)) {
          window.toast?.("Power Dialer worker not set up — starting single-line autodial mode", "info");
          window.dispatchEvent(new CustomEvent("autodial:start", { detail: { queue, redialAttempts, smsTemplates, toggles } }));
          return;
        }
        if (!r.ok) {
          console.error("[startSession] API error", r.status, j);
          window.toast?.(j?.message || j?.error || `Power Dialer failed (${r.status})`, "error");
          return;
        }
        setRunning(j);
      } finally {
        clearTimeout(timeout);
        setBusy(false);
      }
    };

    const toggle = (key) => setToggles(t => ({ ...t, [key]: !t[key] }));
    const runQuoteAssist = () => {
      if (!activeLead) return window.toast?.("Add a dialable lead first", "warn");
      if (!window.enqueueAgentJob) return window.toast?.("Agent quote action unavailable", "warn");
      window.enqueueAgentJob({
        kind: "auto_quote",
        payload: {
          lead_id: activeLead.id,
          lead_name: activeLead.lead,
          age: activeLead.age,
          state: activeLead.state,
          product: activeLead.product,
        },
      }, { surface: "floor_live" });
    };

    if (running && window.PowerDialerSession) {
      const Session = window.PowerDialerSession;
      return (
        <div style={{ display: "grid", gridTemplateColumns: stacked ? "1fr" : "300px minmax(0, 1fr)", gap: 14, alignItems: "start" }}>
          <DialQueueRail leads={leads} activeId={activeLead?.id}/>
          <Session
            sessionId={running.session.id}
            livekit={running.livekit}
            repId={repId}
            agencyId={agencyId}
            embedded
            onEnd={() => setRunning(null)}
          />
        </div>
      );
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        <FloorLeadFilters
          filters={filters}
          setFilters={setFilters}
          options={filterOptions}
          leadCount={leads.length}
          onUploadCsv={() => setCsvOpen(true)}
        />
        <DialerModeStrip mode={dialMode} setMode={setDialMode}/>
        {csvOpen && window.CSVImport && (() => { const C = window.CSVImport; return <C onClose={() => setCsvOpen(false)}/>; })()}
      <div style={{ display: "grid", gridTemplateColumns: stacked ? "1fr" : "300px minmax(0, 1fr) 320px", gap: 14, alignItems: "start" }}>
        <DialQueueRail leads={leads} activeId={activeLead?.id}/>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(112px, 1fr))", gap: 8 }}>
            <DialMetric label="Queue" value={queue.length} sub={`${leads.length} ranked`}/>
            <DialMetric label="AP queued" value={money(apQueued)} sub={activeLead?.product || "products open"} tone="var(--accent-money)"/>
            <DialMetric label="Dials" value={calls} sub="today"/>
            <DialMetric label="Connects" value={`${connectRate}%`} sub={`${connects}/${calls || 0}`}/>
            <DialMetric label="Readiness" value={readiness.ready ?? "—"} sub={readinessText}/>
          </div>

          {/* Shared messaging & dialing options — apply to both Solo and
              Power so the rep controls texting + double-dial regardless of
              mode (matches how they actually dial: phone = Solo). */}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, padding: "10px 14px", background: "var(--surface-elev)", border: "1px solid var(--border-subtle)", borderRadius: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.5 }}>Double dial</span>
              <div style={{ display: "flex", gap: 4 }}>
                {[1, 2, 3, 4].map(n => (
                  <button key={n} className="btn btn-ghost" onClick={() => setRedialAttempts(n)}
                    title={n === 1 ? "Dial each lead once" : `Dial each lead ${n}× back-to-back until they pick up`}
                    style={{ padding: "3px 9px", fontWeight: 700, fontSize: 12,
                      color: redialAttempts === n ? "var(--accent-money)" : "var(--text-tertiary)",
                      background: redialAttempts === n ? "color-mix(in oklch, var(--accent-money) 14%, transparent)" : "var(--bg-raised)",
                      border: redialAttempts === n ? "1px solid color-mix(in oklch, var(--accent-money) 40%, transparent)" : "1px solid var(--border-subtle)" }}>
                    {n}×
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {[["sms_pre", "SMS before"], ["sms_post", "SMS after"]].map(([key, label]) => (
                <button key={key} className="btn btn-ghost" onClick={() => toggle(key)}
                  style={{ padding: "3px 10px", fontSize: 12, color: toggles[key] ? "var(--accent-money)" : "var(--text-tertiary)" }}>
                  {toggles[key] ? <Icons.Check size={12}/> : <Icons.X size={12}/>} {label}
                </button>
              ))}
            </div>
            <button className="btn btn-ghost" onClick={() => setMsgEditorOpen(true)}
              style={{ marginLeft: "auto", padding: "3px 10px", fontSize: 12, color: "var(--text-secondary)" }}>
              <Icons.Edit size={12}/> Edit messages
            </button>
          </div>

          {dialMode === "solo" ? (
            <SoloDialerPanel
              leads={leads}
              repId={repId}
              provider={dialProvider}
              onProviderChange={setDialProvider}
              record={!!toggles.record}
            />
          ) : (
          <div style={{
            background: "var(--surface-elev)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 8,
            padding: 18,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--accent-money)", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  <span className="dot" style={{ background: "var(--accent-money)" }}/> Floor Live · {dialProvider === "twilio" ? "Twilio" : "SignalWire"} worker
                </div>
                <div style={{ marginTop: 8, fontSize: 30, lineHeight: 1.1, fontWeight: 750, letterSpacing: 0 }}>
                  {activeLead ? activeLead.lead : "Build today's dial queue"}
                </div>
                {activeLead ? (
                  <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", color: "var(--text-tertiary)", fontSize: 12 }}>
                    <span>{activeLead.age || "—"} age</span>
                    <span>·</span>
                    <span>{activeLead.state || "—"}</span>
                    <span>·</span>
                    <span>{activeLead.phone || "no phone"}</span>
                    <span>·</span>
                    <span>{activeLead.source || "pipeline"}</span>
                  </div>
                ) : (
                  <div style={{ marginTop: 8, maxWidth: 520, color: "var(--text-tertiary)", fontSize: 12.5, lineHeight: 1.5 }}>
                    Floor runs best when every lead has a phone, state, age, product, and expected premium.
                    The dialer, quote assist, and RBA prompts will lock onto the first ranked lead.
                  </div>
                )}
              </div>
              <button className="btn btn-primary" onClick={startSession} disabled={busy || queue.length === 0}
                style={{ minWidth: 190, minHeight: 44, background: queue.length ? "var(--accent-money)" : "var(--bg-raised)", color: queue.length ? "#022" : "var(--text-tertiary)", fontWeight: 800 }}>
                <Icons.Play size={14}/> {isDemo ? "Demo preview" : busy ? "Starting..." : !queue.length ? "No phone leads" : isPhoneProvider ? "Start dialing" : `Start ${effectiveLines} lines`}
              </button>
            </div>

            {/* ── Dial Provider quick-toggle ───────────────────────────────
                Session-level override. Defaults to agent_settings.default_dial_provider.
                Does NOT trigger a dial — only changes routing for the next call. */}
            <DialProviderChips provider={dialProvider} onChange={setDialProvider}/>

            <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: stacked ? "1fr" : "minmax(0, 1fr) 240px", gap: 14 }}>
              <div style={{
                minHeight: 180,
                padding: 14,
                background: "var(--bg-raised)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 8,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <Icons.Shield size={13} style={{ color: "var(--accent-money)" }}/>
                  <strong style={{ fontSize: 13 }}>Live call workspace</strong>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                  {[
                    ["Intent", activeLead?.product || "load dial queue"],
                    ["Next", activeLead?.next || "add phone leads"],
                    ["Health", "conditions · meds · tobacco"],
                    ["Banking", "rep controls app"],
                    ["Quote", activeLead?.age && activeLead?.state ? "rating ready" : "age/state needed"],
                    ["Compliance", toggles.record ? "recording on" : "recording off"],
                  ].map(([k, v]) => (
                    <div key={k} style={{ padding: 10, background: "var(--surface-elev)", borderRadius: 7, border: "1px solid var(--border-subtle)" }}>
                      <div style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.4 }}>{k}</div>
                      <div style={{ marginTop: 5, fontSize: 12.5, color: "var(--text-secondary)" }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{
                padding: 14,
                background: "var(--bg-raised)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 8,
              }}>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 10 }}>Session</div>

                {/* Parallel lines only apply to the cloud bridge (Twilio).
                    Phone Link / macOS dial through the rep's own phone, one
                    call at a time — so we hide the slider for those. */}
                {isPhoneProvider ? (
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", padding: "8px 10px", background: "var(--surface-elev)", border: "1px solid var(--border-subtle)", borderRadius: 7 }}>
                    <Icons.Phone size={12} style={{ color: "var(--accent-money)", marginRight: 6, verticalAlign: "middle" }}/>
                    Single line · dials through your phone
                  </div>
                ) : (
                  <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)" }}>
                    Lines <strong style={{ color: "var(--accent-money)" }}>{maxLines}</strong>
                    <input type="range" min="1" max="10" value={maxLines} onChange={e => setMaxLines(Number(e.target.value))} style={{ width: "100%", marginTop: 8 }}/>
                  </label>
                )}

                {/* Cloud-leg toggles. Recording works on every provider;
                    AI handle / VM drop are SignalWire/Twilio worker features.
                    SMS + double-dial live in the shared options bar above. */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 14 }}>
                  {[
                    ["record", "Record"],
                    ...(isPhoneProvider ? [] : [["ai_assistant", "AI handle"], ["ai_voicemail", "VM drop"]]),
                  ].map(([key, label]) => (
                    <button key={key} className="btn btn-ghost" onClick={() => toggle(key)}
                      style={{ justifyContent: "center", color: toggles[key] ? "var(--accent-money)" : "var(--text-tertiary)" }}>
                      {toggles[key] ? <Icons.Check size={12}/> : <Icons.X size={12}/>} {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          )}

          {msgEditorOpen && window.Shared && window.Shared.Modal && (
            <MessageEditor
              templates={smsTemplates}
              onSave={(next) => { setSmsTemplates(next); setMsgEditorOpen(false); window.toast?.("Messages saved", "success"); }}
              onClose={() => setMsgEditorOpen(false)}
            />
          )}

          <CallStageAssist lead={activeLead}/>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          <div style={{ background: "var(--surface-elev)", border: "1px solid var(--border-subtle)", borderRadius: 8, overflow: "hidden" }}>
            <div className="panel-h">
              <Icons.Wallet size={13} style={{ color: "var(--accent-money)" }}/>
              <h3>Quote assist</h3>
              <span className="meta">{activeLead?.state || "—"}</span>
            </div>
            <div style={{ padding: 14 }}>
              <div style={{ fontSize: 12.5, fontWeight: 650 }}>{activeLead?.product || "Product open"}</div>
              <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
                {activeLead ? `${activeLead.age || "Age open"} · ${activeLead.state || "state open"} · ${activeLead.heat || "warm"} lead` : "Quote assist activates when a dialable lead is ranked first."}
              </div>
              <button className="btn btn-primary" onClick={runQuoteAssist} disabled={!activeLead}
                style={{ marginTop: 14, width: "100%", justifyContent: "center", background: activeLead ? "var(--accent-money)" : "var(--bg-raised)", color: activeLead ? "#022" : "var(--text-tertiary)", fontWeight: 750 }}>
                <Icons.Sparkles size={13}/> {activeLead ? "Run quote assist" : "Waiting for lead"}
              </button>
            </div>
          </div>
          <RecentAttemptsStrip attempts={attempts}/>
        </div>
      </div>
      </div>
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
    // Quote → Deal handoff: page-quote stashes {carrierId, ap, newLead, source}
    // here. Consume + clear so a refresh doesn't re-prefill stale data.
    const prefill = React.useMemo(() => {
      try {
        const raw = sessionStorage.getItem("repflow.dealwrite.prefill");
        if (!raw) return null;
        sessionStorage.removeItem("repflow.dealwrite.prefill");
        return JSON.parse(raw);
      } catch { return null; }
    }, [refreshKey]);
    if (!Form || !Recent) {
      return <div style={{ padding: 20, color: "var(--text-tertiary)" }}>Loading deal-write form…</div>;
    }
    return (
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 14, alignItems: "start" }}>
        <Form
          key={refreshKey + ":" + (defaultLeadId || "") + ":" + (prefill?.source || "")}
          defaultLeadId={defaultLeadId}
          defaultCarrierId={prefill?.carrierId || ""}
          defaultAp={prefill?.ap || ""}
          defaultNewLead={prefill?.newLead || null}
          prefillSource={prefill?.source || ""}
          onWritten={() => setRefreshKey(k => k + 1)}
        />
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
    // Floor is the dialer cockpit. No sub-modes — Deals/Follow-ups live in
    // their own surfaces (Pipeline / Today). This keeps the dial loop
    // uncluttered and on a single screen.
    return (
      <div className="page-pad">
        <div className="page-h">
          <div>
            <div className="page-title">Power Dialer</div>
            <div className="page-sub">
              Pick a lead list, hit start. Calls run through your provider · auto-recorded · outcome-tagged.
            </div>
          </div>
        </div>

        {/* Horizontal money bar — relevant-to-dialing numbers. Always visible. */}
        <FloorTopStrip role={role}/>

        <FloorDialerCockpit role={role}/>
      </div>
    );
  }

  window.PageFloor = PageFloor;
})();
