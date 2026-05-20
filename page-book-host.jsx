// Book host — manager-nav consolidation 2026-05-19.
// One sidebar item ("Book") wraps the customer lifecycle: pipeline (CRM
// default) → in-force analytics → lead sources → drip sequences → NIGO.
// Each tab mounts an existing page; no business logic lives in the host.
//
// Why default to CRM, not Analytics or LeadDrip:
//   CRM is the daily-driver — "what's moving in my pipeline right now."
//   Analytics is end-of-week. LeadDrip is set-and-forget.
//
// Quicklinks header is a thin chip row mirroring Vault > Resources so a
// manager mid-call doesn't have to navigate away to grab a carrier doc.
function PageBookHost() {
  const TABS = [
    { k: "crm",       l: "CRM",        icon: "Users"        },
    { k: "clients",   l: "Clients",    icon: "Wallet"       },
    { k: "analytics", l: "Analytics",  icon: "Activity"     },
    { k: "sources",   l: "Sources",    icon: "ArrowUpRight" },
    { k: "sequences", l: "Sequences",  icon: "Bolt"         },
    { k: "nigo",      l: "NIGO",       icon: "Bell"         },
  ];
  // Persist tab selection across navigations within the session.
  const [tab, setTab] = React.useState(() => {
    try { return sessionStorage.getItem("book.tab") || "crm"; } catch { return "crm"; }
  });
  React.useEffect(() => { try { sessionStorage.setItem("book.tab", tab); } catch {} }, [tab]);

  // Allow other surfaces (cmd-K, deep links) to jump to a specific tab.
  React.useEffect(() => {
    const fn = (e) => { const t = e.detail?.tab; if (t && TABS.some(x => x.k === t)) setTab(t); };
    window.addEventListener("book:goto", fn);
    return () => window.removeEventListener("book:goto", fn);
  }, []);

  const Stub = (key) => {
    const P = window[key];
    return P ? <P/> : <div style={{ padding: 30, color: "var(--text-tertiary)", fontSize: 13 }}>
      {key} not loaded — check console for build errors.
    </div>;
  };

  return (
    <div className="page-pad book-host">
      <div className="page-h">
        <div>
          <div className="page-title">Book</div>
          <div className="page-sub">Pipeline · in-force · sources · sequences · NIGO</div>
        </div>
        <BookQuicklinks/>
      </div>

      <Shared.SectionPill items={TABS} value={tab} onChange={setTab}/>

      {tab === "crm"       && Stub("PageCrm")}
      {tab === "clients"   && Stub("PageClientBook")}
      {tab === "analytics" && Stub("PageBook")}
      {tab === "sources"   && Stub("PageAttribution")}
      {tab === "sequences" && Stub("PageLeadDrip")}
      {tab === "nigo"      && Stub("PageNIGO")}
    </div>
  );
}

// Thin quicklinks strip — carriers + lead categories. Mirrors Vault >
// Resources so the manager doesn't have to navigate away mid-workflow.
// Settings-driven editing of this list comes with the global carrier
// editor (Settings backlog).
function BookQuicklinks() {
  const carriers = ((window.AppData && window.AppData.CARRIERS) || []).slice(0, 5);
  const links = ((window.AppData && window.AppData.QUICK_LINKS) || []).slice(0, 4);
  if (!carriers.length && !links.length) return null;
  return (
    <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", maxWidth: 540, justifyContent: "flex-end" }}>
      {carriers.map(c => (
        <button key={c.id} className="chip" style={{ cursor: "pointer" }}
          onClick={() => { window.gotoPage && window.gotoPage("vault"); window.dispatchEvent(new CustomEvent("vault:goto", { detail: { tab: "resources" } })); }}
          title={`Open ${c.name} in Vault`}>
          {c.name}
        </button>
      ))}
      {links.map(l => (
        <a key={l.id || l.label} className="chip" href={l.url} target="_blank" rel="noopener" style={{ textDecoration: "none" }}>
          {l.label}
        </a>
      ))}
    </div>
  );
}

window.PageBookHost = PageBookHost;
