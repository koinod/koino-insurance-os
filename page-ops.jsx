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
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-tertiary)", fontWeight: 600, fontFamily: "var(--font-mono)", marginBottom: 6 }}>{cat}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {items.map(c => {
              const tr = testResult[c.id];
              return (
                <div key={c.id} className="panel" style={{ padding: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: "var(--radius-sm)", background: "var(--bg-raised)", display: "grid", placeItems: "center", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 12, color: "var(--text-secondary)" }}>{c.name[0]}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500 }}>{c.name}</div>
                      <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{c.category}</div>
                    </div>
                    <span className={`dot dot-${c.status === "ok" ? "live" : "warn"}`}></span>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-tertiary)" }}>{c.meta}</div>
                  {tr && (
                    <div style={{
                      marginTop: 6, padding: "4px 6px", borderRadius: "var(--radius-sm)", fontSize: 10.5,
                      color: tr.ok ? "var(--accent-money)" : "var(--state-warning)",
                      background: tr.ok ? "color-mix(in srgb, var(--accent-money) 10%, transparent)" : "color-mix(in srgb, var(--state-warning) 10%, transparent)",
                    }}>
                      {tr.ok ? "✓ " : "⚠ "}{tr.detail}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                    <button className="btn btn-ghost" style={{ padding: "3px 6px", fontSize: 10.5 }} onClick={() => setEditing(c.id)}>
                      <Icons.Edit size={10}/> Configure
                    </button>
                    <button className="btn btn-ghost" style={{ padding: "3px 6px", fontSize: 10.5 }} onClick={() => test(c.id)} disabled={testing === c.id}>
                      {testing === c.id ? "Testing…" : <><Icons.Check size={10}/> Test</>}
                    </button>
                    <button className="btn btn-ghost" style={{ padding: "3px 6px", fontSize: 10.5, color: "var(--state-danger)", marginLeft: "auto" }} onClick={() => remove(c.id)} title="Remove connection">
                      <Icons.X size={10}/>
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
  const hardware = (window.AppData && window.AppData.HARDWARE) || [];
  return (
    <div className="page-pad">
      <div className="page-h">
        <div><div className="page-title">Hardware</div><div className="page-sub">Customer-owned nodes running Repflow agents · enroll a fresh VPS or Mac mini in 60 seconds</div></div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            className="btn"
            onClick={() => {
              // Was a toast-only stub. Now opens the user's mail client with a
              // pre-filled subject line so "Schedule a call" actually starts
              // the conversation.
              window.location.href = "mailto:ops@koino.capital?subject=Hardware%20onboarding%20call&body=Hi%20ops%2C%0A%0AI%27d%20like%20to%20schedule%20a%20call%20to%20enroll%20a%20new%20host%20for%20Repflow%20agents.%0A%0AThanks%2C";
            }}
            title="Opens your mail client to ops@koino.capital"
          >
            <Icons.Calendar size={13}/> Schedule call with ops
          </button>
          <button className="btn btn-primary" onClick={() => setEnrollOpen(true)}><Icons.Plus size={13}/> Enroll new host</button>
        </div>
      </div>
      {enrollOpen && (() => { const M = window.EnrollHostModal; return M ? <M onClose={() => setEnrollOpen(false)}/> : null; })()}
      {hardware.length === 0 ? (
        <div className="panel" style={{ padding: 28, textAlign: "center" }}>
          <Icons.Server size={20} style={{ color: "var(--text-quaternary)" }}/>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6, fontWeight: 500 }}>No hosts enrolled</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4, lineHeight: 1.5, maxWidth: 380, marginLeft: "auto", marginRight: "auto" }}>
            Enroll a Mac mini, VPS, or laptop and Repflow agents run on it locally — no cloud-egress fees, full control over the data plane.
          </div>
          <button className="btn btn-primary" onClick={() => setEnrollOpen(true)} style={{ marginTop: 12 }}>
            <Icons.Plus size={11}/> Enroll your first host
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
          {hardware.map(h => (
            <div key={h.id} className="panel" style={{ padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Icons.Server size={14} style={{ color: "var(--text-secondary)" }}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{h.name}</div>
                  <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{h.kind} · last sync {h.last}</div>
                </div>
                <span className={`dot dot-${h.status === "ok" ? "live" : "warn"}`} style={{ width: 8, height: 8 }}></span>
                <span style={{ fontSize: 10.5, fontWeight: 500, color: h.status === "ok" ? "var(--accent-money)" : "var(--state-warning)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h.status === "ok" ? "Healthy" : "Attention"}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 12 }}>
                <div><div style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "var(--font-mono)" }}>Uptime</div><div className="tabular" style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 600 }}>{h.uptime}</div></div>
                <div><div style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "var(--font-mono)" }}>Load</div><div className="tabular" style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 600, color: h.load > 60 ? "var(--state-warning)" : undefined }}>{h.load}%</div></div>
                <div><div style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "var(--font-mono)" }}>Agents</div><div className="tabular" style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 600 }}>{h.agents}</div></div>
              </div>
              <div style={{ marginTop: 10, height: 4, background: "var(--bg-raised)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: `${h.load}%`, height: "100%", background: h.load > 60 ? "var(--state-warning)" : "var(--accent-money)" }}></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
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

  const agents = (window.AppData && window.AppData.AGENTS) || [];
  return (
    <div className="page-pad">
      <div className="page-h">
        <div><div className="page-title">Agents</div><div className="page-sub">{agents.length} template{agents.length === 1 ? "" : "s"} · deploy to any enrolled host · live log streams below</div></div>
        <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={() => setDeployOpen(true)}><Icons.Plus size={13}/> Deploy agent</button>
      </div>
      {deployOpen && (() => { const M = window.DeployAgentModal; return M ? <M onClose={() => setDeployOpen(false)}/> : null; })()}

      {agents.length === 0 && (
        <div className="panel" style={{ padding: 28, textAlign: "center", marginBottom: 10 }}>
          <Icons.Cpu size={20} style={{ color: "var(--text-quaternary)" }}/>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6, fontWeight: 500 }}>No agent templates yet</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4, lineHeight: 1.5, maxWidth: 380, marginLeft: "auto", marginRight: "auto" }}>
            Deploy an agent template (HUNTER, RETAINER, CLOSER, COACH) to start automating prospecting, retention, and coaching workflows.
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 8 }}>
        {agents.map(a => {
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
  const workflows = (window.AppData && window.AppData.WORKFLOWS) || [];
  const [selectedId, setSelectedId] = React.useState(null);
  const selected = workflows.find(w => w.id === selectedId) || null;
  return (
    <div className="page-pad">
      <div className="page-h">
        <div><div className="page-title">Workflows</div><div className="page-sub">Read-only graphs · request changes in chat · ops fulfills, you approve diff</div></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 10 }}>
        <div className="panel">
          <div className="panel-h"><h3>Active workflows</h3><span className="meta">{workflows.length}</span></div>
          <div className="list">
            {workflows.length === 0 && (
              <div style={{ padding: 22, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
                No workflows configured yet. Ops will set them up after onboarding.
              </div>
            )}
            {workflows.map(w => {
              const active = w.active !== false;
              const isSel = selectedId === w.id;
              return (
                <div key={w.id} className="row" style={{
                  gridTemplateColumns: "1fr 90px 90px 60px 30px",
                  height: 36,
                  background: isSel ? "var(--bg-raised)" : undefined,
                  cursor: "pointer",
                }} onClick={() => setSelectedId(isSel ? null : w.id)}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, opacity: active ? 1 : 0.55 }}>{w.name}</div>
                    <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>last run {w.lastRun || "—"}</div>
                  </div>
                  <div className="tabular" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{w.runs ?? 0}</div>
                  <div><span className={`chip ${active ? "chip-money" : ""}`} style={{ fontSize: 9.5 }}>{active ? "healthy" : "paused"}</span></div>
                  <button
                    className="btn btn-ghost"
                    style={{ padding: "2px 6px", fontSize: 10.5 }}
                    onClick={(e) => { e.stopPropagation(); window.AppData.mutate.workflowToggle(w.id, !active).then(() => window.toast && window.toast(`${active ? "Paused" : "Resumed"} ${w.name}`, "success")).catch(() => {}); }}>
                    {active ? <><Icons.Pause size={10}/> Pause</> : <><Icons.Play size={10}/> Run</>}
                  </button>
                  <button
                    className="icon-btn"
                    title="Ask the AI co-pilot about this workflow"
                    onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent("ai:ask", { detail: {
                      prompt: `Explain workflow "${w.name}" — what it does, what it runs against, and one specific change I should consider this week.`,
                      context: "Ops · workflow drill-down",
                    }})); }}
                  >
                    <Icons.ChevronRight size={11}/>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel">
          <div className="panel-h"><Icons.Workflow size={12}/><h3>{selected ? selected.name : "Graph preview"}</h3><span className="meta">{selected ? "read-only" : "select a workflow"}</span></div>
          <WorkflowGraph workflow={selected}/>
          <WorkflowRequestBar workflow={selected}/>
        </div>
      </div>
    </div>
  );
}

/* Render the actual graph for the selected workflow when its `graph` shape
   is { nodes: [{id,label,kind}], edges: [{from,to}] }. Falls back to an
   empty state if the workflow has no graph yet — previously this rendered
   one hardcoded "FB Lead → Med Supp" diagram regardless of selection. */
function WorkflowGraph({ workflow }) {
  if (!workflow) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
        Select a workflow on the left to preview its graph.
      </div>
    );
  }
  const graph = workflow.graph;
  if (!graph || !Array.isArray(graph.nodes) || graph.nodes.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12, lineHeight: 1.6 }}>
        No graph metadata stored for <strong style={{ color: "var(--text-secondary)" }}>{workflow.name}</strong>.
        <div style={{ marginTop: 6, fontSize: 11 }}>
          Last run: <span className="mono">{workflow.lastRun || "—"}</span> · Runs: <span className="mono">{workflow.runs ?? 0}</span>
        </div>
      </div>
    );
  }
  // Lay nodes out by row (kind groups them); a simple horizontal flow.
  const cols = {};
  graph.nodes.forEach((n, idx) => {
    const col = n.col ?? Math.floor(idx / 3);
    (cols[col] ||= []).push(n);
  });
  return (
    <div style={{ padding: 14, background: "repeating-linear-gradient(0deg, var(--bg-raised) 0 1px, transparent 1px 24px), repeating-linear-gradient(90deg, var(--bg-raised) 0 1px, transparent 1px 24px)" }}>
      <svg viewBox={`0 0 360 ${Math.max(120, graph.nodes.length * 36)}`} style={{ width: "100%", height: 200 }}>
        {graph.nodes.map((n, i) => {
          const x = n.x ?? ((i % 3) * 120 + 20);
          const y = n.y ?? (Math.floor(i / 3) * 60 + 20);
          return (
            <g key={n.id || i} transform={`translate(${x},${y})`}>
              <rect width="80" height="32" rx="6" fill="var(--bg-elevated)" stroke="var(--accent-money)" strokeWidth="1"/>
              <text x="40" y="20" textAnchor="middle" fontSize="10" fill="var(--text-primary)" fontFamily="var(--font-ui)">{n.label || n.id}</text>
            </g>
          );
        })}
        {(graph.edges || []).map((e, i) => {
          const from = graph.nodes.find(n => n.id === e.from);
          const to   = graph.nodes.find(n => n.id === e.to);
          if (!from || !to) return null;
          const x1 = (from.x ?? 0) + 80, y1 = (from.y ?? 0) + 16;
          const x2 = (to.x   ?? 0),       y2 = (to.y   ?? 0) + 16;
          return <path key={i} d={`M${x1} ${y1} L${x2} ${y2}`} stroke="var(--text-tertiary)" fill="none"/>;
        })}
      </svg>
    </div>
  );
}

function WorkflowRequestBar({ workflow }) {
  const [req, setReq] = React.useState("");
  const submit = () => {
    if (!req.trim()) return;
    const ctx = workflow ? `Ops · change request for "${workflow.name}"` : "Ops · workflow request";
    const prompt = workflow
      ? `Workflow change request for "${workflow.name}": ${req}`
      : `Workflow change request: ${req}`;
    window.dispatchEvent(new CustomEvent("ai:ask", { detail: { prompt, context: ctx }}));
    setReq("");
    window.toast && window.toast("Sent to AI co-pilot for review", "success");
  };
  return (
    <div style={{ padding: "8px 12px", borderTop: "1px solid var(--border-subtle)", display: "flex", gap: 6 }}>
      <input className="text-input" style={{ flex: 1, fontSize: 12 }} placeholder={workflow ? `Change request for "${workflow.name}"` : "Pick a workflow first"}
        value={req} onChange={(e) => setReq(e.target.value)} disabled={!workflow}
        onKeyDown={(e) => e.key === "Enter" && submit()}/>
      <button className="btn btn-primary" onClick={submit} disabled={!req.trim() || !workflow}><Icons.Send size={11}/></button>
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
