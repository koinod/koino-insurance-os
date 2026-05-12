/* Pages: Operations (Connections, Hardware, Agents, Workflows) + simple stubs */
function PageConnections() {
  const { CONNECTIONS } = AppData;
  const [adding,    setAdding]    = React.useState(false);
  const [editing,   setEditing]   = React.useState(null); // connector id being configured
  const [testing,   setTesting]   = React.useState(null); // id mid-test
  const [testResult, setTestResult] = React.useState({}); // { id: { ok, detail } }
  const [, force]   = React.useState(0);
  React.useEffect(() => {
    const h = () => force(n => n + 1);
    window.addEventListener("data:mutated", h);
    window.addEventListener("data:hydrated", h);
    return () => { window.removeEventListener("data:mutated", h); window.removeEventListener("data:hydrated", h); };
  }, []);

  const schemas = window.CONNECTOR_SCHEMAS || {};
  const connected = (CONNECTIONS || []).reduce((a, c) => { a[c.id] = c; return a; }, {});
  const grouped = (CONNECTIONS || []).reduce((a, c) => { (a[c.category] ||= []).push(c); return a; }, {});

  const test = async (id) => {
    setTesting(id);
    setTestResult(r => ({ ...r, [id]: null }));
    try {
      const r = await fetch("/api/connector/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ connector_id: id }),
      });
      const j = await r.json().catch(() => ({}));
      setTestResult(rr => ({ ...rr, [id]: { ok: r.ok && j.ok, detail: j.detail || j.error || (r.ok ? "Connected" : "Test failed") } }));
    } catch (e) {
      setTestResult(rr => ({ ...rr, [id]: { ok: false, detail: String(e) } }));
    } finally { setTesting(null); }
  };

  const remove = async (id) => {
    if (!confirm(`Remove "${(connected[id] && connected[id].name) || id}" connection?`)) return;
    if (window.AppData.mutate.connectionRemove) {
      try { await window.AppData.mutate.connectionRemove(id); } catch {}
    } else {
      const sb = window.getSupabase && window.getSupabase();
      if (sb) await sb.from("connections").delete().eq("id", id);
      window.AppData.CONNECTIONS = (window.AppData.CONNECTIONS || []).filter(c => c.id !== id);
      window.dispatchEvent(new CustomEvent("data:mutated", { detail: { table: "connections", kind: "delete", id } }));
    }
  };

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Connections</div>
          <div className="page-sub">Your connected services · carrier-agnostic · {(CONNECTIONS || []).length} configured · {Object.keys(schemas).length} available</div>
        </div>
        <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={() => setAdding(true)}>
          <Icons.Plus size={13}/> Add connection
        </button>
      </div>

      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary)", fontWeight: 500, marginBottom: 8 }}>{cat}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {items.map(c => {
              const tr = testResult[c.id];
              return (
                <div key={c.id} className="panel" style={{ padding: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 6, background: "var(--bg-raised)", display: "grid", placeItems: "center", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13, color: "var(--text-secondary)" }}>{c.name[0]}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</div>
                      <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{c.category}</div>
                    </div>
                    <span className={`dot dot-${c.status === "ok" ? "live" : "warn"}`}></span>
                  </div>
                  <div style={{ marginTop: 10, fontSize: 11.5, color: "var(--text-tertiary)" }}>{c.meta}</div>
                  {tr && (
                    <div style={{
                      marginTop: 8, padding: "4px 8px", borderRadius: 4, fontSize: 11,
                      color: tr.ok ? "var(--accent-money)" : "var(--state-warning)",
                      background: tr.ok ? "color-mix(in oklch, var(--accent-money) 10%, transparent)" : "color-mix(in oklch, var(--state-warning) 10%, transparent)",
                    }}>
                      {tr.ok ? "✓ " : "⚠ "}{tr.detail}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                    <button className="btn btn-ghost" style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => setEditing(c.id)}>
                      <Icons.Edit size={11}/> Configure
                    </button>
                    <button className="btn btn-ghost" style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => test(c.id)} disabled={testing === c.id}>
                      {testing === c.id ? "Testing…" : <><Icons.Check size={11}/> Test</>}
                    </button>
                    <button className="btn btn-ghost" style={{ padding: "3px 8px", fontSize: 11, color: "var(--state-danger)", marginLeft: "auto" }} onClick={() => remove(c.id)}>
                      <Icons.X size={11}/>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {(CONNECTIONS || []).length === 0 && (
        <div className="panel" style={{ padding: 18, textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 6 }}>No connections yet</div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 12 }}>Add Twilio for dialing, OpenAI for transcripts, SendBlue for iMessage, etc.</div>
          <button className="btn btn-primary" onClick={() => setAdding(true)}>
            <Icons.Plus size={11}/> Add your first connection
          </button>
        </div>
      )}

      {adding && window.ConnectorPicker && (() => {
        const P = window.ConnectorPicker;
        return <P onPick={(id) => { setAdding(false); setEditing(id); }} onClose={() => setAdding(false)}/>;
      })()}
      {editing && window.ConnectorConfigModal && (() => {
        const M = window.ConnectorConfigModal;
        return <M connectorId={editing} onClose={() => setEditing(null)}/>;
      })()}
    </div>
  );
}

