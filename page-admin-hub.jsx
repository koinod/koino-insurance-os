/* page-admin-hub.jsx — Single super_admin landing page that hosts every
 * platform/admin surface behind one horizontal nav. Replaces the 10-item
 * sidebar block (HQ · Clients · Subscriptions · Users · Onboarding · Carriers
 * · Security · Audit · Lab · Customize) with one entry point — the sidebar
 * keeps only "HQ" for super_admins now.
 *
 * Implementation note: this file is a SHELL. It does not duplicate any logic
 * from `page-platform-admin.jsx` or `page-admin.jsx` — it just renders their
 * existing sub-components in `embedded` mode so they hide their inner page
 * headers + tab strips. Adding a new admin surface = add a row to HUB_TABS
 * and route it to the right component.
 */

(function () {
  const { useState, useEffect } = React;

  // One source of truth for the hub's horizontal nav. Order is the order
  // operators read top-down: business state (HQ, Clients, Subs), people
  // (Users, Onboarding), config (Carriers, Security), audit-and-trust
  // (Audit), engineering knobs (Flags, System, Lab), and self-service
  // (Customize). Reorder = product call, not a code call.
  const HUB_TABS = [
    { k: "hq",         l: "HQ",            icon: "BarChart3"   },
    { k: "agencies",   l: "Clients",       icon: "Building"    },
    { k: "billing",    l: "Subscriptions", icon: "Wallet"      },
    { k: "members",    l: "Users",         icon: "Users"       },
    { k: "invites",    l: "Onboarding",    icon: "Bell"        },
    { k: "carriers",   l: "Carriers",      icon: "Shield"      },
    { k: "security",   l: "Security",      icon: "Lock"        },
    { k: "audit",      l: "Audit",         icon: "Activity"    },
    { k: "flags",      l: "Flags",         icon: "ToggleRight" },
    { k: "system",     l: "System",        icon: "Cpu"         },
    { k: "lab",        l: "Lab",           icon: "Sparkles"    },
    { k: "customize",  l: "Customize",     icon: "Edit"        },
  ];

  // Which tabs route to which underlying component. PagePlatformAdmin owns
  // hq/flags/system (cross-tenant operator views with their own RPCs);
  // PageAdmin owns everything else (tenant-mgmt CRUD). Customize fires the
  // existing modal — keeps a single composer implementation.
  const PLATFORM_SUBPAGES = { hq: "platform", flags: "flags", system: "system" };

  function PageAdminHub({ initialSubpage = "hq" }) {
    const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
    const isSuper = window.isSuperAdmin && window.isSuperAdmin();

    const [tab, setTab] = useState(() => {
      // Honor sessionStorage hand-off so a deep link can land on a specific
      // sub-tab without changing the parent route.
      try {
        const v = sessionStorage.getItem("repflow.adminhub.tab");
        if (v) { sessionStorage.removeItem("repflow.adminhub.tab"); return v; }
      } catch {}
      return initialSubpage || "hq";
    });

    // Switching tabs scrolls back to top — admin pages are long, prevents
    // landing mid-scroll on the wrong section.
    useEffect(() => { try { window.scrollTo({ top: 0, behavior: "instant" }); } catch {} }, [tab]);

    if (!isSuper) {
      return (
        <div className="page-pad">
          <div className="panel" style={{ padding: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--state-danger)" }}>Not authorized</div>
            <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--text-tertiary)", lineHeight: 1.55 }}>
              HQ is gated on the <code className="mono" style={{ fontSize: 11 }}>koino_super_admins</code> allowlist.
              You're signed in as <strong style={{ color: "var(--text-secondary)" }}>{meIdent?.role || "unknown"}</strong>.
            </div>
          </div>
        </div>
      );
    }

    const body = (() => {
      if (tab === "customize") {
        // Fire the existing composer modal — the sidebar listener picks this
        // up and opens it. No need to re-implement.
        return <CustomizeLanding/>;
      }
      if (PLATFORM_SUBPAGES[tab]) {
        const P = window.PagePlatformAdmin;
        if (!P) return <Stub label="Platform admin"/>;
        return <P subpage={PLATFORM_SUBPAGES[tab]} embedded/>;
      }
      const A = window.PageAdmin;
      if (!A) return <Stub label="Admin"/>;
      return <A key={tab} initialTab={tab} embedded/>;
    })();

    return (
      <div className="page-pad">
        <div className="page-h" style={{ marginBottom: 8 }}>
          <div>
            <div className="page-title">HQ · Super Admin</div>
            <div className="page-sub">
              All platform surfaces in one tab — {HUB_TABS.length} sections.
              {meIdent?.email && (
                <span style={{ marginLeft: 8, color: "var(--text-quaternary)" }}>
                  signed in as <strong style={{ color: "var(--text-secondary)" }}>{meIdent.email}</strong>
                </span>
              )}
            </div>
          </div>
        </div>

        <Shared.SectionPill
          items={HUB_TABS.map(t => ({ k: t.k, l: t.l, icon: t.icon }))}
          value={tab}
          onChange={setTab}
        />

        <div style={{ marginTop: 14 }}>{body}</div>
      </div>
    );
  }

  function Stub({ label }) {
    return <div className="panel" style={{ padding: 20, color: "var(--text-tertiary)", fontSize: 12.5 }}>{label} module loading…</div>;
  }

  /* Customize tab body — small landing card that explains what's behind the
   * composer + a single CTA to open it. The composer lives in shared.jsx and
   * is event-driven; opening from here just dispatches the open event. */
  function CustomizeLanding() {
    const openComposer = () => window.dispatchEvent(new CustomEvent("sidebar:composer:open"));
    return (
      <div className="panel" style={{ padding: 24, maxWidth: 720 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Customize your sidebar</div>
        <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 16 }}>
          Add, remove, or reorder the items in your left sidebar. Add an HQ
          tile, drop pages you never use, pin the surfaces you live in. Each
          role (Rep · Mgr · Admin) keeps its own layout — switching the role
          pill swaps in that role's saved customization.
        </div>
        <button className="btn btn-primary" onClick={openComposer}>
          <Icons.Edit size={12}/> Open sidebar composer
        </button>
      </div>
    );
  }

  window.PageAdminHub = PageAdminHub;
})();
