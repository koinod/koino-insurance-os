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
          <button className="btn btn-ghost" style={{ padding: "3px 8px", fontSize: 11 }}
            onClick={() => setState(s => ({ ...s, on: true, paused: false }))}>
            Start
          </button>
        )}
        {on && !paused && (
          <button className="btn btn-ghost" style={{ padding: "3px 8px", fontSize: 11 }}
            onClick={() => setState(s => ({ ...s, paused: true }))}>
            Pause
          </button>
        )}
        {on && paused && (
          <button className="btn btn-ghost" style={{ padding: "3px 8px", fontSize: 11 }}
            onClick={() => setState(s => ({ ...s, paused: false }))}>
            Resume
          </button>
        )}
        {on && (
          <button className="btn btn-ghost" style={{ padding: "3px 8px", fontSize: 11, color: "var(--state-danger)" }}
            onClick={() => setState(s => ({ ...s, on: false, paused: false }))}>
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
          { k: "live",     l: "Live" },
          { k: "pipeline", l: "Pipeline" },
          { k: "history",  l: "History" },
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
    const me = AppData.REPS && AppData.REPS[0];
    const tasksOpen = (AppData.TASKS || []).filter(t => t.status === "open").length;
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

  // ────────────────────────────────────────────────────────────────────────
  // Page entry — picks the mode from URL ?floor=X (so deep links work) and
  // remembers the last mode in localStorage.
  // ────────────────────────────────────────────────────────────────────────
  function PageFloor({ onCall, role = "rep", defaultMode }) {
    const initialMode = (() => {
      // Explicit prop wins (used by legacy /pipeline, /queue, /calls routes)
      if (defaultMode && ["live","pipeline","history"].includes(defaultMode)) return defaultMode;
      try {
        const url = new URL(window.location.href);
        const m = url.searchParams.get("floor");
        if (m && ["live","pipeline","history"].includes(m)) return m;
        const stored = localStorage.getItem("repflow.floor.mode");
        if (stored && ["live","pipeline","history"].includes(stored)) return stored;
      } catch {}
      return "live";
    })();
    const [mode, setMode] = useState(initialMode);
    // If parent route changes (Pipeline → Dial Queue), follow it
    useEffect(() => {
      if (defaultMode && ["live","pipeline","history"].includes(defaultMode)) {
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

        {mode === "live"     && <LiveMode     role={role} onCall={onCall} autodialer={autodialer} setAutodialer={setAutodialer}/>}
        {mode === "pipeline" && <PipelineMode role={role}/>}
        {mode === "history"  && <HistoryMode  role={role}/>}
      </div>
    );
  }

  window.PageFloor = PageFloor;
})();
