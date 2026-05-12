/* page-platform-admin.jsx — KOINO HQ mission control for super_admin.
   Also serves a degraded view to role='admin' (IMO operator).

   Subpages: hq · agencies · users · billing · audit · flags · system

   The whole surface is gated on window.isSuperAdmin() OR role==='admin'.
   Anyone else hitting these routes via the sidebar shouldn't be in nav, but
   defense-in-depth check at mount.

   Talks to the cross-tenant RPCs in migration 0019:
     - platform_hq_kpis()
     - platform_agencies_summary(p_include_demo)
     - platform_users_summary(p_limit, p_offset)
     - platform_audit_recent(p_limit, p_kind, p_hours)
     - platform_set_global_flag(name, value)
     - platform_set_agency_flag(agency, name, value)
     - platform_seed_super_admin(email, notes)
     - platform_revoke_super_admin(email)
     - super_admin_act_as_start(target, reason)
     - super_admin_act_as_stop(target)

   All four definers raise 'forbidden' if is_super_admin() is false, so we
   don't have to thread a service-role key from the browser.

   ── styling ──
   Reuses existing tokens — --bg-base, --bg-raised, --bg-elevated, --bg-overlay,
   --text-*, --accent-money (amber), --accent-status, --accent-heat,
   --state-warning, --state-danger, --border-subtle. Tight terminal layout
   (mono numbers, 11–12px chrome). No new globals. */

(function () {

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────
const fmtMoney = (cents) => {
  const n = Math.round((cents || 0) / 100);
  if (n >= 1_000_000) return `$${(n/1_000_000).toFixed(1)}M`;
  if (n >= 1000)      return `$${(n/1000).toFixed(1)}k`;
  return `$${n.toLocaleString()}`;
};
const fmtAge = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso); const m = Math.round((Date.now() - d) / 60000);
  if (m < 1) return "now"; if (m < 60) return `${m}m`; if (m < 1440) return `${Math.round(m/60)}h`;
  return `${Math.round(m/1440)}d`;
};
const safeRpc = async (sb, fn, args) => {
  if (!sb) return { data: null, error: { message: "no supabase" } };
  try {
    const r = await sb.rpc(fn, args || {});
    return r;
  } catch (e) {
    return { data: null, error: { message: String(e && e.message || e) } };
  }
};

// ──────────────────────────────────────────────────────────────────────────
// ImpersonationBanner — global sticky banner mounted by index.html above topbar
// ──────────────────────────────────────────────────────────────────────────
function ImpersonationBanner() {
  const [target, setTarget] = React.useState(() => {
    try {
      const id = localStorage.getItem("repflow.super_admin_acting_as");
      if (!id) return null;
      const name = localStorage.getItem("repflow.super_admin_acting_as_name") || id;
      return { agency_id: id, agency_name: name };
    } catch { return null; }
  });
  React.useEffect(() => {
    const onImp = (e) => {
      const d = e.detail;
      if (!d || !d.agency_id) { setTarget(null); return; }
      setTarget({ agency_id: d.agency_id, agency_name: d.agency_name || d.agency_id });
      try { localStorage.setItem("repflow.super_admin_acting_as_name", d.agency_name || d.agency_id); } catch {}
    };
    window.addEventListener("admin:impersonate", onImp);
    return () => window.removeEventListener("admin:impersonate", onImp);
  }, []);
  if (!target) return null;
  const stop = () => { window.stopSuperAdminActAs && window.stopSuperAdminActAs(); };
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 16px", borderBottom: "1px solid color-mix(in oklch, var(--state-warning) 40%, transparent)",
      background: "color-mix(in oklch, var(--state-warning) 12%, var(--bg-base))",
      fontSize: 12, color: "var(--text-primary)", position: "sticky", top: 0, zIndex: 40,
      fontFamily: "var(--font-mono, ui-monospace)",
    }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--state-warning)", boxShadow: "0 0 8px var(--state-warning)" }}/>
      <strong style={{ color: "var(--state-warning)", letterSpacing: 0.3 }}>ACTING AS</strong>
      <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{target.agency_name}</span>
      <span style={{ color: "var(--text-tertiary)" }}>· every write attributed to your user_id, scoped to this agency</span>
      <button onClick={stop} className="btn btn-ghost" style={{ marginLeft: "auto", fontSize: 11, padding: "3px 10px", color: "var(--state-warning)", borderColor: "color-mix(in oklch, var(--state-warning) 40%, transparent)" }}>
        Stop impersonating
      </button>
    </div>
  );
}
window.ImpersonationBanner = ImpersonationBanner;

