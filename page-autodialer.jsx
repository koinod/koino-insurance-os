/* page-autodialer.jsx — AI-driven autodialer.

   - <PipelineAutoDialButton/> renders next to "New lead" on the Pipeline header.
     Click it to open the prep modal (sort method + queue preview), then it
     hands control to a floating dial-bar that runs through the queue.

   - <AutoDialBar/> is the floating bottom-of-page status bar:
       Calling Cheryl Hampton · 3 of 12   [Pause] [Skip] [Stop]
       After each call the rep picks an outcome (no answer, voicemail,
       appointment, not interested, callback) which writes to pipeline.next_action
       + advances. Hotkeys: Space pause, S skip, X stop, 1-5 for outcomes.

   - "AI smart sort" toggle calls /api/copilot to rank the queue. Synchronous
     fallback is heat × AP × age-decay so the button works offline. */

(function () {

const HEAT_RANK = { hot: 4, fresh: 3, warm: 2, cold: 1 };
function smartScore(p) {
  // Deterministic priority: hot leads with high AP and short days-in-stage first.
  const heat = HEAT_RANK[p.heat] || 1;
  const ap   = (p.ap || 0) / 1000;
  const decay= 1 / Math.max(1, (p.days || 0) + 1);
  return heat * 10 + ap * 0.4 + decay * 5;
}

async function aiRank(leads) {
  // Ask the AI co-pilot to rank by likely-to-close-now. Returns ordered list of ids.
  // Falls back to deterministic sort if the call fails or RLS blocks.
  try {
    const resp = await fetch("/api/copilot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: `Rank these ${leads.length} leads for an autodial session right now. Return ONLY a JSON array of lead IDs in priority order, highest first. Consider stage, heat, days_in_stage, AP, and source — prioritize hot fresh leads with highest expected close-rate-now. Just the array, no prose.`,
        context: "Pipeline · autodial · " + leads.length + " leads",
      }),
    });
    const j = await resp.json();
    const text = j.text || "";
    const match = text.match(/\[[^\]]+\]/);
    if (!match) return null;
    const ids = JSON.parse(match[0]);
    if (!Array.isArray(ids)) return null;
    const map = new Map(leads.map(l => [l.id, l]));
    const ordered = ids.map(id => map.get(id)).filter(Boolean);
    // Append any leads the AI didn't include
    leads.forEach(l => { if (!ordered.includes(l)) ordered.push(l); });
    return ordered;
  } catch (_e) { return null; }
}

function PipelineAutoDialButton({ leads, onClose }) {
  const [open, setOpen] = React.useState(false);
  const [smart, setSmart] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const start = async () => {
    setBusy(true);
    let ordered;
    if (smart) {
      window.toast && window.toast("AI ranking queue...", "info");
      const r = await aiRank(leads);
      ordered = r || [...leads].sort((a, b) => smartScore(b) - smartScore(a));
    } else {
      ordered = [...leads].sort((a, b) => smartScore(b) - smartScore(a));
    }
    setBusy(false); setOpen(false);
    window.dispatchEvent(new CustomEvent("autodial:start", { detail: { queue: ordered } }));
  };

  if (leads.length === 0) return null;

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)} title="AI autodial through the filtered list">
        <Icons.Phone size={13}/> Autodial · {leads.length}
      </button>
      {open && (
        <Shared.Modal title="AI autodialer" width={520} onClose={() => setOpen(false)} actions={
          <>
            <button className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={start} disabled={busy}><Icons.Play size={11}/> {busy ? "Ranking..." : `Start (${leads.length})`}</button>
          </>
        }>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.55, marginBottom: 12 }}>
            Dials every lead in the current Pipeline filter, top-priority first.
            After each call you'll log an outcome (no answer / voicemail / appointment / not interested / callback).
            Calls go through your Twilio softphone if connected, otherwise the desktop helper, otherwise <span className="mono">tel:</span>.
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, background: "var(--bg-raised)", borderRadius: 6, fontSize: 12.5, cursor: "pointer" }}>
            <input type="checkbox" checked={smart} onChange={(e) => setSmart(e.target.checked)}/>
            <div>
              <div style={{ fontWeight: 500 }}>AI smart sort</div>
              <div style={{ color: "var(--text-tertiary)", fontSize: 11 }}>Ask Gemini to rank by likely-to-close-now (adds ~3s before first dial)</div>
            </div>
          </label>
          <div className="divider"></div>
          <div className="field-l">Preview · top 5</div>
          <div style={{ marginTop: 6, maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {[...leads].sort((a, b) => smartScore(b) - smartScore(a)).slice(0, 5).map(p => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: "var(--bg-raised)", borderRadius: 4, fontSize: 12 }}>
                <span><strong>{p.lead}</strong> <span style={{ color: "var(--text-tertiary)" }}>· {p.product}</span></span>
                <span className="chip" style={{ fontSize: 10 }}>{p.heat}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-tertiary)" }}>Hotkeys during autodial: <span className="kbd mono">Space</span> pause · <span className="kbd mono">S</span> skip · <span className="kbd mono">X</span> stop · <span className="kbd mono">D</span> re-dial current · <span className="kbd mono">V</span> voicemail script · <span className="kbd mono">1-5</span> log outcome</div>
        </Shared.Modal>
      )}
    </>
  );
}
window.PipelineAutoDialButton = PipelineAutoDialButton;