/* ConnectorPicker — modal listing all connector schemas, click to open
   the existing ConnectorConfigModal for that one. */
function ConnectorPicker({ onPick, onClose }) {
  const schemas = window.CONNECTOR_SCHEMAS || {};
  const existing = ((window.AppData && window.AppData.CONNECTIONS) || []).reduce((a, c) => { a[c.id] = true; return a; }, {});
  const entries = Object.entries(schemas).map(([id, s]) => ({ id, name: s.name, configured: !!existing[id] }));
  return (
    <Shared.Modal title="Add connection" width={620} onClose={onClose} actions={<button className="btn btn-ghost" onClick={onClose}>Cancel</button>}>
      <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 12 }}>Pick a service to configure. We'll save the public config to the connection record; secret values stay in Vercel env.</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {entries.map(({ id, name, configured }) => (
          <button key={id}
            onClick={() => onPick(id)}
            className="btn btn-ghost"
            style={{
              justifyContent: "flex-start", textAlign: "left", padding: "10px 12px",
              fontSize: 12.5, border: "1px solid var(--border-subtle)", borderRadius: 6,
              opacity: configured ? 0.8 : 1,
            }}>
            <span style={{ flex: 1 }}>{name}</span>
            {configured && <span style={{ fontSize: 10, color: "var(--accent-money)" }}>configured</span>}
          </button>
        ))}
      </div>
    </Shared.Modal>
  );
}
window.ConnectorPicker = ConnectorPicker;

