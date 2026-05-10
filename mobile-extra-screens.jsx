/* mobile-extra-screens.jsx — Pipeline / Coaching / Settings / Vault for the
   mobile rep app. Adds these screens to the existing FlowPhone in mobile.html
   so the producer in the field has more than dial+queue+leaderboard. */

(function () {

const Ic = (path) => (props) => <svg width={props.s || 18} height={props.s || 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{path}</svg>;
const MI = {
  Funnel:  Ic(<path d="M22 3H2l8 9.46V19l4 2v-8.54z"/>),
  Activity: Ic(<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>),
  Settings: Ic(<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>),
  Shield:  Ic(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>),
};

/* ── Pipeline mobile ──────────────────────────────────────────────────── */
function MScreenPipeline({ onNav, onLead }) {
  const STAGES = ["New", "Contacted", "Quoted", "App In", "Issued"];
  const [stage, setStage] = React.useState("Quoted");
  const items = (AppData.PIPELINE || []).filter(p => p.stage === stage);
  return (
    <div className="m-screen">
      <div className="m-header">
        <div style={{ flex: 1 }}>
          <div className="m-title" style={{ fontSize: 24 }}>Pipeline</div>
          <div className="m-sub">{(AppData.PIPELINE || []).length} active leads</div>
        </div>
      </div>
      <div style={{ padding: "0 16px 8px", display: "flex", gap: 6, overflowX: "auto" }}>
        {STAGES.map(s => {
          const n = (AppData.PIPELINE || []).filter(p => p.stage === s).length;
          const active = stage === s;
          return (
            <span key={s} className="m-chip" onClick={() => setStage(s)} style={{ height: 28, padding: "0 12px", fontSize: 12, fontWeight: active ? 600 : 500, background: active ? "var(--text-primary)" : undefined, color: active ? "var(--bg-base)" : undefined, borderColor: active ? "var(--text-primary)" : undefined, cursor: "pointer" }}>{s} <span style={{ opacity: 0.6, marginLeft: 4 }}>{n}</span></span>
          );
        })}
      </div>
      <div className="m-scroll">
        {items.map(p => (
          <div key={p.id} className="m-card" style={{ padding: 12, marginBottom: 8 }} onClick={() => onLead && onLead(p)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <strong style={{ fontSize: 14 }}>{p.lead}</strong>
              <span className="tabular" style={{ fontSize: 12, color: "var(--accent-money)" }}>${(p.ap || 0).toLocaleString()}</span>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>{p.age} · {p.state} · {p.product}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}>
              <span className="m-chip">{p.stage}</span>
              <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{p.last} · next: {p.next}</span>
            </div>
          </div>
        ))}
        {items.length === 0 && <div style={{ padding: 30, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>No leads in this stage.</div>}
      </div>
    </div>
  );
}

/* ── Coaching mobile ──────────────────────────────────────────────────── */
function MScreenCoaching({ onNav }) {
  const _isDemoMC = !!(window.isDemoAgency && window.isDemoAgency());
  const cards = _isDemoMC ? [
    { focus: "Ask 3 more open-ended questions/hr", evidence: "4 closed-ended in first 6 min of Cheryl Hampton call", impact: "+12% close rate" },
    { focus: "Cut talk-listen 52% → 45%",            evidence: "Talked over Robert Mendez on his medication concern", impact: "+6pts persistency" },
    { focus: "Use Plan G price-anchor sequence",     evidence: "0 anchors used in 14 quoted calls last week",         impact: "+38% closes" },
  ] : [];
  return (
    <div className="m-screen">
      <div className="m-header">
        <div style={{ flex: 1 }}>
          <div className="m-title" style={{ fontSize: 24 }}>Coaching</div>
          <div className="m-sub">3 cards · drills ready</div>
        </div>
      </div>
      <div className="m-scroll">
        {cards.map((c, i) => (
          <div key={i} className="m-card" style={{ padding: 14, marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--accent-status)" }}>{c.focus}</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6, lineHeight: 1.5 }}>{c.evidence}</div>
            <div style={{ fontSize: 11, color: "var(--accent-money)", marginTop: 6 }}>Impact: {c.impact}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              <button className="m-btn m-btn-pri m-btn-pill" style={{ height: 30 }}>Replay</button>
              <button className="m-btn m-btn-pill" style={{ height: 30 }}>Drill</button>
            </div>
          </div>
        ))}
        {cards.length === 0 && <div style={{ padding: 30, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>No coaching cards yet.</div>}
      </div>
    </div>
  );
}

/* ── Vault mobile (read-only) ─────────────────────────────────────────── */
function MScreenVault({ onNav }) {
  const _isDemoMV = !!(window.isDemoAgency && window.isDemoAgency());
  const items = _isDemoMV ? [
    { kind: "SOA",       lead: "Cheryl Hampton",  when: "Today, 11:14a", retain: "10y" },
    { kind: "Recording", lead: "Cheryl Hampton",  when: "Today, 11:14a", retain: "10y" },
    { kind: "TPMO",      lead: "Cheryl Hampton",  when: "Today, 11:14a", retain: "10y" },
    { kind: "SOA",       lead: "Robert Mendez",   when: "Today, 9:02a",  retain: "10y" },
    { kind: "LeadiD",    lead: "Cheryl Hampton",  when: "Today, 11:01a", retain: "13mo" },
  ] : [];
  return (
    <div className="m-screen">
      <div className="m-header">
        <div style={{ flex: 1 }}>
          <div className="m-title" style={{ fontSize: 24 }}>Vault</div>
          <div className="m-sub">14,820 artifacts retained</div>
        </div>
      </div>
      <div className="m-scroll">
        {items.map((a, i) => (
          <div key={i} className="m-card" style={{ padding: 12, marginBottom: 8, display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ width: 36, height: 36, borderRadius: 6, background: "var(--bg-raised)", display: "grid", placeItems: "center" }}>
              <MI.Shield s={18}/>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{a.kind} · {a.lead}</div>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{a.when}</div>
            </div>
            <span className="m-chip">{a.retain}</span>
          </div>
        ))}
        {items.length === 0 && <div style={{ padding: 30, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>No artifacts yet.</div>}
      </div>
    </div>
  );
}

/* ── Settings mobile ──────────────────────────────────────────────────── */
function MScreenSettings({ onNav }) {
  const meIdent = window.me && window.me();
  const me = (meIdent?.rep_id && (AppData.REPS || []).find(r => r.id === meIdent.rep_id))
    || (window.isDemoAgency && window.isDemoAgency() ? (AppData.REPS && AppData.REPS[0]) : null)
    || { name: meIdent?.full_name || meIdent?.email?.split("@")[0] || "Viewer", handle: meIdent?.handle || meIdent?.email || "—" };
  const initials = (me.name || "?").split(" ").map(s => s[0]).filter(Boolean).slice(0, 2).join("") || "?";
  return (
    <div className="m-screen">
      <div className="m-header">
        <div style={{ flex: 1 }}>
          <div className="m-title" style={{ fontSize: 24 }}>Settings</div>
        </div>
      </div>
      <div className="m-scroll">
        <div className="m-card" style={{ padding: 14, marginBottom: 10, display: "flex", alignItems: "center", gap: 12 }}>
          <div className="m-avatar" style={{ width: 48, height: 48, fontSize: 18, background: me.color || "var(--bg-raised)" }}>{initials}</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>{me.name}</div>
            <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{me.handle || "—"}</div>
          </div>
        </div>

        {[
          { k: "notif", l: "Notifications",     v: "All on"  },
          { k: "audio", l: "Audio quality",     v: "Wideband" },
          { k: "thm",    l: "Theme",              v: "Dark"     },
          { k: "lang",   l: "Language",            v: "English"  },
          { k: "lic",     l: "Licenses",           v: "5 active"  },
          { k: "carriers", l: "Carrier appointments", v: "5"      },
          { k: "logout",  l: "Sign out",            v: ""         },
        ].map((row, i) => (
          <div key={i} className="m-card" style={{ padding: "12px 14px", marginBottom: 6, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }} onClick={row.k === "logout" ? () => window.signOut && window.signOut() : undefined}>
            <span style={{ fontSize: 13, fontWeight: 500, color: row.k === "logout" ? "var(--state-danger)" : undefined }}>{row.l}</span>
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{row.v} ›</span>
          </div>
        ))}

        <div style={{ textAlign: "center", color: "var(--text-quaternary)", fontSize: 11, marginTop: 20 }}>Repflow · v2.0 · Atlas IMO</div>
      </div>
    </div>
  );
}

window.MScreenPipeline = MScreenPipeline;
window.MScreenCoaching = MScreenCoaching;
window.MScreenVault    = MScreenVault;
window.MScreenSettings = MScreenSettings;

})();
