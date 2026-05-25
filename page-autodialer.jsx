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
          <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-tertiary)" }}>Hotkeys during autodial: <span className="kbd mono">Space</span> pause · <span className="kbd mono">S</span> skip · <span className="kbd mono">X</span> stop · <span className="kbd mono">D</span> re-dial current · <span className="kbd mono">E</span> open dashboard · <span className="kbd mono">V</span> voicemail script · <span className="kbd mono">1-5</span> log outcome</div>
        </Shared.Modal>
      )}
    </>
  );
}
window.PipelineAutoDialButton = PipelineAutoDialButton;

/* ─── Outcome auto-SMS templates ─────────────────────────────────────────
   When the rep records an outcome on autodial, fire an automatic SMS using
   a per-outcome template. Defaults below; reps customize via the gear icon
   on the AutoDialBar (writes to localStorage `repflow.autodial.outcome_sms`).
   Tokens: {first}, {last}, {phone}, {product}, {state}, {rep}.

   This is the "automation customization" surface — outcome → action mapping.
   Defer outcome → sequence_enrollments to a future cycle once the rep has
   sequences worth enrolling in. For today, a templated SMS closes the loop.

   `enabled: false` skips that outcome's auto-send. `body: ""` also skips. */
const OUTCOME_SMS_DEFAULTS = {
  voicemail: {
    enabled: true,
    body: "Hi {first}, this is {rep} — just left you a voicemail about your {product} options. Reply YES and I'll send a quick text breakdown. Talk soon.",
  },
  appointment: {
    enabled: true,
    body: "Confirmed, {first}! Looking forward to our call — I'll reach out at the time we set. Reply with any questions before then.",
  },
  callback: {
    enabled: true,
    body: "Got it {first} — I'll call you back when we discussed. If anything changes on your end, just text me back here.",
  },
  no_answer: {
    enabled: false,
    body: "Hi {first}, I tried reaching you about your {product} quote. When's a better time to chat? Reply with a time or just YES.",
  },
  not_interested: {
    enabled: false,
    body: "",
  },
};