/* ─── Floating dial bar: mounts globally, listens for autodial:start ─────
   Now also drives the rich <InCall/> dashboard:
     - When stage flips to "dialing" on a new lead, fires `incall:open` with
       the current lead so the App pops the dashboard automatically.
     - Publishes its full state via `autodial:state-change` so InCall can
       render the queue-progress header + outcome footer when in autodial.
     - Outcome buttons in InCall dispatch `autodial:outcome` back here.
     - When InCall is open in autodial mode, the floating bar hides itself
       (no double UI). It re-appears if the rep closes the modal mid-session.
*/
function AutoDialBar() {
  const [queue, setQueue] = React.useState([]);
  const [idx, setIdx] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const [stage, setStage] = React.useState("idle"); // idle | dialing | outcome
  const [results, setResults] = React.useState({}); // leadId -> outcome
  const [incallOpen, setIncallOpen] = React.useState(false);

  const current = queue[idx];

  // Publish state to window + dispatch event so InCall can mirror
  React.useEffect(() => {
    const state = {
      active: queue.length > 0 && stage !== "idle",
      stage, paused, idx, total: queue.length, current, results,
    };
    window.__autodialState = state;
    window.dispatchEvent(new CustomEvent("autodial:state-change", { detail: state }));
  }, [queue, idx, paused, stage, results, current]);

  React.useEffect(() => {
    const onStart = (e) => {
      const q = e.detail?.queue || [];
      if (q.length === 0) return;
      setQueue(q); setIdx(0); setPaused(false); setResults({});
      setStage("dialing");
    };
    const onPause  = () => setPaused(true);
    const onResume = () => setPaused(false);
    const onStop   = () => { setQueue([]); setIdx(0); setStage("idle"); };
    const onIncallOpen  = () => setIncallOpen(true);
    const onIncallClose = () => setIncallOpen(false);
    window.addEventListener("autodial:start",  onStart);
    window.addEventListener("autodial:pause",  onPause);
    window.addEventListener("autodial:resume", onResume);
    window.addEventListener("autodial:stop",   onStop);
    window.addEventListener("incall:opened",   onIncallOpen);
    window.addEventListener("incall:closed",   onIncallClose);
    return () => {
      window.removeEventListener("autodial:start",  onStart);
      window.removeEventListener("autodial:pause",  onPause);
      window.removeEventListener("autodial:resume", onResume);
      window.removeEventListener("autodial:stop",   onStop);
      window.removeEventListener("incall:opened",   onIncallOpen);
      window.removeEventListener("incall:closed",   onIncallClose);
    };
  }, []);

  // Fire the dial AND open the InCall dashboard when stage flips to dialing on a fresh index.
  // Pre-flight: skip if no phone, outside TCPA window, or on cooldown for this lead.
  React.useEffect(() => {
    if (stage !== "dialing" || !current || paused) return;
    if (!current.phone) {
      window.toast && window.toast(`Skipped ${current.lead} — no phone on file`, "warn");
      setResults(r => ({ ...r, [current.id]: "no_contact_info" }));
      const t = setTimeout(advanceOrFinish, 800);
      return () => clearTimeout(t);
    }
    // TCPA window check
    const win = (typeof window.canDialNow === "function") ? window.canDialNow(current) : { ok: true };
    if (!win.ok) {
      window.toast && window.toast(`Skipped ${current.lead} — ${win.reason}`, "warn");
      setResults(r => ({ ...r, [current.id]: "out_of_window" }));
      const t = setTimeout(advanceOrFinish, 600);
      return () => clearTimeout(t);
    }
    // Cooldown check (5min between attempts on same lead)
    const cd = (typeof window.dialCooldown === "function") ? window.dialCooldown(current.id) : 0;
    if (cd > 0) {
      const sec = Math.ceil(cd / 1000);
      window.toast && window.toast(`${current.lead} on cooldown — ${sec}s remaining`, "warn");
      const t = setTimeout(advanceOrFinish, 600);
      return () => clearTimeout(t);
    }
    // OK to dial
    window.markDialAttempt && window.markDialAttempt(current.id);
    window.repflowCall && window.repflowCall(current.phone, current.lead);
    window.dispatchEvent(new CustomEvent("incall:open", { detail: { lead: current, autodial: true } }));
    const t = setTimeout(() => setStage("outcome"), 3000);
    return () => clearTimeout(t);

    function advanceOrFinish() {
      if (idx < queue.length - 1) { setIdx(i => i + 1); setStage("dialing"); }
      else { setQueue([]); setIdx(0); setStage("idle"); window.dispatchEvent(new CustomEvent("incall:dismiss")); }
    }
  }, [stage, idx, paused, current]);

  // Outcome dispatched from InCall dashboard
  React.useEffect(() => {
    const onOutcome = (e) => {
      const out = e.detail?.outcome;
      if (out) recordOutcome(out);
    };
    const onSkip = () => skip();
    const onStopFromInCall = () => stop();
    window.addEventListener("autodial:outcome", onOutcome);
    window.addEventListener("autodial:skip",    onSkip);
    window.addEventListener("autodial:stop-request", onStopFromInCall);
    return () => {
      window.removeEventListener("autodial:outcome", onOutcome);
      window.removeEventListener("autodial:skip",    onSkip);
      window.removeEventListener("autodial:stop-request", onStopFromInCall);
    };
  }, [queue, idx, results]);

  // Hotkeys (only when no input is focused; keep working even when InCall open)
  React.useEffect(() => {
    const onKey = (e) => {
      if (queue.length === 0) return;
      if (document.activeElement && /input|textarea|select/i.test(document.activeElement.tagName)) return;
      if (e.code === "Space") { e.preventDefault(); setPaused(p => !p); }
      else if (e.key === "s" || e.key === "S") { skip(); }
      else if (e.key === "x" || e.key === "X") { stop(); }
      else if (e.key === "d" || e.key === "D") {
        // D = re-dial current lead (rep clicked off, wants to retry without skipping)
        if (current && current.phone && stage !== "idle") {
          window.markDialAttempt && window.markDialAttempt(current.id);
          window.repflowCall && window.repflowCall(current.phone, current.lead);
          window.toast && window.toast(`Re-dialing ${current.lead}`, "info");
        }
      }
      else if (e.key === "v" || e.key === "V") {
        // V = copy voicemail script for current lead — rep can paste/read it after the beep
        const first = (current?.lead || "").split(" ")[0] || "there";
        const product = current?.product || "your Medicare options";
        const vm = `Hi ${first}, this is your producer with Repflow following up on ${product}. I have a 2-minute window I'd like to grab — please call me back at this number, or text the word YES and I'll text you a calendar link. Talk soon.`;
        try { navigator.clipboard.writeText(vm); window.toast && window.toast("Voicemail script copied", "success"); }
        catch (_e) { window.toast && window.toast(vm, "info"); }
      }
      else if (stage === "outcome" && /^[1-5]$/.test(e.key)) {
        const outcomes = ["no_answer", "voicemail", "appointment", "not_interested", "callback"];
        recordOutcome(outcomes[parseInt(e.key, 10) - 1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage, queue, idx, current]);

  const skip = () => { if (idx < queue.length - 1) { setIdx(i => i + 1); setStage("dialing"); } else stop(); };
  const stop = () => {
    setQueue([]); setIdx(0); setStage("idle");
    window.dispatchEvent(new CustomEvent("incall:dismiss"));
    window.toast && window.toast(`Autodial stopped · ${Object.keys(results).length} dialed`, "info");
  };

  const recordOutcome = async (outcome) => {
    if (!current) return;
    const labelMap = { no_answer: "No answer", voicemail: "Left voicemail", appointment: "Booked appointment", not_interested: "Not interested", callback: "Schedule callback" };
    setResults(r => ({ ...r, [current.id]: outcome }));
    try {
      if (outcome === "appointment" && AppData.mutate) {
        await AppData.mutate.pipelineStage(current.id, "Quoted");
      } else if (outcome === "not_interested" && AppData.mutate) {
        await AppData.mutate.pipelineStage(current.id, "Lost");
      }
    } catch (e) { window.toast?.(`Stage update failed: ${e?.message || e}`, "error"); console.error("[autodialer.pipelineStage]", e); }

    // Schedule retry per disposition cadence (no_answer → 2h, voicemail → tomorrow, etc.)
    let cadenceLabel = "";
    if (typeof window.scheduleRedial === "function") {
      const at = window.scheduleRedial(current, outcome);
      if (at) {
        const cad = window.dispositionCadence(outcome);
        cadenceLabel = ` · ${cad.label}`;
      }
    }

    window.toast && window.toast(`${current.lead}: ${labelMap[outcome] || outcome}${cadenceLabel}`, "success");
    if (idx < queue.length - 1) { setIdx(i => i + 1); setStage("dialing"); }
    else {
      setQueue([]); setIdx(0); setStage("idle");
      window.dispatchEvent(new CustomEvent("incall:dismiss"));
      const summary = Object.values({ ...results, [current.id]: outcome });
      const counts = summary.reduce((m, o) => { m[o] = (m[o] || 0) + 1; return m; }, {});
      const parts = Object.entries(counts).map(([o, n]) => `${n} ${o.replace(/_/g, " ")}`).join(", ");
      window.toast && window.toast(`Autodial complete · ${summary.length} dialed (${parts})`, "success");
    }
  };

  // Hide the floating bar when InCall is open in autodial mode — the modal IS the dashboard.
  if (queue.length === 0) return null;
  if (incallOpen) return null;

  return (
    <div className="autodial-bar">
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
        <span className="dot dot-live"></span>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <strong style={{ fontSize: 13 }}>{stage === "outcome" ? "Log outcome" : paused ? "Paused" : "Calling"}</strong>
            <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>· {current?.lead} · {idx + 1} of {queue.length}</span>
          </div>
          <div style={{ height: 3, background: "var(--bg-raised)", borderRadius: 2, marginTop: 6, overflow: "hidden" }}>
            <div style={{ width: `${((idx + 1) / queue.length) * 100}%`, height: "100%", background: "var(--accent-money)" }}></div>
          </div>
        </div>
      </div>
      {stage === "outcome" ? (
        <div style={{ display: "flex", gap: 4 }}>
          <button className="btn btn-ghost" onClick={() => recordOutcome("no_answer")}><span className="kbd mono">1</span> No answer</button>
          <button className="btn btn-ghost" onClick={() => recordOutcome("voicemail")}><span className="kbd mono">2</span> VM</button>
          <button className="btn btn-primary" onClick={() => recordOutcome("appointment")}><span className="kbd mono">3</span> Appt</button>
          <button className="btn btn-ghost" onClick={() => recordOutcome("not_interested")}><span className="kbd mono">4</span> Not int.</button>
          <button className="btn btn-ghost" onClick={() => recordOutcome("callback")}><span className="kbd mono">5</span> Callback</button>
          <button className="icon-btn" onClick={stop} title="Stop"><Icons.X size={12}/></button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 4 }}>
          <button className="btn btn-ghost" onClick={() => setPaused(p => !p)}>{paused ? <><Icons.Play size={11}/> Resume</> : <><Icons.Pause size={11}/> Pause</>}</button>
          <button className="btn btn-ghost" onClick={skip}><Icons.ArrowRight size={11}/> Skip</button>
          <button className="btn btn-ghost" onClick={stop}><Icons.X size={11}/> Stop</button>
        </div>
      )}
    </div>
  );
}
window.AutoDialBar = AutoDialBar;

})();
