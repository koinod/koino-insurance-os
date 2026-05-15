const { useState, useEffect, useMemo } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "role": "manager",
  "page": "today",
  "density": "comfortable",
  "aiRail": false,
  "aepMode": true,
  "mobile": false
}/*EDITMODE-END*/;

function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const { role, page, density, aiRail, aepMode, mobile } = tweaks;
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [callLead, setCallLead] = useState(null);
  const [callAutodial, setCallAutodial] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [, force] = useState(0);

  // Re-render on Supabase hydrate so all pages flip from mock → live data
  useEffect(() => {
    const onHydrate = () => force(n => n + 1);
    window.addEventListener("data:hydrated", onHydrate);
    return () => window.removeEventListener("data:hydrated", onHydrate);
  }, []);

  // Global incall:open / incall:dismiss — used by AutoDialBar to pop the rich
  // dashboard for each lead, and by any per-row Phone button that wants the
  // same panel rather than just firing repflowCall().
  useEffect(() => {
    const onOpen = (e) => {
      setCallLead(e.detail?.lead || null);
      setCallAutodial(!!e.detail?.autodial);
      setCallOpen(true);
      window.dispatchEvent(new CustomEvent("incall:opened"));
    };
    const onDismiss = () => {
      setCallOpen(false); setCallAutodial(false);
      window.dispatchEvent(new CustomEvent("incall:closed"));
    };
    window.addEventListener("incall:open",    onOpen);
    window.addEventListener("incall:dismiss", onDismiss);
    return () => {
      window.removeEventListener("incall:open",    onOpen);
      window.removeEventListener("incall:dismiss", onDismiss);
    };
  }, []);

  // Auto-correct page if role changes and page doesn't exist for that role
  useEffect(() => {
    const navForRole = Shared.NAV[role] || Shared.NAV.owner;
    const validPages = [...navForRole.map(i => i.id), ...Shared.NAV.ops.map(i => i.id), "settings"];
    if (!validPages.includes(page)) {
      setTweak("page", navForRole[0].id);
    }
  }, [role]);

  // When the user signs in (real Supabase session, not demo), pull their real
  // role from me() and switch the UI to it. admin / imo_owner / super_admin
  // are collapsed onto the owner experience (the dedicated admin surface was
  // decommissioned in 34dcba4) — RLS in Supabase still grants the extra
  // cross-agency reads when applicable; no separate UI is needed.
  //
  // Sync runs ONLY on the initial session resolve and explicit SIGNED_IN —
  // NOT on TOKEN_REFRESHED (fires hourly) or USER_UPDATED. Otherwise a
  // super_admin who manually picks "Rep" or "Mgr" via the role-switch has
  // their selection silently reverted to "super_admin" the next time the
  // Supabase SDK refreshes the access token. We also bail if the operator
  // has already touched the role tweak this session.
  useEffect(() => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return;
    let cancelled = false;
    let synced = false;
    const sync = async () => {
      if (synced) return;
      try {
        const { data: { session } } = await sb.auth.getSession();
        if (!session) return;
        const { data: meRow } = await sb.from("agency_members")
          .select("role, agency_id, rep_id")
          .eq("user_id", session.user.id)
          .eq("active", true)
          .order("joined_at", { ascending: false })
          .limit(1).single();
        if (cancelled) return;
        if (meRow?.role) {
          // "owner" and legacy roles collapse to manager. super_admin keeps its
          // own role so it gets the admin tab in its NAV.
          const RETIRED = new Set(["admin", "imo_owner", "owner"]);
          const effective = RETIRED.has(meRow.role) ? "manager" : meRow.role;
          window.__authRole = effective;
          if (effective !== role) setTweak("role", effective);
        }
        synced = true;
      } catch (_e) {}
    };
    sync();
    const sub = sb.auth.onAuthStateChange((event, _sess) => {
      // Only the first sign-in transition triggers a role reset. Token
      // refreshes and user-metadata updates leave the chosen view alone.
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") sync();
    });
    return () => { cancelled = true; sub?.data?.subscription?.unsubscribe?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setCmdkOpen(o => !o); }
      else if (e.key === "?" && !cmdkOpen && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault(); setHelpOpen(h => !h);
      }
      else if (e.key === "Escape") { setCmdkOpen(false); setCallOpen(false); setNotifOpen(false); setHelpOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cmdkOpen]);

  const goto = (p) => { setTweak("page", p); setCmdkOpen(false); };

  // Expose goto + listen to nav:goto events from anywhere (SectionPill, deep-links, etc.)
  React.useEffect(() => {
    window.gotoPage = goto;
    const onNav = (e) => goto(e.detail?.page || e.detail);
    const onAsk = () => { if (!aiRail) setTweak("aiRail", true); };  // auto-open rail when an Ask the Book fires
    window.addEventListener("nav:goto", onNav);
    window.addEventListener("ai:ask", onAsk);
    return () => { window.removeEventListener("nav:goto", onNav); window.removeEventListener("ai:ask", onAsk); };
  }, [aiRail]);

  const pageEl = useMemo(() => {
    // GAP-M1: mobile reps land on Floor (the actual workspace) instead of
    // the legacy MobileRep mock. Manager + owner still get MobileRep — they
    // don't dial from phones.
    if (mobile && role === "rep") return <PageFloor role={role} onCall={() => setCallOpen(true)} defaultMode="live"/>;
    if (mobile) return <MobileRep/>;
    switch (page) {
      case "today":       return <PageToday aep={aepMode} role={role}/>;
      case "floor":       return <PageFloor role={role} onCall={() => setCallOpen(true)} defaultMode="live"/>;
      case "pipeline":    return <PageFloor role={role} onCall={() => setCallOpen(true)} defaultMode="pipeline"/>;
      case "queue":       return <PageFloor role={role} onCall={() => setCallOpen(true)} defaultMode="live"/>;
      case "leaderboard": return (() => {
        // page-leaderboard.jsx was removed — fall through to Performance for
        // owners, or a stub message for non-owner roles.
        const P = window.PagePerformance;
        if (P) return <P/>;
        return <div style={{ padding: 30, color: "var(--text-tertiary)", fontSize: 13 }}>Leaderboard view not available — open P&L → Performance instead.</div>;
      })();
      case "performance": return (() => { const P = window.PagePerformance; return P ? <P/> : null; })();
      case "team":        return <PageTeam/>;
      case "coaching":    return <PageTraining role={role} defaultTab="coaching"/>;
      case "pnl":         return <PagePnL/>;
      case "tree":        return <PageOrgTree/>;
      case "connections": return <PageConnections/>;
      case "calls":       return <PageFloor role={role} onCall={() => setCallOpen(true)} defaultMode="history"/>;
      case "commissions": return <PageCommissions role={role}/>;
      case "training":    return <PageTraining role={role}/>;
      case "vault":       return <PageVault role={role}/>;
      case "leaddrip":    return (() => { const P = window.PageLeadDrip;   return P ? <P role={role}/> : null; })();
      case "resources":   return (() => { const P = window.PageResources;   return P ? <P role={role}/> : null; })();
      case "crm":         return (() => { const P = window.PageCrm;         return P ? <P role={role}/> : null; })();
      case "messages":    return (() => { const P = window.PageMessages;    return P ? <P role={role}/> : null; })();
      case "quote":       return (() => { const P = window.PageQuote;       return P ? <P role={role}/> : null; })();
      case "auto-quoter": return (() => { const P = window.PageAutoQuoter;  return P ? <P role={role}/> : null; })();
      case "book":        return <PageBook/>;
      case "recruiting":  return <PageRecruiting role={role}/>;
      case "settings":    return <PageSettings role={role}/>;
      // admin: super_admin gets the real PageAdmin panel; everyone else falls
      // through to Today so old deep links don't 404.
      case "admin":       return (() => {
        if (role === "super_admin") { const P = window.PageAdmin; return P ? <P role={role}/> : <PageStub title="Admin" sub=""/>; }
        return <PageToday aep={aepMode} role={role}/>;
      })();
      case "platform":
      case "agencies":
      case "users":
      case "billing":
      case "audit":
      case "system":      return <PageToday aep={aepMode} role={role}/>;
      case "attribution": return (() => { const P = window.PageAttribution; return P ? <P role={role}/> : null; })();
      case "nigo":        return (() => { const P = window.PageNIGO;        return P ? <P role={role}/> : null; })();

      // Consolidated NAV aliases (NAV restructure 2026-05-05).
      // Old routes (vault/tree/performance/attribution/training/resources/
      // commissions) still have direct case handlers above for deep-link
      // back-compat — these are the new top-level NAV ids.
      case "library":     return (() => { const P = window.PageLibrary; return P ? <P role={role}/> : <PageTraining role={role}/>; })();
      case "org":         return <PageOrgTree/>;
      case "compliance":  return <PageVault role={role}/>;
      case "pay":         return <PageCommissions role={role}/>;
      case "expenses":    return (() => { const P = window.PageExpenses;    return P ? <P role={role}/> : null; })();

      // Legacy routes — kept so deep links + AI nav: hints don't 404 after
      // earlier owner nav consolidation. They redirect into related pages.
      case "tiering":     return (() => { const P = window.PagePerformance; return P ? <P/> : null; })();
      case "forecast":    return (() => { const P = window.PagePerformance; return P ? <P/> : null; })();
      case "carriers":    return (() => { const P = window.PageResources;   return P ? <P/> : null; })();
      case "scrubbers":   return (() => { const P = window.PageResources;   return P ? <P/> : null; })();
      case "hardware":    return (() => { const P = window.PageHardware;    return P ? <P/> : null; })();
      case "agents":      return (() => { const P = window.PageAgents;      return P ? <P/> : null; })();
      case "workflows":   return (() => { const P = window.PageWorkflows;   return P ? <P/> : null; })();

      default:            return <PageStub title="Page" sub=""/>;
    }
  }, [page, mobile, aepMode, role]);

  const crumbs = useMemo(() => {
    const role_ = { rep: "Rep", manager: "Manager", super_admin: "Admin" }[role] || "Manager";
    const item = [...Shared.NAV[role], ...Shared.NAV.ops].find(i => i.id === page);
    const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
    const agencyName = meIdent?.agency_name || "Agency";
    return [agencyName, role_, item?.label || page];
  }, [role, page]);

  return (
    <div className="app" data-rail={aiRail && !mobile ? "on" : "off"} data-mobile={mobile ? "on" : "off"} data-density={density}>
      {!mobile && (
        <Shared.Sidebar
          role={role}
          setRole={(r) => setTweak("role", r)}
          page={page}
          setPage={goto}
          openCmdK={() => setCmdkOpen(true)}
        />
      )}
      <main className="workspace">
        {window.ImpersonationBanner && (() => { const B = window.ImpersonationBanner; return <B/>; })()}
        {!mobile && (
          <Shared.Topbar
            crumbs={crumbs}
            aep={aepMode}
            openCmdK={() => setCmdkOpen(true)}
            toggleRail={() => setTweak("aiRail", !aiRail)}
            railOn={aiRail}
            openMobile={() => setTweak("mobile", true)}
            openNotifications={() => setNotifOpen(true)}
            openSettings={() => goto("settings")}
            notifCount={6}
          />
        )}
        <div className="page">{pageEl}</div>
      </main>
      {!mobile && aiRail && <Shared.AIRail context={crumbs[crumbs.length - 1]}/>}

      <Shared.CmdK open={cmdkOpen} onClose={() => setCmdkOpen(false)} goto={goto}/>
      {(() => { const T = window.ToastHost; return T ? <T/> : null; })()}
      {(() => { const D = window.RepflowDialMonitor; return D ? <D/> : null; })()}
      {(() => { const O = window.OnboardingTour; return O ? <O/> : null; })()}
      {(() => { const NP = window.PerAgencyNotificationsPanel || NotificationsPanel; return <NP open={notifOpen} onClose={() => setNotifOpen(false)} goto={goto}/>; })()}
      {window.AutoDialBar && (() => { const A = window.AutoDialBar; return <A/>; })()}
      {window.FloorActionsHost && (() => { const F = window.FloorActionsHost; return <F/>; })()}
      {window.RBAConfirmationsHost && (() => { const C = window.RBAConfirmationsHost; return <C/>; })()}
      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)}/>
      {callOpen && <InCall lead={callLead} autodial={callAutodial} onClose={() => { setCallOpen(false); setCallAutodial(false); window.dispatchEvent(new CustomEvent("incall:closed")); }}/>}

      <TweaksPanel title="Tweaks">
        <TweakSection label="View"/>
        <TweakRadio label="Role" value={role} options={[{value:"rep",label:"Rep"},{value:"manager",label:"Mgr"},{value:"super_admin",label:"Admin"}]} onChange={(v) => setTweak("role", v)}/>
        <TweakSelect label="Page" value={page} options={[
          ...Shared.NAV[role].map(i => ({ value: i.id, label: i.label })),
          ...Shared.NAV.ops.map(i => ({ value: i.id, label: `Ops · ${i.label}` }))
        ]} onChange={(v) => setTweak("page", v)}/>
        <TweakToggle label="Mobile rep view" value={mobile} onChange={(v) => setTweak("mobile", v)}/>
        <TweakSection label="Density & UI"/>
        <TweakRadio label="Density" value={density} options={[{value:"comfortable",label:"Comfy"},{value:"compact",label:"Compact"}]} onChange={(v) => setTweak("density", v)}/>
        <TweakToggle label="AI co-pilot rail" value={aiRail} onChange={(v) => setTweak("aiRail", v)}/>
        <TweakToggle label="AEP surge mode" value={aepMode} onChange={(v) => setTweak("aepMode", v)}/>
        <TweakSection label="Try"/>
        <TweakButton label="Open command palette (⌘K)" onClick={() => setCmdkOpen(true)}/>
        <TweakButton label="Open in-call overlay" onClick={() => setCallOpen(true)}/>
        <TweakButton label="Open mobile prototype (full screen)" onClick={() => window.location.assign("/mobile.html")}/>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <Shared.ErrorBoundary>
    <AuthGate><App/></AuthGate>
  </Shared.ErrorBoundary>
);