// ──────────────────────────────────────────────────────────────────────────
// HQ subpage — Mission control
// ──────────────────────────────────────────────────────────────────────────
function SubpageHQ({ onActAs }) {
  const [kpis, setKpis]         = React.useState(null);
  const [agencies, setAgencies] = React.useState([]);
  const [audit, setAudit]       = React.useState([]);
  const [showDemo, setShowDemo] = React.useState(() => {
    try { return localStorage.getItem("repflow.super_admin.show_demo") === "1"; } catch { return false; }
  });
  const [err, setErr]           = React.useState(null);
  const [loading, setLoading]   = React.useState(true);

  const load = React.useCallback(async () => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) { setLoading(false); return; }
    setLoading(true);
    const [k, a, l] = await Promise.all([
      safeRpc(sb, "platform_hq_kpis", {}),
      safeRpc(sb, "platform_agencies_summary", { p_include_demo: showDemo }),
      safeRpc(sb, "platform_audit_recent", { p_limit: 12, p_hours: 24 }),
    ]);
    if (k.error && /forbidden|does not exist/i.test(k.error.message || "")) {
      setErr(k.error.message);
    } else {
      setErr(null);
    }
    setKpis(k.data || null);
    setAgencies(Array.isArray(a.data) ? a.data : []);
    setAudit(Array.isArray(l.data) ? l.data : []);
    setLoading(false);
  }, [showDemo]);
  React.useEffect(() => { load(); }, [load]);

  if (err) return <ForbiddenCard error={err}/>;

  const topAgencies = [...agencies].sort((x, y) => (y.mrr_cents || 0) - (x.mrr_cents || 0)).slice(0, 8);
  const blockers = audit.filter(a => a.kind === "blocker_on_operator" || a.severity === "danger").slice(0, 5);
  const liveAge = kpis?.generated_at ? Math.round((Date.now() - new Date(kpis.generated_at)) / 1000) : null;
  const isLive = liveAge != null && liveAge < 300;

  return (
    <div className="page-pad" style={{ fontFamily: "var(--font-stack)" }}>
      <div className="page-h">
        <div>
          <div className="page-title" style={{ fontFamily: "var(--font-mono, ui-monospace)", letterSpacing: 0.5 }}>
            KOINO HQ <span style={{ color: "var(--accent-money)" }}>·</span> mission control
          </div>
          <div className="page-sub">
            {loading ? "syncing fleet…" : `${agencies.length} agencies · ${isLive ? "live" : "stale"} · last sync ${liveAge != null ? liveAge + "s" : "—"}`}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--text-tertiary)" }}>
            <input type="checkbox" checked={showDemo} onChange={(e) => { setShowDemo(e.target.checked); try { localStorage.setItem("repflow.super_admin.show_demo", e.target.checked ? "1" : "0"); } catch {} }}/>
            Show demo agencies
          </label>
          <button className="btn" onClick={load}><Icons.Sparkles size={11}/> Re-sync</button>
        </div>
      </div>

      {/* HQ hero strip — six tabular counters, mono so columns lock as numbers grow */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10,
        marginBottom: 14, fontFamily: "var(--font-mono, ui-monospace)",
      }}>
        <HqMetric label="Agencies" value={kpis?.agency_count ?? "—"} tone="status"/>
        <HqMetric label="Active 24h" value={kpis?.active_24h ?? "—"} tone="money"/>
        <HqMetric label="Audit 24h" value={kpis?.audit_24h ?? "—"} tone="status"/>
        <HqMetric label="MRR (sum)" value={fmtMoney(kpis?.mrr_cents)} tone="money"/>
        <HqMetric label="Open NIGOs" value={kpis?.open_nigos ?? "—"} tone={kpis?.open_nigos > 0 ? "warn" : "money"}/>
        <HqMetric label="Blockers" value={blockers.length} tone={blockers.length ? "danger" : "money"}/>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 14 }}>
        {/* LEFT column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="panel">
            <div className="panel-h">
              <Icons.Building size={13}/>
              <h3>Top agencies by MRR</h3>
              <span className="meta">{topAgencies.length} of {agencies.length}</span>
            </div>
            <div className="list">
              <div className="list-h" style={{ gridTemplateColumns: "1.4fr 80px 80px 80px 80px 110px" }}>
                <div>Agency</div><div>Plan</div><div>Members</div><div>NIGOs</div><div>MRR</div><div></div>
              </div>
              {loading && <div style={{ padding: 18, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>Loading…</div>}
              {!loading && topAgencies.length === 0 && <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>No agencies visible — confirm you're on the super_admin allowlist.</div>}
              {topAgencies.map(a => (
                <div key={a.id} className="row" style={{ gridTemplateColumns: "1.4fr 80px 80px 80px 80px 110px", fontFamily: "var(--font-mono, ui-monospace)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-stack)" }}>
                    <span style={{ fontWeight: 500 }}>{a.name}</span>
                    {a.is_demo && <span className="chip" style={{ fontSize: 9.5, color: "var(--text-tertiary)" }}>demo</span>}
                  </div>
                  <div><span className="chip" style={{ fontSize: 10 }}>{a.plan}</span></div>
                  <div className="tabular">{a.member_count}</div>
                  <div className="tabular" style={{ color: (a.open_nigos || 0) > 0 ? "var(--state-warning)" : "var(--text-tertiary)" }}>{a.open_nigos}</div>
                  <div className="tabular" style={{ color: "var(--accent-money)" }}>{fmtMoney(a.mrr_cents)}</div>
                  <div>
                    <button className="btn btn-ghost" style={{ fontSize: 10.5, padding: "2px 8px" }} onClick={() => onActAs(a)}>
                      <Icons.ArrowUpRight size={10}/> Act as
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-h">
              <Icons.Activity size={13}/>
              <h3>Global audit · last 24h</h3>
              <span className="meta">{audit.length} events</span>
            </div>
            <div className="list">
              {audit.length === 0 && <div style={{ padding: 18, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>No audit events in the window.</div>}
              {audit.map(a => (
                <AuditRow key={a.id} a={a}/>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="panel">
            <div className="panel-h">
              <Icons.Shield size={13} style={{ color: "var(--state-warning)" }}/>
              <h3>BLOCKERS on operator</h3>
              <span className="meta">{blockers.length}</span>
            </div>
            <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {blockers.length === 0 && (
                <div style={{ padding: 12, color: "var(--text-tertiary)", fontSize: 12, lineHeight: 1.6 }}>
                  Nothing flagged. Automation surfaces operator-dependent items here.
                </div>
              )}
              {blockers.map(b => (
                <div key={b.id} style={{ padding: 10, background: "var(--bg-raised)", borderRadius: 6, borderLeft: "3px solid var(--state-warning)", fontSize: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <strong style={{ fontFamily: "var(--font-mono, ui-monospace)", color: "var(--state-warning)" }}>{b.kind || b.action}</strong>
                    <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{fmtAge(b.created_at)}</span>
                  </div>
                  <div style={{ marginTop: 4, color: "var(--text-secondary)", fontSize: 11.5 }}>
                    {b.target || "—"}{b.agency_name ? ` · ${b.agency_name}` : ""}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <CapabilityRail/>
          <ProjectInfoCard/>
        </div>
      </div>
    </div>
  );
}

function HqMetric({ label, value, tone }) {
  const colors = {
    money:  "var(--accent-money)",
    status: "var(--accent-status)",
    warn:   "var(--state-warning)",
    danger: "var(--state-danger)",
  };
  const c = colors[tone] || "var(--text-primary)";
  return (
    <div style={{ padding: "12px 14px", background: "var(--bg-raised)", border: "1px solid var(--border-subtle)", borderRadius: 6 }}>
      <div style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: c, marginTop: 4, fontFeatureSettings: "'tnum'" }}>{value}</div>
    </div>
  );
}

function AuditRow({ a }) {
  const severityColor =
    a.severity === "danger"  ? "var(--state-danger)" :
    a.severity === "warn"    ? "var(--state-warning)" :
    a.severity === "success" ? "var(--accent-money)" :
    "var(--text-tertiary)";
  return (
    <div className="row" style={{ gridTemplateColumns: "110px 1.2fr 1fr 90px 70px", fontSize: 11.5, fontFamily: "var(--font-mono, ui-monospace)" }}>
      <div style={{ color: "var(--text-tertiary)" }}>{new Date(a.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
      <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>{a.kind || a.action}</div>
      <div style={{ color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.target || "—"}{a.agency_name ? ` · ${a.agency_name}` : ""}</div>
      <div><span className="chip" style={{ fontSize: 9.5 }}>{a.actor_role || "system"}</span></div>
      <div><span style={{ width: 6, height: 6, borderRadius: 999, background: severityColor, display: "inline-block" }}/></div>
    </div>
  );
}

function ForbiddenCard({ error }) {
  return (
    <div className="page-pad">
      <div className="panel" style={{ padding: 24, border: "1px solid color-mix(in oklch, var(--state-danger) 35%, transparent)" }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--state-danger)" }}>Platform admin · forbidden</div>
        <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          The cross-tenant RPC returned an error. You're either not on the
          <code className="mono" style={{ marginLeft: 4, background: "var(--bg-raised)", padding: "1px 5px", borderRadius: 3 }}>koino_super_admins</code> allowlist,
          or migration <code className="mono">0019_super_admin_platform.sql</code> hasn't been applied to this project yet.
        </div>
        <pre style={{ marginTop: 12, padding: 10, background: "var(--bg-base)", borderRadius: 6, fontSize: 11, color: "var(--text-tertiary)", whiteSpace: "pre-wrap", overflowX: "auto" }}>
{String(error || "")}
        </pre>
      </div>
    </div>
  );
}

function CapabilityRail() {
  // Reuses the capability shape from page-platform.jsx — three probes
  // (voice / sms / transcription) hitting the local API. Lightweight; runs on
  // mount only.
  const [s, setS] = React.useState({ voice: "checking", sms: "checking", transcription: "checking" });
  React.useEffect(() => {
    const probe = async (path, body) => {
      try {
        const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
        if (r.status === 503) return "unconfigured";
        if (r.ok) return "ready";
        const j = await r.json().catch(() => ({}));
        if (j.error && /missing|invalid_/i.test(j.error)) return "ready";
        return "error";
      } catch { return "error"; }
    };
    Promise.all([
      probe("/api/twilio-token", {}),
      probe("/api/twilio-sms", {}),
      probe("/api/transcribe", {}),
    ]).then(([v, s_, t]) => setS({ voice: v, sms: s_, transcription: t }));
  }, []);
  const dot = (state) => state === "ready" ? "var(--accent-money)" : state === "unconfigured" ? "var(--state-warning)" : state === "checking" ? "var(--text-tertiary)" : "var(--state-danger)";
  return (
    <div className="panel">
      <div className="panel-h"><Icons.Bolt size={13}/><h3>Capabilities</h3><span className="meta">infra probe</span></div>
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        {[["Voice (Twilio)", s.voice], ["SMS (Twilio)", s.sms], ["Transcription (Whisper)", s.transcription]].map(([label, state]) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: dot(state) }}/>
            <span style={{ flex: 1 }}>{label}</span>
            <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.4, fontFamily: "var(--font-mono, ui-monospace)" }}>{state}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProjectInfoCard() {
  const url = (window.SUPABASE_URL || "").replace(/^https?:\/\//, "").replace(/\.supabase\.co.*/, "");
  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  return (
    <div className="panel">
      <div className="panel-h"><Icons.Folder size={13}/><h3>Project</h3></div>
      <div style={{ padding: 12, fontSize: 11.5, lineHeight: 1.8, fontFamily: "var(--font-mono, ui-monospace)" }}>
        <div><span style={{ color: "var(--text-tertiary)" }}>supabase</span> {url || "—"}</div>
        <div><span style={{ color: "var(--text-tertiary)" }}>you</span> {meIdent?.full_name || "—"} ({meIdent?.handle || "—"})</div>
        <div><span style={{ color: "var(--text-tertiary)" }}>role</span> <span style={{ color: "var(--accent-money)" }}>{meIdent?.is_super_admin ? "super_admin" : (meIdent?.role || "—")}</span></div>
        <div><span style={{ color: "var(--text-tertiary)" }}>agency</span> {meIdent?.agency_name || "—"}</div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Agencies subpage
// ──────────────────────────────────────────────────────────────────────────
function SubpageAgencies({ onActAs }) {
  const [showDemo, setShowDemo] = React.useState(() => {
    try { return localStorage.getItem("repflow.super_admin.show_demo") === "1"; } catch { return false; }
  });
  const [agencies, setAgencies] = React.useState([]);
  const [loading, setLoading]   = React.useState(true);
  const [err, setErr]           = React.useState(null);
  const [q, setQ]               = React.useState("");
  const [editing, setEditing]   = React.useState(null);   // for flags editor

  const load = React.useCallback(async () => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) { setLoading(false); return; }
    setLoading(true);
    const r = await safeRpc(sb, "platform_agencies_summary", { p_include_demo: showDemo });
    if (r.error) setErr(r.error.message); else setErr(null);
    setAgencies(Array.isArray(r.data) ? r.data : []);
    setLoading(false);
  }, [showDemo]);
  React.useEffect(() => { load(); }, [load]);

  if (err && /forbidden|does not exist/i.test(err)) return <ForbiddenCard error={err}/>;

  const filtered = q
    ? agencies.filter(a => (a.name || "").toLowerCase().includes(q.toLowerCase()) || (a.slug || "").toLowerCase().includes(q.toLowerCase()))
    : agencies;

  return (
    <div className="page-pad" style={{ fontFamily: "var(--font-stack)" }}>
      <div className="page-h">
        <div>
          <div className="page-title">All agencies</div>
          <div className="page-sub">{loading ? "loading…" : `${filtered.length} of ${agencies.length} agencies${showDemo ? "" : " (demo hidden)"}`}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
          <input className="text-input" style={{ width: 240 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or slug…"/>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--text-tertiary)" }}>
            <input type="checkbox" checked={showDemo} onChange={(e) => { setShowDemo(e.target.checked); try { localStorage.setItem("repflow.super_admin.show_demo", e.target.checked ? "1" : "0"); } catch {} }}/>
            Show demo
          </label>
          <button className="btn" onClick={load}><Icons.Sparkles size={11}/> Refresh</button>
        </div>
      </div>

      <div className="panel">
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1.6fr 80px 80px 80px 80px 80px 120px 140px" }}>
            <div>Agency</div>
            <div>Plan</div>
            <div>Members</div>
            <div>Reps</div>
            <div>NIGOs</div>
            <div>MRR</div>
            <div>Created</div>
            <div></div>
          </div>
          {loading && <div style={{ padding: 18, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>Loading…</div>}
          {!loading && filtered.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
              {q ? "No matches." : "No agencies visible. Verify the super_admin allowlist."}
            </div>
          )}
          {filtered.map(a => (
            <div key={a.id} className="row" style={{ gridTemplateColumns: "1.6fr 80px 80px 80px 80px 80px 120px 140px", fontFamily: "var(--font-mono, ui-monospace)" }}>
              <div style={{ fontFamily: "var(--font-stack)" }}>
                <span style={{ fontWeight: 500 }}>{a.name}</span>
                {a.is_demo && <span className="chip" style={{ fontSize: 9.5, marginLeft: 6, color: "var(--text-tertiary)" }}>demo</span>}
                <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginTop: 2, fontFamily: "var(--font-mono, ui-monospace)" }}>{a.slug || "—"} · {(a.id || "").slice(0, 8)}</div>
              </div>
              <div><span className="chip" style={{ fontSize: 10 }}>{a.plan}</span></div>
              <div className="tabular">{a.member_count}</div>
              <div className="tabular">{a.rep_count}</div>
              <div className="tabular" style={{ color: (a.open_nigos || 0) > 0 ? "var(--state-warning)" : "var(--text-tertiary)" }}>{a.open_nigos}</div>
              <div className="tabular" style={{ color: "var(--accent-money)" }}>{fmtMoney(a.mrr_cents)}</div>
              <div style={{ color: "var(--text-tertiary)", fontSize: 11 }}>{a.created_at ? new Date(a.created_at).toLocaleDateString() : "—"}</div>
              <div style={{ display: "flex", gap: 4 }}>
                <button className="btn btn-ghost" style={{ fontSize: 10.5, padding: "2px 8px" }} onClick={() => onActAs(a)}>
                  <Icons.ArrowUpRight size={10}/> Act as
                </button>
                <button className="btn btn-ghost" style={{ fontSize: 10.5, padding: "2px 8px" }} onClick={() => setEditing(a)}>
                  <Icons.Bolt size={10}/> Flags
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {editing && <AgencyFlagsModal agency={editing} onClose={() => setEditing(null)}/>}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Users subpage
// ──────────────────────────────────────────────────────────────────────────
function SubpageUsers() {
  const [rows, setRows]     = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr]       = React.useState(null);
  const [q, setQ]           = React.useState("");
  const [grantEmail, setGrantEmail] = React.useState("");
  const [busy, setBusy]     = React.useState(false);

  const load = React.useCallback(async () => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) { setLoading(false); return; }
    setLoading(true);
    const r = await safeRpc(sb, "platform_users_summary", { p_limit: 500, p_offset: 0 });
    if (r.error) setErr(r.error.message); else setErr(null);
    setRows(Array.isArray(r.data) ? r.data : []);
    setLoading(false);
  }, []);
  React.useEffect(() => { load(); }, [load]);

  if (err && /forbidden|does not exist/i.test(err)) return <ForbiddenCard error={err}/>;

  const filtered = q
    ? rows.filter(r => (r.email || "").toLowerCase().includes(q.toLowerCase()) || (r.agencies || "").toLowerCase().includes(q.toLowerCase()))
    : rows;

  const grant = async () => {
    if (!grantEmail.trim()) return;
    setBusy(true);
    const sb = window.getSupabase();
    const r = await safeRpc(sb, "platform_seed_super_admin", { p_email: grantEmail.trim(), p_notes: "Granted via platform-admin UI" });
    setBusy(false);
    if (r.error) {
      window.toast && window.toast(`Grant failed: ${r.error.message}`, "error");
    } else if (r.data === false) {
      window.toast && window.toast(`No auth.users row for ${grantEmail}`, "warn");
    } else {
      window.toast && window.toast(`${grantEmail} is now super_admin`, "success");
      setGrantEmail("");
      load();
    }
  };
  const revoke = async (email) => {
    if (!confirm(`Revoke super_admin from ${email}? This locks them out of the platform-admin surface immediately.`)) return;
    const sb = window.getSupabase();
    const r = await safeRpc(sb, "platform_revoke_super_admin", { p_email: email });
    if (r.error) window.toast && window.toast(`Revoke failed: ${r.error.message}`, "error");
    else { window.toast && window.toast(`${email} revoked`, "success"); load(); }
  };

  return (
    <div className="page-pad" style={{ fontFamily: "var(--font-stack)" }}>
      <div className="page-h">
        <div>
          <div className="page-title">All users</div>
          <div className="page-sub">{loading ? "loading…" : `${filtered.length} of ${rows.length} users · ${rows.filter(r => r.is_super).length} super-admins`}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
          <input className="text-input" style={{ width: 260 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by email or agency…"/>
          <button className="btn" onClick={load}><Icons.Sparkles size={11}/> Refresh</button>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="panel-h"><Icons.Shield size={13} style={{ color: "var(--accent-money)" }}/><h3>Grant super_admin</h3></div>
        <div style={{ padding: 12, display: "flex", gap: 8 }}>
          <input className="text-input" value={grantEmail} onChange={(e) => setGrantEmail(e.target.value)} placeholder="email@koino.capital" style={{ flex: 1 }}/>
          <button className="btn btn-primary" disabled={!grantEmail.trim() || busy} onClick={grant}>
            <Icons.Check size={11}/> {busy ? "Granting…" : "Grant"}
          </button>
        </div>
        <div style={{ padding: "0 12px 12px", fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.55 }}>
          The user must already have an <code className="mono">auth.users</code> row (signed in at least once). Allowlist is canonical; <code className="mono">KOINO_SUPER_ADMIN_EMAILS</code> env var seeds the same table on migration replay.
        </div>
      </div>

      <div className="panel">
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1.4fr 1.4fr 1fr 120px 100px 110px" }}>
            <div>Email</div>
            <div>Agencies</div>
            <div>Roles</div>
            <div>Last sign-in</div>
            <div>Super</div>
            <div></div>
          </div>
          {loading && <div style={{ padding: 18, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>Loading…</div>}
          {!loading && filtered.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>{q ? "No matches." : "No users visible."}</div>
          )}
          {filtered.map(u => (
            <div key={u.user_id} className="row" style={{ gridTemplateColumns: "1.4fr 1.4fr 1fr 120px 100px 110px", fontSize: 11.5 }}>
              <div style={{ fontWeight: 500 }}>{u.email || "—"}</div>
              <div style={{ color: "var(--text-secondary)" }}>{u.agencies || "—"}</div>
              <div style={{ color: "var(--text-tertiary)" }}>{u.roles || "—"}</div>
              <div style={{ fontFamily: "var(--font-mono, ui-monospace)", color: "var(--text-tertiary)" }}>{fmtAge(u.last_sign_in)}</div>
              <div>{u.is_super && <span className="chip" style={{ color: "var(--accent-money)", borderColor: "color-mix(in oklch, var(--accent-money) 35%, transparent)" }}>super</span>}</div>
              <div>
                {u.is_super && (
                  <button className="btn btn-ghost" style={{ fontSize: 10.5, padding: "2px 8px", color: "var(--state-danger)" }} onClick={() => revoke(u.email)}>
                    Revoke
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Billing subpage — cross-agency Stripe roll-up (read-only placeholder)
// ──────────────────────────────────────────────────────────────────────────
function SubpageBilling() {
  const [agencies, setAgencies] = React.useState([]);
  const [err, setErr]           = React.useState(null);
  const [loading, setLoading]   = React.useState(true);
  const [includeDemo, setIncludeDemo] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      const sb = window.getSupabase && window.getSupabase();
      if (!sb) { setLoading(false); return; }
      const r = await safeRpc(sb, "platform_agencies_summary", { p_include_demo: includeDemo });
      if (r.error) setErr(r.error.message); else setErr(null);
      setAgencies(Array.isArray(r.data) ? r.data : []);
      setLoading(false);
    })();
  }, [includeDemo]);

  if (err && /forbidden|does not exist/i.test(err)) return <ForbiddenCard error={err}/>;

  const totalMrr = agencies.reduce((s, a) => s + (a.mrr_cents || 0), 0);
  const byPlan = agencies.reduce((m, a) => { m[a.plan] = (m[a.plan] || 0) + (a.mrr_cents || 0); return m; }, {});

  return (
    <div className="page-pad" style={{ fontFamily: "var(--font-stack)" }}>
      <div className="page-h">
        <div>
          <div className="page-title">Repflow MRR</div>
          <div className="page-sub">{loading ? "loading…" : `${agencies.length} agencies · ${fmtMoney(totalMrr)} MRR (sum)`}</div>
        </div>
        <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--text-tertiary)" }}>
          <input type="checkbox" checked={includeDemo} onChange={(e) => setIncludeDemo(e.target.checked)}/>
          Include demo
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14, fontFamily: "var(--font-mono, ui-monospace)" }}>
        <HqMetric label="MRR" value={fmtMoney(totalMrr)} tone="money"/>
        <HqMetric label="Agencies billed" value={agencies.filter(a => (a.mrr_cents || 0) > 0).length} tone="status"/>
        <HqMetric label="On trial" value={agencies.filter(a => a.plan === "trial").length} tone="warn"/>
        <HqMetric label="Pro+" value={agencies.filter(a => /pro|growth|enterprise/i.test(a.plan || "")).length} tone="money"/>
      </div>

      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="panel-h"><Icons.Wallet size={13}/><h3>By plan</h3></div>
        <div style={{ padding: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
          {Object.entries(byPlan).map(([plan, cents]) => (
            <div key={plan} style={{ padding: 10, background: "var(--bg-raised)", borderRadius: 6, fontFamily: "var(--font-mono, ui-monospace)" }}>
              <div style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.4 }}>{plan}</div>
              <div style={{ fontSize: 16, color: "var(--accent-money)", marginTop: 4 }}>{fmtMoney(cents)}</div>
            </div>
          ))}
          {Object.keys(byPlan).length === 0 && <div style={{ padding: 12, color: "var(--text-tertiary)", fontSize: 12 }}>No agencies yet.</div>}
        </div>
      </div>

      <div className="panel">
        <div className="panel-h"><Icons.Activity size={13}/><h3>Per-agency</h3></div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1.6fr 100px 100px 100px" }}>
            <div>Agency</div><div>Plan</div><div>MRR</div><div>Members</div>
          </div>
          {agencies.map(a => (
            <div key={a.id} className="row" style={{ gridTemplateColumns: "1.6fr 100px 100px 100px", fontFamily: "var(--font-mono, ui-monospace)" }}>
              <div style={{ fontFamily: "var(--font-stack)" }}>{a.name}{a.is_demo && <span className="chip" style={{ marginLeft: 6, fontSize: 9.5 }}>demo</span>}</div>
              <div><span className="chip" style={{ fontSize: 10 }}>{a.plan}</span></div>
              <div className="tabular" style={{ color: "var(--accent-money)" }}>{fmtMoney(a.mrr_cents)}</div>
              <div className="tabular">{a.member_count}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 12, padding: 12, fontSize: 11.5, color: "var(--text-tertiary)", lineHeight: 1.6 }}>
        Note: MRR is summed from the local <code className="mono">subscriptions</code> table where status = active/trialing. Live Stripe cross-customer aggregation is tracked separately.
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Audit subpage
// ──────────────────────────────────────────────────────────────────────────
function SubpageAudit() {
  const [rows, setRows]   = React.useState([]);
  const [hours, setHours] = React.useState(24);
  const [kind, setKind]   = React.useState("");
  const [err, setErr]     = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) { setLoading(false); return; }
    setLoading(true);
    const r = await safeRpc(sb, "platform_audit_recent", { p_limit: 500, p_hours: hours, p_kind: kind || null });
    if (r.error) setErr(r.error.message); else setErr(null);
    setRows(Array.isArray(r.data) ? r.data : []);
    setLoading(false);
  }, [hours, kind]);
  React.useEffect(() => { load(); }, [load]);

  if (err && /forbidden|does not exist/i.test(err)) return <ForbiddenCard error={err}/>;

  const kinds = [...new Set(rows.map(r => r.kind).filter(Boolean))].sort();

  return (
    <div className="page-pad" style={{ fontFamily: "var(--font-stack)" }}>
      <div className="page-h">
        <div>
          <div className="page-title">Global audit</div>
          <div className="page-sub">{loading ? "loading…" : `${rows.length} events · last ${hours}h${kind ? ` · kind=${kind}` : ""}`}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <Shared.Select value={hours} onChange={(v) => setHours(Number(v))} options={[
            { v: 1, l: "Last 1h" }, { v: 6, l: "Last 6h" }, { v: 24, l: "Last 24h" }, { v: 72, l: "Last 3d" }, { v: 168, l: "Last 7d" },
          ]}/>
          <Shared.Select value={kind} onChange={setKind} options={[{ v: "", l: "All kinds" }, ...kinds.map(k => ({ v: k, l: k }))]}/>
          <button className="btn" onClick={load}><Icons.Sparkles size={11}/> Refresh</button>
        </div>
      </div>

      <div className="panel">
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "130px 1.1fr 1fr 1fr 110px 70px" }}>
            <div>When</div><div>Kind</div><div>Target / agency</div><div>Actor</div><div>Role</div><div>Sev</div>
          </div>
          {loading && <div style={{ padding: 18, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>Loading…</div>}
          {!loading && rows.length === 0 && <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>No audit rows in this window.</div>}
          {rows.map(a => (
            <div key={a.id} className="row" style={{ gridTemplateColumns: "130px 1.1fr 1fr 1fr 110px 70px", fontSize: 11.5, fontFamily: "var(--font-mono, ui-monospace)" }}>
              <div style={{ color: "var(--text-tertiary)" }}>{new Date(a.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>
              <div style={{ fontWeight: 500 }}>{a.kind || a.action}</div>
              <div style={{ color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={`${a.target || ""} ${a.agency_name || ""}`}>
                {a.target || "—"}{a.agency_name ? ` · ${a.agency_name}` : ""}
              </div>
              <div style={{ color: "var(--text-tertiary)" }}>{a.actor_email || (a.actor_user_id ? a.actor_user_id.slice(0, 8) : "—")}</div>
              <div><span className="chip" style={{ fontSize: 9.5 }}>{a.actor_role || "system"}</span></div>
              <div>
                <span style={{
                  width: 6, height: 6, borderRadius: 999, display: "inline-block",
                  background: a.severity === "danger" ? "var(--state-danger)" : a.severity === "warn" ? "var(--state-warning)" : a.severity === "success" ? "var(--accent-money)" : "var(--text-tertiary)",
                }}/>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Flags subpage
// ──────────────────────────────────────────────────────────────────────────
function SubpageFlags() {
  const [global, setGlobal]   = React.useState([]);    // {key, value}
  const [agencies, setAgencies] = React.useState([]); // for the per-agency editor list
  const [loading, setLoading] = React.useState(true);
  const [err, setErr]         = React.useState(null);
  const [newName, setNewName] = React.useState("");
  const [newValue, setNewValue] = React.useState("true");

  const load = React.useCallback(async () => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) { setLoading(false); return; }
    setLoading(true);
    const [g, a] = await Promise.all([
      sb.from("org_settings").select("key, value").like("key", "feature_flag.%").order("key"),
      safeRpc(sb, "platform_agencies_summary", { p_include_demo: true }),
    ]);
    if (g.error) setErr(g.error.message);
    else setErr(null);
    setGlobal((g.data || []).map(r => ({ name: r.key.replace(/^feature_flag\./, ""), value: r.value })));
    setAgencies(Array.isArray(a.data) ? a.data : []);
    setLoading(false);
  }, []);
  React.useEffect(() => { load(); }, [load]);

  if (err && /forbidden|does not exist/i.test(err)) return <ForbiddenCard error={err}/>;

  const setGlobalFlag = async (name, value) => {
    const sb = window.getSupabase();
    const r = await safeRpc(sb, "platform_set_global_flag", { p_name: name, p_value: value });
    if (r.error) window.toast && window.toast(`Save failed: ${r.error.message}`, "error");
    else { window.toast && window.toast(`Flag ${name} saved`, "success"); load(); }
  };

  const addFlag = async () => {
    if (!newName.trim()) return;
    let v;
    try { v = JSON.parse(newValue); } catch { v = newValue; }
    await setGlobalFlag(newName.trim(), v);
    setNewName(""); setNewValue("true");
  };

  return (
    <div className="page-pad" style={{ fontFamily: "var(--font-stack)" }}>
      <div className="page-h">
        <div>
          <div className="page-title">Feature flags</div>
          <div className="page-sub">{loading ? "loading…" : `${global.length} global flags · ${agencies.length} agencies`}</div>
        </div>
        <button className="btn" style={{ marginLeft: "auto" }} onClick={load}><Icons.Sparkles size={11}/> Refresh</button>
      </div>

      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="panel-h"><Icons.Bolt size={13}/><h3>Global flags</h3><span className="meta">org_settings · feature_flag.*</span></div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1.4fr 1fr 100px" }}>
            <div>Name</div><div>Value</div><div></div>
          </div>
          {global.length === 0 && <div style={{ padding: 18, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>No global flags yet.</div>}
          {global.map(f => (
            <FlagRow key={f.name} flag={f} onChange={(v) => setGlobalFlag(f.name, v)}/>
          ))}
        </div>
        <div style={{ padding: 12, borderTop: "1px solid var(--border-subtle)", display: "grid", gridTemplateColumns: "1.4fr 1fr 100px", gap: 8, alignItems: "center" }}>
          <input className="text-input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="new_flag_name"/>
          <input className="text-input" value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="true / false / JSON"/>
          <button className="btn btn-primary" disabled={!newName.trim()} onClick={addFlag}><Icons.Plus size={11}/> Add</button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h"><Icons.Building size={13}/><h3>Per-agency overrides</h3><span className="meta">agencies.config.feature_flags.*</span></div>
        <div style={{ padding: 12, fontSize: 11.5, color: "var(--text-tertiary)", lineHeight: 1.6 }}>
          Per-agency overrides live in <code className="mono">agencies.config jsonb</code> under the <code className="mono">feature_flags</code> key. Open an agency from <strong>All agencies → Flags</strong> to edit.
        </div>
      </div>
    </div>
  );
}

function FlagRow({ flag, onChange }) {
  const v = flag.value;
  const isBool = typeof v === "boolean";
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft]     = React.useState(JSON.stringify(v));
  if (isBool) {
    return (
      <div className="row" style={{ gridTemplateColumns: "1.4fr 1fr 100px", fontFamily: "var(--font-mono, ui-monospace)", fontSize: 12 }}>
        <div>{flag.name}</div>
        <div style={{ color: v ? "var(--accent-money)" : "var(--text-tertiary)" }}>{v ? "true" : "false"}</div>
        <div>
          <button className="btn btn-ghost" style={{ fontSize: 10.5, padding: "2px 10px" }} onClick={() => onChange(!v)}>{v ? "Disable" : "Enable"}</button>
        </div>
      </div>
    );
  }
  return (
    <div className="row" style={{ gridTemplateColumns: "1.4fr 1fr 100px", fontFamily: "var(--font-mono, ui-monospace)", fontSize: 12 }}>
      <div>{flag.name}</div>
      <div style={{ color: "var(--text-secondary)" }}>
        {editing
          ? <input className="text-input" style={{ fontSize: 11 }} value={draft} onChange={(e) => setDraft(e.target.value)}/>
          : <code style={{ fontSize: 11 }}>{JSON.stringify(v)}</code>}
      </div>
      <div>
        {editing
          ? <button className="btn btn-ghost" style={{ fontSize: 10.5, padding: "2px 10px" }} onClick={() => { let parsed; try { parsed = JSON.parse(draft); } catch { parsed = draft; } onChange(parsed); setEditing(false); }}>Save</button>
          : <button className="btn btn-ghost" style={{ fontSize: 10.5, padding: "2px 10px" }} onClick={() => setEditing(true)}>Edit</button>}
      </div>
    </div>
  );
}

// Modal: edit per-agency feature flags for one agency
function AgencyFlagsModal({ agency, onClose }) {
  const [cfg, setCfg]   = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    const sb = window.getSupabase();
    sb.from("agencies").select("config").eq("id", agency.id).maybeSingle().then(({ data }) => {
      setCfg((data && data.config) || {});
    });
  }, [agency.id]);
  const flags = (cfg && cfg.feature_flags) || {};
  const set = async (name, value) => {
    setBusy(true);
    const sb = window.getSupabase();
    const r = await safeRpc(sb, "platform_set_agency_flag", { p_agency: agency.id, p_name: name, p_value: value });
    setBusy(false);
    if (r.error) { window.toast && window.toast(`Save failed: ${r.error.message}`, "error"); return; }
    const next = { ...cfg, feature_flags: { ...flags, [name]: value } };
    setCfg(next);
    window.toast && window.toast(`Set ${name} for ${agency.name}`, "success");
  };
  const [newName, setNewName]   = React.useState("");
  const [newValue, setNewValue] = React.useState("true");
  const add = async () => {
    if (!newName.trim()) return;
    let v; try { v = JSON.parse(newValue); } catch { v = newValue; }
    await set(newName.trim(), v);
    setNewName(""); setNewValue("true");
  };
  return (
    <Shared.Modal title={`Flags · ${agency.name}`} width={620} onClose={onClose}>
      {cfg === null && <div style={{ padding: 14, color: "var(--text-tertiary)" }}>Loading…</div>}
      {cfg !== null && (
        <>
          <div style={{ padding: "0 0 10px", fontSize: 11.5, color: "var(--text-tertiary)" }}>
            Per-agency overrides override the global default. Stored at <code className="mono">agencies.config.feature_flags.{`{name}`}</code>.
          </div>
          {Object.entries(flags).length === 0 && (
            <div style={{ padding: 14, color: "var(--text-tertiary)", fontSize: 12 }}>No overrides yet for this agency.</div>
          )}
          {Object.entries(flags).map(([name, value]) => (
            <FlagRow key={name} flag={{ name, value }} onChange={(v) => set(name, v)}/>
          ))}
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1.4fr 1fr 100px", gap: 8, alignItems: "center" }}>
            <input className="text-input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="flag_name"/>
            <input className="text-input" value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="true / JSON"/>
            <button className="btn btn-primary" disabled={!newName.trim() || busy} onClick={add}><Icons.Plus size={11}/> Add</button>
          </div>
        </>
      )}
    </Shared.Modal>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// System subpage
// ──────────────────────────────────────────────────────────────────────────
function SubpageSystem() {
  const url = window.SUPABASE_URL || "—";
  const projectRef = (url.match(/https?:\/\/([^.]+)\.supabase\.co/) || [])[1] || "—";
  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  return (
    <div className="page-pad" style={{ fontFamily: "var(--font-stack)" }}>
      <div className="page-h">
        <div>
          <div className="page-title">Env + health</div>
          <div className="page-sub">platform infrastructure · ref {projectRef}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <CapabilityRail/>

        <div className="panel">
          <div className="panel-h"><Icons.Folder size={13}/><h3>Project</h3></div>
          <div style={{ padding: 12, fontSize: 11.5, lineHeight: 1.9, fontFamily: "var(--font-mono, ui-monospace)" }}>
            <div><span style={{ color: "var(--text-tertiary)" }}>supabase</span> {url}</div>
            <div><span style={{ color: "var(--text-tertiary)" }}>ref</span> {projectRef}</div>
            <div><span style={{ color: "var(--text-tertiary)" }}>build</span> v=77</div>
            <div><span style={{ color: "var(--text-tertiary)" }}>migration</span> 0019_super_admin_platform</div>
            <div><span style={{ color: "var(--text-tertiary)" }}>you</span> {meIdent?.full_name || "—"}</div>
            <div><span style={{ color: "var(--text-tertiary)" }}>role</span> <span style={{ color: meIdent?.is_super_admin ? "var(--accent-money)" : "var(--text-primary)" }}>{meIdent?.is_super_admin ? "super_admin" : (meIdent?.role || "—")}</span></div>
            <div><span style={{ color: "var(--text-tertiary)" }}>act-as</span> {window.superAdminActingAs && window.superAdminActingAs() ? <span style={{ color: "var(--state-warning)" }}>{window.superAdminActingAs()}</span> : "—"}</div>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-h"><Icons.Bolt size={13}/><h3>Stripe + Twilio + OpenAI</h3></div>
        <div style={{ padding: 12, fontSize: 11.5, color: "var(--text-tertiary)", lineHeight: 1.6 }}>
          Configure via Vercel env vars. Run <code className="mono">/api/twilio-app/provision</code> for new agency Twilio sub-accounts.
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Container — gate + subpage router
// ──────────────────────────────────────────────────────────────────────────
function PagePlatformAdmin({ subpage = "platform" }) {
  // Defense-in-depth gate. Sidebar should never route a non-admin/non-super
  // user here, but if something does, render a clean denial card instead of
  // attempting cross-tenant RPCs that would just throw forbidden.
  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  const isSuper = window.isSuperAdmin && window.isSuperAdmin();
  const isAdmin = meIdent && (meIdent.role === "admin" || meIdent.role === "super_admin");
  if (!isSuper && !isAdmin) {
    return (
      <div className="page-pad">
        <div className="panel" style={{ padding: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--state-danger)" }}>Not authorized</div>
          <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--text-secondary)" }}>
            Platform admin is gated on <code className="mono">koino_super_admins</code> allowlist (or role=admin for the IMO sub-views).
            You're signed in as <strong>{meIdent?.role || "unknown"}</strong>.
          </div>
        </div>
      </div>
    );
  }

  const onActAs = async (agency) => {
    const reason = prompt(`Act as ${agency.name}? Reason (logged in target agency's audit):`);
    if (reason === null) return;   // user cancelled
    await window.startSuperAdminActAs(agency.id, agency.name, reason || "");
    window.toast && window.toast(`Now acting as ${agency.name}`, "warn");
  };

  // Non-super admin (role='admin') can see Agencies / Users / Audit at a
  // degraded level (their own IMO + sub-agencies) — the underlying RPCs still
  // raise forbidden, so we show a ForbiddenCard with an explanation. For the
  // HQ surface, fall through to the existing single-agency PageAdmin.
  if (!isSuper && isAdmin) {
    return (
      <div className="page-pad">
        <div className="panel" style={{ padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Platform admin · IMO operator view</div>
          <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
            Cross-tenant views are super-admin-only. Use <strong>Admin →</strong> in the sidebar for your own IMO's surface.
            If you should be a super-admin, ping Ian to add you to <code className="mono">koino_super_admins</code>.
          </div>
        </div>
      </div>
    );
  }

  switch (subpage) {
    case "agencies": return <SubpageAgencies onActAs={onActAs}/>;
    case "users":    return <SubpageUsers/>;
    case "billing":  return <SubpageBilling/>;
    case "audit":    return <SubpageAudit/>;
    case "flags":    return <SubpageFlags/>;
    case "system":   return <SubpageSystem/>;
    case "platform":
    default:         return <SubpageHQ onActAs={onActAs}/>;
  }
}
window.PagePlatformAdmin = PagePlatformAdmin;

})();
