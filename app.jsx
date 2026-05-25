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
  const [callSid, setCallSid] = useState(null);
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

  // Hydrate the AutodialQueue from Supabase once per session-load. The queue
  // is localStorage-cached so the UI never blocks; this call pulls the
  // server copy (user_prefs.key='autodial_queue') and merges, so a queue
  // built on one device shows up on the next sign-in.
  useEffect(() => {
    let done = false;
    const tryHydrate = () => {
      if (done) return;
      if (window.AutodialQueue && typeof window.AutodialQueue.hydrate === "function") {
        done = true;
        window.AutodialQueue.hydrate().catch(() => {});
      }
    };
    // If me is already resolved by the time the App mounts, fire immediately.
    if (window.me && window.me()) tryHydrate();
    window.addEventListener("me:loaded", tryHydrate);
    return () => window.removeEventListener("me:loaded", tryHydrate);
  }, []);

  // Global incall:open / incall:dismiss — used by AutoDialBar to pop the rich
  // dashboard for each lead, and by any per-row Phone button that wants the
  // same panel rather than just firing repflowCall().
  useEffect(() => {
    const onOpen = (e) => {
      setCallLead(e.detail?.lead || null);
      setCallAutodial(!!e.detail?.autodial);
      setCallSid(e.detail?.callSid || null);
      setCallOpen(true);
      window.dispatchEvent(new CustomEvent("incall:opened"));
    };
    const onDismiss = () => {
      setCallOpen(false); setCallAutodial(false); setCallSid(null);
      window.dispatchEvent(new CustomEvent("incall:closed"));
    };
    window.addEventListener("incall:open",    onOpen);
    window.addEventListener("incall:dismiss", onDismiss);
    return () => {
      window.removeEventListener("incall:open",    onOpen);
      window.removeEventListener("incall:dismiss", onDismiss);
    };
  }, []);

  // Auto-correct page if role changes and page doesn't exist for that role.
  // super_admin gets the full admin-* allowlist because the sidebar default
  // is just "HQ" (the hub), but composer-pinned widgets can navigate to
  // admin-flags / admin-system / admin-customize / admin-hierarchy /
  // admin-scrape / admin-devices / lab — each of which is a valid route.
  useEffect(() => {
    const navForRole = Shared.NAV[role] || Shared.NAV.owner;
    const validPages = [...navForRole.map(i => i.id), ...Shared.NAV.ops.map(i => i.id), "settings"];
    if (role === "super_admin") {
      validPages.push(
        "admin", "admin-billing", "admin-members", "admin-invites",
        "admin-carriers", "admin-security", "admin-audit",
        "admin-flags", "admin-system", "admin-customize",
        "admin-hierarchy", "admin-scrape", "admin-devices", "lab",
      );
    }
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
      } catch (e) { console.warn("[app.roleSync]", e); }
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

  // Legacy routes "team" and "coaching" are folded into the Today sub-tab
  // bar (Pulse · Team · Coaching · Pay · Expenses · NIGO · Onboarding). When a
  // caller still requests them, redirect into Today and flip the sub-tab via
  // both a sessionStorage stash (for the fresh-mount case) and a
  // `today:subtab` event (for the already-mounted case).
  const goto = (p) => {
    if (p === "team" && (role === "manager" || role === "owner" || role === "super_admin")) {
      try { sessionStorage.setItem("repflow.today.subtab", "team"); } catch {}
      window.dispatchEvent(new CustomEvent("today:subtab", { detail: "team" }));
      p = "today";
    } else if (p === "coaching" && (role === "manager" || role === "owner")) {
      try { sessionStorage.setItem("repflow.today.subtab", "coaching"); } catch {}
      window.dispatchEvent(new CustomEvent("today:subtab", { detail: "coaching" }));
      p = "today";
    }
    setTweak("page", p);
    setCmdkOpen(false);
  };

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
    // Every page reference goes through window.* so a per-file IIFE failure or
    // a stale-cache mismatch (e.g. app.js loaded but page-owner.js didn't
    // register window.PageTeam) degrades to a Stub instead of crashing the
    // whole app with "Can't find variable: X".
    const F = (key, props = {}) => {
      const P = window[key];
      return P ? <P {...props}/> : <PageStub title={key.replace(/^Page/,'')} sub=""/>;
    };
    if (mobile && role === "rep") return F("PageFloor", { role, onCall: () => setCallOpen(true), defaultMode: "live" });
    if (mobile) return F("MobileRep", { onExitMobile: () => setTweak("mobile", false) });
    switch (page) {
      case "today":       return F("PageToday", { aep: aepMode, role });
      case "floor":       return F("PageFloor", { role, onCall: () => setCallOpen(true), defaultMode: "live" });
      // Pipeline + Calls used to mount through Floor; refactored 2026-05-22
      // so they route to their own pages — Floor is dialer-first now.
      case "pipeline":    return F("PagePipeline", { role });
      case "queue":       return F("PageFloor", { role, onCall: () => setCallOpen(true), defaultMode: "live" });
      case "leaderboard": return (() => {
        // page-leaderboard.jsx was removed — fall through to Performance for
        // owners, or a stub message for non-owner roles.
        const P = window.PagePerformance;
        if (P) return <P/>;
        return <div style={{ padding: 30, color: "var(--text-tertiary)", fontSize: 13 }}>Leaderboard view not available — open P&L → Performance instead.</div>;
      })();
      case "performance": return F("PagePerformance");
      case "team":        return F("PageTeam");
      case "coaching":    return F("PageTraining", { role, defaultTab: "coaching" });
      case "pnl":         return F("PagePnL");
      case "tree":        return F("PageOrgTree");
      case "connections": return F("PageConnections");
      case "calls":       return F("PageCalls", { role });
      case "commissions": return F("PageCommissions", { role });
      case "training":    return F("PageTraining", { role });
      // NAV restructure 2026-05-19: vault + book route through host
      // wrappers that surface sub-tabs (see page-vault-host.jsx /
      // page-book-host.jsx). Old direct routes below still resolve for
      // deep-link back-compat.
      case "vault":       return F("PageVaultHost", { role });
      case "book":        return F("PageBookHost");
      case "leaddrip":    return F("PageLeadDrip",   { role });
      case "resources":   return F("PageResources",  { role });
      case "crm":         return F("PageCrm",        { role });
      case "messages":    return F("PageMessages",   { role });
      case "quote":       return F("PageQuote",      { role });
      case "auto-quoter": return F("PageAutoQuoter", { role });
      case "recruiting":  return F("PageRecruiting", { role });
      case "recruits":    return F("PageRecruits",   { role });
      case "carrier-appointments":
                          return F("PageCarrierAppointments", { role });
      case "settings":    return F("PageSettings",   { role });
      // admin: super_admin gets the real PageAdmin panel; everyone else falls
      // through to Today so old deep links don't 404. The admin-* deep-link
      // ids drive the super_admin sidebar — each lands on a specific PageAdmin
      // tab. `key` forces a remount so PageAdmin's useState picks up the new
      // initialTab.
      // All admin-* deep links land on the PageAdminHub with the right
      // initial sub-tab. The old per-route page mapping (one sidebar item per
      // admin surface) was collapsed 2026-05-25 — sidebar now has just "HQ".
      case "admin-hq":       return role === "super_admin" ? (() => { const P = window.PageAdminHub; return P ? <P key="hub-hq"       initialSubpage="hq"/>       : <PageStub title="HQ"/>; })() : F("PageToday", { aep: aepMode, role });
      case "admin":          return role === "super_admin" ? (() => { const P = window.PageAdminHub; return P ? <P key="hub-agencies" initialSubpage="agencies"/> : <PageStub title="HQ"/>; })() : F("PageToday", { aep: aepMode, role });
      case "admin-billing":  return role === "super_admin" ? (() => { const P = window.PageAdminHub; return P ? <P key="hub-billing"  initialSubpage="billing"/>  : <PageStub title="HQ"/>; })() : F("PageToday", { aep: aepMode, role });
      case "admin-members":  return role === "super_admin" ? (() => { const P = window.PageAdminHub; return P ? <P key="hub-members"  initialSubpage="members"/>  : <PageStub title="HQ"/>; })() : F("PageToday", { aep: aepMode, role });
      case "admin-invites":  return role === "super_admin" ? (() => { const P = window.PageAdminHub; return P ? <P key="hub-invites"  initialSubpage="invites"/>  : <PageStub title="HQ"/>; })() : F("PageToday", { aep: aepMode, role });
      case "admin-carriers": return role === "super_admin" ? (() => { const P = window.PageAdminHub; return P ? <P key="hub-carriers" initialSubpage="carriers"/> : <PageStub title="HQ"/>; })() : F("PageToday", { aep: aepMode, role });
      case "admin-security": return role === "super_admin" ? (() => { const P = window.PageAdminHub; return P ? <P key="hub-security" initialSubpage="security"/> : <PageStub title="HQ"/>; })() : F("PageToday", { aep: aepMode, role });
      case "admin-audit":    return role === "super_admin" ? (() => { const P = window.PageAdminHub; return P ? <P key="hub-audit"      initialSubpage="audit"/>      : <PageStub title="HQ"/>; })() : F("PageToday", { aep: aepMode, role });
      // Pinnable sub-pages added 2026-05-25 — widget composer can drop these
      // directly into the sidebar. Each lands on the hub with the right
      // initialSubpage. Hierarchy/scrape/devices fall through the hub to
      // PageAdmin internally; the hub pill won't highlight (those tabs
      // aren't in HUB_TABS yet) which is acceptable for niche surfaces.
      case "admin-flags":      return role === "super_admin" ? (() => { const P = window.PageAdminHub; return P ? <P key="hub-flags"     initialSubpage="flags"/>     : <PageStub title="HQ"/>; })() : F("PageToday", { aep: aepMode, role });
      case "admin-system":     return role === "super_admin" ? (() => { const P = window.PageAdminHub; return P ? <P key="hub-system"    initialSubpage="system"/>    : <PageStub title="HQ"/>; })() : F("PageToday", { aep: aepMode, role });
      case "admin-customize":  return role === "super_admin" ? (() => { const P = window.PageAdminHub; return P ? <P key="hub-customize" initialSubpage="customize"/> : <PageStub title="HQ"/>; })() : F("PageToday", { aep: aepMode, role });
      case "admin-hierarchy":  return role === "super_admin" ? (() => { const P = window.PageAdminHub; return P ? <P key="hub-hierarchy" initialSubpage="hierarchy"/> : <PageStub title="HQ"/>; })() : F("PageToday", { aep: aepMode, role });
      case "admin-scrape":     return role === "super_admin" ? (() => { const P = window.PageAdminHub; return P ? <P key="hub-scrape"    initialSubpage="scrape"/>    : <PageStub title="HQ"/>; })() : F("PageToday", { aep: aepMode, role });
      case "admin-devices":    return role === "super_admin" ? (() => { const P = window.PageAdminHub; return P ? <P key="hub-devices"   initialSubpage="devices"/>   : <PageStub title="HQ"/>; })() : F("PageToday", { aep: aepMode, role });
      case "platform":
      case "agencies":
      case "users":
      case "billing":
      case "audit":
      case "system":      return F("PageToday", { aep: aepMode, role });
      case "attribution": return F("PageAttribution", { role });
      case "nigo":        return F("PageNIGO",        { role });

      // Consolidated NAV aliases (NAV restructure 2026-05-05).
      // Old routes (vault/tree/performance/attribution/training/resources/
      // commissions) still have direct case handlers above for deep-link
      // back-compat — these are the new top-level NAV ids.
      case "library":     return (() => { const P = window.PageLibrary; return P ? <P role={role}/> : F("PageTraining", { role }); })();
      case "org":         return F("PageOrgTree");
      case "compliance":  return F("PageVault",       { role });
      case "pay":         return F("PageCommissions", { role });
      case "expenses":    return F("PageExpenses",    { role });
      case "invite-team": return F("PageInviteTeamRoute");
      case "lab":         return role === "super_admin"
                                ? F("PageLab")
                                : F("PageToday", { aep: aepMode, role });

      // Legacy routes — kept so deep links + AI nav: hints don't 404 after
      // earlier owner nav consolidation. They redirect into related pages.
      case "tiering":     return F("PagePerformance");
      case "forecast":    return F("PagePerformance");
      case "carriers":    return F("PageResources");
      case "scrubbers":   return F("PageResources");
      case "hardware":    return F("PageHardware");
      case "agents":      return F("PageAgents");
      case "workflows":   return F("PageWorkflows");

      default:            return F("PageStub", { title: "Page", sub: "" });
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
      {window.RepflowFAB && (() => { const RF = window.RepflowFAB; return <RF/>; })()}
      {window.RBAConfirmationsHost && (() => { const C = window.RBAConfirmationsHost; return <C/>; })()}
      {window.AICopilotMount && (() => { const C = window.AICopilotMount; return <C/>; })()}
      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)}/>
      {callOpen && <InCall lead={callLead} callSid={callSid} autodial={callAutodial} onClose={() => { setCallOpen(false); setCallAutodial(false); setCallSid(null); window.dispatchEvent(new CustomEvent("incall:closed")); }}/>}

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
