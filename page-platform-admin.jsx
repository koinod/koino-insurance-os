/* page-platform-admin.jsx — KOINO HQ mission control for super_admin.
   Also serves a degraded view to role='admin' (IMO operator).

   Subpages: hq · agencies · users · billing · audit · flags · system

   The whole surface is gated on window.isSuperAdmin() OR role==='admin'.
   Defense-in-depth check at mount. Cross-tenant fetches go through the
   security-definer RPCs in migration 0019; non-super callers get
   'forbidden' from the RPC body, which renders the ForbiddenCard.

   ── styling — KOINO.CAPITAL DESIGN SYSTEM ──
   Mirrors the storefront at koino.capital (KOINO/ventures/products/
   storefront-static). Deep-black surfaces (#050505 / #0d0d0d / #151515),
   mint-green primary (#00d4aa), purple secondary (#7c3aed), Inter sans
   + JetBrains Mono. Border radii 10–14px (was 6px in Repflow's amber DS).
   Subtle hover-lift (translateY(-1px)) instead of the terminal app's
   accent-glow.

   We don't fight the Repflow CSS — we scope a `.koino-platform` wrapper
   that re-points `--accent-money` to mint-green and bumps card radii.
   Components keep using `var(--accent-money)`, they just resolve to a
   different colour inside this surface.

   Cards: 10–14px padding (down from Repflow's 12–18px), 10–12px gap,
   tighter grid columns. Numbers in mono. Soft hover lift. */

