// Vault host — manager-nav consolidation 2026-05-19.
// One sidebar item ("Vault") wraps four buckets: at-a-glance dashboard,
// the full resource library (scripts/videos/docs/carriers/links/etc.),
// compliance docs, and the org hierarchy tree. Tree lives here because
// it answers "who's on my team and what do they need" — same audience
// as the rest of Vault.
function PageVaultHost({ role = "manager" }) {
  const TABS = [
    { k: "resources",  l: "Resources",  icon: "Folder"   },
    { k: "compliance", l: "Compliance", icon: "Shield"   },
    { k: "tree",       l: "Tree",       icon: "Workflow" },
  ];
  const [tab, setTab] = React.useState(() => {
    try { return sessionStorage.getItem("vault.tab") || "resources"; } catch { return "resources"; }
  });
  React.useEffect(() => { try { sessionStorage.setItem("vault.tab", tab); } catch {} }, [tab]);

  React.useEffect(() => {
    const fn = (e) => { const t = e.detail?.tab; if (t && TABS.some(x => x.k === t)) setTab(t); };
    window.addEventListener("vault:goto", fn);
    return () => window.removeEventListener("vault:goto", fn);
  }, []);

  return (
    <div className="page-pad vault-host">
      <div className="page-h">
        <div>
          <div className="page-title">Vault</div>
          <div className="page-sub">Resources · compliance · org tree</div>
        </div>
      </div>

      <Shared.SectionPill items={TABS} value={tab} onChange={setTab}/>

      {tab === "resources"  && (() => { const P = window.PageVault;    return P ? <P role={role} embedded={true}/> : null; })()}
      {tab === "compliance" && <VaultCompliancePane role={role}/>}
      {tab === "tree"       && (() => { const P = window.PageOrgTree; return P ? <P/>          : null; })()}
    </div>
  );
}

// Lightweight summary — counts + jump links. Real content lives under
// Resources; this is the "I just opened Vault, where do I go?" view.
function VaultDashboardPane({ role, onJump }) {
  const A = (k) => (window.AppData && window.AppData[k]) || [];
  const counts = {
    scripts:   A("SCRIPTS_LIB").length,
    videos:    A("VIDEOS").length,
    docs:      A("DOCS").length,
    courses:   A("TRAINING_COURSES").length,
    reps:      A("REPS").length,
  };
  const Card = ({ label, value, sub, onClick }) => (
    <button onClick={onClick} className="kpi-card" style={{ textAlign: "left", cursor: "pointer", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: 14 }}>
      <div style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>{sub}</div>}
    </button>
  );
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 14 }}>
        <Card label="Scripts"  value={counts.scripts}  sub="open library" onClick={() => onJump("resources")}/>
        <Card label="Videos"   value={counts.videos}   sub="training reels" onClick={() => onJump("resources")}/>
        <Card label="Docs"     value={counts.docs}     sub="forms · policies" onClick={() => onJump("resources")}/>
        <Card label="Courses"  value={counts.courses}  sub="active tracks" onClick={() => onJump("resources")}/>
        <Card label="Team"     value={counts.reps}     sub="view org tree" onClick={() => onJump("tree")}/>
      </div>
      <div className="panel" style={{ padding: 18 }}>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
          Vault is the agency's source of truth for what reps need to do
          their job — scripts, training, carrier rules, compliance, and
          the org hierarchy. Pick a section above to dive in.
        </div>
      </div>
    </div>
  );
}

// Compliance docs only — filtered subset of PageVault's docs by category
// or target_roles. Lightweight placeholder until the compliance schema
// lands; for now it surfaces docs tagged "compliance" / "policy" / "uw".
function VaultCompliancePane({ role }) {
  const docs = ((window.AppData && window.AppData.DOCS) || []).filter(d => {
    const cat = (d.cat || d.category || "").toLowerCase();
    return cat.includes("compl") || cat.includes("polic") || cat.includes("legal") || cat.includes("uw");
  });
  if (docs.length === 0) {
    return (
      <div className="panel" style={{ padding: 30, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>
        No compliance docs yet. Tag a document in Vault &gt; Resources with category
        <code style={{ margin: "0 4px" }}>compliance</code>,
        <code style={{ margin: "0 4px" }}>policy</code>, or
        <code style={{ margin: "0 4px" }}>uw</code> and it will appear here.
      </div>
    );
  }
  return (
    <div className="panel">
      <div className="panel-h"><Icons.Shield size={13}/><h3>Compliance documents</h3><span className="meta">{docs.length} total</span></div>
      <div className="list">
        {docs.map(d => (
          <div key={d.id} className="row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px" }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: 13 }}>{d.title}</div>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{d.cat || d.category}</div>
            </div>
            {d.url && <a className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 11 }} href={d.url} target="_blank" rel="noopener">Open</a>}
          </div>
        ))}
      </div>
    </div>
  );
}

window.PageVaultHost = PageVaultHost;