function PageHardware() {
  const [enrollOpen, setEnrollOpen] = React.useState(false);
  const [inspect, setInspect]        = React.useState(null);

  const removeHost = async (h) => {
    if (!confirm(`Remove host "${h.name}"? Any agents deployed to it will stop running. Re-enroll later if you change your mind.`)) return;
    try {
      const sb = window.getSupabase && window.getSupabase();
      if (sb) {
        const { error } = await sb.from("hardware").delete().eq("id", h.id);
        if (error) throw error;
      }
      window.AppData.HARDWARE = (window.AppData.HARDWARE || []).filter(x => x.id !== h.id);
      window.dispatchEvent(new CustomEvent("data:mutated", { detail: { table: "hardware", kind: "delete", id: h.id } }));
      window.toast && window.toast(`Removed ${h.name}`, "success");
    } catch (e) {
      window.toast && window.toast(`Delete failed: ${e?.message || e}`, "error");
    }
  };

  return (
    <div className="page-pad">
      <div className="page-h">
        <div><div className="page-title">Hardware</div><div className="page-sub">{(AppData.HARDWARE || []).length} enrolled host{(AppData.HARDWARE || []).length === 1 ? "" : "s"} · click any to inspect deployments + logs</div></div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => window.toast && window.toast("Email ops@koino.capital to schedule a hardware-onboarding call", "info")}><Icons.Calendar size={13}/> Schedule call with ops</button>
          <button className="btn btn-primary" onClick={() => setEnrollOpen(true)}><Icons.Plus size={13}/> Enroll new host</button>
        </div>
      </div>
      {enrollOpen && (() => { const M = window.EnrollHostModal; return M ? <M onClose={() => setEnrollOpen(false)}/> : null; })()}

      {(AppData.HARDWARE || []).length === 0 && (
        <div className="panel" style={{ padding: 30, textAlign: "center", color: "var(--text-tertiary)" }}>
          <Icons.Server size={20} style={{ display: "inline-block", color: "var(--text-quaternary)" }}/>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8, fontWeight: 500 }}>No hosts yet</div>
          <div style={{ fontSize: 11.5, marginTop: 4, lineHeight: 1.5, maxWidth: 460, marginLeft: "auto", marginRight: "auto" }}>
            Enroll a Mac mini, VPS, or any Linux/macOS box and Repflow agents run on your hardware — not in our cloud.
          </div>
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setEnrollOpen(true)}>
            <Icons.Plus size={11}/> Enroll first host
          </button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
        {(AppData.HARDWARE || []).map(h => (
          <div key={h.id} className="panel" style={{ padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Icons.Server size={16} style={{ color: "var(--text-secondary)" }}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{h.kind} · last sync {h.last || "—"}</div>
              </div>
              <span className={`dot dot-${h.status === "ok" ? "live" : "warn"}`} style={{ width: 8, height: 8 }}></span>
              <span style={{ fontSize: 11, fontWeight: 500, color: h.status === "ok" ? "var(--accent-money)" : "var(--state-warning)" }}>{h.status === "ok" ? "Healthy" : "Attention"}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 16 }}>
              <div><div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>UPTIME</div><div className="tabular" style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 500 }}>{h.uptime}</div></div>
              <div><div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>LOAD</div><div className="tabular" style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 500, color: h.load > 60 ? "var(--state-warning)" : undefined }}>{h.load}%</div></div>
              <div><div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>AGENTS</div><div className="tabular" style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 500 }}>{h.agents}</div></div>
            </div>
            <div style={{ marginTop: 14, height: 6, background: "var(--bg-raised)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${h.load}%`, height: "100%", background: h.load > 60 ? "var(--state-warning)" : "var(--accent-money)" }}></div>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
              <button className="btn btn-ghost" style={{ padding: "3px 10px", fontSize: 11 }} onClick={() => setInspect(h)}>
                <Icons.Activity size={11}/> Inspect
              </button>
              <button className="btn btn-ghost" style={{ padding: "3px 10px", fontSize: 11, marginLeft: "auto", color: "var(--state-danger)" }} onClick={() => removeHost(h)}>
                <Icons.X size={11}/> Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      {inspect && <HostInspectModal host={inspect} onClose={() => setInspect(null)}/>}
    </div>
  );
}