(function () {

// ──────────────────────────────────────────────────────────────────────────
// Inject scoped styles once. We deliberately don't touch styles.css so this
// change is self-contained — if the DS pivots again, this block is the only
// edit needed.
// ──────────────────────────────────────────────────────────────────────────
(function injectKoinoStyles() {
  if (document.getElementById("koino-platform-style")) return;
  const css = `
.koino-platform {
  /* Override Repflow tokens within this scope. Mint-green replaces amber. */
  --accent-money:      #00d4aa;
  --accent-money-glow: rgba(0,212,170,0.18);
  --accent-money-dim:  rgba(0,212,170,0.08);
  --accent-status:     #7c3aed;
  --accent-status-glow:rgba(124,58,237,0.18);
  --accent-heat:       #f59e0b;
  --bg-base:           #050505;
  --bg-raised:         #0d0d0d;
  --bg-elevated:       #151515;
  --bg-overlay:        #1a1a1a;
  --border-subtle:     #1a1a1a;
  --border-strong:     #2a2a2a;
  --text-primary:      #e8e8e8;
  --text-secondary:    #b4b4b4;
  --text-tertiary:     #888888;
  --text-quaternary:   #555555;
  --state-warning:     #f59e0b;
  --state-danger:      #f87171;
  --font-stack:        'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono:         'JetBrains Mono', ui-monospace, SFMono-Regular, monospace;

  background: var(--bg-base);
  color: var(--text-primary);
  font-family: var(--font-stack);
  letter-spacing: -0.005em;
}

/* Card primitive. The Repflow `.panel` class still applies; we extend it
   inside the scope with rounded corners + soft hover. */
.koino-platform .panel {
  background: var(--bg-raised);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  overflow: hidden;
  transition: border-color 0.2s, transform 0.2s;
}
.koino-platform .panel:hover { border-color: var(--border-strong); }

.koino-platform .panel-h {
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  gap: 8px;
}
.koino-platform .panel-h h3 {
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: -0.005em;
  margin: 0;
}
.koino-platform .panel-h .meta {
  margin-left: auto;
  font-size: 10.5px;
  color: var(--text-tertiary);
  font-family: var(--font-mono);
}

/* Row primitive — tighter than Repflow default */
.koino-platform .row {
  padding: 7px 14px;
  border-bottom: 1px solid var(--border-subtle);
  display: grid;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  transition: background 0.15s;
}
.koino-platform .row:hover { background: var(--bg-elevated); }
.koino-platform .row:last-child { border-bottom: none; }

.koino-platform .list-h {
  padding: 8px 14px;
  background: var(--bg-base);
  border-bottom: 1px solid var(--border-subtle);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-tertiary);
  display: grid;
  align-items: center;
  gap: 8px;
  font-family: var(--font-mono);
}

/* Chip — softer, rounded */
.koino-platform .chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 100px;
  font-size: 10px;
  color: var(--text-secondary);
  font-weight: 500;
  white-space: nowrap;
}
.koino-platform .chip-money,
.koino-platform .chip.chip-money {
  background: var(--accent-money-dim);
  border-color: var(--accent-money-glow);
  color: var(--accent-money);
}

/* Buttons — match storefront btn-p / btn-s */
.koino-platform .btn {
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 11.5px;
  font-weight: 500;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  color: var(--text-primary);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s;
  cursor: pointer;
}
.koino-platform .btn:hover {
  border-color: var(--border-strong);
  background: var(--bg-overlay);
}
.koino-platform .btn-primary {
  background: var(--accent-money);
  color: #000;
  border-color: var(--accent-money);
  font-weight: 600;
}
.koino-platform .btn-primary:hover {
  background: var(--accent-money);
  transform: translateY(-1px);
  box-shadow: 0 6px 20px var(--accent-money-glow);
}
.koino-platform .btn-ghost {
  background: transparent;
  border-color: transparent;
  color: var(--text-secondary);
}
.koino-platform .btn-ghost:hover {
  background: var(--bg-elevated);
  color: var(--text-primary);
}

/* Inputs */
.koino-platform .text-input {
  padding: 7px 11px;
  background: var(--bg-base);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  font-size: 12px;
  font-family: var(--font-stack);
  color: var(--text-primary);
  transition: border-color 0.15s;
}
.koino-platform .text-input:focus {
  outline: none;
  border-color: var(--accent-money);
}

/* Page header — denser than Repflow's */
.koino-platform .page-pad { padding: 18px 22px 32px; }
.koino-platform .page-h {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  padding-bottom: 14px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--border-subtle);
}
.koino-platform .page-title {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.015em;
}
.koino-platform .page-sub {
  font-size: 11.5px;
  color: var(--text-tertiary);
  margin-top: 3px;
  font-family: var(--font-mono);
}

/* Metric tile — the HQ hero strip */
.koino-platform .ko-metric {
  padding: 10px 12px;
  background: var(--bg-raised);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  transition: border-color 0.2s, transform 0.2s;
}
.koino-platform .ko-metric:hover {
  border-color: var(--border-strong);
  transform: translateY(-1px);
}
.koino-platform .ko-metric .lbl {
  font-size: 9.5px;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-family: var(--font-mono);
}
.koino-platform .ko-metric .val {
  font-size: 18px;
  font-weight: 700;
  margin-top: 3px;
  font-family: var(--font-mono);
  font-feature-settings: 'tnum';
  letter-spacing: -0.01em;
}

/* Tabular numbers helper */
.koino-platform .tabular {
  font-family: var(--font-mono);
  font-feature-settings: 'tnum';
}

/* Mono helper */
.koino-platform .mono { font-family: var(--font-mono); }

/* Impersonation banner — sticky, top-of-main */
.koino-impersonation {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 18px;
  background: linear-gradient(90deg, rgba(245,158,11,0.12), rgba(245,158,11,0.04));
  border-bottom: 1px solid rgba(245,158,11,0.35);
  font-size: 12px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  position: sticky;
  top: 0;
  z-index: 40;
}
.koino-impersonation .pulse {
  width: 7px; height: 7px; border-radius: 50%;
  background: #f59e0b;
  box-shadow: 0 0 0 0 rgba(245,158,11,0.6);
  animation: koino-pulse 1.6s infinite;
}
@keyframes koino-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(245,158,11,0.6); }
  70%  { box-shadow: 0 0 0 8px rgba(245,158,11,0); }
  100% { box-shadow: 0 0 0 0 rgba(245,158,11,0); }
}
.koino-impersonation .stop-btn {
  margin-left: auto;
  padding: 4px 12px;
  background: rgba(245,158,11,0.12);
  border: 1px solid rgba(245,158,11,0.4);
  color: #f59e0b;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}
.koino-impersonation .stop-btn:hover { background: rgba(245,158,11,0.2); }

/* Severity dot */
.koino-platform .sev {
  width: 6px; height: 6px; border-radius: 50%;
  display: inline-block;
}
`;
  const style = document.createElement("style");
  style.id = "koino-platform-style";
  style.textContent = css;
  document.head.appendChild(style);
})();

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

const sevColor = (s) =>
  s === "danger"  ? "#f87171" :
  s === "warn"    ? "#f59e0b" :
  s === "success" ? "#00d4aa" :
  "#888";

const toneColor = (t) =>
  t === "money"  ? "#00d4aa" :
  t === "status" ? "#7c3aed" :
  t === "warn"   ? "#f59e0b" :
  t === "danger" ? "#f87171" :
  "#e8e8e8";

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
    <div className="koino-impersonation">
      <span className="pulse"/>
      <strong style={{ color: "#f59e0b", letterSpacing: 0.4 }}>ACTING AS</strong>
      <span style={{ color: "#e8e8e8", fontWeight: 600, fontFamily: "Inter, sans-serif" }}>{target.agency_name}</span>
      <span style={{ color: "#888" }}>· writes attributed to your user_id, scoped to this agency</span>
      <button className="stop-btn" onClick={stop}>Stop impersonating</button>
    </div>
  );
}
window.ImpersonationBanner = ImpersonationBanner;

// ──────────────────────────────────────────────────────────────────────────
// Reusable atoms (all use scoped tokens — only render inside .koino-platform)
// ──────────────────────────────────────────────────────────────────────────
function KoMetric({ label, value, tone }) {
  return (
    <div className="ko-metric">
      <div className="lbl">{label}</div>
      <div className="val" style={{ color: toneColor(tone) }}>{value}</div>
    </div>
  );
}

