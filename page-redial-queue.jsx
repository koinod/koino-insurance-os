/* page-redial-queue.jsx — UI for the disposition-driven retry queue.
 *
 * The autodialer schedules retries via window.scheduleRedial after each
 * outcome (no_answer → 2h, voicemail → 24h, callback → manual). Reps need
 * to *see* what's coming back, manually clear, or pull due retries into
 * their active autodial session.
 *
 * <RedialQueuePanel/>      — full panel with filters, ready/scheduled split,
 *                            "Pull due into autodial" button.
 * <RedialQueueBadge/>      — compact strip suitable for the floor sidebar
 *                            showing "12 ready · 47 scheduled".
 *
 * Hot-key R (set up in floor LiveMode) pulls due retries into autodial.
 */

(function () {
  const { useState, useEffect } = React;

  function useRedialState() {
    const [tick, setTick] = useState(0);
    useEffect(() => {
      const refresh = () => setTick(t => t + 1);
      window.addEventListener("redial:queued", refresh);
      window.addEventListener("redial:due",    refresh);
      window.addEventListener("storage",       refresh);
      // Tick every 30s so countdown labels stay fresh
      const i = setInterval(refresh, 30_000);
      return () => {
        window.removeEventListener("redial:queued", refresh);
        window.removeEventListener("redial:due",    refresh);
        window.removeEventListener("storage",       refresh);
        clearInterval(i);
      };
    }, []);
    const queue = (() => {
      try { return JSON.parse(localStorage.getItem("repflow.redial_queue") || "[]"); }
      catch { return []; }
    })();
    const now = Date.now();
    queue.sort((a, b) => a.at - b.at);
    return {
      queue,
      due:       queue.filter(q => q.at <= now),
      scheduled: queue.filter(q => q.at >  now),
      tick,
    };
  }

  function fmtIn(ms) {
    if (ms <= 0) return "now";
    const sec = Math.round(ms / 1000);
    if (sec < 60)   return `${sec}s`;
    const min = Math.round(sec / 60);
    if (min < 60)   return `${min}m`;
    const hr = min / 60;
    if (hr < 24)    return `${hr.toFixed(hr < 10 ? 1 : 0)}h`;
    return `${Math.round(hr / 24)}d`;
  }
  function outcomeChip(outcome) {
    const map = {
      no_answer:      { l: "no answer",  c: "var(--state-warning)" },
      voicemail:      { l: "voicemail",  c: "var(--accent-status)" },
      callback:       { l: "callback",   c: "var(--accent-money)"  },
      out_of_window:  { l: "TCPA",       c: "var(--state-danger)"  },
    };
    const s = map[outcome] || { l: outcome, c: "var(--text-tertiary)" };
    return <span className="chip" style={{ fontSize: 10, color: s.c, borderColor: `color-mix(in oklch, ${s.c} 35%, transparent)`, background: `color-mix(in oklch, ${s.c} 10%, transparent)` }}>{s.l}</span>;
  }

  /** Pull due retries into the active autodial session. If autodial isn't
   *  running, kicks off a new session with just the due retries. */
  window.pullDueRetries = function () {
    const { due } = (() => {
      const queue = JSON.parse(localStorage.getItem("repflow.redial_queue") || "[]");
      const now = Date.now();
      return { due: queue.filter(q => q.at <= now) };
    })();
    if (due.length === 0) {
      window.toast && window.toast("No retries are due yet", "info");
      return 0;
    }
    // Hydrate full lead rows from PIPELINE / QUEUE
    const all = [...(AppData.PIPELINE || []), ...(AppData.QUEUE || [])];
    const leads = due.map(d => {
      const full = all.find(l => l.id === d.leadId);
      if (full) return full;
      // Fallback to the snapshot stored in the redial entry
      return { id: d.leadId, lead: d.leadName, phone: d.phone };
    });
    // Clear them from the redial queue
    due.forEach(d => window.clearRedial && window.clearRedial(d.leadId));
    // Fire autodial:start with the due leads
    window.dispatchEvent(new CustomEvent("autodial:start", { detail: { queue: leads } }));
    window.toast && window.toast(`Pulled ${leads.length} due retr${leads.length === 1 ? "y" : "ies"} into autodial`, "success");
    return leads.length;
  };

  function RedialQueuePanel({ compact = false }) {
    const { due, scheduled } = useRedialState();
    const total = due.length + scheduled.length;

    return (
      <div className="panel">
        <div className="panel-h">
          <Icons.Clock size={13} style={{ color: due.length ? "var(--accent-money)" : "var(--text-tertiary)" }}/>
          <h3>Redial queue</h3>
          <span className="meta">{due.length} due · {scheduled.length} scheduled</span>
          {due.length > 0 && (
            <button className="btn btn-primary" style={{ marginLeft: "auto", fontSize: 11, padding: "3px 10px" }} onClick={() => window.pullDueRetries()}>
              <Icons.Phone size={11}/> Pull {due.length} due
            </button>
          )}
        </div>

        {total === 0 && (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>
            No retries scheduled. Outcomes from autodial sessions ({"no_answer"} → 2h, {"voicemail"} → 24h) land here automatically.
          </div>
        )}

        {due.length > 0 && (
          <>
            <div style={{ padding: "8px 14px", fontSize: 10.5, color: "var(--accent-money)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
              Due now
            </div>
            <div className="list">
              <div className="list-h" style={{ gridTemplateColumns: "1.4fr 130px 90px 80px 60px" }}>
                <div>Lead</div><div>Phone</div><div>Outcome</div><div>Due</div><div></div>
              </div>
              {due.slice(0, compact ? 5 : 50).map(d => (
                <div key={d.leadId} className="row" style={{ gridTemplateColumns: "1.4fr 130px 90px 80px 60px" }}>
                  <div className="cell-truncate" style={{ fontWeight: 500 }}>{d.leadName}</div>
                  <div className="mono" style={{ fontSize: 11 }}>{d.phone || <span style={{ color: "var(--text-quaternary)" }}>—</span>}</div>
                  <div>{outcomeChip(d.outcome)}</div>
                  <div className="tabular" style={{ fontSize: 11, color: "var(--accent-money)" }}>now</div>
                  <button className="icon-btn" title="Clear from queue" onClick={() => { window.clearRedial && window.clearRedial(d.leadId); window.dispatchEvent(new CustomEvent("redial:queued")); }}>
                    <Icons.X size={11}/>
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {scheduled.length > 0 && !compact && (
          <>
            <div style={{ padding: "8px 14px", fontSize: 10.5, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
              Scheduled
            </div>
            <div className="list">
              <div className="list-h" style={{ gridTemplateColumns: "1.4fr 130px 90px 80px 60px" }}>
                <div>Lead</div><div>Phone</div><div>Outcome</div><div>In</div><div></div>
              </div>
              {scheduled.slice(0, 50).map(d => (
                <div key={d.leadId} className="row" style={{ gridTemplateColumns: "1.4fr 130px 90px 80px 60px" }}>
                  <div className="cell-truncate" style={{ color: "var(--text-secondary)" }}>{d.leadName}</div>
                  <div className="mono" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{d.phone || "—"}</div>
                  <div>{outcomeChip(d.outcome)}</div>
                  <div className="tabular" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{fmtIn(d.at - Date.now())}</div>
                  <button className="icon-btn" title="Clear from queue" onClick={() => { window.clearRedial && window.clearRedial(d.leadId); window.dispatchEvent(new CustomEvent("redial:queued")); }}>
                    <Icons.X size={11}/>
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }
  window.RedialQueuePanel = RedialQueuePanel;

  /* ─── Dial pacing — soft warning when rep exceeds the per-hour cap ────────
     Most autodialers cap at 60-120 dials/hour to keep DNC complaint rates low.
     We track attempts in sessionStorage and emit a warning toast when crossed. */
  const PACING_DEFAULT = 90;  // dials/hour
  function recentDialsLastHour() {
    try {
      const map = JSON.parse(sessionStorage.getItem("repflow.dial_attempts") || "{}");
      const cutoff = Date.now() - 60 * 60 * 1000;
      return Object.values(map).filter(t => t > cutoff).length;
    } catch { return 0; }
  }
  window.checkDialPace = function (cap = PACING_DEFAULT) {
    const n = recentDialsLastHour();
    return { count: n, cap, exceeded: n >= cap };
  };

  function PacingBadge({ cap = PACING_DEFAULT }) {
    const [, force] = useState(0);
    useEffect(() => {
      const i = setInterval(() => force(x => x + 1), 30_000);
      return () => clearInterval(i);
    }, []);
    const { count, exceeded } = window.checkDialPace ? window.checkDialPace(cap) : { count: 0, exceeded: false };
    if (count === 0) return null;
    const tone = exceeded ? "var(--state-warning)" : count > cap * 0.7 ? "var(--accent-status)" : "var(--text-tertiary)";
    return (
      <div title={`${count} dials in the last hour · soft cap ${cap}`}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px",
          borderRadius: 999, border: `1px solid color-mix(in oklch, ${tone} 35%, transparent)`,
          background: `color-mix(in oklch, ${tone} 10%, transparent)`,
          fontSize: 11, color: tone,
        }}>
        <Icons.Activity size={11}/> {count}/{cap}/hr
        {exceeded && <span style={{ fontWeight: 500 }}>· slow down</span>}
      </div>
    );
  }
  window.PacingBadge = PacingBadge;

})();