// Persistence: localStorage is the synchronous cache; user_prefs.value
// keyed 'autodial_outcome_sms' is the cross-device source of truth.
// Mirror pattern from AutodialQueue (shared.jsx) + redial_queue
// (lib/dial-rules.js): debounced upsert on save, hydrate on me:loaded,
// server-newer-wins.
function loadOutcomeSms() {
  try {
    const raw = localStorage.getItem("repflow.autodial.outcome_sms");
    const stored = raw ? JSON.parse(raw) : {};
    // Merge so a new default outcome (added later) is picked up without the
    // rep needing to clear localStorage.
    const merged = {};
    Object.keys(OUTCOME_SMS_DEFAULTS).forEach(k => {
      merged[k] = { ...OUTCOME_SMS_DEFAULTS[k], ...(stored[k] || {}) };
    });
    return merged;
  } catch { return { ...OUTCOME_SMS_DEFAULTS }; }
}
let _outcomeSmsPushTimer = null;
function _pushOutcomeSmsToServer(map) {
  if (_outcomeSmsPushTimer) clearTimeout(_outcomeSmsPushTimer);
  _outcomeSmsPushTimer = setTimeout(async () => {
    _outcomeSmsPushTimer = null;
    const sb  = window.getSupabase && window.getSupabase();
    const me  = window.me && window.me();
    if (!sb || !me?.rep_id) return;
    try {
      const updated_at = new Date().toISOString();
      try { localStorage.setItem("repflow.autodial.outcome_sms.meta", JSON.stringify({ updated_at })); } catch {}
      const { error } = await sb.from("user_prefs").upsert(
        { rep_id: me.rep_id, key: "autodial_outcome_sms", value: map, updated_at },
        { onConflict: "rep_id,key" }
      );
      if (error && !/relation .* does not exist/i.test(error.message || "")) {
        console.warn("[outcomeSms.push]", error.message || error);
      }
    } catch (e) { console.warn("[outcomeSms.push]", e?.message || e); }
  }, 600);
}
function saveOutcomeSms(map) {
  try { localStorage.setItem("repflow.autodial.outcome_sms", JSON.stringify(map)); } catch {}
  _pushOutcomeSmsToServer(map);
}
async function hydrateOutcomeSms() {
  const sb = window.getSupabase && window.getSupabase();
  const me = window.me && window.me();
  if (!sb || !me?.rep_id) return null;
  try {
    const { data, error } = await sb.from("user_prefs")
      .select("value, updated_at")
      .eq("rep_id", me.rep_id)
      .eq("key", "autodial_outcome_sms")
      .maybeSingle();
    if (error || !data) return null;
    const localMeta = (() => { try { return JSON.parse(localStorage.getItem("repflow.autodial.outcome_sms.meta") || "{}"); } catch { return {}; } })();
    const serverNewer = !localMeta.updated_at || new Date(data.updated_at) > new Date(localMeta.updated_at);
    if (serverNewer && data.value && typeof data.value === "object") {
      // Merge with defaults so missing keys don't disappear
      const merged = {};
      Object.keys(OUTCOME_SMS_DEFAULTS).forEach(k => {
        merged[k] = { ...OUTCOME_SMS_DEFAULTS[k], ...(data.value[k] || {}) };
      });
      try { localStorage.setItem("repflow.autodial.outcome_sms", JSON.stringify(merged)); } catch {}
      try { localStorage.setItem("repflow.autodial.outcome_sms.meta", JSON.stringify({ updated_at: data.updated_at })); } catch {}
      window.dispatchEvent(new CustomEvent("autodial:outcome_sms:hydrated", { detail: { value: merged } }));
      return merged;
    }
    return null;
  } catch (e) { console.warn("[outcomeSms.hydrate]", e?.message || e); return null; }
}
// Fire hydrate when me() resolves
if (typeof window !== "undefined") {
  const _tryHydrateOutcomeSms = () => {
    if (window.me && window.me()) hydrateOutcomeSms().catch(() => {});
  };
  if (window.me && window.me()) _tryHydrateOutcomeSms();
  window.addEventListener("me:loaded", _tryHydrateOutcomeSms);
}
function renderOutcomeSms(template, lead) {
  const fullName = lead?.lead || "";
  const parts    = String(fullName).trim().split(/\s+/);
  const first    = parts[0] || "there";
  const last     = parts.slice(1).join(" ") || "";
  const me       = (window.me && window.me()) || {};
  const repName  = (me?.full_name || me?.rep_name || me?.name || "your producer").split(" ")[0];
  const tokens = {
    "{first}":   first,
    "{last}":    last,
    "{phone}":   lead?.phone || "",
    "{product}": lead?.product || "your coverage",
    "{state}":   lead?.state || "your state",
    "{rep}":     repName,
  };
  return Object.keys(tokens).reduce(
    (b, t) => b.split(t).join(tokens[t]),
    template || ""
  );
}