// Drills a single host: its deployments, recent runs, and a tail-log
// shortcut into the Agents page. Was: no way to see what was actually
// running on a host without clicking around the Agents page guessing.
function HostInspectModal({ host, onClose }) {
  const [deployments, setDeployments] = React.useState(undefined);
  const [runs, setRuns] = React.useState([]);

  React.useEffect(() => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) { setDeployments([]); return; }
    Promise.all([
      sb.from("agent_deployments").select("*").eq("host_id", host.id),
      sb.from("agent_runs").select("*").eq("host_id", host.id).order("started_at", { ascending: false }).limit(8),
    ]).then(([d, r]) => {
      setDeployments(d.data || []);
      setRuns(r.data || []);
    });
  }, [host.id]);

  const agentName = (id) => (AppData.AGENTS || []).find(a => a.id === id)?.name || id;

  return (
    <Shared.Modal title={`Host · ${host.name}`} width={620} onClose={onClose} actions={
      <button className="btn btn-ghost" onClick={onClose}>Close</button>
    }>
      <div className="kpi-row" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <Shared.KpiCard label="Status" value={host.status}/>
        <Shared.KpiCard label="Uptime" value={host.uptime || "—"}/>
        <Shared.KpiCard label="Load" value={`${host.load}%`}/>
        <Shared.KpiCard label="Agents" value={String(host.agents || 0)}/>
      </div>
      <div className="divider"></div>
      <div className="field-l">Deployments</div>
      <div className="list" style={{ marginTop: 6 }}>
        <div className="list-h" style={{ gridTemplateColumns: "1.5fr 90px 130px" }}>
          <div>Agent</div><div>Status</div><div>Started</div>
        </div>
        {deployments === undefined && <div style={{ padding: 14, color: "var(--text-tertiary)", fontSize: 12 }}>Loading…</div>}
        {deployments && deployments.length === 0 && (
          <div style={{ padding: 14, color: "var(--text-tertiary)", fontSize: 12 }}>No agents deployed to this host yet. Deploy one from Agents → Deploy agent.</div>
        )}
        {(deployments || []).map(d => (
          <div key={d.id} className="row" style={{ gridTemplateColumns: "1.5fr 90px 130px" }}>
            <div style={{ fontWeight: 500 }}>{agentName(d.agent_id)}</div>
            <div><span className={`chip ${d.status === "live" ? "chip-money" : ""}`}>{d.status}</span></div>
            <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{d.started_at ? new Date(d.started_at).toLocaleString() : "—"}</div>
          </div>
        ))}
      </div>
      <div className="divider"></div>
      <div className="field-l">Recent runs</div>
      <div className="list" style={{ marginTop: 6 }}>
        {runs.length === 0 && (
          <div style={{ padding: 14, color: "var(--text-tertiary)", fontSize: 12 }}>No runs recorded.</div>
        )}
        {runs.map(r => (
          <div key={r.id} className="row" style={{ gridTemplateColumns: "120px 1fr 70px 70px" }}>
            <div className="mono" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{new Date(r.started_at).toLocaleTimeString()}</div>
            <div style={{ fontSize: 11.5, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{agentName(r.agent_id)}</div>
            <div><span className={`chip ${r.status === "ok" ? "chip-money" : r.status === "running" ? "chip-info" : "chip-danger"}`}>{r.status}</span></div>
            <div className="tabular" style={{ textAlign: "right", fontSize: 11.5, color: "var(--text-tertiary)" }}>{r.duration_ms ? `${r.duration_ms}ms` : "—"}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, display: "flex", gap: 6 }}>
        <button className="btn" onClick={() => { window.dispatchEvent(new CustomEvent("nav:goto", { detail: { page: "agents" }})); onClose(); }}>
          <Icons.ArrowUpRight size={11}/> Open Agents → tail log
        </button>
      </div>
    </Shared.Modal>
  );
}

function PageAgents() {
  const [deployOpen, setDeployOpen] = React.useState(false);
  const [tailFor, setTailFor]       = React.useState(null);
  const [runs, setRuns]              = React.useState([]);
  const [loading, setLoading]        = React.useState(false);

  // Pull recent runs for the selected agent (or all agents if none selected)
  const loadRuns = React.useCallback(async (agentId) => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) { setRuns([]); return; }
    setLoading(true);
    let q = sb.from("agent_runs").select("*").order("started_at", { ascending: false }).limit(20);
    if (agentId) q = q.eq("agent_id", agentId);
    const { data } = await q;
    setRuns(data || []); setLoading(false);
  }, []);
  React.useEffect(() => { loadRuns(tailFor); }, [tailFor, loadRuns]);
  // Realtime: refresh when an agent_runs row appears
  React.useEffect(() => {
    const onRt = (e) => { if (e.detail?.table === "agent_runs") loadRuns(tailFor); };
    window.addEventListener("data:realtime", onRt);
    return () => window.removeEventListener("data:realtime", onRt);
  }, [tailFor, loadRuns]);

  return (
    <div className="page-pad">
      <div className="page-h">
        <div><div className="page-title">Agents</div><div className="page-sub">{AppData.AGENTS.length} templates · deploy to any enrolled host · live log streams below</div></div>
        <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={() => setDeployOpen(true)}><Icons.Plus size={13}/> Deploy agent</button>
      </div>
      {deployOpen && (() => { const M = window.DeployAgentModal; return M ? <M onClose={() => setDeployOpen(false)}/> : null; })()}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 10 }}>
        {AppData.AGENTS.map(a => {
          const myRuns = runs.filter(r => r.agent_id === a.id);
          const lastRun = myRuns[0];
          return (
            <div key={a.id} className="panel" style={{ padding: 14, cursor: "pointer", borderColor: tailFor === a.id ? "var(--accent-money)" : undefined }} onClick={() => setTailFor(tailFor === a.id ? null : a.id)}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <Icons.Cpu size={14} style={{ color: "var(--accent-money)", marginTop: 2 }}/>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{a.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>host: {a.host} · {lastRun ? `last run ${new Date(lastRun.started_at).toLocaleTimeString()}` : "no runs yet"}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6, lineHeight: 1.5 }}>{a.desc}</div>
                </div>
                {lastRun ? (
                  <span className={`chip ${lastRun.status === "ok" ? "chip-money" : lastRun.status === "running" ? "chip-info" : "chip-danger"}`}>{lastRun.status}</span>
                ) : (
                  <span className="chip">v2.4</span>
                )}
              </div>
              <div style={{ display: "flex", gap: 14, marginTop: 12, fontSize: 11, alignItems: "center" }}>
                <span style={{ color: "var(--text-tertiary)" }}>Reqs: <span className="tabular" style={{ color: "var(--text-primary)" }}>{a.reqs}</span></span>
                <span style={{ color: "var(--text-tertiary)" }}>Success: <span className="tabular" style={{ color: a.success >= 99 ? "var(--accent-money)" : "var(--accent-status)" }}>{a.success}%</span></span>
                <span style={{ color: "var(--text-tertiary)" }}>Runs (24h): <span className="tabular" style={{ color: "var(--text-primary)" }}>{myRuns.length}</span></span>
                <button className="btn btn-ghost" style={{ marginLeft: "auto", padding: "3px 8px", fontSize: 11 }} onClick={(e) => { e.stopPropagation(); setTailFor(tailFor === a.id ? null : a.id); }}>
                  {tailFor === a.id ? "Hide log" : "Tail log"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-h">
          <Icons.Activity size={13}/>
          <h3>Live log · {tailFor ? AppData.AGENTS.find(a => a.id === tailFor)?.name || tailFor : "all agents"}</h3>
          <span className="meta">{runs.length} recent runs · auto-refreshes via realtime</span>
          {tailFor && <button className="btn btn-ghost" style={{ marginLeft: "auto" }} onClick={() => setTailFor(null)}>All agents</button>}
        </div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "120px 1fr 80px 70px 90px" }}>
            <div>Started</div><div>Log preview</div><div>Status</div><div className="tabular" style={{ textAlign: "right" }}>Exit</div><div className="tabular" style={{ textAlign: "right" }}>Duration</div>
          </div>
          {loading && <div style={{ padding: 14, color: "var(--text-tertiary)", fontSize: 12 }}>Loading...</div>}
          {!loading && runs.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5, lineHeight: 1.6 }}>
              No runs yet. Either no agents are deployed, no enrolled host has the runner installed, or the cron tick hasn't fired.
              <div style={{ marginTop: 6, fontSize: 11 }}>Hardware → Enroll new host (the install script now schedules <span className="mono">agent-runner.sh</span> too).</div>
            </div>
          )}
          {!loading && runs.map(r => (
            <div key={r.id} className="row" style={{ gridTemplateColumns: "120px 1fr 80px 70px 90px", height: "auto", padding: "8px 12px", alignItems: "flex-start" }}>
              <div style={{ color: "var(--text-tertiary)", fontSize: 11, fontFamily: "var(--font-mono)" }}>{new Date(r.started_at).toLocaleTimeString()}</div>
              <pre style={{ margin: 0, fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-secondary)", whiteSpace: "pre-wrap", maxHeight: 80, overflow: "auto" }}>{(r.log || "(empty)").slice(0, 600)}</pre>
              <div><span className={`chip ${r.status === "ok" ? "chip-money" : r.status === "running" ? "chip-info" : "chip-danger"}`}>{r.status}</span></div>
              <div className="tabular" style={{ textAlign: "right", color: r.exit_code ? "var(--state-danger)" : "var(--text-tertiary)", fontSize: 11.5 }}>{r.exit_code ?? "—"}</div>
              <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)", fontSize: 11.5 }}>{r.duration_ms ? `${r.duration_ms}ms` : "—"}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PageWorkflows() {
  return (
    <div className="page-pad">
      <div className="page-h">
        <div><div className="page-title">Workflows</div><div className="page-sub">Read-only graphs · request changes in chat · ops fulfills, you approve diff</div></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 14 }}>
        <div className="panel">
          <div className="panel-h"><h3>Active workflows</h3><span className="meta">{AppData.WORKFLOWS.length}</span></div>
          <div className="list">
            {AppData.WORKFLOWS.map(w => {
              const active = w.active !== false;
              return (
                <div key={w.id} className="row" style={{ gridTemplateColumns: "1fr 90px 90px 60px 30px", height: 44 }}>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 500, opacity: active ? 1 : 0.55 }}>{w.name}</div>
                    <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>last run {w.lastRun}</div>
                  </div>
                  <div className="tabular" style={{ color: "var(--text-secondary)" }}>{w.runs}</div>
                  <div><span className={`chip ${active ? "chip-money" : ""}`}>{active ? "healthy" : "paused"}</span></div>
                  <button
                    className="btn btn-ghost"
                    style={{ padding: "3px 8px", fontSize: 11 }}
                    onClick={() => window.AppData.mutate.workflowToggle(w.id, !active).then(() => window.toast && window.toast(`${active ? "Paused" : "Resumed"} ${w.name}`, "success")).catch(() => {})}>
                    {active ? <><Icons.Pause size={11}/> Pause</> : <><Icons.Play size={11}/> Run</>}
                  </button>
                  <button className="icon-btn"><Icons.ChevronRight size={12}/></button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel">
          <div className="panel-h"><Icons.Workflow size={13}/><h3>FB Lead → Med Supp queue</h3><span className="meta">read-only graph</span></div>
          <div style={{ padding: 18, background: "repeating-linear-gradient(0deg, var(--bg-raised) 0 1px, transparent 1px 24px), repeating-linear-gradient(90deg, var(--bg-raised) 0 1px, transparent 1px 24px)" }}>
            <svg viewBox="0 0 360 240" style={{ width: "100%", height: 240 }}>
              {[
                { x: 20, y: 20, l: "FB Lead form", c: "var(--state-info)" },
                { x: 140, y: 20, l: "Enrich", c: "var(--accent-money)" },
                { x: 260, y: 20, l: "T65 check", c: "var(--accent-money)" },
                { x: 140, y: 110, l: "LeadiD verify", c: "var(--accent-money)" },
                { x: 20, y: 200, l: "Speed-route < 60s", c: "var(--accent-status)" },
                { x: 200, y: 200, l: "Vapi call back", c: "var(--accent-money)" },
              ].map((n, i) => (
                <g key={i} transform={`translate(${n.x},${n.y})`}>
                  <rect width="80" height="36" rx="6" fill="var(--bg-elevated)" stroke={n.c} strokeWidth="1"/>
                  <text x="40" y="22" textAnchor="middle" fontSize="10.5" fill="var(--text-primary)" fontFamily="var(--font-ui)">{n.l}</text>
                </g>
              ))}
              <path d="M100 38 L140 38" stroke="var(--text-tertiary)" fill="none"/>
              <path d="M220 38 L260 38" stroke="var(--text-tertiary)" fill="none"/>
              <path d="M180 56 L180 110" stroke="var(--text-tertiary)" fill="none"/>
              <path d="M180 146 L60 200" stroke="var(--text-tertiary)" fill="none"/>
              <path d="M180 146 L240 200" stroke="var(--text-tertiary)" fill="none"/>
            </svg>
          </div>
          <WorkflowRequestBar/>
        </div>
      </div>
    </div>
  );
}

function WorkflowRequestBar() {
  const [req, setReq] = React.useState("");
  const submit = () => {
    if (!req.trim()) return;
    window.dispatchEvent(new CustomEvent("ai:ask", { detail: { prompt: `Workflow change request: ${req}`, context: "Ops · workflow request" }}));
    setReq("");
    window.toast && window.toast("Sent to AI co-pilot for review", "success");
  };
  return (
    <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border-subtle)", display: "flex", gap: 8 }}>
      <input className="airail-input" placeholder="Request a change: 'add an SMS step after Vapi voicemail drop'"
        value={req} onChange={(e) => setReq(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}/>
      <button className="btn btn-primary" onClick={submit} disabled={!req.trim()}><Icons.Send size={11}/></button>
    </div>
  );
}

function PageStub({ title, sub }) {
  return (
    <div className="page-pad">
      <div className="page-h">
        <div><div className="page-title">{title}</div><div className="page-sub">{sub}</div></div>
      </div>
      <div className="panel" style={{ padding: 40, textAlign: "center", color: "var(--text-tertiary)" }}>
        <Icons.Sparkles size={20} style={{ color: "var(--accent-money)", marginBottom: 8 }}/>
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>This surface follows the same pattern — explore Today, Pipeline, Dial Queue, Leaderboard, Team Board, Coaching, P&L, and Org Tree for the worked examples.</div>
      </div>
    </div>
  );
}

window.PageConnections = PageConnections;
window.PageHardware = PageHardware;
window.PageAgents = PageAgents;
window.PageWorkflows = PageWorkflows;
window.PageStub = PageStub;