function ForbiddenCard({ error }) {
  return (
    <div className="page-pad">
      <div className="panel" style={{ padding: 22, border: "1px solid rgba(248,113,113,0.35)" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#f87171", letterSpacing: -0.01 }}>Platform admin · forbidden</div>
        <div style={{ marginTop: 8, fontSize: 12.5, color: "#b4b4b4", lineHeight: 1.6 }}>
          The cross-tenant RPC returned an error. You're either not on the
          <code className="mono" style={{ marginLeft: 4, background: "#0d0d0d", padding: "1px 6px", borderRadius: 4, fontSize: 11 }}>koino_super_admins</code> allowlist,
          or migration <code className="mono" style={{ fontSize: 11 }}>0019_super_admin_platform.sql</code> hasn't been applied.
        </div>
        <pre style={{ marginTop: 10, padding: 10, background: "#050505", borderRadius: 8, fontSize: 11, color: "#888", whiteSpace: "pre-wrap", overflowX: "auto", border: "1px solid #1a1a1a" }}>
{String(error || "")}
        </pre>
      </div>
    </div>
  );
}

function AuditRow({ a, compact }) {
  return (
    <div className="row" style={{ gridTemplateColumns: compact ? "92px 1.1fr 1fr 80px 18px" : "120px 1.1fr 1fr 90px 70px", fontSize: 11.5, fontFamily: "var(--font-mono)" }}>
      <div style={{ color: "var(--text-tertiary)" }}>
        {new Date(a.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
      </div>
      <div style={{ fontWeight: 500, color: "var(--accent-money)" }}>{a.kind || a.action}</div>
      <div style={{ color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {a.target || "—"}{a.agency_name ? ` · ${a.agency_name}` : ""}
      </div>
      <div><span className="chip">{a.actor_role || "system"}</span></div>
      <div><span className="sev" style={{ background: sevColor(a.severity) }}/></div>
    </div>
  );
}

function CapabilityRail() {
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
  const dot = (state) => state === "ready" ? "#00d4aa" : state === "unconfigured" ? "#f59e0b" : state === "checking" ? "#555" : "#f87171";
  return (
    <div className="panel">
      <div className="panel-h"><Icons.Bolt size={12}/><h3>Capabilities</h3><span className="meta">infra probe</span></div>
      <div style={{ padding: "8px 14px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
        {[["Voice (Twilio)", s.voice], ["SMS (Twilio)", s.sms], ["Whisper", s.transcription]].map(([label, state]) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5 }}>
            <span style={{ width: 6, height: 6, borderRadius: 50, background: dot(state) }}/>
            <span style={{ flex: 1 }}>{label}</span>
            <span style={{ fontSize: 9.5, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, fontFamily: "var(--font-mono)" }}>{state}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProjectInfoCard() {
  const url = (window.SUPABASE_URL || "").replace(/^https?:\/\//, "").replace(/\.supabase\.co.*/, "");
  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  const acting = window.superAdminActingAs && window.superAdminActingAs();
  return (
    <div className="panel">
      <div className="panel-h"><Icons.Folder size={12}/><h3>Project</h3></div>
      <div style={{ padding: "8px 14px 12px", fontSize: 11, lineHeight: 1.85, fontFamily: "var(--font-mono)" }}>
        <Row k="supabase" v={url || "—"}/>
        <Row k="you" v={`${meIdent?.full_name || "—"} ${meIdent?.handle ? "· " + meIdent.handle : ""}`}/>
        <Row k="role" v={<span style={{ color: meIdent?.is_super_admin ? "#00d4aa" : "#e8e8e8" }}>{meIdent?.is_super_admin ? "super_admin" : (meIdent?.role || "—")}</span>}/>
        <Row k="agency" v={meIdent?.agency_name || "—"}/>
        {acting && <Row k="act-as" v={<span style={{ color: "#f59e0b" }}>{acting.slice(0, 8)}…</span>}/>}
      </div>
    </div>
  );
}
function Row({ k, v }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <span style={{ color: "#555", minWidth: 56 }}>{k}</span>
      <span style={{ color: "#e8e8e8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</span>
    </div>
  );
}

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
      safeRpc(sb, "platform_audit_recent", { p_limit: 10, p_hours: 24 }),
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

  const topAgencies = [...agencies].sort((x, y) => (y.mrr_cents || 0) - (x.mrr_cents || 0)).slice(0, 6);
  const blockers = audit.filter(a => a.kind === "blocker_on_operator" || a.severity === "danger").slice(0, 4);
  const liveAge = kpis?.generated_at ? Math.round((Date.now() - new Date(kpis.generated_at)) / 1000) : null;
  const isLive = liveAge != null && liveAge < 300;

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title" style={{ fontFamily: "var(--font-mono)", letterSpacing: 0.3 }}>
            KOINO <span style={{ color: "#00d4aa" }}>·</span> HQ
          </div>
          <div className="page-sub">
            {loading ? "syncing fleet…" : `${agencies.length} agencies · ${isLive ? "live" : "stale"} · ${liveAge != null ? liveAge + "s ago" : "—"}`}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#888" }}>
            <input type="checkbox" checked={showDemo} onChange={(e) => { setShowDemo(e.target.checked); try { localStorage.setItem("repflow.super_admin.show_demo", e.target.checked ? "1" : "0"); } catch {} }}/>
            demo agencies
          </label>
          <button className="btn" onClick={load}><Icons.Sparkles size={10}/> Re-sync</button>
        </div>
      </div>

      {/* HQ hero strip — six tabular counters, denser than amber DS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, marginBottom: 12 }}>
        <KoMetric label="Agencies"   value={kpis?.agency_count ?? "—"} tone="status"/>
        <KoMetric label="Active 24h" value={kpis?.active_24h ?? "—"}   tone="money"/>
        <KoMetric label="Audit 24h"  value={kpis?.audit_24h ?? "—"}    tone="status"/>
        <KoMetric label="MRR"        value={fmtMoney(kpis?.mrr_cents)} tone="money"/>
        <KoMetric label="NIGOs"      value={kpis?.open_nigos ?? "—"}   tone={kpis?.open_nigos > 0 ? "warn" : "money"}/>
        <KoMetric label="Blockers"   value={blockers.length}           tone={blockers.length ? "danger" : "money"}/>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.7fr 1fr", gap: 12 }}>
        {/* LEFT */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="panel">
            <div className="panel-h">
              <Icons.Building size={12}/>
              <h3>Top agencies by MRR</h3>
              <span className="meta">{topAgencies.length} of {agencies.length}</span>
            </div>
            <div>
              <div className="list-h" style={{ gridTemplateColumns: "1.4fr 70px 60px 60px 70px 90px" }}>
                <div>Agency</div><div>Plan</div><div>Members</div><div>NIGOs</div><div>MRR</div><div></div>
              </div>
              {loading && <div style={{ padding: 14, textAlign: "center", color: "#888", fontSize: 11.5 }}>Loading…</div>}
              {!loading && topAgencies.length === 0 && <div style={{ padding: 18, textAlign: "center", color: "#888", fontSize: 11.5 }}>No agencies visible — confirm super_admin allowlist.</div>}
              {topAgencies.map(a => (
                <div key={a.id} className="row" style={{ gridTemplateColumns: "1.4fr 70px 60px 60px 70px 90px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontWeight: 500 }}>{a.name}</span>
                    {a.is_demo && <span className="chip" style={{ fontSize: 9, color: "#555" }}>demo</span>}
                  </div>
                  <div><span className="chip">{a.plan}</span></div>
                  <div className="tabular">{a.member_count}</div>
                  <div className="tabular" style={{ color: (a.open_nigos || 0) > 0 ? "#f59e0b" : "#555" }}>{a.open_nigos}</div>
                  <div className="tabular" style={{ color: "#00d4aa" }}>{fmtMoney(a.mrr_cents)}</div>
                  <div>
                    <button className="btn btn-ghost" style={{ fontSize: 10, padding: "2px 8px" }} onClick={() => onActAs(a)}>
                      <Icons.ArrowUpRight size={9}/> Act as
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-h">
              <Icons.Activity size={12}/>
              <h3>Global audit · last 24h</h3>
              <span className="meta">{audit.length} events</span>
            </div>
            <div>
              {audit.length === 0 && <div style={{ padding: 16, textAlign: "center", color: "#888", fontSize: 11.5 }}>No audit events in window.</div>}
              {audit.map(a => <AuditRow key={a.id} a={a}/>)}
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="panel">
            <div className="panel-h">
              <Icons.Shield size={12} style={{ color: blockers.length ? "#f59e0b" : "#888" }}/>
              <h3>BLOCKERS on operator</h3>
              <span className="meta">{blockers.length}</span>
            </div>
            <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
              {blockers.length === 0 && (
                <div style={{ padding: 8, color: "#888", fontSize: 11.5, lineHeight: 1.55 }}>
                  Nothing flagged. Automation surfaces operator-dependent items here.
                </div>
              )}
              {blockers.map(b => (
                <div key={b.id} style={{ padding: 8, background: "var(--bg-base)", borderRadius: 8, borderLeft: "2px solid #f59e0b", fontSize: 11.5 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <strong style={{ fontFamily: "var(--font-mono)", color: "#f59e0b", fontSize: 11 }}>{b.kind || b.action}</strong>
                    <span style={{ fontSize: 10, color: "#555" }}>{fmtAge(b.created_at)}</span>
                  </div>
                  <div style={{ marginTop: 3, color: "#b4b4b4", fontSize: 11 }}>
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
  const [editing, setEditing]   = React.useState(null);

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
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">All agencies</div>
          <div className="page-sub">{loading ? "loading…" : `${filtered.length} of ${agencies.length}${showDemo ? "" : " (demo hidden)"}`}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <input className="text-input" style={{ width: 220 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…"/>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#888" }}>
            <input type="checkbox" checked={showDemo} onChange={(e) => { setShowDemo(e.target.checked); try { localStorage.setItem("repflow.super_admin.show_demo", e.target.checked ? "1" : "0"); } catch {} }}/>
            demo
          </label>
          <button className="btn" onClick={load}><Icons.Sparkles size={10}/> Refresh</button>
        </div>
      </div>

      <div className="panel">
        <div className="list-h" style={{ gridTemplateColumns: "1.6fr 70px 70px 60px 60px 80px 100px 130px" }}>
          <div>Agency</div><div>Plan</div><div>Members</div><div>Reps</div><div>NIGOs</div><div>MRR</div><div>Created</div><div></div>
        </div>
        {loading && <div style={{ padding: 14, textAlign: "center", color: "#888", fontSize: 11.5 }}>Loading…</div>}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: 22, textAlign: "center", color: "#888", fontSize: 11.5 }}>
            {q ? "No matches." : "No agencies visible. Verify allowlist."}
          </div>
        )}
        {filtered.map(a => (
          <div key={a.id} className="row" style={{ gridTemplateColumns: "1.6fr 70px 70px 60px 60px 80px 100px 130px" }}>
            <div>
              <div style={{ fontWeight: 500 }}>
                {a.name}
                {a.is_demo && <span className="chip" style={{ fontSize: 9, marginLeft: 6, color: "#555" }}>demo</span>}
              </div>
              <div style={{ fontSize: 10, color: "#555", marginTop: 1, fontFamily: "var(--font-mono)" }}>{a.slug || "—"} · {(a.id || "").slice(0, 8)}</div>
            </div>
            <div><span className="chip">{a.plan}</span></div>
            <div className="tabular">{a.member_count}</div>
            <div className="tabular">{a.rep_count}</div>
            <div className="tabular" style={{ color: (a.open_nigos || 0) > 0 ? "#f59e0b" : "#555" }}>{a.open_nigos}</div>
            <div className="tabular" style={{ color: "#00d4aa" }}>{fmtMoney(a.mrr_cents)}</div>
            <div style={{ color: "#888", fontSize: 10.5, fontFamily: "var(--font-mono)" }}>{a.created_at ? new Date(a.created_at).toLocaleDateString() : "—"}</div>
            <div style={{ display: "flex", gap: 4 }}>
              <button className="btn btn-ghost" style={{ fontSize: 10, padding: "2px 7px" }} onClick={() => onActAs(a)}>
                <Icons.ArrowUpRight size={9}/> Act as
              </button>
              <button className="btn btn-ghost" style={{ fontSize: 10, padding: "2px 7px" }} onClick={() => setEditing(a)}>
                <Icons.Bolt size={9}/> Flags
              </button>
            </div>
          </div>
        ))}
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
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">All users</div>
          <div className="page-sub">{loading ? "loading…" : `${filtered.length} of ${rows.length} · ${rows.filter(r => r.is_super).length} super-admins`}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <input className="text-input" style={{ width: 240 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by email or agency…"/>
          <button className="btn" onClick={load}><Icons.Sparkles size={10}/> Refresh</button>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 12 }}>
        <div className="panel-h"><Icons.Shield size={12} style={{ color: "#00d4aa" }}/><h3>Grant super_admin</h3></div>
        <div style={{ padding: 10, display: "flex", gap: 8 }}>
          <input className="text-input" value={grantEmail} onChange={(e) => setGrantEmail(e.target.value)} placeholder="email@koino.capital" style={{ flex: 1 }}/>
          <button className="btn btn-primary" disabled={!grantEmail.trim() || busy} onClick={grant}>
            <Icons.Check size={10}/> {busy ? "Granting…" : "Grant"}
          </button>
        </div>
        <div style={{ padding: "0 12px 10px", fontSize: 10.5, color: "#888", lineHeight: 1.55 }}>
          User must have signed in once (auth.users row). Allowlist is canonical; <code className="mono" style={{ fontSize: 10 }}>KOINO_SUPER_ADMIN_EMAILS</code> env seeds on migration replay.
        </div>
      </div>

      <div className="panel">
        <div className="list-h" style={{ gridTemplateColumns: "1.4fr 1.4fr 1fr 100px 80px 90px" }}>
          <div>Email</div><div>Agencies</div><div>Roles</div><div>Last sign-in</div><div>Super</div><div></div>
        </div>
        {loading && <div style={{ padding: 14, textAlign: "center", color: "#888", fontSize: 11.5 }}>Loading…</div>}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: 22, textAlign: "center", color: "#888", fontSize: 11.5 }}>{q ? "No matches." : "No users visible."}</div>
        )}
        {filtered.map(u => (
          <div key={u.user_id} className="row" style={{ gridTemplateColumns: "1.4fr 1.4fr 1fr 100px 80px 90px" }}>
            <div style={{ fontWeight: 500 }}>{u.email || "—"}</div>
            <div style={{ color: "#b4b4b4" }}>{u.agencies || "—"}</div>
            <div style={{ color: "#888" }}>{u.roles || "—"}</div>
            <div style={{ fontFamily: "var(--font-mono)", color: "#888", fontSize: 10.5 }}>{fmtAge(u.last_sign_in)}</div>
            <div>{u.is_super && <span className="chip chip-money">super</span>}</div>
            <div>
              {u.is_super && (
                <button className="btn btn-ghost" style={{ fontSize: 10, padding: "2px 8px", color: "#f87171" }} onClick={() => revoke(u.email)}>
                  Revoke
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Billing subpage
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
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Repflow MRR</div>
          <div className="page-sub">{loading ? "loading…" : `${agencies.length} agencies · ${fmtMoney(totalMrr)} MRR sum`}</div>
        </div>
        <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#888" }}>
          <input type="checkbox" checked={includeDemo} onChange={(e) => setIncludeDemo(e.target.checked)}/>
          include demo
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
        <KoMetric label="MRR" value={fmtMoney(totalMrr)} tone="money"/>
        <KoMetric label="Billed" value={agencies.filter(a => (a.mrr_cents || 0) > 0).length} tone="status"/>
        <KoMetric label="Trial" value={agencies.filter(a => a.plan === "trial").length} tone="warn"/>
        <KoMetric label="Pro+" value={agencies.filter(a => /pro|growth|enterprise/i.test(a.plan || "")).length} tone="money"/>
      </div>

      <div className="panel" style={{ marginBottom: 12 }}>
        <div className="panel-h"><Icons.Wallet size={12}/><h3>By plan</h3></div>
        <div style={{ padding: 10, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 6 }}>
          {Object.entries(byPlan).map(([plan, cents]) => (
            <div key={plan} style={{ padding: 8, background: "var(--bg-base)", borderRadius: 8, border: "1px solid #1a1a1a", fontFamily: "var(--font-mono)" }}>
              <div style={{ fontSize: 9.5, color: "#555", textTransform: "uppercase", letterSpacing: 0.5 }}>{plan}</div>
              <div style={{ fontSize: 14, color: "#00d4aa", marginTop: 2, fontWeight: 600 }}>{fmtMoney(cents)}</div>
            </div>
          ))}
          {Object.keys(byPlan).length === 0 && <div style={{ padding: 8, color: "#888", fontSize: 11.5 }}>No agencies yet.</div>}
        </div>
      </div>

      <div className="panel">
        <div className="panel-h"><Icons.Activity size={12}/><h3>Per-agency</h3></div>
        <div className="list-h" style={{ gridTemplateColumns: "1.6fr 80px 80px 80px" }}>
          <div>Agency</div><div>Plan</div><div>MRR</div><div>Members</div>
        </div>
        {agencies.map(a => (
          <div key={a.id} className="row" style={{ gridTemplateColumns: "1.6fr 80px 80px 80px" }}>
            <div style={{ fontWeight: 500 }}>{a.name}{a.is_demo && <span className="chip" style={{ marginLeft: 6, fontSize: 9 }}>demo</span>}</div>
            <div><span className="chip">{a.plan}</span></div>
            <div className="tabular" style={{ color: "#00d4aa" }}>{fmtMoney(a.mrr_cents)}</div>
            <div className="tabular">{a.member_count}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10, padding: 8, fontSize: 10.5, color: "#555", lineHeight: 1.55 }}>
        MRR sums local <code className="mono" style={{ fontSize: 10 }}>subscriptions.amount_cents</code> where status ∈ active/trialing. Live Stripe cross-customer roll-up tracked separately.
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
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Global audit</div>
          <div className="page-sub">{loading ? "loading…" : `${rows.length} events · last ${hours}h${kind ? ` · kind=${kind}` : ""}`}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <select className="text-input" value={hours} onChange={(e) => setHours(Number(e.target.value))} style={{ padding: "6px 10px" }}>
            <option value={1}>Last 1h</option><option value={6}>Last 6h</option><option value={24}>Last 24h</option>
            <option value={72}>Last 3d</option><option value={168}>Last 7d</option>
          </select>
          <select className="text-input" value={kind} onChange={(e) => setKind(e.target.value)} style={{ padding: "6px 10px" }}>
            <option value="">All kinds</option>
            {kinds.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
          <button className="btn" onClick={load}><Icons.Sparkles size={10}/> Refresh</button>
        </div>
      </div>

      <div className="panel">
        <div className="list-h" style={{ gridTemplateColumns: "120px 1.1fr 1fr 1fr 100px 50px" }}>
          <div>When</div><div>Kind</div><div>Target / agency</div><div>Actor</div><div>Role</div><div>Sev</div>
        </div>
        {loading && <div style={{ padding: 14, textAlign: "center", color: "#888", fontSize: 11.5 }}>Loading…</div>}
        {!loading && rows.length === 0 && <div style={{ padding: 22, textAlign: "center", color: "#888", fontSize: 11.5 }}>No audit rows in this window.</div>}
        {rows.map(a => (
          <div key={a.id} className="row" style={{ gridTemplateColumns: "120px 1.1fr 1fr 1fr 100px 50px", fontFamily: "var(--font-mono)", fontSize: 11 }}>
            <div style={{ color: "#888" }}>{new Date(a.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>
            <div style={{ fontWeight: 500, color: "#00d4aa" }}>{a.kind || a.action}</div>
            <div style={{ color: "#b4b4b4", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={`${a.target || ""} ${a.agency_name || ""}`}>
              {a.target || "—"}{a.agency_name ? ` · ${a.agency_name}` : ""}
            </div>
            <div style={{ color: "#888" }}>{a.actor_email || (a.actor_user_id ? a.actor_user_id.slice(0, 8) : "—")}</div>
            <div><span className="chip">{a.actor_role || "system"}</span></div>
            <div><span className="sev" style={{ background: sevColor(a.severity) }}/></div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Flags subpage
// ──────────────────────────────────────────────────────────────────────────
function SubpageFlags() {
  const [global, setGlobal]   = React.useState([]);
  const [agencies, setAgencies] = React.useState([]);
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
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Feature flags</div>
          <div className="page-sub">{loading ? "loading…" : `${global.length} global · ${agencies.length} agencies`}</div>
        </div>
        <button className="btn" style={{ marginLeft: "auto" }} onClick={load}><Icons.Sparkles size={10}/> Refresh</button>
      </div>

      <div className="panel" style={{ marginBottom: 12 }}>
        <div className="panel-h"><Icons.Bolt size={12}/><h3>Global flags</h3><span className="meta">org_settings · feature_flag.*</span></div>
        <div className="list-h" style={{ gridTemplateColumns: "1.4fr 1fr 90px" }}>
          <div>Name</div><div>Value</div><div></div>
        </div>
        {global.length === 0 && <div style={{ padding: 14, textAlign: "center", color: "#888", fontSize: 11.5 }}>No global flags yet.</div>}
        {global.map(f => (
          <FlagRow key={f.name} flag={f} onChange={(v) => setGlobalFlag(f.name, v)}/>
        ))}
        <div style={{ padding: 10, borderTop: "1px solid #1a1a1a", display: "grid", gridTemplateColumns: "1.4fr 1fr 90px", gap: 8, alignItems: "center" }}>
          <input className="text-input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="new_flag_name"/>
          <input className="text-input" value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="true / false / JSON"/>
          <button className="btn btn-primary" disabled={!newName.trim()} onClick={addFlag}><Icons.Plus size={10}/> Add</button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h"><Icons.Building size={12}/><h3>Per-agency overrides</h3><span className="meta">agencies.config.feature_flags.*</span></div>
        <div style={{ padding: 10, fontSize: 11, color: "#888", lineHeight: 1.55 }}>
          Per-agency overrides live in <code className="mono" style={{ fontSize: 10.5 }}>agencies.config.feature_flags</code>. Open from <strong>All agencies → Flags</strong>.
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
      <div className="row" style={{ gridTemplateColumns: "1.4fr 1fr 90px", fontFamily: "var(--font-mono)", fontSize: 11.5 }}>
        <div>{flag.name}</div>
        <div style={{ color: v ? "#00d4aa" : "#555" }}>{v ? "true" : "false"}</div>
        <div>
          <button className="btn btn-ghost" style={{ fontSize: 10, padding: "2px 8px" }} onClick={() => onChange(!v)}>{v ? "Disable" : "Enable"}</button>
        </div>
      </div>
    );
  }
  return (
    <div className="row" style={{ gridTemplateColumns: "1.4fr 1fr 90px", fontFamily: "var(--font-mono)", fontSize: 11.5 }}>
      <div>{flag.name}</div>
      <div style={{ color: "#b4b4b4" }}>
        {editing
          ? <input className="text-input" style={{ fontSize: 11 }} value={draft} onChange={(e) => setDraft(e.target.value)}/>
          : <code style={{ fontSize: 10.5 }}>{JSON.stringify(v)}</code>}
      </div>
      <div>
        {editing
          ? <button className="btn btn-ghost" style={{ fontSize: 10, padding: "2px 8px" }} onClick={() => { let parsed; try { parsed = JSON.parse(draft); } catch { parsed = draft; } onChange(parsed); setEditing(false); }}>Save</button>
          : <button className="btn btn-ghost" style={{ fontSize: 10, padding: "2px 8px" }} onClick={() => setEditing(true)}>Edit</button>}
      </div>
    </div>
  );
}

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
    <div className="koino-platform">
      <Shared.Modal title={`Flags · ${agency.name}`} width={580} onClose={onClose}>
        {cfg === null && <div style={{ padding: 12, color: "#888", fontSize: 11.5 }}>Loading…</div>}
        {cfg !== null && (
          <>
            <div style={{ padding: "0 0 10px", fontSize: 11, color: "#888", lineHeight: 1.55 }}>
              Per-agency overrides shadow the global default. Stored at <code className="mono" style={{ fontSize: 10.5 }}>agencies.config.feature_flags</code>.
            </div>
            {Object.entries(flags).length === 0 && (
              <div style={{ padding: 12, color: "#888", fontSize: 11.5 }}>No overrides yet.</div>
            )}
            {Object.entries(flags).map(([name, value]) => (
              <FlagRow key={name} flag={{ name, value }} onChange={(v) => set(name, v)}/>
            ))}
            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1.4fr 1fr 90px", gap: 8, alignItems: "center" }}>
              <input className="text-input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="flag_name"/>
              <input className="text-input" value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="true / JSON"/>
              <button className="btn btn-primary" disabled={!newName.trim() || busy} onClick={add}><Icons.Plus size={10}/> Add</button>
            </div>
          </>
        )}
      </Shared.Modal>
    </div>
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
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Env + health</div>
          <div className="page-sub">infrastructure · ref {projectRef}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <CapabilityRail/>
        <div className="panel">
          <div className="panel-h"><Icons.Folder size={12}/><h3>Project</h3></div>
          <div style={{ padding: "8px 14px 12px", fontSize: 11, lineHeight: 1.85, fontFamily: "var(--font-mono)" }}>
            <Row k="supabase" v={url}/>
            <Row k="ref" v={projectRef}/>
            <Row k="build" v="v=78"/>
            <Row k="migration" v="0019_super_admin_platform"/>
            <Row k="you" v={meIdent?.full_name || "—"}/>
            <Row k="role" v={<span style={{ color: meIdent?.is_super_admin ? "#00d4aa" : "#e8e8e8" }}>{meIdent?.is_super_admin ? "super_admin" : (meIdent?.role || "—")}</span>}/>
            <Row k="act-as" v={window.superAdminActingAs && window.superAdminActingAs() ? <span style={{ color: "#f59e0b" }}>{window.superAdminActingAs()}</span> : "—"}/>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 12 }}>
        <div className="panel-h"><Icons.Bolt size={12}/><h3>External services</h3></div>
        <div style={{ padding: 10, fontSize: 11, color: "#888", lineHeight: 1.55 }}>
          Configure Stripe / Twilio / OpenAI via Vercel env vars. Auto-provision Twilio sub-accounts via <code className="mono" style={{ fontSize: 10.5 }}>/api/twilio-app/provision</code>.
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Container — gate + subpage router. Wraps everything in .koino-platform
// so the scoped DS overrides apply.
// ──────────────────────────────────────────────────────────────────────────
function PagePlatformAdmin({ subpage = "platform" }) {
  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  const isSuper = window.isSuperAdmin && window.isSuperAdmin();
  const isAdmin = meIdent && (meIdent.role === "admin" || meIdent.role === "super_admin");
  if (!isSuper && !isAdmin) {
    return (
      <div className="koino-platform">
        <div className="page-pad">
          <div className="panel" style={{ padding: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#f87171" }}>Not authorized</div>
            <div style={{ marginTop: 6, fontSize: 12, color: "#b4b4b4", lineHeight: 1.55 }}>
              Platform admin is gated on the <code className="mono" style={{ fontSize: 10.5 }}>koino_super_admins</code> allowlist.
              You're signed in as <strong style={{ color: "#e8e8e8" }}>{meIdent?.role || "unknown"}</strong>.
            </div>
          </div>
        </div>
      </div>
    );
  }

  const onActAs = async (agency) => {
    const reason = prompt(`Act as ${agency.name}? Reason (logged in target agency's audit):`);
    if (reason === null) return;
    await window.startSuperAdminActAs(agency.id, agency.name, reason || "");
    window.toast && window.toast(`Now acting as ${agency.name}`, "warn");
  };

  if (!isSuper && isAdmin) {
    return (
      <div className="koino-platform">
        <div className="page-pad">
          <div className="panel" style={{ padding: 16 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>Platform admin · IMO operator view</div>
            <div style={{ marginTop: 6, fontSize: 11.5, color: "#b4b4b4", lineHeight: 1.55 }}>
              Cross-tenant views are super-admin-only. Use <strong>Admin →</strong> in the sidebar for your own IMO surface.
              For super-admin grants, ping Ian to add you to <code className="mono" style={{ fontSize: 10.5 }}>koino_super_admins</code>.
            </div>
          </div>
        </div>
      </div>
    );
  }

  let body;
  switch (subpage) {
    case "agencies": body = <SubpageAgencies onActAs={onActAs}/>; break;
    case "users":    body = <SubpageUsers/>; break;
    case "billing":  body = <SubpageBilling/>; break;
    case "audit":    body = <SubpageAudit/>; break;
    case "flags":    body = <SubpageFlags/>; break;
    case "system":   body = <SubpageSystem/>; break;
    case "platform":
    default:         body = <SubpageHQ onActAs={onActAs}/>; break;
  }
  return <div className="koino-platform">{body}</div>;
}
window.PagePlatformAdmin = PagePlatformAdmin;

})();