async function fireOutcomeSms(outcome, lead) {
  if (!lead?.phone) return { sent: false, reason: "no_phone" };
  const map  = loadOutcomeSms();
  const spec = map[outcome];
  if (!spec || !spec.enabled || !spec.body) return { sent: false, reason: "disabled_or_empty" };
  const body = renderOutcomeSms(spec.body, lead);
  if (!body.trim()) return { sent: false, reason: "empty_after_render" };
  try {
    const r = await fetch("/api/twilio-sms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: lead.phone, body, lead_id: lead.leadId || null, source: `autodial:${outcome}` }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { sent: false, reason: j.error || `HTTP ${r.status}` };
    return { sent: true, sid: j.sid, status: j.status };
  } catch (e) {
    return { sent: false, reason: e?.message || "network_error" };
  }
}

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
    window.repflowCall && window.repflowCall(current.phone, current.lead, {
      lead_id: current.leadId || null,
    });
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
          window.repflowCall && window.repflowCall(current.phone, current.lead, {
            lead_id: current.leadId || null,
          });
          window.toast && window.toast(`Re-dialing ${current.lead}`, "info");
        }
      }
      else if (e.key === "e" || e.key === "E") {
        // E = expand/re-open the call dashboard for the current lead after dismissing it
        if (current && stage !== "idle") {
          window.dispatchEvent(new CustomEvent("incall:open", { detail: { lead: current, autodial: true } }));
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

    // Outcome → auto-SMS (customizable per rep). Fire-and-forget so the next
    // dial doesn't wait on Twilio. Toast the result.
    let smsLabel = "";
    fireOutcomeSms(outcome, current).then(res => {
      if (res.sent) {
        window.toast && window.toast(`Auto-SMS to ${current.lead}: queued`, "info");
      } else if (res.reason && res.reason !== "disabled_or_empty" && res.reason !== "no_phone") {
        window.toast && window.toast(`Auto-SMS failed: ${res.reason}`, "warn");
      }
    });

    window.toast && window.toast(`${current.lead}: ${labelMap[outcome] || outcome}${cadenceLabel}${smsLabel}`, "success");
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

  // Re-pop the rich dashboard for the current lead (used when rep dismissed it mid-session).
  const reopenDashboard = () => {
    if (!current) return;
    window.dispatchEvent(new CustomEvent("incall:open", { detail: { lead: current, autodial: true } }));
  };

  return (
    <div className="autodial-bar" onClick={(e) => {
      // Click anywhere on the bar (except a button) re-opens the dashboard.
      if (e.target.closest("button")) return;
      reopenDashboard();
    }} style={{ cursor: "pointer" }} title="Click to re-open the call dashboard">
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
      <button className="btn btn-primary" onClick={reopenDashboard} title="Open call dashboard (E)" style={{ fontSize: 11 }}>
        <Icons.ArrowUp size={11}/> Open dashboard
      </button>
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

/* ─── Outcome settings modal ──────────────────────────────────────────────
   Per-rep customization for the auto-SMS that fires on each outcome.
   Tokens: {first}, {last}, {phone}, {product}, {state}, {rep}. */
function AutodialOutcomeSettings({ onClose }) {
  const [map, setMap]   = React.useState(() => loadOutcomeSms());
  const [busy, setBusy] = React.useState(false);
  const Shared = window.Shared || {};
  const Icons  = window.Icons  || {};

  const save = () => {
    setBusy(true);
    saveOutcomeSms(map);
    window.toast && window.toast("Outcome auto-SMS saved", "success");
    setBusy(false);
    onClose && onClose();
  };

  const resetDefaults = () => {
    if (!window.confirm("Reset all outcome templates to defaults?")) return;
    setMap({ ...OUTCOME_SMS_DEFAULTS });
  };

  const OUTCOMES = [
    { k: "voicemail",      l: "Left voicemail" },
    { k: "appointment",    l: "Booked appointment" },
    { k: "callback",       l: "Schedule callback" },
    { k: "no_answer",      l: "No answer" },
    { k: "not_interested", l: "Not interested" },
  ];

  const updateField = (k, field, v) => {
    setMap(m => ({ ...m, [k]: { ...(m[k] || {}), [field]: v } }));
  };

  if (!Shared.Modal) {
    return null;
  }

  return (
    <Shared.Modal title="Outcome auto-SMS" width={620} onClose={busy ? null : onClose} actions={
      <>
        <button className="btn btn-ghost" onClick={resetDefaults}>Reset defaults</button>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>Save</button>
      </>
    }>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: 12 }}>
        When you log an autodial outcome, the autodialer can fire a templated SMS to that lead automatically.
        Toggle each outcome on/off; tokens: <span className="mono">{"{first}"}</span> <span className="mono">{"{last}"}</span> <span className="mono">{"{phone}"}</span> <span className="mono">{"{product}"}</span> <span className="mono">{"{state}"}</span> <span className="mono">{"{rep}"}</span>.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {OUTCOMES.map(o => {
          const spec = map[o.k] || { enabled: false, body: "" };
          return (
            <div key={o.k} style={{
              border: "1px solid var(--border-subtle)",
              borderRadius: 8,
              padding: 10,
              background: spec.enabled ? "var(--bg-raised)" : "transparent",
            }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={!!spec.enabled}
                  onChange={(e) => updateField(o.k, "enabled", e.target.checked)}
                />
                <strong style={{ fontSize: 12.5 }}>{o.l}</strong>
                <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-tertiary)" }}>{spec.body?.length || 0} chars</span>
              </label>
              <textarea
                value={spec.body || ""}
                onChange={(e) => updateField(o.k, "body", e.target.value)}
                rows={2}
                maxLength={1600}
                className="text-input"
                disabled={!spec.enabled}
                placeholder={spec.enabled ? "Write the auto-SMS for this outcome…" : "Enable to edit"}
                style={{ width: "100%", lineHeight: 1.5, resize: "vertical", fontFamily: "inherit", fontSize: 12.5 }}
              />
            </div>
          );
        })}
      </div>
    </Shared.Modal>
  );
}
window.AutodialOutcomeSettings = AutodialOutcomeSettings;

})();
