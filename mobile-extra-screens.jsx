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
  // Was 3 hardcoded coaching cards naming "Cheryl Hampton" and "Robert
  // Mendez" — those bleed into real rep accounts. Now: hydrate from
  // AppData.COACHING_NOTES for me when present, else demo-only copy.
  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  const isDemo  = !!(window.isDemoAgency && window.isDemoAgency());
  const myId    = meIdent?.rep_id || (isDemo ? AppData.REPS?.[0]?.id : null);
  const liveCards = (AppData.COACHING_NOTES || [])
    .filter(n => !myId || n.repId === myId || n.rep_id === myId)
    .slice(0, 6)
    .map(n => ({ focus: n.focus || n.title || "Coaching focus", evidence: n.body || n.summary || "", impact: n.impact || "" }));
  const demoCards = isDemo && liveCards.length === 0 ? [
    { focus: "Ask 3 more open-ended questions/hr", evidence: "4 closed-ended in first 6 min on a recent Plan G call", impact: "+12% close rate" },
    { focus: "Cut talk-listen 52% → 45%",            evidence: "Talked over a prospect on a medication concern",        impact: "+6pts persistency" },
    { focus: "Use Plan G price-anchor sequence",     evidence: "0 anchors used in 14 quoted calls last week",            impact: "+38% closes" },
  ] : [];
  const cards = liveCards.length > 0 ? liveCards : demoCards;
  return (
    <div className="m-screen">
      <div className="m-header">
        <div style={{ flex: 1 }}>
          <div className="m-title" style={{ fontSize: 24 }}>Coaching</div>
          <div className="m-sub">{cards.length} card{cards.length === 1 ? "" : "s"}{cards.length > 0 ? " · drills ready" : ""}</div>
        </div>
      </div>
      <div className="m-scroll">
        {cards.length === 0 && (
          <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.7rem", color: "#00d4aa", letterSpacing: "0.1em", textTransform: "uppercase" }}>// no notes yet</span>
            <span style={{ maxWidth: 280, lineHeight: 1.5 }}>After your next AI-scored call, your upline can drop focus cards here.</span>
          </div>
        )}
        {cards.map((c, i) => (
          <div key={i} className="m-card" style={{ padding: 14, marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--accent-status)" }}>{c.focus}</div>
            {c.evidence && <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6, lineHeight: 1.5 }}>{c.evidence}</div>}
            {c.impact && <div style={{ fontSize: 11, color: "var(--accent-money)", marginTop: 6 }}>Impact: {c.impact}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Vault mobile (read-only) ─────────────────────────────────────────── */
function MScreenVault({ onNav }) {
  // Was 5 hardcoded SOA/Recording rows for Cheryl Hampton + Robert Mendez
  // and a "14,820 artifacts" literal. Now hydrates from VAULT_FILES.
  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  const isDemo  = !!(window.isDemoAgency && window.isDemoAgency());
  const myId    = meIdent?.rep_id || (isDemo ? AppData.REPS?.[0]?.id : null);
  const fmtWhen = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" });
  };
  const liveItems = (AppData.VAULT_FILES || [])
    .filter(f => !myId || f.repId === myId || f.rep_id === myId)
    .slice(0, 20)
    .map(f => ({ kind: f.kind || "File", lead: f.lead || f.leadName || "—", when: fmtWhen(f.createdAt || f.created_at), retain: f.retentionLabel || (f.kind === "LeadiD" ? "13mo" : "10y") }));
  const demoItems = isDemo && liveItems.length === 0 ? [
    { kind: "SOA",       lead: "Cheryl Hampton",  when: "Today, 11:14a", retain: "10y" },
    { kind: "Recording", lead: "Cheryl Hampton",  when: "Today, 11:14a", retain: "10y" },
    { kind: "TPMO",      lead: "Cheryl Hampton",  when: "Today, 11:14a", retain: "10y" },
  ] : [];
  const items = liveItems.length > 0 ? liveItems : demoItems;
  return (
    <div className="m-screen">
      <div className="m-header">
        <div style={{ flex: 1 }}>
          <div className="m-title" style={{ fontSize: 24 }}>Vault</div>
          <div className="m-sub">{items.length} artifact{items.length === 1 ? "" : "s"}{items.length > 0 ? " retained" : ""}</div>
        </div>
      </div>
      <div className="m-scroll">
        {items.length === 0 && (
          <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.7rem", color: "#00d4aa", letterSpacing: "0.1em", textTransform: "uppercase" }}>// vault · empty</span>
            <span style={{ maxWidth: 280, lineHeight: 1.5 }}>Recorded calls, SOAs, and TPMO captures will land here.</span>
          </div>
        )}
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
      </div>
    </div>
  );
}

/* ── Settings mobile ──────────────────────────────────────────────────── */
function MScreenSettings({ onNav }) {
  // Was: `const me = AppData.REPS[0]` — crashed when REPS was empty
  // (".name of undefined") and leaked Marcus's name + Atlanta + "Atlas IMO"
  // onto every signed-in operator's mobile settings.
  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  const isDemo  = !!(window.isDemoAgency && window.isDemoAgency());
  const meRep   = meIdent?.rep_id ? (AppData.REPS || []).find(r => r.id === meIdent.rep_id) : null;
  const fallback = isDemo ? (AppData.REPS || [])[0] : null;
  const meRow = meRep || fallback || {
    id: meIdent?.rep_id || "viewer",
    name: meIdent?.full_name || "You",
    handle: meIdent?.handle || "",
    color: undefined,
  };
  const initials = (meRow.name || "?").split(" ").map(s => s[0]).filter(Boolean).join("").slice(0, 2);
  const agencyLine = meIdent?.agency_name || (isDemo ? "Demo · Atlas seed" : null);
  const licStates  = (meIdent?.licensed_states && Array.isArray(meIdent.licensed_states)) ? meIdent.licensed_states.length : null;
  const carrierApps = (AppData.APPOINTMENTS || []).filter(a => a.repId === meRow.id && a.status === "appointed").length;

  const goSettings = () => window.gotoPage && window.gotoPage("settings");

  return (
    <div className="m-screen">
      <div className="m-header">
        <div style={{ flex: 1 }}>
          <div className="m-title" style={{ fontSize: 24 }}>Settings</div>
        </div>
      </div>
      <div className="m-scroll">
        <div className="m-card" style={{ padding: 14, marginBottom: 10, display: "flex", alignItems: "center", gap: 12 }}>
          <div className="m-avatar" style={{ width: 48, height: 48, fontSize: 18, background: meRow.color }}>{initials}</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>{meRow.name}</div>
            <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
              {meRow.handle ? meRow.handle : ""}
              {meRow.handle && agencyLine ? " · " : ""}
              {agencyLine || ""}
            </div>
          </div>
        </div>

        {[
          { k: "notif",    l: "Notifications",         v: "Manage",                       go: goSettings },
          { k: "thm",      l: "Theme",                  v: "System",                        go: goSettings },
          { k: "lic",      l: "Licenses",               v: licStates != null ? (licStates === 0 ? "none yet" : `${licStates} active`) : "set in profile", go: goSettings },
          { k: "carriers", l: "Carrier appointments", v: carrierApps > 0 ? String(carrierApps) : (isDemo ? "5" : "—"), go: goSettings },
          { k: "logout",  l: "Sign out",                v: "",                              go: () => window.signOut && window.signOut() },
        ].map((row, i) => (
          <div key={i} className="m-card"
               style={{ padding: "12px 14px", marginBottom: 6, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
               onClick={row.go}>
            <span style={{ fontSize: 13, fontWeight: 500, color: row.k === "logout" ? "var(--state-danger)" : undefined }}>{row.l}</span>
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{row.v} {row.v ? "›" : ""}</span>
          </div>
        ))}

        <div style={{ textAlign: "center", color: "var(--text-quaternary)", fontSize: 11, marginTop: 20 }}>Repflow{agencyLine ? " · " + agencyLine : ""}</div>
      </div>
    </div>
  );
}

window.MScreenPipeline = MScreenPipeline;
window.MScreenCoaching = MScreenCoaching;
window.MScreenVault    = MScreenVault;
window.MScreenSettings = MScreenSettings;

})();
