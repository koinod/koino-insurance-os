/* page-extras.jsx — role-aware pages: Vault, Tiering, Commissions, Training, Recruiting, Calls, Book.
   Each page exports a single component that branches on `role` so a single sidebar entry
   serves rep / manager / owner with the right density.

   Conventions:
     - All money in dollars in display (the underlying domain is cents in Supabase).
     - Hardcoded demo state lives in module scope; real pages read from Supabase. */

const Money = ({ v, dim }) => (
  <span className="tabular" style={{ color: dim ? "var(--text-tertiary)" : undefined, fontWeight: dim ? 400 : 500 }}>
    ${Math.abs(v).toLocaleString()}
  </span>
);

/* ─────────────────────────────────────────────────────────────────────────
   Vault create surface — shared helpers
   ───────────────────────────────────────────────────────────────────────── */
const ROLE_CHOICES = [
  { v: "super_admin", l: "Super admin" },
  { v: "owner",       l: "Owner"       },
  { v: "manager",     l: "Manager"     },
  { v: "rep",         l: "Rep"         },
];

// Pure helper: does the viewer's role see a row tagged with these target_roles?
// Empty/null target_roles = everyone (back-compat with rows from before 0034).
function roleAllowed(viewerRole, targetRoles) {
  if (!Array.isArray(targetRoles) || targetRoles.length === 0) return true;
  if (viewerRole === "super_admin" || viewerRole === "owner") return true; // admins see everything
  return targetRoles.includes(viewerRole);
}

// Reusable multiselect row of role chips. Used by every Vault create modal.
function RoleVisibilityField({ value, onChange, label = "Visible to" }) {
  const arr = Array.isArray(value) ? value : ["owner","manager","rep"];
  const toggle = (v) => {
    const next = arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];
    onChange(next);
  };
  return (
    <Shared.Field label={label}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {ROLE_CHOICES.map(opt => {
          const on = arr.includes(opt.v);
          return (
            <button key={opt.v} type="button" onClick={() => toggle(opt.v)}
              className="chip"
              style={{
                cursor: "pointer",
                background: on ? "rgba(0, 212, 170, 0.14)" : "var(--bg-raised)",
                color: on ? "var(--accent-money)" : "var(--text-tertiary)",
                borderColor: on ? "var(--accent-money)" : "var(--border-subtle)",
                padding: "4px 10px",
                fontSize: 11.5,
                fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
              }}>
              {opt.l}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 10.5, color: "var(--text-quaternary)", marginTop: 5 }}>
        {arr.length === 0
          ? "No roles selected — nobody will see this row. Pick at least one."
          : `${arr.length} of ${ROLE_CHOICES.length} roles can see this row.`}
      </div>
    </Shared.Field>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   1. Vault — upgraded Library: coaching + courses + scripts + videos + docs +
      segments + carriers + quick links, all in one searchable hub.
      Reads from AppData (no mocks). Empty states render `.koino-empty` mono tags.
   ───────────────────────────────────────────────────────────────────────── */
function PageVault({ role = "owner", embedded = false }) {
  const data = useVaultResources();
  const [tab, setTab] = React.useState("all");
  const [q, setQ]     = React.useState("");
  const [openScript, setOpenScript] = React.useState(null);
  const [openVideo,  setOpenVideo]  = React.useState(null);

  // ⌘K → script handoff (back-compat: PageLibrary used to listen for this)
  React.useEffect(() => {
    const fn = (e) => {
      const s = e.detail;
      if (s?.id) { setTab("scripts"); setOpenScript(s.id); }
    };
    window.addEventListener("library:openScript", fn);
    return () => window.removeEventListener("library:openScript", fn);
  }, []);

  const canEdit = role === "owner" || role === "super_admin" || role === "manager";
  const isOwner = role === "owner" || role === "super_admin";

  const ql = q.trim().toLowerCase();
  const match = (s) => !ql || (s || "").toLowerCase().includes(ql);

  // Role-gated visibility (migration 0034). Reps only see rows whose
  // target_roles includes 'rep'; owners + super_admin see everything.
  const visScripts = data.scripts.filter(s => roleAllowed(role, s.targetRoles));
  const visDocs    = data.docs   .filter(d => roleAllowed(role, d.targetRoles));
  const visCourses = data.courses.filter(c => roleAllowed(role, c.targetRoles));

  const fScripts  = visScripts.filter(s => match(s.title) || match(s.body) || match(s.cat));
  const fVideos   = data.videos.filter(v => match(v.title) || match(v.cat));
  const fDocs     = visDocs.filter(d => match(d.title) || match(d.cat) || (d.text && match(d.text)));
  const fLinks    = data.links.filter(l => match(l.label) || match(l.cat));
  const fCarriers = data.carriers.filter(c => match(c.name) || match(c.category || ""));
  const fCourses  = visCourses.filter(c => match(c.title) || match(c.track || "") || match(c.description || ""));

  const totalSearch =
    fScripts.length + fVideos.length + fDocs.length +
    fLinks.length + fCarriers.length + fCourses.length;

  const counts = {
    all: totalSearch,
    coaching:  data.recordings.length + data.coachingNotes.length + data.coachingSessions.length,
    courses:   fCourses.length,
    scripts:   fScripts.length,
    videos:    fVideos.length,
    docs:      fDocs.length,
    carriers:  fCarriers.length,
    links:     fLinks.length,
  };

  const TABS = [
    { k: "all",       l: "All",        icon: "Search"    },
    { k: "coaching",  l: "Coaching",   icon: "Activity"  },
    { k: "courses",   l: "Courses",    icon: "Book"      },
    { k: "scripts",   l: "Scripts",    icon: "FileText"  },
    { k: "videos",    l: "Videos",     icon: "Video"     },
    { k: "docs",      l: "Documents",  icon: "Folder"    },
    { k: "carriers",  l: "Carriers",   icon: "Shield"    },
    { k: "links",     l: "Quick links",icon: "ArrowUpRight" },
  ];

  // Live-call context for script token substitution
  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  const subCtx = { lead: null, me: meIdent };

  return (
    <div className={embedded ? "" : "page-pad"}>
      {!embedded && (
        <div className="page-h">
          <div>
            <div className="page-title">Vault</div>
            <div className="page-sub">Coaching · courses · scripts · videos · documents · carriers · quick links</div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <input className="text-input" style={{ width: 260 }}
              placeholder="Search across everything…"
              value={q} onChange={(e) => setQ(e.target.value)}/>
            {q && <button className="btn btn-ghost" onClick={() => setQ("")}>Clear</button>}
          </div>
        </div>
      )}

      {/* Clickable Vault Dashboard Summary Row */}
      <div className="kpi-row vault-summary-grid" style={{ marginBottom: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
        <Shared.KpiCard label="Scripts" value={String(counts.scripts)} sub="open library" onClick={() => setTab("scripts")}/>
        <Shared.KpiCard label="Videos" value={String(counts.videos)} sub="training reels" onClick={() => setTab("videos")}/>
        <Shared.KpiCard label="Docs" value={String(counts.docs)} sub="forms · policies" onClick={() => setTab("docs")}/>
        <Shared.KpiCard label="Carriers" value={String(counts.carriers)} sub="appointments" onClick={() => setTab("carriers")}/>
        <Shared.KpiCard label="Courses" value={String(counts.courses)} sub="active tracks" onClick={() => setTab("courses")}/>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <Shared.SectionPill items={TABS.map(t => ({ ...t, badge: counts[t.k] }))} value={tab} onChange={setTab}/>
        {embedded && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <input className="text-input" style={{ width: 220, fontSize: 12 }}
              placeholder="Search inside resources…"
              value={q} onChange={(e) => setQ(e.target.value)}/>
            {q && <button className="btn btn-ghost btn-sm" onClick={() => setQ("")}>Clear</button>}
          </div>
        )}
      </div>

      {tab === "all" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {q && totalSearch === 0 && (
            <div className="panel" style={{ padding: 30, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
              No matches for <strong style={{ color: "var(--text-secondary)" }}>"{q}"</strong> across the Vault.
            </div>
          )}
          {!q && totalSearch === 0 && counts.coaching === 0 && (
            <div className="panel" style={{ padding: 36, textAlign: "center" }}>
              <Icons.Folder size={20} style={{ color: "var(--text-quaternary)" }}/>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8, fontWeight: 500 }}>Vault is empty</div>
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4, lineHeight: 1.5, maxWidth: 380, margin: "4px auto 0" }}>
                Once you set up carrier appointments, scripts, training, and documents, they all land here — searchable and reachable from ⌘K on every call.
              </div>
            </div>
          )}
          {fScripts.length  > 0 && <VaultScriptsBlock  scripts={fScripts}  openId={openScript} setOpenId={setOpenScript} subCtx={subCtx}/>}
          {fCourses.length  > 0 && <VaultCoursesBlock  courses={fCourses}  role={role}/>}
          {fVideos.length   > 0 && <VaultVideosBlock   videos={fVideos}    onOpen={setOpenVideo}/>}
          {fDocs.length     > 0 && <VaultDocsBlock     docs={fDocs}/>}
          {fCarriers.length > 0 && <VaultCarriersBlock carriers={fCarriers}/>}
          {fLinks.length    > 0 && <VaultLinksBlock    links={fLinks}/>}
        </div>
      )}

      {tab === "coaching" && <VaultCoachingPane role={role}/>}
      {tab === "courses"  && <ProductTrainingEmbedded role={role}/>}
      {tab === "scripts"  && <VaultScriptsPane scripts={fScripts} openId={openScript} setOpenId={setOpenScript} subCtx={subCtx} role={role}/>}
      {tab === "videos"   && <VaultVideosPane   videos={fVideos}   onOpen={setOpenVideo} canEdit={canEdit}/>}
      {tab === "docs"     && <VaultDocsPane     canEdit={canEdit}/>}
      {tab === "carriers" && <VaultCarriersPane carriers={fCarriers} canEdit={canEdit}/>}
      {tab === "links"    && <VaultLinksPane    links={fLinks}    canEdit={canEdit}/>}

      {openVideo && (
        <Shared.Modal title={openVideo.title} width={800} onClose={() => setOpenVideo(null)}>
          {openVideo.src && (
            <div style={{ position: "relative", paddingTop: "56.25%", background: "black", borderRadius: 6, overflow: "hidden" }}>
              <iframe src={openVideo.src} title={openVideo.title} allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}/>
            </div>
          )}
          <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
            <Icons.Clock size={11}/> {openVideo.durMin || 0} min · <span className="chip">{openVideo.cat}</span>
            {openVideo.sourceLabel && <span className="chip" style={{ fontSize: 9.5 }}>{openVideo.sourceLabel}</span>}
          </div>
        </Shared.Modal>
      )}
    </div>
  );
}

// Hook: all AppData arrays needed by the Vault, with live re-render on hydrate/mutate/realtime.
function useVaultResources() {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const fn = () => force(n => n + 1);
    ["data:hydrated", "data:mutated", "data:realtime"].forEach(e => window.addEventListener(e, fn));
    return () => ["data:hydrated", "data:mutated", "data:realtime"].forEach(e => window.removeEventListener(e, fn));
  }, []);
  const A = (k) => (window.AppData && window.AppData[k]) || [];
  return {
    scripts:          A("SCRIPTS_LIB"),
    videos:           A("VIDEOS"),
    docs:             A("DOCS"),
    links:            A("QUICK_LINKS"),
    carriers:         A("CARRIERS"),
    courses:          A("TRAINING_COURSES"),
    segments:         A("SEGMENTS"),
    recordings:       A("RECORDINGS"),
    coachingNotes:    A("COACHING_NOTES"),
    coachingSessions: A("COACHING_SESSIONS"),
  };
}

// Mid-call script token substitution. Tokens swap to the lead's name on an
// active call (subCtx.lead is set via In-Call panel). Empty subCtx still renders.
function vaultSubstitute(body, ctx) {
  if (!body) return "";
  const lead = ctx?.lead || {}, me = ctx?.me || {};
  const map = {
    lead_name:  lead.lead || lead.name || "your lead",
    lead_first: ((lead.lead || lead.name || "").split(" ")[0]) || "your lead",
    lead_state: lead.state || "your state",
    product:    lead.product || "your coverage",
    rep_first:  (me.full_name || me.name || "").split(" ")[0] || "your producer",
    rep_full:   me.full_name || me.name || "your producer",
    agency:     me.agency_name || "the agency",
    n_orgs:     "8", n_plans: "32",
  };
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (full, k) => map[k.toLowerCase()] != null ? map[k.toLowerCase()] : full);
}

/* ── Vault: Scripts block — collapsible cards with live-call token sub ── */
function VaultScriptsBlock({ scripts, openId, setOpenId, subCtx }) {
  if (!scripts.length) {
    return (
      <div className="panel" style={{ padding: 32, textAlign: "center" }}>
        <code className="mono koino-empty" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>no-scripts</code>
      </div>
    );
  }
  const copy = (s) => {
    try { navigator.clipboard.writeText(vaultSubstitute(s.body, subCtx)); window.toast && window.toast("Script copied", "success"); }
    catch (_e) {}
  };
  return (
    <div className="panel">
      <div className="panel-h"><Icons.FileText size={13}/><h3>Scripts</h3><span className="meta">{scripts.length}</span></div>
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
        {scripts.map(s => {
          const open = openId === s.id;
          const Chev = open ? Icons.ChevronDown : Icons.ChevronRight;
          return (
            <div key={s.id} style={{ background: "var(--bg-raised)", borderRadius: 5, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", cursor: "pointer" }} onClick={() => setOpenId(open ? null : s.id)}>
                <Chev size={11} style={{ color: "var(--text-tertiary)" }}/>
                <span style={{ flex: 1, fontWeight: 500, fontSize: 12 }} className="cell-truncate">{s.title}</span>
                {s.cat && <span className="chip" style={{ fontSize: 9.5 }}>{s.cat}</span>}
                {s.version && <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{s.version}</span>}
                <button className="icon-btn" onClick={(e) => { e.stopPropagation(); copy(s); }} title="Copy"><Icons.Copy size={11}/></button>
              </div>
              {open && (
                <div style={{ padding: "10px 12px 12px 30px", fontSize: 12, color: "var(--text-secondary)", borderTop: "1px solid var(--border-subtle)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                  {vaultSubstitute(s.body, subCtx)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Vault: Scripts pane — block + create modal (Scripts tab) ─────────── */
const SCRIPT_CATEGORIES = ["Cold","Warm","Voicemail","Objection","Close","Open","Discovery","Cross-sell","Compliance"];

function VaultScriptsPane({ scripts, openId, setOpenId, subCtx, role }) {
  const me        = (typeof window !== "undefined" && window.me && window.me()) || null;
  const myRole    = me?.role || role || "rep";
  const myRepId   = me?.rep_id || null;
  const isManager = myRole === "owner" || myRole === "manager"
                 || myRole === "imo_owner" || myRole === "admin"
                 || myRole === "super_admin";
  const canCreate = true;
  const canModify = (s) => {
    if (isManager) return true;
    if (myRole === "rep") {
      return s.creatorRole === "rep" && s.createdBy && s.createdBy === myRepId;
    }
    return false;
  };

  const emptyScriptDraft = () => {
    // Reps default to a rep-only visibility so a new personal script doesn't
    // land in the manager / owner Vault. Manager+ defaults to fleet-wide.
    const defaultRoles = isManager ? ["owner","manager","rep"] : ["rep"];
    return { id: null, title: "", cat: "Cold", body: "", description: "",
             segmentId: null, targetRoles: defaultRoles };
  };

  const [addOpen, setAddOpen] = React.useState(false);
  const [draft, setDraft]     = React.useState(emptyScriptDraft());
  const segments = (window.AppData && window.AppData.SEGMENTS) || [];

  // Hierarchy (matches RLS in migration 0095):
  //   canCreate: any signed-in agency member, including reps.
  //   canModify(s): manager+ on anything, or rep on a rep-created row they own.
  // Computed per-row because rep ownership depends on createdBy / creatorRole.

  const openCreate = () => { setDraft(emptyScriptDraft()); setAddOpen(true); };
  const openEdit   = (s) => {
    setDraft({
      id: s.id, title: s.title || "", cat: s.cat || "Cold",
      body: s.body || "", description: s.description || "",
      segmentId: s.segmentId || null,
      targetRoles: Array.isArray(s.targetRoles) && s.targetRoles.length > 0
        ? s.targetRoles : ["owner","manager","rep"],
    });
    setAddOpen(true);
  };

  const openCustomize = (s) => {
    const defaultRoles = isManager ? ["owner","manager","rep"] : ["rep"];
    setDraft({
      id: null,
      title: `${s.title} (Copy)`,
      cat: s.cat || "Cold",
      body: s.body || "",
      description: s.description || "",
      segmentId: s.segmentId || null,
      targetRoles: defaultRoles,
    });
    setAddOpen(true);
  };

  const saveScript = async () => {
    const title = draft.title.trim();
    const body  = draft.body.trim();
    if (!title || !body) return;
    if (!Array.isArray(draft.targetRoles) || draft.targetRoles.length === 0) {
      window.toast && window.toast("Pick at least one role under Visible to", "error");
      return;
    }
    try {
      await window.AppData.mutate.scriptUpsert({
        id: draft.id || undefined,
        title, cat: draft.cat, body,
        description: draft.description.trim() || null,
        segmentId: draft.segmentId || null,
        targetRoles: draft.targetRoles,
      });
      setDraft(emptyScriptDraft());
      setAddOpen(false);
      window.toast && window.toast(draft.id ? "Script saved" : "Script created", "success");
    } catch (e) {
      // toast already fired by mutator
    }
  };

  const removeScript = async (id) => {
    if (!confirm("Delete this script? This can't be undone.")) return;
    try { await window.AppData.mutate.scriptDelete(id); window.toast && window.toast("Script removed", "info"); }
    catch (e) { window.toast?.(`Script delete failed: ${e?.message || e}`, "error"); console.error("[vault.scriptDelete]", e); }
  };

  const copy = (s) => {
    try { navigator.clipboard.writeText(vaultSubstitute(s.body, subCtx)); window.toast && window.toast("Script copied", "success"); }
    catch (_e) {}
  };

  return (
    <div className="panel">
      <div className="panel-h">
        <Icons.FileText size={13}/><h3>Scripts</h3><span className="meta">{scripts.length}</span>
        {canCreate && (
          <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={openCreate}>
            <Icons.Plus size={12}/> New script
          </button>
        )}
      </div>

      {scripts.length === 0 ? (
        <div style={{ padding: 36, textAlign: "center" }}>
          <code className="mono koino-empty" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>no-scripts</code>
          {canCreate && (
            <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-tertiary)" }}>
              Click <strong style={{ color: "var(--text-secondary)" }}>New script</strong> to create one.
              {!isManager && (
                <div style={{ marginTop: 4, fontSize: 11, color: "var(--text-quaternary)" }}>
                  Your scripts are private to you. Manager-created scripts also live here.
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
          {scripts.map(s => {
            const open    = openId === s.id;
            const Chev    = open ? Icons.ChevronDown : Icons.ChevronRight;
            const canMod  = canModify(s);
            const isMine  = s.creatorRole === "rep" && s.createdBy && s.createdBy === myRepId;
            const ownerChip = isMine
              ? { label: "yours",   tone: "var(--accent-money)" }
              : s.creatorRole && s.creatorRole !== "rep"
                ? { label: s.creatorRole, tone: "var(--text-tertiary)" }
                : null;
            return (
              <div key={s.id} style={{ background: "var(--bg-raised)", borderRadius: 5, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", cursor: "pointer" }} onClick={() => setOpenId(open ? null : s.id)}>
                  <Chev size={11} style={{ color: "var(--text-tertiary)" }}/>
                  <span style={{ flex: 1, fontWeight: 500, fontSize: 12 }} className="cell-truncate">{s.title}</span>
                  {ownerChip && <span className="chip" style={{ fontSize: 9.5, color: ownerChip.tone }}>{ownerChip.label}</span>}
                  {s.isStarter && <span className="chip" style={{ fontSize: 9.5, color: "var(--text-tertiary)" }}>starter</span>}
                  {s.cat && <span className="chip" style={{ fontSize: 9.5 }}>{s.cat}</span>}
                  {s.version && <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{s.version}</span>}
                  <button className="icon-btn" onClick={(e) => { e.stopPropagation(); copy(s); }} title="Copy"><Icons.Copy size={11}/></button>
                  {canMod ? (
                    <>
                      <button className="icon-btn" onClick={(e) => { e.stopPropagation(); openEdit(s); }} title="Edit"><Icons.Edit size={11}/></button>
                      <button className="icon-btn" onClick={(e) => { e.stopPropagation(); removeScript(s.id); }} title="Delete" style={{ color: "var(--state-danger)" }}><Icons.X size={11}/></button>
                    </>
                  ) : (
                    <button className="icon-btn" onClick={(e) => { e.stopPropagation(); openCustomize(s); }} title="Customize (create personal copy)" style={{ color: "var(--accent-money)" }}><Icons.Plus size={11}/></button>
                  )}
                </div>
                {open && (
                  <div style={{ padding: "10px 12px 12px 30px", fontSize: 12, color: "var(--text-secondary)", borderTop: "1px solid var(--border-subtle)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                    {s.description && (
                      <div style={{ marginBottom: 8, fontSize: 11.5, color: "var(--text-tertiary)", fontStyle: "italic" }}>{s.description}</div>
                    )}
                    {vaultSubstitute(s.body, subCtx)}
                    {Array.isArray(s.targetRoles) && s.targetRoles.length > 0 && s.targetRoles.length < 4 && (
                      <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--border-subtle)", display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                        <span style={{ fontSize: 10.5, color: "var(--text-quaternary)", marginRight: 4 }}>Visible to:</span>
                        {s.targetRoles.map(r => <span key={r} className="chip" style={{ fontSize: 9.5 }}>{r}</span>)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {addOpen && (
        <Shared.Modal title={draft.id ? "Edit script" : "New script"} width={620} onClose={() => setAddOpen(false)} actions={
          <>
            <button className="btn btn-ghost" onClick={() => setAddOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveScript}
              disabled={!draft.title.trim() || !draft.body.trim() || draft.targetRoles.length === 0}>
              <Icons.Check size={11}/> {draft.id ? "Save changes" : "Create script"}
            </button>
          </>
        }>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 180px", gap: 12 }}>
            <Shared.Field label="Title">
              <input className="text-input" value={draft.title} autoFocus
                onChange={e => setDraft({ ...draft, title: e.target.value })}
                placeholder="Cold Open — Final Expense"/>
            </Shared.Field>
            <Shared.Field label="Category">
              <Shared.Select value={draft.cat} onChange={v => setDraft({ ...draft, cat: v })}
                options={SCRIPT_CATEGORIES.map(c => ({ v: c, l: c }))}/>
            </Shared.Field>
          </div>
          <Shared.Field label="Short description (optional)">
            <input className="text-input" value={draft.description}
              onChange={e => setDraft({ ...draft, description: e.target.value })}
              placeholder="When to use this and what it does"/>
          </Shared.Field>
          <Shared.Field label="Body (markdown ok · use {{lead_first}} etc for tokens)">
            <textarea className="text-input" rows={9} value={draft.body}
              onChange={e => setDraft({ ...draft, body: e.target.value })}
              placeholder={`Hi {{lead_first}}, this is {{rep_first}} with {{agency}}...`}
              style={{ width: "100%", lineHeight: 1.55, fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)", fontSize: 12.5 }}/>
          </Shared.Field>
          <Shared.Field label={`Segment (optional — Lead Drip uses this to route)`}>
            <Shared.Select value={draft.segmentId || ""} onChange={v => setDraft({ ...draft, segmentId: v || null })}
              options={[{ v: "", l: "— No segment —" }, ...segments.map(s => ({ v: s.id, l: s.name }))]}/>
          </Shared.Field>
          {isManager
            ? <RoleVisibilityField value={draft.targetRoles} onChange={v => setDraft({ ...draft, targetRoles: v })}/>
            : (
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
                This script is private to you. Managers can publish scripts to the whole team.
              </div>
            )
          }
        </Shared.Modal>
      )}
    </div>
  );
}

/* ── Vault: Videos block — thumbnail grid, modal player via parent ── */
function VaultVideosBlock({ videos, onOpen }) {
  if (!videos.length) {
    return (
      <div className="panel" style={{ padding: 32, textAlign: "center" }}>
        <code className="mono koino-empty" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>no-videos</code>
      </div>
    );
  }
  return (
    <div className="panel">
      <div className="panel-h"><Icons.Video size={13}/><h3>Training videos</h3><span className="meta">{videos.length}</span></div>
      <div style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
        {videos.map(v => (
          <div key={v.id} onClick={() => onOpen(v)}
            style={{ background: "var(--bg-raised)", borderRadius: 8, overflow: "hidden", cursor: "pointer", border: "1px solid var(--border-subtle)" }}>
            <div style={{ position: "relative", paddingTop: "56.25%", background: "var(--bg-overlay)" }}>
              {v.thumb && <img src={v.thumb} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}/>}
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.25)" }}>
                <div style={{ width: 36, height: 36, borderRadius: 999, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icons.Play size={14} style={{ color: "white", marginLeft: 2 }}/>
                </div>
              </div>
              {v.durMin > 0 && (
                <div style={{ position: "absolute", bottom: 6, right: 6, padding: "2px 6px", background: "rgba(0,0,0,0.7)", borderRadius: 3, fontSize: 10, color: "white" }}>{v.durMin}m</div>
              )}
            </div>
            <div style={{ padding: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 500 }} className="cell-truncate">{v.title}</div>
              {v.cat && <div style={{ marginTop: 4 }}><span className="chip" style={{ fontSize: 9.5 }}>{v.cat}</span></div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Vault: Videos pane (Block + create modal) ── */
const VIDEO_PANE_CATS = ["Med Supp","Final Expense","AEP","Life","Annuity","Compliance","Other"];

function VaultVideosPane({ videos, onOpen, canEdit }) {
  const [addOpen, setAddOpen] = React.useState(false);
  const segments = (window.AppData && window.AppData.SEGMENTS) || [];
  const emptyDraft = () => ({ id: null, title: "", cat: "Med Supp", sourceUrl: "", durMin: 0, segmentId: null });
  const [draft, setDraft] = React.useState(emptyDraft());

  const openCreate = () => { setDraft(emptyDraft()); setAddOpen(true); };
  const openEdit   = (v) => setDraft({
    id: v.id, title: v.title || "", cat: v.cat || "Med Supp",
    sourceUrl: v.sourceUrl || v.src || "", durMin: v.durMin || 0,
    segmentId: v.segmentId || null,
  });
  const save = async () => {
    const title = draft.title.trim();
    const url   = draft.sourceUrl.trim();
    if (!title) return;
    const src        = toEmbedSrc(url);
    const thumb      = thumbFromUrl(url);
    const sourceLabel = detectVideoSourceLabel(url);
    try {
      await window.AppData.mutate.videoUpsert({
        id: draft.id || undefined,
        title, cat: draft.cat, src,
        sourceUrl: url, sourceLabel,
        thumb, durMin: Number(draft.durMin) || 0,
      });
      setAddOpen(false);
      setDraft(emptyDraft());
      window.toast && window.toast(draft.id ? "Video saved" : "Video added", "success");
    } catch (_e) {}
  };
  const remove = async (id) => {
    if (!confirm("Delete this video? This can't be undone.")) return;
    try { await window.AppData.mutate.videoDelete(id); window.toast && window.toast("Video removed", "info"); }
    catch (_e) {}
  };

  return (
    <div className="panel">
      <div className="panel-h">
        <Icons.Video size={13}/><h3>Training videos</h3><span className="meta">{videos.length}</span>
        {canEdit && (
          <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={openCreate}>
            <Icons.Plus size={12}/> New video
          </button>
        )}
      </div>
      {videos.length === 0 ? (
        <div style={{ padding: 36, textAlign: "center" }}>
          <code className="mono koino-empty" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>no-videos</code>
          {canEdit && (
            <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-tertiary)" }}>
              Paste a Loom, YouTube, Vimeo, or Wistia URL to share a training clip across the agency.
            </div>
          )}
        </div>
      ) : (
        <div style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
          {videos.map(v => (
            <div key={v.id}
              style={{ background: "var(--bg-raised)", borderRadius: 8, overflow: "hidden", cursor: "pointer", border: "1px solid var(--border-subtle)", position: "relative" }}>
              <div onClick={() => onOpen(v)} style={{ position: "relative", paddingTop: "56.25%", background: "var(--bg-overlay)" }}>
                {v.thumb && <img src={v.thumb} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}/>}
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.25)" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 999, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icons.Play size={14} style={{ color: "white", marginLeft: 2 }}/>
                  </div>
                </div>
                {v.durMin > 0 && (
                  <div style={{ position: "absolute", bottom: 6, right: 6, padding: "2px 6px", background: "rgba(0,0,0,0.7)", borderRadius: 3, fontSize: 10, color: "white" }}>{v.durMin}m</div>
                )}
              </div>
              <div style={{ padding: 10, display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500 }} className="cell-truncate">{v.title}</div>
                  {v.cat && <div style={{ marginTop: 4 }}><span className="chip" style={{ fontSize: 9.5 }}>{v.cat}</span></div>}
                </div>
                {canEdit && (
                  <div style={{ display: "flex", gap: 2 }}>
                    <button className="icon-btn" onClick={(e) => { e.stopPropagation(); openEdit(v); setAddOpen(true); }} title="Edit"><Icons.Edit size={11}/></button>
                    <button className="icon-btn" onClick={(e) => { e.stopPropagation(); remove(v.id); }} title="Delete" style={{ color: "var(--state-danger)" }}><Icons.X size={11}/></button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {addOpen && (
        <Shared.Modal title={draft.id ? "Edit video" : "New video"} width={560} onClose={() => setAddOpen(false)} actions={
          <>
            <button className="btn btn-ghost" onClick={() => setAddOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={!draft.title.trim() || !draft.sourceUrl.trim()}>
              <Icons.Check size={11}/> {draft.id ? "Save changes" : "Add video"}
            </button>
          </>
        }>
          <Shared.Field label="Title">
            <input className="text-input" autoFocus value={draft.title}
              onChange={e => setDraft({ ...draft, title: e.target.value })}
              placeholder="Med Supp Plan G — opening + objections"/>
          </Shared.Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 12 }}>
            <Shared.Field label="Category">
              <Shared.Select value={draft.cat} onChange={v => setDraft({ ...draft, cat: v })}
                options={VIDEO_PANE_CATS.map(c => ({ v: c, l: c }))}/>
            </Shared.Field>
            <Shared.Field label="Duration (min)">
              <input className="text-input" type="number" value={draft.durMin}
                onChange={e => setDraft({ ...draft, durMin: +e.target.value || 0 })}/>
            </Shared.Field>
          </div>
          <Shared.Field label="Video URL (Loom / YouTube / Vimeo / Wistia / direct mp4)">
            <input className="text-input" value={draft.sourceUrl}
              onChange={e => setDraft({ ...draft, sourceUrl: e.target.value })}
              placeholder="https://loom.com/share/…"/>
          </Shared.Field>
          {segments.length > 0 && (
            <Shared.Field label="Segment (optional)">
              <Shared.Select value={draft.segmentId || ""} onChange={v => setDraft({ ...draft, segmentId: v || null })}
                options={[{ v: "", l: "— No segment —" }, ...segments.map(s => ({ v: s.id, l: s.name }))]}/>
            </Shared.Field>
          )}
        </Shared.Modal>
      )}
    </div>
  );
}

/* ── Vault: Documents block (compact, search-friendly) ── */
function VaultDocsBlock({ docs }) {
  if (!docs.length) {
    return (
      <div className="panel" style={{ padding: 32, textAlign: "center" }}>
        <code className="mono koino-empty" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>no-documents</code>
      </div>
    );
  }
  return (
    <div className="panel">
      <div className="panel-h"><Icons.Folder size={13}/><h3>Documents</h3><span className="meta">{docs.length}</span></div>
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 4 }}>
        {docs.map(d => {
          const Ico = d.kind === "gdoc" ? Icons.ArrowUpRight : Icons.FileText;
          const open = () => { if (d.url) window.open(d.url, "_blank"); };
          return (
            <div key={d.id} onClick={open}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "var(--bg-raised)", borderRadius: 5, cursor: d.url ? "pointer" : "default" }}>
              <Ico size={11} style={{ color: "var(--text-tertiary)", flex: "0 0 auto" }}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500 }} className="cell-truncate">
                  {d.title}
                  {!d.url && <span style={{ marginLeft: 6, fontSize: 10, color: "var(--text-tertiary)" }}>(no link)</span>}
                </div>
              </div>
              {d.kind === "gdoc" && <span className="chip" style={{ fontSize: 9.5 }}>{d.gdocKind || "gdoc"}</span>}
              {d.kind === "upload" && d.ext && <span className="chip" style={{ fontSize: 9.5 }}>{d.ext}</span>}
              {d.cat && <span className="chip" style={{ fontSize: 9.5 }}>{d.cat}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Vault: Courses block (compact preview, full pane lives on Courses tab) ── */
function VaultCoursesBlock({ courses, role }) {
  if (!courses.length) {
    return (
      <div className="panel" style={{ padding: 32, textAlign: "center" }}>
        <code className="mono koino-empty" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>no-courses</code>
      </div>
    );
  }
  return (
    <div className="panel">
      <div className="panel-h"><Icons.Book size={13}/><h3>Courses</h3><span className="meta">{courses.length}</span></div>
      <div style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
        {courses.map(c => (
          <div key={c.id} style={{ padding: 12, background: "var(--bg-raised)", borderRadius: 6, border: "1px solid var(--border-subtle)" }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ flex: 1 }}>{c.title}</span>
              {c.isStarter && <span className="chip" style={{ fontSize: 9, color: "var(--text-tertiary)" }}>starter</span>}
            </div>
            {c.track && <div style={{ marginTop: 4 }}><span className="chip" style={{ fontSize: 9.5 }}>{c.track}</span></div>}
            {c.description && <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 6, lineHeight: 1.5 }} className="cell-truncate">{c.description}</div>}
            {c.required && <div style={{ marginTop: 6 }}><span className="chip chip-status" style={{ fontSize: 9.5 }}>required</span></div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Vault: Carriers — directory preview on All tab (read-only block) ── */
function VaultCarriersBlock({ carriers }) {
  if (!carriers.length) {
    return (
      <div className="panel" style={{ padding: 32, textAlign: "center" }}>
        <code className="mono koino-empty" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>no-carriers</code>
      </div>
    );
  }
  return (
    <div className="panel">
      <div className="panel-h"><Icons.Shield size={13}/><h3>Carriers directory</h3><span className="meta">{carriers.length}</span></div>
      <div style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
        {carriers.map(c => (
          <div key={c.id} style={{ padding: 12, background: "var(--bg-raised)", borderRadius: 6, border: "1px solid var(--border-subtle)" }}>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>{c.name}</div>
            <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginTop: 2 }}>{c.category || "—"}</div>
            {c.contact && (c.contact.phone || c.contact.email) && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border-subtle)", fontSize: 11, color: "var(--text-tertiary)" }}>
                {c.contact.name && <div>{c.contact.name}</div>}
                {c.contact.phone && <div>{c.contact.phone}</div>}
                {c.contact.email && <div className="cell-truncate">{c.contact.email}</div>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Vault: Carriers PANE — directory + agency appointments (the operational one)
   On the dedicated Carriers tab. canEdit gates the create/edit/delete buttons. ── */
const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"];

function VaultCarriersPane({ carriers, canEdit }) {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const fn = () => force(n => n + 1);
    ["data:hydrated","data:mutated","data:realtime"].forEach(e => window.addEventListener(e, fn));
    return () => ["data:hydrated","data:mutated","data:realtime"].forEach(e => window.removeEventListener(e, fn));
  }, []);

  const appts = (window.AppData && window.AppData.AGENCY_APPOINTMENTS) || [];
  const carrierById = Object.fromEntries((carriers || []).map(c => [c.id, c]));

  const emptyDraft = () => ({
    id: null, carrierId: (carriers[0] && carriers[0].id) || "",
    carrierName: "", npn: "", compRatePct: "",
    appointedStates: [], notes: "", active: true,
  });
  const [addOpen, setAddOpen] = React.useState(false);
  const [draft, setDraft]     = React.useState(emptyDraft());

  const openCreate = () => { setDraft(emptyDraft()); setAddOpen(true); };
  const openEdit   = (a) => {
    setDraft({
      id: a.id,
      carrierId: a.carrierId || "",
      carrierName: a.carrierName || "",
      npn: a.npn || "",
      compRatePct: a.compRatePct != null ? String(a.compRatePct) : "",
      appointedStates: Array.isArray(a.appointedStates) ? a.appointedStates : [],
      notes: a.notes || "",
      active: a.active !== false,
    });
    setAddOpen(true);
  };

  const toggleState = (st) => setDraft(d => ({
    ...d,
    appointedStates: d.appointedStates.includes(st)
      ? d.appointedStates.filter(x => x !== st)
      : [...d.appointedStates, st],
  }));

  const save = async () => {
    const carrier = carrierById[draft.carrierId];
    const carrierName = (draft.carrierName || (carrier && carrier.name) || "").trim();
    if (!carrierName) {
      window.toast && window.toast("Pick a carrier or enter a name", "danger");
      return;
    }
    const comp = draft.compRatePct === "" ? null : Number(draft.compRatePct);
    try {
      await window.AppData.mutate.agencyAppointmentUpsert({
        id: draft.id || undefined,
        carrierId: draft.carrierId || null,
        carrierName,
        npn: draft.npn.trim() || null,
        compRatePct: comp,
        appointedStates: draft.appointedStates,
        notes: draft.notes.trim() || null,
        active: draft.active,
      });
      setAddOpen(false);
      setDraft(emptyDraft());
      window.toast && window.toast(draft.id ? "Appointment saved" : "Appointment added", "success");
    } catch (_e) {}
  };

  const remove = async (id) => {
    if (!confirm("Remove this carrier appointment? This can't be undone.")) return;
    try { await window.AppData.mutate.agencyAppointmentDelete(id); window.toast && window.toast("Removed", "info"); }
    catch (_e) {}
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="panel">
        <div className="panel-h">
          <Icons.Shield size={13}/>
          <h3>My agency's carrier appointments</h3>
          <span className="meta">{appts.length}</span>
          {canEdit && (
            <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={openCreate}>
              <Icons.Plus size={12}/> New appointment
            </button>
          )}
        </div>
        {appts.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center" }}>
            <code className="mono koino-empty" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>no-appointments</code>
            {canEdit && (
              <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-tertiary)" }}>
                Click <strong style={{ color: "var(--text-secondary)" }}>New appointment</strong> after you've been appointed with your first carrier.
              </div>
            )}
          </div>
        ) : (
          <div className="list">
            <div className="list-h" style={{ gridTemplateColumns: "1.6fr 80px 90px 1.4fr 80px 60px" }}>
              <div>Carrier</div><div>NPN</div><div className="tabular" style={{ textAlign: "right" }}>Comp %</div><div>States</div><div>Status</div><div></div>
            </div>
            {appts.map(a => (
              <div key={a.id} className="row" style={{ gridTemplateColumns: "1.6fr 80px 90px 1.4fr 80px 60px" }}>
                <div style={{ fontWeight: 500, fontSize: 12.5 }}>
                  {a.carrierName || (carrierById[a.carrierId] && carrierById[a.carrierId].name) || "—"}
                  {a.notes && <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }} className="cell-truncate">{a.notes}</div>}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }} className="mono">{a.npn || "—"}</div>
                <div className="tabular" style={{ textAlign: "right", fontSize: 11.5 }}>{a.compRatePct != null ? `${a.compRatePct}%` : "—"}</div>
                <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                  {a.appointedStates.length === 0
                    ? <span style={{ color: "var(--text-quaternary)", fontSize: 11.5 }}>—</span>
                    : a.appointedStates.slice(0, 6).map(s => <span key={s} className="chip" style={{ fontSize: 9.5 }}>{s}</span>)}
                  {a.appointedStates.length > 6 && (
                    <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>+{a.appointedStates.length - 6}</span>
                  )}
                </div>
                <div><span className={`chip ${a.active ? "chip-money" : ""}`}>{a.active ? "active" : "inactive"}</span></div>
                {canEdit
                  ? (
                    <div style={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
                      <button className="icon-btn" onClick={() => openEdit(a)} title="Edit"><Icons.Edit size={11}/></button>
                      <button className="icon-btn" onClick={() => remove(a.id)} title="Delete" style={{ color: "var(--state-danger)" }}><Icons.X size={11}/></button>
                    </div>
                  )
                  : <div/>}
              </div>
            ))}
          </div>
        )}
      </div>

      {(carriers || []).length > 0 && <VaultCarriersBlock carriers={carriers}/>}

      {addOpen && (
        <Shared.Modal title={draft.id ? "Edit carrier appointment" : "New carrier appointment"} width={720} onClose={() => setAddOpen(false)} actions={
          <>
            <button className="btn btn-ghost" onClick={() => setAddOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save}><Icons.Check size={11}/> {draft.id ? "Save changes" : "Add appointment"}</button>
          </>
        }>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Shared.Field label="Carrier (from directory)">
              <Shared.Select value={draft.carrierId} onChange={v => setDraft({ ...draft, carrierId: v })}
                options={[{ v: "", l: "— Custom (type name below) —" }, ...carriers.map(c => ({ v: c.id, l: c.name }))]}/>
            </Shared.Field>
            <Shared.Field label="Custom carrier name (if not in directory)">
              <input className="text-input" value={draft.carrierName}
                onChange={e => setDraft({ ...draft, carrierName: e.target.value })}
                placeholder="Leave blank to use directory pick"/>
            </Shared.Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 1fr", gap: 12 }}>
            <Shared.Field label="NPN">
              <input className="text-input" value={draft.npn}
                onChange={e => setDraft({ ...draft, npn: e.target.value })}
                placeholder="Agency NPN with this carrier"/>
            </Shared.Field>
            <Shared.Field label="Comp % (target)">
              <input className="text-input" type="number" step="0.5" value={draft.compRatePct}
                onChange={e => setDraft({ ...draft, compRatePct: e.target.value })}
                placeholder="22"/>
            </Shared.Field>
            <Shared.Field label="Status">
              <Shared.Select value={draft.active ? "active" : "inactive"} onChange={v => setDraft({ ...draft, active: v === "active" })}
                options={[{ v: "active", l: "Active" }, { v: "inactive", l: "Inactive / terminated" }]}/>
            </Shared.Field>
          </div>
          <Shared.Field label={`Appointed states (${draft.appointedStates.length} selected)`}>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", maxHeight: 140, overflowY: "auto", padding: 4, background: "var(--bg-raised)", borderRadius: 6 }}>
              {US_STATES.map(st => {
                const on = draft.appointedStates.includes(st);
                return (
                  <button key={st} type="button" onClick={() => toggleState(st)}
                    className="chip"
                    style={{
                      cursor: "pointer", padding: "3px 8px", fontSize: 10.5,
                      background: on ? "rgba(0, 212, 170, 0.14)" : "var(--bg-overlay)",
                      color: on ? "var(--accent-money)" : "var(--text-tertiary)",
                      borderColor: on ? "var(--accent-money)" : "var(--border-subtle)",
                      fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                    }}>{st}</button>
                );
              })}
            </div>
          </Shared.Field>
          <Shared.Field label="Notes (optional)">
            <textarea className="text-input" rows={2} value={draft.notes}
              onChange={e => setDraft({ ...draft, notes: e.target.value })}
              placeholder="Anything that matters about this appointment — release rules, comp clawback windows, etc."
              style={{ width: "100%", lineHeight: 1.55 }}/>
          </Shared.Field>
        </Shared.Modal>
      )}
    </div>
  );
}

/* ── Vault: Quick links (grouped by category) ── */
function VaultLinksBlock({ links }) {
  if (!links.length) {
    return (
      <div className="panel" style={{ padding: 32, textAlign: "center" }}>
        <code className="mono koino-empty" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>no-quick-links</code>
      </div>
    );
  }
  const groups = links.reduce((acc, l) => { (acc[l.cat || "Internal"] ||= []).push(l); return acc; }, {});
  return (
    <div className="panel">
      <div className="panel-h"><Icons.ArrowUpRight size={13}/><h3>Quick links</h3><span className="meta">{links.length}</span></div>
      <div style={{ padding: 14 }}>
        {Object.entries(groups).map(([cat, items]) => (
          <div key={cat} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{cat}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 6 }}>
              {items.map(l => (
                <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer"
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "var(--bg-raised)", borderRadius: 5, color: "var(--text-primary)", textDecoration: "none" }}>
                  <Icons.ArrowUpRight size={11} style={{ color: "var(--text-tertiary)" }}/>
                  <span className="cell-truncate" style={{ fontSize: 12, fontWeight: 500 }}>{l.label}</span>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Vault: Quick links pane (Block + create modal) ── */
const LINK_CATS = ["Carrier portal","Compliance","Internal","Training","Other"];

function VaultLinksPane({ links, canEdit }) {
  const [addOpen, setAddOpen] = React.useState(false);
  const emptyDraft = () => ({ id: null, label: "", url: "", cat: "Internal", sortOrder: 0 });
  const [draft, setDraft] = React.useState(emptyDraft());

  const openCreate = () => { setDraft(emptyDraft()); setAddOpen(true); };
  const openEdit   = (l) => { setDraft({
    id: l.id, label: l.label || "", url: l.url || "",
    cat: l.cat || "Internal", sortOrder: l.sortOrder || 0,
  }); setAddOpen(true); };

  const save = async () => {
    const label = draft.label.trim();
    const raw   = draft.url.trim();
    if (!label || !raw) return;
    const safeUrl = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      await window.AppData.mutate.quickLinkUpsert({
        id: draft.id || undefined,
        label, url: safeUrl, cat: draft.cat, sortOrder: Number(draft.sortOrder) || 0,
      });
      setAddOpen(false);
      setDraft(emptyDraft());
      window.toast && window.toast(draft.id ? "Link saved" : "Link added", "success");
    } catch (_e) {}
  };
  const remove = async (id) => {
    if (!confirm("Delete this link?")) return;
    try { await window.AppData.mutate.quickLinkDelete(id); window.toast && window.toast("Link removed", "info"); }
    catch (_e) {}
  };

  const groups = links.reduce((acc, l) => { (acc[l.cat || "Internal"] ||= []).push(l); return acc; }, {});
  return (
    <div className="panel">
      <div className="panel-h">
        <Icons.ArrowUpRight size={13}/><h3>Quick links</h3><span className="meta">{links.length}</span>
        {canEdit && (
          <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={openCreate}>
            <Icons.Plus size={12}/> New link
          </button>
        )}
      </div>
      {links.length === 0 ? (
        <div style={{ padding: 36, textAlign: "center" }}>
          <code className="mono koino-empty" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>no-quick-links</code>
          {canEdit && (
            <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-tertiary)" }}>
              Pin carrier portals, the AHIP training site, the CMS TPMO PDF — anywhere reps need fast access mid-call.
            </div>
          )}
        </div>
      ) : (
        <div style={{ padding: 14 }}>
          {Object.entries(groups).map(([cat, items]) => (
            <div key={cat} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{cat}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 6 }}>
                {items.map(l => (
                  <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", background: "var(--bg-raised)", borderRadius: 5 }}>
                    <a href={l.url} target="_blank" rel="noopener noreferrer"
                      style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, color: "var(--text-primary)", textDecoration: "none", minWidth: 0 }}>
                      <Icons.ArrowUpRight size={11} style={{ color: "var(--text-tertiary)", flexShrink: 0 }}/>
                      <span className="cell-truncate" style={{ fontSize: 12, fontWeight: 500 }}>{l.label}</span>
                    </a>
                    {canEdit && (
                      <>
                        <button className="icon-btn" onClick={() => openEdit(l)} title="Edit"><Icons.Edit size={11}/></button>
                        <button className="icon-btn" onClick={() => remove(l.id)} title="Delete" style={{ color: "var(--state-danger)" }}><Icons.X size={11}/></button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {addOpen && (
        <Shared.Modal title={draft.id ? "Edit quick link" : "New quick link"} width={520} onClose={() => setAddOpen(false)} actions={
          <>
            <button className="btn btn-ghost" onClick={() => setAddOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={!draft.label.trim() || !draft.url.trim()}>
              <Icons.Check size={11}/> {draft.id ? "Save changes" : "Add link"}
            </button>
          </>
        }>
          <Shared.Field label="Label">
            <input className="text-input" autoFocus value={draft.label}
              onChange={e => setDraft({ ...draft, label: e.target.value })}
              placeholder="UHC Producer Portal"/>
          </Shared.Field>
          <Shared.Field label="URL">
            <input className="text-input" value={draft.url}
              onChange={e => setDraft({ ...draft, url: e.target.value })}
              placeholder="https://uhcjarvis.com/"/>
          </Shared.Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 12 }}>
            <Shared.Field label="Category">
              <Shared.Select value={draft.cat} onChange={v => setDraft({ ...draft, cat: v })}
                options={LINK_CATS.map(c => ({ v: c, l: c }))}/>
            </Shared.Field>
            <Shared.Field label="Sort order">
              <input className="text-input" type="number" value={draft.sortOrder}
                onChange={e => setDraft({ ...draft, sortOrder: e.target.value })}/>
            </Shared.Field>
          </div>
        </Shared.Modal>
      )}
    </div>
  );
}

/* ── Vault: Segments preview block on All tab — names only, deep-link to Segments tab ── */
function VaultSegmentsListBlock({ segments, onOpen }) {
  return (
    <div className="panel">
      <div className="panel-h">
        <Icons.Bookmark size={13}/><h3>Segments</h3><span className="meta">{segments.length}</span>
        <button className="btn btn-ghost" style={{ marginLeft: "auto", padding: "2px 10px", fontSize: 11 }} onClick={onOpen}>
          Open <Icons.ArrowUpRight size={10}/>
        </button>
      </div>
      <div style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
        {segments.map(s => (
          <div key={s.id} style={{ padding: 10, background: "var(--bg-raised)", borderRadius: 6, border: "1px solid var(--border-subtle)" }}>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>{s.name}</div>
            {s.description && <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4, lineHeight: 1.4 }}>{s.description}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Vault: Coaching pane — recordings / notes / sessions ──────────────── */
function VaultCoachingPane({ role }) {
  const [sub, setSub] = React.useState("recordings");
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const fn = () => force(n => n + 1);
    ["data:hydrated","data:mutated","data:realtime"].forEach(e => window.addEventListener(e, fn));
    return () => ["data:hydrated","data:mutated","data:realtime"].forEach(e => window.removeEventListener(e, fn));
  }, []);

  const meRepId = (window.me && window.me()?.rep_id) || null;
  const allRecs  = (window.AppData && window.AppData.RECORDINGS) || [];
  const recordings = role === "rep" && meRepId
    ? allRecs.filter(r => r.repId === meRepId || r.isCoachingExample)
    : allRecs;
  const notes    = (window.AppData && window.AppData.COACHING_NOTES)    || [];
  const sessions = (window.AppData && window.AppData.COACHING_SESSIONS) || [];

  const SUBS = [["recordings","Call Recordings"],["notes","Coaching Notes"],["sessions","Sessions"]];
  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
        {SUBS.map(([k, l]) => (
          <button key={k} onClick={() => setSub(k)} className="btn btn-ghost"
            style={{ fontSize: 12, padding: "4px 12px", background: sub === k ? "var(--bg-raised)" : "transparent", color: sub === k ? "var(--text-primary)" : "var(--text-tertiary)" }}>
            {l}
          </button>
        ))}
      </div>
      {sub === "recordings" && <VaultRecordingsPane recordings={recordings} role={role}/>}
      {sub === "notes"      && <VaultNotesPane notes={notes}/>}
      {sub === "sessions"   && <VaultSessionsPane sessions={sessions}/>}
    </div>
  );
}

function VaultRecordingsPane({ recordings, role }) {
  const { REPS } = AppData;
  const repById = Object.fromEntries(REPS.map(r => [r.id, r]));
  const [q, setQ]               = React.useState("");
  const [repFilter, setRepFilter] = React.useState("all");
  const filtered = recordings.filter(r =>
    (!q || (r.lead || "").toLowerCase().includes(q.toLowerCase())) &&
    (repFilter === "all" || r.repId === repFilter)
  );
  return (
    <div className="panel">
      <div className="panel-h">
        <Icons.Headset size={13}/>
        <h3>Call Recordings</h3>
        <span className="meta">{filtered.length}</span>
        <input className="text-input" style={{ width: 200, marginLeft: "auto" }} placeholder="Search lead…" value={q} onChange={e => setQ(e.target.value)}/>
        {role !== "rep" && REPS.length > 0 && (
          <select className="text-input" style={{ width: 140 }} value={repFilter} onChange={e => setRepFilter(e.target.value)}>
            <option value="all">All reps</option>
            {REPS.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        )}
      </div>
      {filtered.length === 0 ? (
        <div style={{ padding: 32, textAlign: "center" }}>
          <code className="mono" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>no-recordings</code>
        </div>
      ) : (
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1fr 130px 90px 70px 70px" }}>
            <div>Lead</div><div>Rep</div><div>Date</div><div>Score</div><div>Duration</div>
          </div>
          {filtered.map(r => (
            <div key={r.id} className="row" style={{ gridTemplateColumns: "1fr 130px 90px 70px 70px" }}>
              <div style={{ fontWeight: 500, fontSize: 12.5 }}>{r.lead || "—"}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Shared.Avatar rep={repById[r.repId]} size={16}/>
                <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{repById[r.repId]?.name?.split(" ")[0] || "—"}</span>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{r.date || "—"}</div>
              <div>
                {r.score != null
                  ? <span className={`chip ${r.score >= 80 ? "chip-money" : r.score >= 60 ? "chip-status" : ""}`}>{r.score}</span>
                  : <span style={{ color: "var(--text-quaternary)", fontSize: 11.5 }}>—</span>}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }} className="mono">
                {r.durSec ? `${Math.floor(r.durSec/60)}:${String(r.durSec%60).padStart(2,"0")}` : "—"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VaultNotesPane({ notes }) {
  return (
    <div className="panel">
      <div className="panel-h"><Icons.FileText size={13}/><h3>Coaching Notes</h3><span className="meta">{notes.length}</span></div>
      {notes.length === 0 ? (
        <div style={{ padding: 32, textAlign: "center" }}>
          <code className="mono" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>no-coaching-notes</code>
        </div>
      ) : (
        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8, maxHeight: 480, overflowY: "auto" }}>
          {notes.map(n => (
            <div key={n.id} style={{ padding: 12, background: "var(--bg-raised)", borderRadius: 6, border: "1px solid var(--border-subtle)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}>{n.repId || "Rep"}</span>
                <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{n.createdAt ? new Date(n.createdAt).toLocaleDateString() : "—"}</span>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text-primary)", lineHeight: 1.55 }}>{n.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VaultSessionsPane({ sessions }) {
  return (
    <div className="panel">
      <div className="panel-h"><Icons.Calendar size={13}/><h3>Coaching Sessions</h3><span className="meta">{sessions.length}</span></div>
      {sessions.length === 0 ? (
        <div style={{ padding: 32, textAlign: "center" }}>
          <code className="mono" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>no-sessions</code>
        </div>
      ) : (
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1fr 120px 110px 90px" }}>
            <div>Focus</div><div>Rep</div><div>Scheduled</div><div>Status</div>
          </div>
          {sessions.map(s => (
            <div key={s.id} className="row" style={{ gridTemplateColumns: "1fr 120px 110px 90px" }}>
              <div style={{ fontWeight: 500, fontSize: 12.5 }}>{s.focusArea || "Coaching session"}</div>
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{s.repId || "—"}</div>
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{s.scheduledAt ? new Date(s.scheduledAt).toLocaleDateString() : "—"}</div>
              <div><span className={`chip ${s.outcome === "completed" || s.completedAt ? "chip-money" : ""}`}>{s.completedAt ? "completed" : "scheduled"}</span></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Vault: per-mime preview renderer for docs.
   Inline-renders PDFs, images, video/audio, and Google Docs URLs in an iframe.
   Falls back to "Open in new tab" for unknown formats. ── */
function DocPreviewBody({ doc, url }) {
  if (!url) {
    return <div style={{ padding: 30, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>Loading preview…</div>;
  }
  const mime = (doc.mime || "").toLowerCase();
  const ext  = (doc.ext  || "").toLowerCase();
  const isPdf   = mime.includes("pdf")   || ext === "pdf";
  const isImage = mime.startsWith("image/") || /^(png|jpe?g|gif|webp|svg|bmp)$/i.test(ext);
  const isVideo = mime.startsWith("video/") || /^(mp4|webm|mov|m4v)$/i.test(ext);
  const isAudio = mime.startsWith("audio/") || /^(mp3|wav|m4a|ogg)$/i.test(ext);
  const isGdoc  = /\bdocs\.google\.com|docs\.google|drive\.google|sheets\.google|slides\.google\b/i.test(url);

  const frame = (src) => (
    <iframe src={src} title={doc.title}
      style={{ width: "100%", height: 540, border: "1px solid var(--border-subtle)", borderRadius: 6, background: "white" }}
      allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen/>
  );

  return (
    <div>
      {isPdf   && frame(url)}
      {isImage && <img src={url} alt={doc.title} style={{ maxWidth: "100%", maxHeight: 600, borderRadius: 6, background: "var(--bg-raised)" }}/>}
      {isVideo && <video src={url} controls style={{ width: "100%", maxHeight: 540, background: "black", borderRadius: 6 }}/>}
      {isAudio && <audio src={url} controls style={{ width: "100%" }}/>}
      {!isPdf && !isImage && !isVideo && !isAudio && isGdoc && frame(url.replace(/\/edit.*$/, "/preview"))}
      {!isPdf && !isImage && !isVideo && !isAudio && !isGdoc && (
        <div style={{ padding: 20, textAlign: "center", background: "var(--bg-raised)", borderRadius: 6, color: "var(--text-tertiary)", fontSize: 12.5 }}>
          Inline preview not supported for this file type.
          <div style={{ marginTop: 10 }}>
            <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ display: "inline-flex" }}>
              <Icons.ArrowUpRight size={11}/> Open in new tab
            </a>
          </div>
        </div>
      )}
      <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--text-tertiary)" }}>
        <span className="chip" style={{ fontSize: 9.5 }}>{doc.kind || "link"}</span>
        {doc.cat && <span className="chip" style={{ fontSize: 9.5 }}>{doc.cat}</span>}
        {doc.sizeBytes ? <span>{(doc.sizeBytes/1024/1024).toFixed(1)}MB</span> : null}
        {doc.mime ? <code className="mono" style={{ fontSize: 10.5 }}>{doc.mime}</code> : null}
        <a href={url} target="_blank" rel="noopener noreferrer" style={{ marginLeft: "auto", color: "var(--text-secondary)" }}>
          Open in new tab <Icons.ArrowUpRight size={10}/>
        </a>
      </div>
    </div>
  );
}

/* ── Vault: Documents pane ─────────────────────────────────────────────── */
function VaultDocsPane({ canEdit }) {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const fn = () => force(n => n + 1);
    ["data:hydrated","data:mutated","data:realtime"].forEach(e => window.addEventListener(e, fn));
    return () => ["data:hydrated","data:mutated","data:realtime"].forEach(e => window.removeEventListener(e, fn));
  }, []);

  const docs = (window.AppData && window.AppData.DOCS) || [];
  const segments = (window.AppData && window.AppData.SEGMENTS) || [];
  const [q, setQ]           = React.useState("");
  const [catFilter, setCat] = React.useState("All");
  const [addOpen, setAddOpen] = React.useState(false);
  const [preview, setPreview] = React.useState(null);   // currently-previewing doc row
  const [previewUrl, setPreviewUrl] = React.useState("");
  const [uploading, setUploading]   = React.useState(false);
  const emptyDocDraft = () => ({
    id: null, title: "", cat: "Internal", url: "",
    segmentId: null, targetRoles: ["owner","manager","rep"],
    kind: "link", storagePath: null, ext: null, sizeBytes: null, mime: null,
  });
  const [draft, setDraft]   = React.useState(emptyDocDraft());
  const openCreate = () => { setDraft(emptyDocDraft()); setAddOpen(true); };
  const openEdit   = (d) => {
    setDraft({
      id: d.id, title: d.title || "", cat: d.cat || "Internal",
      url: d.url || "", segmentId: d.segmentId || null,
      targetRoles: Array.isArray(d.targetRoles) && d.targetRoles.length > 0
        ? d.targetRoles : ["owner","manager","rep"],
      kind: d.kind || "link", storagePath: d.storagePath || null,
      ext: d.ext || null, sizeBytes: d.sizeBytes || null, mime: null,
    });
    setAddOpen(true);
  };

  // Drag+drop upload — accepts any file under the bucket's 500MB limit.
  // Stores in vault/{agency_id}/docs/... then sets the draft to a 'upload' kind row.
  const ingestFile = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const up = await window.AppData.mutate.storageUpload(file, "docs");
      const extMatch = (file.name || "").match(/\.([a-z0-9]{1,8})$/i);
      const ext = extMatch ? extMatch[1].toLowerCase() : null;
      setDraft(d => ({
        ...d,
        title: d.title || file.name.replace(/\.[a-z0-9]+$/i, ""),
        url: up.signedUrl || "",
        kind: "upload",
        storagePath: up.path,
        ext, sizeBytes: up.sizeBytes, mime: up.mime,
      }));
      window.toast && window.toast(`Uploaded ${file.name}`, "success");
    } catch (e) {
      window.toast && window.toast(`Upload failed: ${e.message || e}`, "danger");
    } finally {
      setUploading(false);
    }
  };
  const onDrop = async (e) => {
    e.preventDefault();
    if (!canEdit) return;
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length === 0) return;
    if (!addOpen) { setDraft(emptyDocDraft()); setAddOpen(true); }
    await ingestFile(files[0]);
  };
  const onDragOver = (e) => { e.preventDefault(); };

  // Open a doc preview — uploads get re-signed; links open inline iframe.
  const openPreview = async (d) => {
    setPreview(d); setPreviewUrl("");
    if (d.kind === "upload" && d.storagePath) {
      const url = await window.AppData.mutate.storageSign(d.storagePath, 3600);
      setPreviewUrl(url || "");
    } else if (d.url) {
      setPreviewUrl(d.url);
    }
  };

  const cats = ["All", ...Array.from(new Set(docs.map(d => d.cat).filter(Boolean)))];
  const filtered = docs.filter(d =>
    (catFilter === "All" || d.cat === catFilter) &&
    (!q || d.title.toLowerCase().includes(q.toLowerCase()))
  );

  const addDoc = async () => {
    const title = draft.title.trim();
    if (!title) return;
    if (!Array.isArray(draft.targetRoles) || draft.targetRoles.length === 0) {
      window.toast && window.toast("Pick at least one role under Visible to", "error");
      return;
    }
    const raw = draft.url.trim();
    const safeUrl = raw ? (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`) : "";
    try {
      await window.AppData.mutate.docUpsert({
        id: draft.id || undefined,
        title, cat: draft.cat, url: safeUrl,
        kind: draft.kind || (draft.storagePath ? "upload" : "link"),
        ext: draft.ext || null,
        sizeBytes: draft.sizeBytes || null,
        storagePath: draft.storagePath || null,
        segmentId: draft.segmentId || null,
        targetRoles: draft.targetRoles,
      });
      setDraft(emptyDocDraft());
      setAddOpen(false);
      window.toast && window.toast(draft.id ? "Document saved" : "Document added", "success");
    } catch (e) { window.toast?.(`Document save failed: ${e?.message || e}`, "error"); console.error("[vault.docUpsert]", e); }
  };

  const removeDoc = async (id) => {
    try { await window.AppData.mutate.docDelete(id); window.toast && window.toast("Removed", "info"); }
    catch (e) { window.toast?.(`Document delete failed: ${e?.message || e}`, "error"); console.error("[vault.docDelete]", e); }
  };

  return (
    <div className="panel" onDrop={onDrop} onDragOver={onDragOver}
      style={{ position: "relative" }}>
      {uploading && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 5 }}>
          <div style={{ padding: "12px 18px", background: "var(--bg-raised)", borderRadius: 6, fontSize: 12, color: "var(--text-secondary)" }}>
            Uploading…
          </div>
        </div>
      )}
      <div className="panel-h">
        <Icons.Folder size={13}/>
        <h3>Documents</h3>
        <span className="meta">{filtered.length} of {docs.length}</span>
        <input className="text-input" style={{ width: 200, marginLeft: "auto" }} placeholder="Search docs…" value={q} onChange={e => setQ(e.target.value)}/>
        {canEdit && <button className="btn btn-primary" onClick={openCreate}><Icons.Plus size={12}/> Add doc</button>}
      </div>
      {canEdit && (
        <div style={{ padding: "6px 14px", fontSize: 11, color: "var(--text-quaternary)", fontStyle: "italic" }}>
          Drag any file (PDF, image, video, slide deck) onto this panel to upload it to the agency vault.
        </div>
      )}
      <div style={{ padding: "8px 14px 0", display: "flex", gap: 4, flexWrap: "wrap" }}>
        {cats.map(c => (
          <button key={c} className="btn btn-ghost" onClick={() => setCat(c)}
            style={{ padding: "4px 10px", fontSize: 11.5, background: catFilter===c ? "var(--bg-raised)" : "transparent", color: catFilter===c ? "var(--text-primary)" : "var(--text-tertiary)" }}>
            {c}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div style={{ padding: 32, textAlign: "center" }}>
          <code className="mono" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>no-documents</code>
          {canEdit && <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-tertiary)" }}>Click <strong style={{ color: "var(--text-secondary)" }}>Add doc</strong> to paste a link or import.</div>}
        </div>
      ) : (
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1fr 120px 80px 60px" }}>
            <div>Title</div><div>Category</div><div>Kind</div><div></div>
          </div>
          {filtered.map(d => (
            <div key={d.id} className="row" style={{ gridTemplateColumns: "1fr 120px 80px 60px" }}>
              <div style={{ fontWeight: 500, fontSize: 12.5, display: "flex", alignItems: "center", gap: 8 }}>
                <Icons.FileText size={11} style={{ color: "var(--text-tertiary)", flexShrink: 0 }}/>
                {(d.url || d.storagePath)
                  ? <span className="cell-truncate" style={{ cursor: "pointer", color: "inherit" }} onClick={() => openPreview(d)}>{d.title}</span>
                  : <span className="cell-truncate">{d.title}</span>}
                {d.kind === "upload" && d.sizeBytes ? <span style={{ fontSize: 10.5, color: "var(--text-quaternary)" }}>· {(d.sizeBytes/1024/1024).toFixed(1)}MB</span> : null}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{d.cat || "—"}</div>
              <div><span className="chip">{d.kind || "link"}</span></div>
              {canEdit
                ? (
                  <div style={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
                    <button className="icon-btn" onClick={() => openEdit(d)} title="Edit"><Icons.Edit size={11}/></button>
                    <button className="icon-btn" onClick={() => removeDoc(d.id)} title="Delete" style={{ color: "var(--state-danger)" }}><Icons.X size={11}/></button>
                  </div>
                )
                : <div/>}
            </div>
          ))}
        </div>
      )}
      {addOpen && (
        <Shared.Modal title={draft.id ? "Edit document" : "Add document"} width={520} onClose={() => setAddOpen(false)} actions={
          <>
            <button className="btn btn-ghost" onClick={() => setAddOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={addDoc}
              disabled={!draft.title.trim() || draft.targetRoles.length === 0}>
              <Icons.Check size={11}/> {draft.id ? "Save changes" : "Add"}
            </button>
          </>
        }>
          <Shared.Field label="Title">
            <input className="text-input" value={draft.title} onChange={e => setDraft({...draft, title: e.target.value})} placeholder="Employee handbook" autoFocus/>
          </Shared.Field>
          <Shared.Field label="Category">
            <Shared.Select value={draft.cat} onChange={v => setDraft({...draft, cat: v})} options={["Internal","Training","Carrier","Compliance","Other"].map(c => ({v:c,l:c}))}/>
          </Shared.Field>
          <Shared.Field label="Source — paste a URL or upload a file">
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, alignItems: "center" }}>
              <input className="text-input" value={draft.url}
                onChange={e => setDraft({...draft, url: e.target.value, kind: "link", storagePath: null})}
                placeholder={draft.storagePath ? "(uploaded file)" : "https://docs.google.com/…"}
                readOnly={!!draft.storagePath}/>
              <label className="btn btn-ghost" style={{ cursor: "pointer", whiteSpace: "nowrap" }}>
                <Icons.ArrowUpRight size={11}/> Upload
                <input type="file" style={{ display: "none" }} onChange={e => ingestFile(e.target.files?.[0])}/>
              </label>
            </div>
            {draft.storagePath && (
              <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginTop: 4 }}>
                Stored at <code className="mono">{draft.storagePath}</code>
                {draft.sizeBytes ? ` · ${(draft.sizeBytes/1024/1024).toFixed(1)}MB` : ""}
                {draft.mime ? ` · ${draft.mime}` : ""}
              </div>
            )}
          </Shared.Field>
          <Shared.Field label="Segment (optional)">
            <Shared.Select value={draft.segmentId || ""} onChange={v => setDraft({ ...draft, segmentId: v || null })}
              options={[{ v: "", l: "— No segment —" }, ...segments.map(s => ({ v: s.id, l: s.name }))]}/>
          </Shared.Field>
          <RoleVisibilityField value={draft.targetRoles} onChange={v => setDraft({ ...draft, targetRoles: v })}/>
        </Shared.Modal>
      )}

      {preview && (
        <Shared.Modal title={preview.title} width={920} onClose={() => { setPreview(null); setPreviewUrl(""); }}>
          <DocPreviewBody doc={preview} url={previewUrl}/>
        </Shared.Modal>
      )}
    </div>
  );
}

/* ── Vault: Segments pane ──────────────────────────────────────────────── */
const SEGMENT_FIELDS = [
  { v: "state",      l: "State"        },
  { v: "product",    l: "Product"      },
  { v: "source",     l: "Lead source"  },
  { v: "tier",       l: "Lead tier"    },
  { v: "stage",      l: "Stage"        },
  { v: "age",        l: "Age"          },
  { v: "ap_cents",   l: "Annual prem"  },
  { v: "days",       l: "Days in stage"},
];
const SEGMENT_OPS = [
  { v: "eq",        l: "equals"       },
  { v: "neq",       l: "not equals"   },
  { v: "in",        l: "is one of"    },
  { v: "contains",  l: "contains"     },
  { v: "gt",        l: "greater than" },
  { v: "lt",        l: "less than"    },
];

function VaultSegmentsPane({ canEdit }) {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const fn = () => force(n => n + 1);
    ["data:hydrated","data:mutated","data:realtime"].forEach(e => window.addEventListener(e, fn));
    return () => ["data:hydrated","data:mutated","data:realtime"].forEach(e => window.removeEventListener(e, fn));
  }, []);

  const segments = (window.AppData && window.AppData.SEGMENTS) || [];
  const docs     = (window.AppData && window.AppData.DOCS)        || [];
  const scripts  = (window.AppData && window.AppData.SCRIPTS_LIB) || [];
  const videos   = (window.AppData && window.AppData.VIDEOS)      || [];

  const [selId, setSelId]   = React.useState(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const emptySegDraft = () => ({ id: null, name: "", description: "", filterRules: [] });
  const [draft, setDraft]   = React.useState(emptySegDraft());

  const sel        = segments.find(s => s.id === selId) || null;
  const segDocs    = docs.filter(d => d.segmentId === selId);
  const segScripts = scripts.filter(s => s.segmentId === selId);
  const segVideos  = videos.filter(v => v.segmentId === selId);

  const addRule    = () => setDraft(d => ({ ...d, filterRules: [...d.filterRules, { field: "state", op: "eq", value: "" }] }));
  const updateRule = (i, patch) => setDraft(d => ({ ...d, filterRules: d.filterRules.map((r, j) => j === i ? { ...r, ...patch } : r) }));
  const removeRule = (i) => setDraft(d => ({ ...d, filterRules: d.filterRules.filter((_, j) => j !== i) }));

  const openCreate = () => { setDraft(emptySegDraft()); setAddOpen(true); };
  const openEdit   = (s) => {
    setDraft({
      id: s.id, name: s.name || "", description: s.description || "",
      filterRules: Array.isArray(s.filterRules) ? s.filterRules : [],
    });
    setAddOpen(true);
  };

  const saveSegment = async () => {
    if (!draft.name.trim()) return;
    try {
      const sb       = window.getSupabase && window.getSupabase();
      const agencyId = window.getActiveAgencyId && window.getActiveAgencyId();
      if (!sb || !agencyId) { window.toast && window.toast("Not connected", "error"); return; }
      // Strip empty-value rules so the segment never carries dead filters.
      const rules = draft.filterRules.filter(r => r.field && r.op && (r.value !== "" && r.value != null));
      const payload = {
        agency_id:   agencyId,
        name:        draft.name.trim(),
        description: draft.description.trim() || null,
        filter_rules: rules,
      };
      let resp;
      if (draft.id) {
        resp = await sb.from("vault_segments").update(payload).eq("id", draft.id).select().single();
      } else {
        resp = await sb.from("vault_segments").insert({ ...payload, sort_order: segments.length }).select().single();
      }
      let { data, error } = resp;
      if (error && /column .* does not exist/i.test(error.message || "")) {
        console.warn("[vault] filter_rules column missing — retrying without");
        delete payload.filter_rules;
        if (draft.id) ({ data, error } = await sb.from("vault_segments").update(payload).eq("id", draft.id).select().single());
        else          ({ data, error } = await sb.from("vault_segments").insert({ ...payload, sort_order: segments.length }).select().single());
      }
      if (error) throw error;
      const jsRow = {
        id: data.id, agencyId: data.agency_id,
        name: data.name, description: data.description || null,
        sortOrder: data.sort_order,
        filterRules: Array.isArray(data.filter_rules) ? data.filter_rules : rules,
        isStarter: !!data.is_starter,
      };
      if (draft.id) {
        window.AppData.SEGMENTS = segments.map(s => s.id === draft.id ? jsRow : s);
      } else {
        window.AppData.SEGMENTS = [...segments, jsRow];
      }
      window.dispatchEvent(new CustomEvent("data:mutated"));
      setDraft(emptySegDraft());
      setAddOpen(false);
      setSelId(data.id);
      window.toast && window.toast(draft.id ? "Segment saved" : "Segment created", "success");
    } catch (_e) {
      window.toast && window.toast(draft.id ? "Failed to save segment" : "Failed to create segment", "error");
    }
  };

  // Modal body shared by both empty-state and populated-state Add-segment buttons.
  const segmentModal = addOpen && (
    <Shared.Modal title={draft.id ? "Edit segment" : "New segment"} width={620} onClose={() => setAddOpen(false)} actions={
      <>
        <button className="btn btn-ghost" onClick={() => setAddOpen(false)}>Cancel</button>
        <button className="btn btn-primary" onClick={saveSegment} disabled={!draft.name.trim()}>
          <Icons.Check size={11}/> {draft.id ? "Save changes" : "Create"}
        </button>
      </>
    }>
      <Shared.Field label="Name">
        <input className="text-input" value={draft.name}
          onChange={e => setDraft({...draft, name: e.target.value})}
          placeholder="Storm-season Florida warm" autoFocus/>
      </Shared.Field>
      <Shared.Field label="Description (optional)">
        <input className="text-input" value={draft.description}
          onChange={e => setDraft({...draft, description: e.target.value})}
          placeholder="What these leads have in common"/>
      </Shared.Field>
      <Shared.Field label="Filter rules (used later by Lead Drip to target sequences)">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {draft.filterRules.length === 0 && (
            <div style={{ fontSize: 11.5, color: "var(--text-quaternary)", padding: "6px 2px" }}>
              No rules. Segments without rules behave like static tags — add rules to target dynamically.
            </div>
          )}
          {draft.filterRules.map((r, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.4fr 32px", gap: 6, alignItems: "center" }}>
              <Shared.Select value={r.field} onChange={v => updateRule(i, { field: v })} options={SEGMENT_FIELDS}/>
              <Shared.Select value={r.op}    onChange={v => updateRule(i, { op: v })}    options={SEGMENT_OPS}/>
              <input className="text-input" value={r.value}
                onChange={e => updateRule(i, { value: e.target.value })}
                placeholder={r.op === "in" ? "FL, GA, AL" : "value"}/>
              <button className="icon-btn" onClick={() => removeRule(i)} title="Remove rule" style={{ color: "var(--state-danger)" }}>
                <Icons.X size={11}/>
              </button>
            </div>
          ))}
          <button className="btn btn-ghost" style={{ alignSelf: "flex-start", padding: "4px 10px", fontSize: 11.5 }} onClick={addRule}>
            <Icons.Plus size={11}/> Add rule
          </button>
        </div>
      </Shared.Field>
    </Shared.Modal>
  );

  const deleteSegment = async (id) => {
    try {
      const sb = window.getSupabase && window.getSupabase();
      if (sb) await sb.from("vault_segments").delete().eq("id", id);
      window.AppData.SEGMENTS = segments.filter(s => s.id !== id);
      window.dispatchEvent(new CustomEvent("data:mutated"));
      if (selId === id) setSelId(null);
      window.toast && window.toast("Segment removed", "info");
    } catch (e) { window.toast?.(`Segment delete failed: ${e?.message || e}`, "error"); console.error("[vault.segmentDelete]", e); }
  };

  if (segments.length === 0) {
    return (
      <div className="panel" style={{ padding: 40, textAlign: "center" }}>
        <Icons.Bookmark size={22} style={{ color: "var(--text-quaternary)", marginBottom: 10 }}/>
        <code className="mono" style={{ display: "block", fontSize: 12, color: "var(--text-tertiary)", marginBottom: 14 }}>no-segments</code>
        {canEdit ? (
          <>
            <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginBottom: 14, maxWidth: 420, margin: "0 auto 14px" }}>
              Segments are saved filters over leads — Lead Drip uses them to target sequences. Examples: "Storm-season Florida warm", "Med Supp T65 cohort", "Cancelled in last 30 days".
            </div>
            <button className="btn btn-primary" onClick={openCreate}><Icons.Plus size={12}/> Create first segment</button>
          </>
        ) : (
          <div style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>Owner or manager must create segments before they appear here.</div>
        )}
        {segmentModal}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 14 }}>
      <div className="panel">
        <div className="panel-h">
          <Icons.Bookmark size={13}/>
          <h3>Segments</h3>
          {canEdit && (
            <button className="btn btn-primary" style={{ marginLeft: "auto", padding: "3px 10px", fontSize: 11 }} onClick={openCreate}>
              <Icons.Plus size={11}/> New
            </button>
          )}
        </div>
        <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          {segments.map(s => (
            <div key={s.id} onClick={() => setSelId(s.id)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderRadius: 6, cursor: "pointer",
                background: selId === s.id ? "var(--bg-overlay)" : "var(--bg-raised)",
                border: "1px solid var(--border-subtle)" }}>
              <span style={{ fontWeight: 500, fontSize: 12.5, flex: 1 }}>{s.name}</span>
              {s.isStarter && <span className="chip" style={{ fontSize: 9, color: "var(--text-tertiary)", padding: "1px 6px" }}>starter</span>}
              {canEdit && (
                <button className="icon-btn" onClick={e => { e.stopPropagation(); deleteSegment(s.id); }}
                  style={{ color: "var(--state-danger)", padding: 2, flexShrink: 0 }}>
                  <Icons.X size={10}/>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        {!sel ? (
          <div className="panel" style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>
            Select a segment on the left.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="panel">
              <div className="panel-h">
                <h3>{sel.name}</h3>
                {sel.isStarter && <span className="chip" style={{ marginLeft: 8, fontSize: 9.5, color: "var(--text-tertiary)" }}>starter</span>}
                {canEdit && (
                  <button className="btn btn-ghost" style={{ marginLeft: "auto", padding: "2px 10px", fontSize: 11 }} onClick={() => openEdit(sel)}>
                    <Icons.Edit size={11}/> Edit segment
                  </button>
                )}
              </div>
              {sel.description && <div style={{ padding: "0 14px 12px", fontSize: 12.5, color: "var(--text-secondary)" }}>{sel.description}</div>}
              {Array.isArray(sel.filterRules) && sel.filterRules.length > 0 && (
                <div style={{ padding: "0 14px 14px" }}>
                  <div style={{ fontSize: 10.5, color: "var(--text-quaternary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                    Filter rules
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {sel.filterRules.map((r, i) => (
                      <code key={i} className="mono" style={{ fontSize: 11.5, color: "var(--text-secondary)", padding: "4px 8px", background: "var(--bg-raised)", borderRadius: 4 }}>
                        {r.field} <span style={{ color: "var(--text-tertiary)" }}>{r.op}</span> {String(r.value)}
                      </code>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {segDocs.length > 0 && (
              <div className="panel">
                <div className="panel-h"><Icons.Folder size={13}/><h3>Documents</h3><span className="meta">{segDocs.length}</span></div>
                <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                  {segDocs.map(d => (
                    <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: 8, background: "var(--bg-raised)", borderRadius: 6 }}>
                      <Icons.FileText size={11} style={{ color: "var(--text-tertiary)" }}/>
                      <span style={{ fontSize: 12.5, flex: 1 }}>{d.title}</span>
                      {d.url && <a href={d.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ padding: "2px 8px", fontSize: 11 }}><Icons.ArrowUpRight size={10}/></a>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {segScripts.length > 0 && (
              <div className="panel">
                <div className="panel-h"><Icons.FileText size={13}/><h3>Scripts</h3><span className="meta">{segScripts.length}</span></div>
                <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  {segScripts.map(s => (
                    <div key={s.id} style={{ padding: 12, background: "var(--bg-raised)", borderRadius: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <strong style={{ fontSize: 12.5 }}>{s.title}</strong>
                        <button className="btn btn-ghost" style={{ padding: "2px 8px", fontSize: 11 }}
                          onClick={() => navigator.clipboard?.writeText(s.body || "").then(() => window.toast && window.toast("Copied", "success"))}>
                          <Icons.Copy size={10}/> Copy
                        </button>
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.55 }}>
                        {(s.body || "").slice(0, 200)}{(s.body || "").length > 200 ? "…" : ""}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {segVideos.length > 0 && (
              <div className="panel">
                <div className="panel-h"><Icons.Video size={13}/><h3>Videos</h3><span className="meta">{segVideos.length}</span></div>
                <div style={{ padding: 10, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
                  {segVideos.map(v => (
                    <div key={v.id} style={{ background: "var(--bg-raised)", borderRadius: 6, overflow: "hidden", border: "1px solid var(--border-subtle)" }}>
                      <div style={{ position: "relative", paddingTop: "56.25%", background: "var(--bg-overlay)" }}>
                        {v.thumb && <img src={v.thumb} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}/>}
                        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Icons.Play size={14} style={{ color: "white" }}/>
                        </div>
                      </div>
                      <div style={{ padding: "8px 10px", fontSize: 12 }}>{v.title}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {segDocs.length === 0 && segScripts.length === 0 && segVideos.length === 0 && (
              <div className="panel" style={{ padding: 32, textAlign: "center" }}>
                <code className="mono" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>segment-empty</code>
                <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--text-tertiary)" }}>
                  Tag docs, scripts, or videos with this segment to populate it.
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {segmentModal}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   2. Tiering Console — owner power: who decides who's Diamond?
   ───────────────────────────────────────────────────────────────────────── */
function PageTiering() {
  const { REPS } = AppData;
  const TIER_ORDER = ["bronze","silver","gold","platinum","diamond"];

  // Initial rules — editable
  const [rules, setRules] = React.useState({
    bronze:   { mtd: 0,     persistency: 0  },
    silver:   { mtd: 15000, persistency: 70 },
    gold:     { mtd: 25000, persistency: 80 },
    platinum: { mtd: 35000, persistency: 85 },
    diamond:  { mtd: 50000, persistency: 90 },
  });
  // Per-rep overrides
  const [overrides, setOverrides] = React.useState({});
  const [history, setHistory] = React.useState(
    (window.isDemoAgency && window.isDemoAgency()) ? [
      { who: "Tony Park",   from: "gold",     to: "platinum", reason: "Lost a lead to no fault — protect tier",    when: "Apr 28" },
      { who: "Remy Chen",   from: "silver",   to: "bronze",   reason: "Persistency drift, 6-mo cohort",            when: "Apr 21" },
    ] : []
  );

  const persFor = (rep) => 88 + (rep.streak % 7); // synthesized

  const calcTier = (rep) => {
    const p = persFor(rep);
    let t = "bronze";
    for (const k of TIER_ORDER) {
      if (rep.mtd >= rules[k].mtd && p >= rules[k].persistency) t = k;
    }
    return t;
  };

  const setOverride = async (id, t) => {
    const rep = REPS.find(r => r.id === id);
    const auto = calcTier(rep);
    if (t === auto) {
      const n = { ...overrides }; delete n[id]; setOverrides(n);
    } else {
      setOverrides({ ...overrides, [id]: t });
      setHistory([{ who: rep.name, from: rep.tier, to: t, reason: "Manual override", when: "now" }, ...history]);
    }
    try { await AppData.mutate.tieringOverride(id, t); window.toast && window.toast(`${rep.name} → ${t.toUpperCase()}${AppData.LIVE ? " · saved" : ""}`, "success"); }
    catch (e) { window.toast?.(`Tier override failed: ${e?.message || e}`, "error"); console.error("[tiering.override]", e); }
  };

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Tiering Console</div>
          <div className="page-sub">Define tier rules. Override per-rep when judgment beats numbers. Audit log included.</div>
        </div>
      </div>

      <div className="tiering-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div className="panel">
          <div className="panel-h"><Icons.Award size={13}/><h3>Tier rules</h3><span className="meta">all conditions AND</span></div>
          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {TIER_ORDER.map(t => (
              <div key={t} style={{ display: "grid", gridTemplateColumns: "120px 1fr 1fr", gap: 10, alignItems: "center" }}>
                <div><Shared.TierChip tier={t}/></div>
                <Shared.Field label={`MTD ≥ $${rules[t].mtd.toLocaleString()}`}>
                  <input type="range" min={0} max={70000} step={1000} value={rules[t].mtd} onChange={(e) => setRules({ ...rules, [t]: { ...rules[t], mtd: +e.target.value } })}/>
                </Shared.Field>
                <Shared.Field label={`Persistency ≥ ${rules[t].persistency}%`}>
                  <input type="range" min={0} max={100} value={rules[t].persistency} onChange={(e) => setRules({ ...rules, [t]: { ...rules[t], persistency: +e.target.value } })}/>
                </Shared.Field>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-h"><Icons.Users size={13}/><h3>Per-rep tier · auto vs override</h3></div>
          <div className="list">
            <div className="list-h" style={{ gridTemplateColumns: "1.4fr 80px 90px 100px 1fr" }}>
              <div>Producer</div>
              <div className="tabular" style={{ textAlign: "right" }}>MTD</div>
              <div className="tabular" style={{ textAlign: "right" }}>Persist.</div>
              <div>Auto</div>
              <div>Effective</div>
            </div>
            {REPS.map(r => {
              const auto = calcTier(r);
              const eff = overrides[r.id] || auto;
              return (
                <div key={r.id} className="row" style={{ gridTemplateColumns: "1.4fr 80px 90px 100px 1fr" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Shared.Avatar rep={r} size={20}/>
                    <span style={{ fontWeight: 500 }}>{r.name}</span>
                  </div>
                  <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>${(r.mtd/1000).toFixed(1)}k</div>
                  <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{persFor(r)}%</div>
                  <div><Shared.TierChip tier={auto} compact/></div>
                  <div>
                    <Shared.Select value={eff} onChange={(v) => setOverride(r.id, v)} options={TIER_ORDER.map(t => ({ v: t, l: t.toUpperCase() + (t === auto ? " (auto)" : "") }))}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-h"><Icons.Activity size={13}/><h3>Override audit log</h3><span className="meta">{history.length}</span></div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1fr 100px 100px 1.6fr 100px" }}>
            <div>Producer</div><div>From</div><div>To</div><div>Reason</div><div>When</div>
          </div>
          {history.map((h, i) => (
            <div key={i} className="row" style={{ gridTemplateColumns: "1fr 100px 100px 1.6fr 100px" }}>
              <div style={{ fontWeight: 500 }}>{h.who}</div>
              <div><Shared.TierChip tier={h.from} compact/></div>
              <div><Shared.TierChip tier={h.to} compact/></div>
              <div style={{ color: "var(--text-secondary)", fontSize: 12.5 }}>{h.reason}</div>
              <div style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>{h.when}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   3. Commissions — rep statement / mgr team rollup / owner override pool
   ───────────────────────────────────────────────────────────────────────── */
function PageCommissions({ role = "rep" }) {
  if (role === "manager") return <CommissionsManager/>;
  if (role === "owner")   return <CommissionsOwner/>;
  return <CommissionsRep/>;
}

const STATEMENT = [
  { date: "Today",      lead: "Cheryl Hampton", carrier: "Aetna SRC",     product: "Plan G",    ap: 1840, pct: 50, expected: 920,  paid: 920,  status: "advance"  },
  { date: "Today",      lead: "Robert Mendez",  carrier: "UHC",            product: "FE $15K",   ap: 1320, pct: 50, expected: 660,  paid: 660,  status: "advance"  },
  { date: "Yesterday",  lead: "Henry Akins",    carrier: "F&G Annuities",  product: "Annuity",   ap: 4250, pct: 10, expected: 425,  paid: 0,    status: "as-earned"},
  { date: "Apr 26",     lead: "Linda Cho",      carrier: "Humana Vantage", product: "Plan N",    ap: 1490, pct: 50, expected: 745,  paid: 0,    status: "NIGO · sigs missing" },
  { date: "Apr 24",     lead: "Don Phelps",     carrier: "Aetna SRC",      product: "FE $10K",   ap: 0,    pct: 0,  expected: 0,    paid: -480, status: "Chargeback" },
  { date: "Apr 22",     lead: "Naomi Reese",    carrier: "Aetna SRC",      product: "Plan G",    ap: 1780, pct: 50, expected: 890,  paid: 890,  status: "paid"     },
  { date: "Apr 19",     lead: "Patricia Volker",carrier: "UHC",            product: "Plan G",    ap: 2120, pct: 50, expected: 1060, paid: 1060, status: "paid"     },
];

// ─── Account-based commission calculator ───────────────────────────────────
// Single source of truth: each row in policies carries comp_rate_pct +
// expected_commission (set by deal-write). PAID amounts come from the
// commissions ledger (advances / earned / trails). This makes the rep,
// manager, and owner views all derive from the same data — change a comp%
// at deal entry and every downstream number moves.
function buildStatement({ repId } = {}) {
  const policies = AppData.POLICIES || [];
  const commissions = AppData.COMMISSIONS || [];
  const pipeline = AppData.PIPELINE || [];
  const carriers = AppData.CARRIERS || [];
  const clawbacks = AppData.CLAWBACKS || [];
  const carrierById = new Map(carriers.map(c => [c.id, c]));
  const leadById   = new Map(pipeline.map(l => [l.id, l]));

  const fmtDate = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso); if (isNaN(d)) return iso;
    const today = new Date(); today.setHours(0,0,0,0);
    const day = new Date(d); day.setHours(0,0,0,0);
    const diff = Math.round((today - day) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    if (diff < 14)  return `${diff}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const rows = policies
    .filter(p => !repId || p.owner === repId)
    .map(p => {
      // Sum any paid commissions tied to this policy
      const paidForPolicy = commissions
        .filter(c => c.policyId === p.id)
        .reduce((a, c) => a + (c.amount || 0), 0);
      // expected: prefer stored expected, else AP × comp%
      const base = p.targetPremium || p.ap || 0;
      const pct  = p.compRatePct != null ? p.compRatePct : 0;
      const expected = p.expectedCommission != null ? p.expectedCommission : Math.round(base * pct / 100);
      const lead     = p.leadId ? leadById.get(p.leadId) : null;
      const carrier  = carrierById.get(p.carrierId);
      // Status mapping
      const status = p.status === "issued" || p.status === "active" ? (paidForPolicy > 0 ? "paid" : "pending payout")
                    : p.status === "submitted" || p.status === "app_in" ? "submitted"
                    : p.status === "declined" || p.status === "withdrawn" ? p.status
                    : p.status || "—";
      return {
        policyId: p.id,
        date: fmtDate(p.submissionDate || p.issuedAt),
        dateISO: p.submissionDate || p.issuedAt || null,
        lead: lead?.lead || (p.policyNumber ? `Policy ${p.policyNumber}` : "—"),
        carrier: carrier?.name || p.carrierId || "—",
        product: p.product || "—",
        ap: p.ap || 0,
        pct,
        expected,
        paid: paidForPolicy,
        status,
      };
    });

  // Append chargebacks (negative paid)
  clawbacks
    .filter(cb => !repId || cb.repId === repId)
    .forEach(cb => rows.push({
      policyId: cb.policyId,
      date: fmtDate(cb.recordedAt),
      dateISO: cb.recordedAt || null,
      lead: "(chargeback)",
      carrier: "—", product: "—", ap: 0, pct: 0,
      expected: 0, paid: -(cb.amount || 0), status: "Chargeback",
    }));

  return rows;
}

// Producer pay periods — forward-planning windows, not trailing ones.
// Producers plan against today / this week / this month / this quarter;
// trailing-90-style views don't help them plan, so they're not offered.
const PAY_PERIODS = [
  { k: "today",   l: "Today" },
  { k: "week",    l: "Week" },
  { k: "month",   l: "Month" },
  { k: "quarter", l: "Quarter" },
];
const PAY_PERIOD_LABEL = { today: "today", week: "this week", month: "this month", quarter: "this quarter" };
function payPeriodStart(key) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  if (key === "week")    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday start
  if (key === "month")   d.setDate(1);
  if (key === "quarter") d.setMonth(Math.floor(d.getMonth() / 3) * 3, 1);
  return d;
}

// Agency-wide deposit allocations — the SOURCE OF TRUTH for paid commission.
// Manager/owner rollups read this (RLS lets manager+ see every allocation in
// their agency). The projected `commissions` table is never written in prod,
// so the old buildStatement-derived "paid" was always $0. Realtime so a
// deposit logged in Book → Deposits moves the rollup live.
function useAgencyAllocations() {
  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  const agencyId = meIdent?.agency_id || null;
  const [allocs, setAllocs] = React.useState(null);
  const [refreshKey, setRefreshKey] = React.useState(0);
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sb = window.getSupabase && window.getSupabase();
        if (!sb || !agencyId) { if (!cancelled) setAllocs([]); return; }
        const { data, error } = await sb.from("deposit_allocations")
          .select("rep_id, kind, amount_cents, carrier_deposits(deposit_date)")
          .eq("agency_id", agencyId)
          .limit(5000);
        if (error) throw error;
        if (!cancelled) setAllocs(data || []);
      } catch (e) {
        console.warn("[commissions] agency allocations load failed", e);
        if (!cancelled) setAllocs([]);
      }
    })();
    return () => { cancelled = true; };
  }, [agencyId, refreshKey]);
  React.useEffect(() => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb || !agencyId) return;
    const ch = sb.channel("commissions-agency:" + agencyId)
      .on("postgres_changes", { event: "*", schema: "public", table: "deposit_allocations", filter: `agency_id=eq.${agencyId}` }, () => setRefreshKey(k => k + 1))
      .subscribe();
    return () => { try { sb.removeChannel(ch); } catch {} };
  }, [agencyId]);
  return allocs;
}

// Roll allocations up by rep for a pay period. Returns { map, team } where
// map[rep_id] = { paid, advance, override } in dollars and team is the sum.
// chargeback_recoup is excluded from paid (it's carrier clawing money back).
function rollupAllocations(allocs, period) {
  const start = payPeriodStart(period);
  const inP = (iso) => {
    if (!iso) return false;
    const d = new Date(iso.length <= 10 ? iso + "T12:00:00" : iso);
    return !isNaN(d) && d >= start;
  };
  const map = {};
  const team = { paid: 0, advance: 0, override: 0 };
  for (const a of (allocs || [])) {
    if (!inP(a.carrier_deposits?.deposit_date)) continue;
    if (a.kind === "chargeback_recoup") continue;
    const c = Math.round((a.amount_cents || 0) / 100);
    const key = a.rep_id || "_unassigned";
    const m = map[key] = map[key] || { paid: 0, advance: 0, override: 0 };
    m.paid += c; team.paid += c;
    if (a.kind === "advance")  { m.advance += c; team.advance += c; }
    if (a.kind === "override") { m.override += c; team.override += c; }
  }
  return { map, team };
}

function CommissionsRep() {
  // Statement rows recompute from policies + clawbacks so any deal entered
  // anywhere by this rep flows through immediately. PAID money, however,
  // comes from deposit_allocations (Book → Deposits) — the projected
  // `commissions` table is never written in prod, so summing it showed
  // producers $0 paid forever. Advances are the number producers plan on.
  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  const _isDemoCR = !!(window.isDemoAgency && window.isDemoAgency());
  const repId = meIdent?.rep_id || (_isDemoCR ? (AppData.REPS && AppData.REPS[0] && AppData.REPS[0].id) : null);

  const [period, setPeriod] = React.useState("month");
  const [allocs, setAllocs] = React.useState(null);   // deposit_allocations for this rep
  const [refreshKey, setRefreshKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sb = window.getSupabase && window.getSupabase();
        if (!sb || !repId) { if (!cancelled) setAllocs([]); return; }
        const { data, error } = await sb.from("deposit_allocations")
          .select("kind, amount_cents, carrier_deposits(deposit_date)")
          .eq("rep_id", repId)
          .limit(2000);
        if (error) throw error;
        if (!cancelled) setAllocs(data || []);
      } catch (e) {
        console.warn("[commissions] deposit_allocations load failed", e);
        if (!cancelled) setAllocs([]);
      }
    })();
    return () => { cancelled = true; };
  }, [repId, refreshKey]);

  // Realtime — a deposit logged in Book → Deposits shows up here live.
  React.useEffect(() => {
    const sb = window.getSupabase && window.getSupabase();
    const agencyId = meIdent?.agency_id;
    if (!sb || !agencyId) return;
    const ch = sb.channel("commissions-rep:" + agencyId)
      .on("postgres_changes", { event: "*", schema: "public", table: "deposit_allocations", filter: `agency_id=eq.${agencyId}` }, () => setRefreshKey(k => k + 1))
      .subscribe();
    return () => { try { sb.removeChannel(ch); } catch {} };
  }, [meIdent?.agency_id]);

  const start = payPeriodStart(period);
  const inPeriod = (iso) => {
    if (!iso) return false;
    const d = new Date(iso.length <= 10 ? iso + "T12:00:00" : iso);
    return !isNaN(d) && d >= start;
  };

  const liveRows = buildStatement({ repId });
  const usingDemoRows = !(liveRows && liveRows.length) && _isDemoCR;
  const allRows = (liveRows && liveRows.length) ? liveRows : (usingDemoRows ? STATEMENT : []);
  const ROWS = usingDemoRows ? allRows : allRows.filter(r => inPeriod(r.dateISO));

  // Actual money received this period, from real carrier deposits.
  const periodAllocs = (allocs || []).filter(a => inPeriod(a.carrier_deposits?.deposit_date));
  const sumKind = (pred) => Math.round(periodAllocs.filter(pred).reduce((s, a) => s + (a.amount_cents || 0), 0) / 100);
  let advancePaid = sumKind(a => a.kind === "advance");
  let totalPaid   = sumKind(a => a.kind !== "chargeback_recoup");
  if (usingDemoRows) { // demo agency has no deposit rows — derive from demo statement
    advancePaid = allRows.filter(r => r.status === "advance").reduce((s, r) => s + Math.max(0, r.paid), 0);
    totalPaid   = allRows.reduce((s, r) => s + Math.max(0, r.paid), 0);
  }

  const total = ROWS.reduce((a, r) => a + r.expected, 0);
  const charge = ROWS.filter(r => r.paid < 0).reduce((a, r) => a + r.paid, 0);
  const issuedCount = ROWS.filter(r => r.expected > 0 && r.paid >= 0).length;
  const nigoCount   = ROWS.filter(r => /nigo|declined|withdrawn/i.test(r.status || "")).length;
  const periodLbl = PAY_PERIOD_LABEL[period];
  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Commissions · Me</div>
          <div className="page-sub">Statement · advances vs as-earned · NIGO and chargeback alerts</div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <Shared.SectionPill items={PAY_PERIODS} value={period} onChange={setPeriod} dense/>
        </div>
        <button className="btn" style={{ marginLeft: 8 }} onClick={() => {
          const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
          const producerName = meIdent?.full_name || "Producer";
          const orgName = meIdent?.agency_name || "Your agency";
          const periodLabel = `${PAY_PERIODS.find(p => p.k === period)?.l || "Month"} · ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
          const html = `
            <h1>Statement · ${periodLabel}</h1>
            <div class="meta">${producerName} · ${orgName} · ${new Date().toLocaleDateString()}</div>
            <table>
              <thead><tr><th>Date</th><th>Lead</th><th>Carrier</th><th>Product</th><th style="text-align:right">AP</th><th style="text-align:right">Comp %</th><th style="text-align:right">Expected</th><th style="text-align:right">Paid</th><th>Status</th></tr></thead>
              <tbody>
              ${ROWS.map(r => `<tr><td>${r.date}</td><td>${r.lead}</td><td>${r.carrier}</td><td>${r.product}</td><td style="text-align:right">$${(r.ap || 0).toLocaleString()}</td><td style="text-align:right">${r.pct}%</td><td style="text-align:right">$${r.expected.toLocaleString()}</td><td style="text-align:right">$${r.paid.toLocaleString()}</td><td>${r.status}</td></tr>`).join("")}
              </tbody>
            </table>`;
          window.exportPDF && window.exportPDF(`Statement · ${periodLabel}`, html);
        }}><Icons.ArrowUpRight size={13}/> Statement PDF</button>
        <button className="btn" style={{ marginLeft: 8 }} onClick={() => window.AppData.exportCsv(ROWS, "commissions-statement",
          [
            { k: "date",     l: "Date" },
            { k: "lead",     l: "Lead" },
            { k: "carrier",  l: "Carrier" },
            { k: "product",  l: "Product" },
            { k: "ap",       l: "AP",       fmt: (v) => v || 0 },
            { k: "pct",      l: "Comp %" },
            { k: "expected", l: "Expected", fmt: (v) => v || 0 },
            { k: "paid",     l: "Paid",     fmt: (v) => v || 0 },
            { k: "status",   l: "Status" },
          ])}><Icons.ArrowDown size={13}/> Export CSV</button>
      </div>

      <div className="kpi-row">
        <Shared.KpiCard hero label="Advance paid" prefix="$" value={advancePaid.toLocaleString()} sub={`${periodLbl} · actual carrier deposits`} trend={advancePaid > 0 ? "up" : undefined}/>
        <Shared.KpiCard label="Total paid" prefix="$" value={totalPaid.toLocaleString()} sub="advances + as-earned + trails"/>
        <Shared.KpiCard label="Expected" prefix="$" value={total.toLocaleString()} sub={nigoCount > 0 ? `${issuedCount} issues · ${nigoCount} NIGO` : `across ${issuedCount} issue${issuedCount === 1 ? "" : "s"}`}/>
        <Shared.KpiCard label="Chargebacks" prefix="$" value={Math.abs(charge).toLocaleString()} sub={periodLbl} neg/>
      </div>

      <div className="panel">
        <div className="panel-h"><Icons.Wallet size={13}/><h3>Statement</h3><span className="meta">{ROWS.length} row{ROWS.length === 1 ? "" : "s"} · {periodLbl}</span></div>
        {ROWS.length === 0 && allRows.length === 0 && (
          <div style={{ padding: "32px 24px", textAlign: "center", color: "var(--text-tertiary)", fontSize: 13, lineHeight: 1.55 }}>
            <div style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 6 }}>No deals on your statement yet.</div>
            <div>Write your first deal in <strong>Floor → Deals</strong> — comp % is captured at deal-write and flows here automatically.</div>
            <button className="btn btn-primary" style={{ marginTop: 14 }}
              onClick={() => {
                try { localStorage.setItem("repflow.floor.mode", "deals"); } catch {}
                window.dispatchEvent(new CustomEvent("nav:goto", { detail: { page: "floor" }}));
              }}>
              <Icons.Plus size={12}/> Write a deal
            </button>
          </div>
        )}
        {ROWS.length === 0 && allRows.length > 0 && (
          <div style={{ padding: "26px 24px", textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
            No statement rows {periodLbl}. Switch the period filter to widen the window.
          </div>
        )}
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "100px 1.4fr 1fr 1fr 80px 60px 90px 90px 1fr" }}>
            <div>Date</div><div>Lead</div><div>Carrier</div><div>Product</div>
            <div className="tabular" style={{ textAlign: "right" }}>AP</div>
            <div className="tabular" style={{ textAlign: "right" }}>%</div>
            <div className="tabular" style={{ textAlign: "right" }}>Expected</div>
            <div className="tabular" style={{ textAlign: "right" }}>Paid</div>
            <div>Status</div>
          </div>
          {ROWS.map((r, i) => (
            <div key={i} className="row" style={{ gridTemplateColumns: "100px 1.4fr 1fr 1fr 80px 60px 90px 90px 1fr" }}>
              <div style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>{r.date}</div>
              <div className="cell-truncate" style={{ fontWeight: 500 }}>{r.lead}</div>
              <div className="cell-truncate" style={{ color: "var(--text-tertiary)" }}>{r.carrier}</div>
              <div className="cell-truncate" style={{ color: "var(--text-tertiary)" }}>{r.product}</div>
              <div className="tabular" style={{ textAlign: "right" }}>{r.ap ? `$${r.ap.toLocaleString()}` : "—"}</div>
              <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{r.pct}%</div>
              <div className="tabular" style={{ textAlign: "right" }}><Money v={r.expected}/></div>
              <div className="tabular" style={{ textAlign: "right", color: r.paid < 0 ? "var(--state-danger)" : undefined }}><Money v={r.paid}/></div>
              <div><span className={`chip ${
                r.status === "paid" || r.status === "advance" ? "chip-money" :
                r.status === "as-earned" ? "chip-info" :
                r.status.startsWith("Chargeback") ? "chip-danger" : "chip-status"
              }`}>{r.status}</span></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Per-row Base % editor. The earlier inline `<input value={rep.baseCompPct}
// onChange={save}>` had two problems: (1) `reps.base_comp_pct` didn't exist
// in prod until 2026-05-23, so every keystroke fired a save that errored
// silently — the "unable to change comp rates" repro; (2) even after the
// schema fix, every keystroke fired a save, and the in-place AppData
// mutation never triggered a re-render, so the displayed value would drift
// from the persisted one. This sub-component keeps a local draft, commits on
// blur or Enter, and bails on out-of-range values.
function BaseCompPctInput({ rep }) {
  const persisted = rep.baseCompPct != null ? rep.baseCompPct : 50;
  const [draft, setDraft] = React.useState(String(persisted));
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => { setDraft(String(persisted)); }, [persisted]);

  const commit = async () => {
    const v = parseFloat(draft);
    if (!Number.isFinite(v) || v < 0 || v > 100) {
      window.toast && window.toast("Comp % must be between 0 and 100", "error");
      setDraft(String(persisted));
      return;
    }
    if (v === persisted) return;
    setSaving(true);
    try {
      await AppData.mutate.repBaseCompPctSave(rep.id, v);
      window.toast && window.toast(`${rep.name.split(" ")[0]} → ${v}%`, "success");
    } catch (_e) {
      setDraft(String(persisted));
    } finally {
      setSaving(false);
    }
  };

  return (
    <input type="number" step="0.5" min="0" max="100" className="input-tiny"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); } else if (e.key === "Escape") { setDraft(String(persisted)); e.currentTarget.blur(); } }}
      disabled={saving}
      title={saving ? "Saving…" : "Manager-set base comp % · Enter to save"}
      style={{ width: 45, textAlign: "right", padding: "2px 4px", fontSize: 11, opacity: saving ? 0.6 : 1 }} />
  );
}

function CommissionsManager() {
  const { REPS } = AppData;
  const scopeIds = (typeof window !== "undefined" && window.scopeRepIds && window.scopeRepIds()) || null;
  const [period, setPeriod] = React.useState("month");
  const periodLbl = PAY_PERIOD_LABEL[period];

  // Paid = real money from deposit_allocations, period-scoped. Expected + AP
  // stay derived from policies (buildStatement) — those are projections, the
  // right source for "what we're owed". Paid must be actuals.
  const allocs = useAgencyAllocations();
  const { map: paidMap, team: paidTeam } = rollupAllocations(allocs, period);

  const perRep = REPS.filter(r => !scopeIds || scopeIds.includes(r.id)).map(r => {
    const rows = buildStatement({ repId: r.id });
    const issued = rows.filter(x => x.status === "paid" || x.status === "pending payout").length;
    const ap     = rows.reduce((a, x) => a + (x.ap || 0), 0);
    const expected = rows.reduce((a, x) => a + (x.expected || 0), 0);
    const paid    = paidMap[r.id]?.paid || 0;       // ACTUAL received this period
    const charge  = rows.filter(x => (x.paid || 0) < 0)?.reduce((a, x) => a + x.paid, 0);
    return { rep: r, issued, ap, expected, paid, ic: Math.max(0, expected - paid), charge };
  });
  const teamAp       = perRep.reduce((a, x) => a + x.ap, 0);
  const teamExpected = perRep.reduce((a, x) => a + x.expected, 0);
  const teamPaid     = paidTeam.paid;
  const teamIc       = Math.max(0, teamExpected - teamPaid);
  const teamCharge   = perRep.reduce((a, x) => a + x.charge, 0);

  // Fall back to demo numbers only on the demo agency. Real agencies with no
  // policies yet see zeros + an empty-state CTA below.
  const _isDemoCM = !!(window.isDemoAgency && window.isDemoAgency());
  const isEmpty = teamAp === 0 && teamExpected === 0;
  const display = (isEmpty && _isDemoCM)
    ? { ap: 295000, expected: 184260, paid: 142080, ic: 42180, charge: -11420 }
    : { ap: teamAp, expected: teamExpected, paid: teamPaid, ic: teamIc, charge: teamCharge };

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Commissions · Team rollup</div>
          <div className="page-sub">Per-producer ledger · expected from policies · paid from real carrier deposits</div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <Shared.SectionPill items={PAY_PERIODS} value={period} onChange={setPeriod} dense/>
        </div>
      </div>

      <div className="kpi-row">
        <Shared.KpiCard hero label="Team paid" prefix="$" value={display.paid.toLocaleString()} sub={`${periodLbl} · actual deposits`} trend={display.paid > 0 ? "up" : undefined}/>
        <Shared.KpiCard label="Team expected" prefix="$" value={display.expected.toLocaleString()} sub={`across ${perRep.reduce((a, x) => a + x.issued, 0) || (_isDemoCM ? 14 : 0)} issues`}/>
        <Shared.KpiCard label="In clearing" prefix="$" value={display.ic.toLocaleString()} sub={(isEmpty && _isDemoCM) ? "14 apps" : "expected − paid"}/>
        <Shared.KpiCard label="Chargebacks" prefix="$" value={Math.abs(display.charge).toLocaleString()} sub="last 30d" neg/>
      </div>

      <div className="panel">
        <div className="panel-h"><h3>Producers · {periodLbl}</h3><span className="meta">{perRep.length} producers in scope</span></div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1.6fr 70px 90px 100px 100px 100px 100px" }}>
            <div>Producer</div>
            <div className="tabular" style={{ textAlign: "right" }}>Base %</div>
            <div className="tabular" style={{ textAlign: "right" }}>Issued</div>
            <div className="tabular" style={{ textAlign: "right" }}>AP</div>
            <div className="tabular" style={{ textAlign: "right" }}>Expected</div>
            <div className="tabular" style={{ textAlign: "right" }}>Paid</div>
            <div className="tabular" style={{ textAlign: "right" }}>Debt</div>
          </div>
          {perRep.map(({ rep, issued, ap, expected, paid, ic, charge }) => {
            const showAp = (isEmpty && _isDemoCM) ? rep.mtd : ap;
            const showExpected = (isEmpty && _isDemoCM) ? Math.round(rep.mtd * 0.5) : expected;
            const showPaid = (isEmpty && _isDemoCM) ? Math.round(rep.mtd * 0.3) : paid;
            const showCharge = (isEmpty && _isDemoCM) ? 0 : charge;
            return (
              <div key={rep.id} className="row" style={{ gridTemplateColumns: "1.6fr 70px 90px 100px 100px 100px 100px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Shared.Avatar rep={rep} size={20}/>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rep.name}</div>
                    <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{rep.handle}</div>
                  </div>
                </div>
                <div className="tabular" style={{ textAlign: "right" }}>
                  <BaseCompPctInput rep={rep}/>
                </div>
                <div className="tabular" style={{ textAlign: "right" }}>{issued}</div>
                <div className="tabular" style={{ textAlign: "right" }}>${showAp.toLocaleString()}</div>
                <div className="tabular" style={{ textAlign: "right", fontWeight: 500 }}>${showExpected.toLocaleString()}</div>
                <div className="tabular" style={{ textAlign: "right", color: "var(--accent-money)" }}>${showPaid.toLocaleString()}</div>
                <div className="tabular" style={{ textAlign: "right", color: showCharge < 0 ? "var(--state-danger)" : "var(--text-tertiary)" }}>
                  {showCharge < 0 ? `-$${Math.abs(showCharge).toLocaleString()}` : "—"}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CommissionsOwner() {
  const { REPS, AGENCIES } = AppData;
  const me = (typeof window !== "undefined" && window.me && window.me()) || null;
  const agency = (AGENCIES || []).find(a => a.id === me?.agency_id) || AGENCIES?.[0] || {};
  
  const [overridePct, setOverridePct] = React.useState(agency.defaultOverridePct || 20);
  const [period, setPeriod] = React.useState("month");
  const periodLbl = PAY_PERIOD_LABEL[period];

  const handleOverrideSave = (val) => {
    setOverridePct(val);
    if (agency.id) AppData.mutate.agencyOverridePctSave(agency.id, val);
  };

  // Projections from policies; actuals from deposit_allocations.
  const allRows = buildStatement();
  const issued = allRows.filter(r => r.status === "paid" || r.status === "pending payout").length;
  const totalAp       = allRows.reduce((a, r) => a + (r.ap || 0), 0);
  const overridePool  = Math.round(totalAp * overridePct / 100);   // projected slice

  const allocs = useAgencyAllocations();
  const { team } = rollupAllocations(allocs, period);
  const overrideReceived = team.override;   // ACTUAL override deposits, period
  const paidOut          = team.paid;        // ACTUAL paid to producers, period

  // Demo numbers are gated to the demo agency ONLY. A real agency with no
  // data shows zeros + empty state, never mock dollars (rickroll rule).
  const _isDemoCO = !!(window.isDemoAgency && window.isDemoAgency());
  const isEmpty = totalAp === 0 && paidOut === 0 && overrideReceived === 0;
  const display = (isEmpty && _isDemoCO)
    ? { pool: 258420, overrideReceived: 51680, paidOut: 412300, totalAp: 731000 }
    : { pool: overridePool, overrideReceived, paidOut, totalAp };

  const exportCommissions = () => {
    const headers = ["Period","Rep","Carrier","Lead","AP","Expected","Paid","Status"];
    const rows = allRows.map(r => {
      const pol = (AppData.POLICIES || []).find(p => p.id === r.policyId) || {};
      const rep = (AppData.REPS    || []).find(p => p.id === pol.owner)    || {};
      return [r.period || "", rep.name || "", pol.carrier || "", pol.lead || "", r.ap || 0, r.expected || 0, r.paid || 0, r.status || ""];
    });
    const csv = [headers.join(","), ...rows.map(r => r.map(v => typeof v === "string" && v.includes(",") ? `"${v.replace(/"/g, '""')}"` : v).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `commissions-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
    window.toast && window.toast(`Exported ${rows.length} commission rows`, "success");
  };

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Commissions · Override pool</div>
          <div className="page-sub">Account-wide rollup · projected slice from policies · actuals from deposits</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <Shared.SectionPill items={PAY_PERIODS} value={period} onChange={setPeriod} dense/>
          <button className="btn" onClick={exportCommissions} disabled={isEmpty} title={isEmpty ? "No commission rows to export" : "Download CSV of all commission rows"}>Export CSV</button>
        </div>
      </div>
      <div className="kpi-row">
        <Shared.KpiCard hero label="Override received" prefix="$" value={display.overrideReceived.toLocaleString()} sub={`${periodLbl} · actual deposits`} trend={display.overrideReceived > 0 ? "up" : undefined}/>
        <Shared.KpiCard label="Paid to producers" prefix="$" value={display.paidOut.toLocaleString()} sub={`${periodLbl} · ${REPS.length} producers`}/>
        <Shared.KpiCard label="Projected pool" prefix="$" value={display.pool.toLocaleString()} sub={`${overridePct}% of $${display.totalAp.toLocaleString()} AP`}/>
        <Shared.KpiCard label="Coverage" value={`${(display.pool / 100000).toFixed(2)}x`} sub="projected vs $100k goal" trend={display.pool >= 100000 ? "up" : "down"}/>
      </div>

      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="panel-h"><Icons.Calculator size={13}/><h3>Owner override %</h3><span className="meta">persisted to agency settings</span></div>
        <div style={{ padding: "12px 14px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Override slice</span>
            <span className="tabular" style={{ fontSize: 14, fontWeight: 600 }}>{overridePct}%</span>
          </div>
          <input type="range" min={5} max={40} step={1} value={overridePct} onChange={(e) => handleOverrideSave(+e.target.value)} style={{ width: "100%" }}/>
          <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--text-tertiary)" }}>
            At {overridePct}%, every $1k of producer AP returns ${(overridePct * 10).toFixed(0)} to the owner pool.
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   4. Training — rep / mgr / owner
   ───────────────────────────────────────────────────────────────────────── */
/* ─── ProductTraining store ───────────────────────────────────────────────
   Persists three things to Supabase (migration 0019) with localStorage as a
   pre-hydrate fallback. Broadcasts a "training:changed" event after every
   mutation so every Training pane stays in sync after edits:
     • courses        — owner-authored library (sections + lessons)
     • progress       — per-rep, per-course completedLessons + completedAt
     • assignments    — manager assigns courseId → repIds with optional dueDate
   Status is derived (not stored) so the source of truth is always progress. */
const ProductTraining = (() => {
  const K_COURSES     = "repflow:product_training_courses";
  const K_PROGRESS    = "repflow:product_training_progress";
  const K_ASSIGNMENTS = "repflow:product_training_assignments";

  function isLive() {
    return Boolean(window.AppData && Array.isArray(window.AppData.TRAINING_COURSES) && window.AppData.TRAINING_COURSES.length > 0);
  }
  function legacySeedCourses() {
    return (AppData.COURSES || []).map((c) => ({
      ...c,
      required: c.required ?? false,
      description: c.description || "",
      sections: c.sections || [],
    }));
  }
  function loadJSON(key, fallback) {
    try { const raw = localStorage.getItem(key); if (raw) return JSON.parse(raw); } catch (e) { console.warn("[training.loadJSON]", key, e); }
    return fallback;
  }
  function saveJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { console.warn("[training.saveJSON]", key, e); }
  }
  function broadcast() {
    window.dispatchEvent(new CustomEvent("training:changed"));
  }
  function loadCourses() {
    if (isLive()) return window.AppData.TRAINING_COURSES;
    return loadJSON(K_COURSES, legacySeedCourses());
  }
  function loadProgress() {
    if (isLive() && window.AppData.TRAINING_PROGRESS && typeof window.AppData.TRAINING_PROGRESS === "object") {
      return window.AppData.TRAINING_PROGRESS;
    }
    return loadJSON(K_PROGRESS, {});
  }
  function loadAssignments() {
    if (isLive() && Array.isArray(window.AppData.TRAINING_ASSIGNMENTS)) {
      return window.AppData.TRAINING_ASSIGNMENTS;
    }
    return loadJSON(K_ASSIGNMENTS, []);
  }

  // Supabase writes (fire-and-forget — UI is mutated optimistically first).
  function sbClient() { return (window.getSupabase && window.getSupabase()) || null; }
  function activeAgencyId() { return (window.getActiveAgencyId && window.getActiveAgencyId()) || null; }
  function pgCourseRow(c, opts) {
    const o = opts || {};
    const row = {
      id: c.id, agency_id: activeAgencyId(),
      slug: c.slug || null, title: c.title, track: c.track || null,
      description: c.description || null, dur_min: c.durMin || null,
      required: !!c.required, sections: c.sections || [],
      target_roles: c.targetRoles || ["owner","manager","rep"],
      display_order: c.displayOrder || 100,
      is_published: c.isPublished !== false,
    };
    if (!o.skipPost0034) {
      // Columns added in migration 0034 — strip and retry if the DB rejects them.
      row.cover_url = c.coverUrl || null;
    }
    return row;
  }
  async function upsertCourse(course) {
    const client = sbClient(); if (!client) return;
    let row = pgCourseRow(course);
    if (!row.agency_id) { console.warn("[training] no active agency_id; course not saved"); return; }
    let { error } = await client.from("training_courses").upsert(row, { onConflict: "id" });
    if (error && /column .* does not exist/i.test(error.message || "")) {
      console.warn("[training] post-0034 cover_url column missing — retrying without (apply migration 0034)");
      row = pgCourseRow(course, { skipPost0034: true });
      ({ error } = await client.from("training_courses").upsert(row, { onConflict: "id" }));
    }
    if (error) console.warn("[training] upsertCourse failed:", error.message);
  }
  async function deleteCourseRow(id) {
    const client = sbClient(); if (!client) return;
    const { error } = await client.from("training_courses").delete().eq("id", id);
    if (error) console.warn("[training] deleteCourse failed:", error.message);
  }
  async function replaceAssignmentsForCourse(courseId, repIds, dueDate) {
    const client = sbClient(); if (!client) return;
    const agency_id = activeAgencyId();
    if (!agency_id) { console.warn("[training] no active agency_id; assignments not saved"); return; }
    await client.from("training_assignments").delete().eq("course_id", courseId);
    if (!repIds || repIds.length === 0) return;
    const rows = repIds.map(rep_id => ({ agency_id, course_id: courseId, rep_id, due_at: dueDate || null }));
    const { error } = await client.from("training_assignments").insert(rows);
    if (error) console.warn("[training] insertAssignments failed:", error.message);
  }
  async function writeProgress(repId, courseId, lessonKey, completed) {
    const client = sbClient(); if (!client) return;
    if (completed) {
      const { error } = await client.from("training_progress")
        .upsert({ rep_id: repId, course_id: courseId, lesson_key: lessonKey },
                { onConflict: "rep_id,course_id,lesson_key" });
      if (error) console.warn("[training] writeProgress upsert failed:", error.message);
    } else {
      const { error } = await client.from("training_progress").delete()
        .eq("rep_id", repId).eq("course_id", courseId).eq("lesson_key", lessonKey);
      if (error) console.warn("[training] writeProgress delete failed:", error.message);
    }
  }
  function diffProgress(prev, next) {
    const keys = new Set([...Object.keys(prev || {}), ...Object.keys(next || {})]);
    for (const repId of keys) {
      const p = (prev && prev[repId]) || {};
      const n = (next && next[repId]) || {};
      const courseKeys = new Set([...Object.keys(p), ...Object.keys(n)]);
      for (const courseId of courseKeys) {
        const pLessons = new Set((p[courseId]?.completedLessons) || []);
        const nLessons = new Set((n[courseId]?.completedLessons) || []);
        for (const k of nLessons) if (!pLessons.has(k)) writeProgress(repId, courseId, k, true);
        for (const k of pLessons) if (!nLessons.has(k)) writeProgress(repId, courseId, k, false);
      }
    }
  }

  function totalLessons(course) {
    return (course.sections || []).reduce((a, s) => a + (s.lessons?.length || 0), 0);
  }
  function lessonIds(course) {
    const ids = [];
    (course.sections || []).forEach((s, si) => (s.lessons || []).forEach((_, li) => ids.push(`${si}.${li}`)));
    return ids;
  }
  function getProgress(progress, repId, courseId) {
    return (progress[repId] && progress[repId][courseId]) || { completedLessons: [], completedAt: null };
  }
  function deriveStatus(course, prog, assignment) {
    const total = totalLessons(course);
    const done  = prog.completedLessons.length;
    if (total > 0 && done >= total) return "complete";
    if (done > 0) return "in-progress";
    if (assignment?.dueDate) {
      const today = new Date().toISOString().slice(0, 10);
      if (assignment.dueDate < today) return "overdue";
    }
    if (assignment) return "assigned";
    if (course.required) return "due";
    return "assigned";
  }
  function statusFor(repId, course, progress, assignments) {
    const prog = getProgress(progress, repId, course.id);
    const a    = assignments.find(x => x.courseId === course.id && (x.repIds || []).includes(repId));
    return deriveStatus(course, prog, a);
  }
  function percentFor(repId, course, progress) {
    const total = totalLessons(course);
    if (total === 0) return 0;
    return Math.round((getProgress(progress, repId, course.id).completedLessons.length / total) * 100);
  }
  function isComplete(repId, course, progress) {
    return statusFor(repId, course, progress, []) === "complete";
  }

  function useStore() {
    const [, force] = React.useState(0);
    React.useEffect(() => {
      const onChange = () => force(n => n + 1);
      window.addEventListener("training:changed", onChange);
      window.addEventListener("data:hydrated",   onChange);
      window.addEventListener("data:realtime",   onChange);
      return () => {
        window.removeEventListener("training:changed", onChange);
        window.removeEventListener("data:hydrated",   onChange);
        window.removeEventListener("data:realtime",   onChange);
      };
    }, []);
    return {
      courses: loadCourses(),
      progress: loadProgress(),
      assignments: loadAssignments(),
      saveCourses: (next) => {
        const prev = loadCourses();
        const v = typeof next === "function" ? next(prev) : next;
        if (isLive()) {
          window.AppData.TRAINING_COURSES = v;
          const prevById = new Map(prev.map(c => [c.id, c]));
          const nextById = new Map(v.map(c => [c.id, c]));
          for (const [id, c] of nextById) {
            const p = prevById.get(id);
            if (!p || JSON.stringify(p) !== JSON.stringify(c)) upsertCourse(c);
          }
          for (const id of prevById.keys()) if (!nextById.has(id)) deleteCourseRow(id);
        } else {
          saveJSON(K_COURSES, v);
        }
        broadcast();
      },
      saveProgress: (next) => {
        const prev = loadProgress();
        const v = typeof next === "function" ? next(prev) : next;
        if (isLive()) {
          window.AppData.TRAINING_PROGRESS = v;
          // Diff prev vs next and emit per-lesson writeProgress() — bulk
          // replacements hit the DB just like mark/unmark.
          diffProgress(prev, v);
        } else {
          saveJSON(K_PROGRESS, v);
        }
        broadcast();
      },
      saveAssignments: (next) => {
        const prev = loadAssignments();
        const v = typeof next === "function" ? next(prev) : next;
        if (isLive()) {
          window.AppData.TRAINING_ASSIGNMENTS = v;
          const prevByCourse = new Map(prev.map(a => [a.courseId, a]));
          const nextByCourse = new Map(v.map(a => [a.courseId, a]));
          for (const [cid, a] of nextByCourse) {
            const p = prevByCourse.get(cid);
            const same = p &&
              JSON.stringify((p.repIds || []).slice().sort()) === JSON.stringify((a.repIds || []).slice().sort()) &&
              (p.dueDate || null) === (a.dueDate || null);
            if (!same) replaceAssignmentsForCourse(cid, a.repIds || [], a.dueDate);
          }
          for (const cid of prevByCourse.keys()) {
            if (!nextByCourse.has(cid)) replaceAssignmentsForCourse(cid, [], null);
          }
        } else {
          saveJSON(K_ASSIGNMENTS, v);
        }
        broadcast();
      },
    };
  }

  function markLessonComplete(repId, courseId, lessonId) {
    const all = loadProgress();
    const repProg = all[repId] || {};
    const cur = repProg[courseId] || { completedLessons: [], completedAt: null };
    if (!cur.completedLessons.includes(lessonId)) {
      cur.completedLessons = [...cur.completedLessons, lessonId];
    }
    repProg[courseId] = cur;
    all[repId] = repProg;

    const courses = loadCourses();
    const course = courses.find(c => c.id === courseId);
    if (course) {
      const total = totalLessons(course);
      if (total > 0 && cur.completedLessons.length >= total && !cur.completedAt) {
        cur.completedAt = new Date().toISOString();
        all[repId][courseId] = cur;
      }
    }
    if (isLive()) {
      window.AppData.TRAINING_PROGRESS = all;
      writeProgress(repId, courseId, lessonId, true);
    } else {
      saveJSON(K_PROGRESS, all);
    }
    broadcast();
  }

  function unmarkLessonComplete(repId, courseId, lessonId) {
    const all = loadProgress();
    const cur = (all[repId] || {})[courseId];
    if (!cur) return;
    cur.completedLessons = cur.completedLessons.filter(x => x !== lessonId);
    cur.completedAt = null;
    all[repId][courseId] = cur;
    if (isLive()) {
      window.AppData.TRAINING_PROGRESS = all;
      writeProgress(repId, courseId, lessonId, false);
    } else {
      saveJSON(K_PROGRESS, all);
    }
    broadcast();
  }

  function requiredCoursesFor(repId, courses, progress, assignments) {
    return courses.filter(c => {
      if (c.required) return true;
      return assignments.some(a => a.courseId === c.id && (a.repIds || []).includes(repId));
    });
  }
  function openRequiredCount(repId, courses, progress, assignments) {
    return requiredCoursesFor(repId, courses, progress, assignments)
      .filter(c => totalLessons(c) > 0)
      .filter(c => statusFor(repId, c, progress, assignments) !== "complete")
      .length;
  }

  return {
    useStore, totalLessons, lessonIds, getProgress, statusFor, percentFor, isComplete,
    requiredCoursesFor, openRequiredCount, markLessonComplete, unmarkLessonComplete,
  };
})();

/* ─── Embed helpers — accept Loom / YouTube / Vimeo / Wistia / direct mp4 ─ */
function toEmbedSrc(url = "") {
  const u = String(url).trim();
  if (!u) return "";
  const loom = u.match(/loom\.com\/share\/([a-z0-9]+)/i);
  if (loom) return `https://www.loom.com/embed/${loom[1]}`;
  const yt = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vm = u.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  const wist = u.match(/(?:wistia\.com\/(?:medias|embed)|wi\.st\/)\/?([a-z0-9]+)/i);
  if (wist) return `https://fast.wistia.net/embed/iframe/${wist[1]}`;
  return u;
}
function isDirectVideo(url = "") {
  return /\.(mp4|webm|ogg)(\?|$)/i.test(url) || url.startsWith("data:video/");
}
/* Pull a thumbnail from a YouTube URL when we can — Vimeo/Loom/Wistia thumbnails
   require an API call so we let those fall through to a placeholder. */
function thumbFromUrl(url = "") {
  const u = String(url).trim();
  const yt = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]+)/);
  if (yt) return `https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg`;
  return "";
}
function detectVideoSourceLabel(url = "") {
  const u = String(url).toLowerCase();
  if (/youtube\.com|youtu\.be/.test(u)) return "YouTube";
  if (/vimeo\.com/.test(u))             return "Vimeo";
  if (/loom\.com/.test(u))              return "Loom";
  if (/wistia\.com|wi\.st/.test(u))     return "Wistia";
  if (isDirectVideo(u))                  return "Direct";
  return "Embed";
}

const COURSE_TRACKS = ["Onboarding", "FE", "Med Supp", "AEP", "Life", "Annuity", "Compliance"];

/* ─────────────────────────────────────────────────────────────────────────
   4. Training — unified hub: Call Coaching · Call Library · Product Training
   The legacy /coaching route in index.html now lands here with defaultTab="coaching".
   ───────────────────────────────────────────────────────────────────────── */
function PageTraining({ role = "rep", defaultTab = "coaching" }) {
  const [tab, setTab] = React.useState(() => {
    try {
      const saved = sessionStorage.getItem("repflow.training.tab");
      if (saved) return saved;
    } catch {}
    return defaultTab;
  });
  // BUG FIX (2026-05-16): sub-tab state was bleeding across outer routes.
  // App.jsx routes both /training and /coaching to <PageTraining/>, with
  // different defaultTab props. React reused the same fiber, so useState
  // kept whatever the user had last picked. Result: hitting "Coaching" in
  // the sidebar after touring /training landed you on the WRONG tab AND
  // left you trapped because CoachingPane previously suppressed the
  // Team Board return SectionPill via .training-embed. Reset on prop change.
  React.useEffect(() => {
    let next = defaultTab;
    try {
      const saved = sessionStorage.getItem("repflow.training.tab");
      if (saved) {
        next = saved;
        sessionStorage.removeItem("repflow.training.tab");
      }
    } catch {}
    setTab(next);
  }, [defaultTab]);
  const store = ProductTraining.useStore();
  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  // Real rep id when signed in. In demo-agency mode fall back to the first
  // seeded rep so the page renders. Fresh non-demo agencies see 0 required.
  const meId = meIdent?.rep_id || (window.isDemoAgency && window.isDemoAgency() ? AppData.REPS[0]?.id : null);
  const requiredOpen = meId ? ProductTraining.openRequiredCount(meId, store.courses, store.progress, store.assignments) : 0;

  const tabs = [
    { k: "coaching", l: "Call Coaching",    icon: "Activity" },
    { k: "library",  l: "Call Library",     icon: "Headset" },
    { k: "product",  l: "Product Training", icon: "Book", badge: role === "rep" && requiredOpen > 0 ? requiredOpen : undefined },
  ];

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Training</div>
          <div className="page-sub">
            {tab === "coaching" && "Coaching cards · scorecards · drill replays"}
            {tab === "library"  && "Recorded calls · waveform · AI scoring"}
            {tab === "product"  && (role === "owner" ? "Course library · authoring · required onboarding" : "Courses · videos · scripts · cert progress")}
          </div>
        </div>
      </div>

      <div className="training-tabs section-pill">
        {tabs.map(t => {
          const Ic = Icons[t.icon];
          return (
            <button key={t.k} className={tab === t.k ? "active" : ""} onClick={() => setTab(t.k)}>
              <Ic size={12} style={{ marginRight: 6, verticalAlign: "middle" }}/>
              {t.l}
              {t.badge != null && <span className="badge tabular" style={{ marginLeft: 6, fontSize: 10 }}>{t.badge}</span>}
            </button>
          );
        })}
      </div>

      {tab === "coaching" && <CoachingPane role={role}/>}
      {tab === "library"  && <CallLibraryPane role={role}/>}
      {tab === "product"  && <ProductTrainingPane role={role} store={store} meId={meId} requiredOpen={requiredOpen}/>}
    </div>
  );
}

/* Defer to the existing PageCoaching — it already handles all three roles.
   We strip its outer page-pad since we're already inside one. */
function CoachingPane({ role }) {
  // Render the role-specific inner component. The CoachingManager component
  // ships its own SectionPill with Floor / Coaching / NIGO / Recruiting /
  // Dispatch links — that pill is the user's ONLY way back to Team Board,
  // since Team Board isn't in any sidebar NAV. Previously this wrapper
  // applied .training-embed which CSS-hid that pill, trapping the user
  // (bug repro: Home → Coaching → Team Board → click Coaching = dead-end).
  // Pill stays visible now; the two nav rows have different scopes and that's OK.
  const Inner = role === "manager" ? window.CoachingManager
              : role === "owner"   ? window.CoachingOwner
              : window.CoachingRep;
  const Fallback = window.PageCoaching;
  if (!Inner && !Fallback) return <div style={{ padding: 30, color: "var(--text-tertiary)" }}>Coaching module loading…</div>;
  return (
    <div className="coaching-embed">
      {Inner ? <Inner/> : <Fallback role={role}/>}
    </div>
  );
}

function CallLibraryPane({ role }) {
  const [, force] = React.useState(0);
  const fileRef = React.useRef(null);
  const [selId, setSelId] = React.useState(null);
  const [q, setQ] = React.useState("");
  const [uploadLead, setUploadLead] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const [dragActive, setDragActive] = React.useState(false);

  React.useEffect(() => {
    const h = () => force(n => n + 1);
    window.addEventListener("data:hydrated", h);
    window.addEventListener("data:mutated", h);
    window.addEventListener("data:realtime", h);
    return () => {
      window.removeEventListener("data:hydrated", h);
      window.removeEventListener("data:mutated", h);
      window.removeEventListener("data:realtime", h);
    };
  }, []);

  const { RECORDINGS = [], REPS = [] } = AppData;
  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  const meId = meIdent?.rep_id || (window.isDemoAgency && window.isDemoAgency() ? REPS[0]?.id : null);
  const visible = role === "rep" ? RECORDINGS.filter(r => !r.repId || r.repId === meId) : RECORDINGS;

  const filtered = visible.filter(r => !q || String(r.lead || "").toLowerCase().includes(q.toLowerCase()));
  const sel = filtered.find(r => r.id === selId) || filtered[0];
  const fmtDur = (sec) => {
    const n = Math.max(0, Number(sec || 0));
    return `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}`;
  };
  const scoreColor = (score) => score == null ? "var(--text-quaternary)" : score >= 80 ? "var(--accent-money)" : score >= 60 ? "var(--state-warning)" : "var(--state-danger)";

  const openRecorder = (mode = "roleplay", returnTab = mode === "mic" ? "library" : "coaching") => {
    try {
      sessionStorage.setItem("repflow.recorder.mode", mode);
      sessionStorage.setItem("repflow.recorder.returnPage", "training");
      sessionStorage.setItem("repflow.recorder.returnTab", returnTab);
      sessionStorage.setItem("repflow.recorder.prefill", JSON.stringify({
        leadName: mode === "roleplay" ? "Roleplay session" : "",
      }));
    } catch {}
    window.gotoPage?.("recorder");
  };

  async function readMediaDuration(file) {
    return new Promise(resolve => {
      const el = document.createElement((file.type || "").startsWith("video/") ? "video" : "audio");
      const url = URL.createObjectURL(file);
      const done = (value) => { URL.revokeObjectURL(url); resolve(value); };
      const t = setTimeout(() => done(null), 2500);
      el.preload = "metadata";
      el.onloadedmetadata = () => {
        clearTimeout(t);
        done(Number.isFinite(el.duration) ? Math.max(1, Math.round(el.duration)) : null);
      };
      el.onerror = () => { clearTimeout(t); done(null); };
      el.src = url;
    });
  }

  async function uploadFiles(files) {
    const file = Array.from(files || [])[0];
    if (!file) return;
    setUploading(true);
    try {
      const sb = window.getSupabase?.();
      const { data } = await (sb?.auth.getSession?.() || Promise.resolve({ data: {} }));
      const jwt = data?.session?.access_token;
      const duration = await readMediaDuration(file);
      const leadName = uploadLead.trim() || file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
      const fd = new FormData();
      fd.append("file", file, file.name || "call.webm");
      fd.append("mime", file.type || "audio/webm");
      fd.append("channels", "uploaded");
      if (duration) fd.append("duration_sec", String(duration));
      if (leadName) fd.append("lead_name", leadName);
      const r = await fetch("/api/call-recording-upload", {
        method: "POST",
        headers: jwt ? { "x-supabase-auth": `Bearer ${jwt}` } : {},
        body: fd,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `upload failed (${r.status})`);

      const now = new Date();
      const optimistic = {
        id: j.id,
        lead: leadName || "Uploaded call",
        repId: meId,
        agencyId: meIdent?.agency_id || null,
        recordedAt: now.toISOString(),
        date: now.toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" }),
        durSec: duration || 0,
        talkRatio: null,
        openQ: null,
        ai: null,
        flags: { tpmo: null, soa: null },
        score: null,
        audioPath: j.audio_path || null,
        source: "upload",
      };
      AppData.RECORDINGS = [optimistic, ...(AppData.RECORDINGS || []).filter(r => r.id !== optimistic.id)];
      setSelId(optimistic.id);
      setUploadLead("");
      force(n => n + 1);
      window.dispatchEvent(new CustomEvent("data:hydrated"));
      window.toast?.("Call uploaded — transcription and coaching will run automatically.", "success");
      setTimeout(() => window.hydrateFromSupabase?.(), 1500);
    } catch (e) {
      window.toast?.(`Call upload failed: ${e.message || e}`, "error");
    } finally {
      setUploading(false);
      setDragActive(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="calls-grid" style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 14 }}>
      <div className="panel" style={{ display: "flex", flexDirection: "column" }}>
        <div className="panel-h" style={{ borderBottom: "1px solid var(--border-subtle)", paddingBottom: 10 }}>
          <h3>Call Library</h3>
          <span className="meta">{filtered.length} calls</span>
          <input className="text-input" style={{ width: 140, marginLeft: "auto", fontSize: 11.5 }} placeholder="Search calls…" value={q} onChange={(e) => setQ(e.target.value)}/>
        </div>

        {/* Prominent Quick Actions: Record & Upload Modules */}
        <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 10, borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-base)" }}>
          {/* Card A: Quick Record */}
          <div style={{ padding: 10, background: "var(--bg-raised)", border: "1px solid var(--border-subtle)", borderRadius: 8, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--state-danger)", animation: "spin 2s linear infinite" }} />
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>Record Live Session</div>
            </div>
            <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", lineHeight: 1.4 }}>
              Record microphone and system audio directly from your browser.
            </div>
            <button className="btn btn-primary btn-sm" style={{ width: "100%", justifyContent: "center", gap: 6, fontWeight: 700 }} onClick={() => openRecorder("mic", "library")}>
              <Icons.Mic size={12}/> Start Recording
            </button>
          </div>

          {/* Card B: Quick Drop Zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => { e.preventDefault(); uploadFiles(e.dataTransfer.files); }}
            style={{
              padding: "12px 10px",
              border: `2px dashed ${dragActive ? "var(--accent-money)" : "var(--border-subtle)"}`,
              borderRadius: 8,
              background: dragActive ? "color-mix(in oklch, var(--accent-money) 8%, transparent)" : "var(--bg-raised)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              textAlign: "center",
              cursor: "pointer",
              transition: "border-color .15s, background .15s",
            }}
            onClick={() => fileRef.current?.click()}
          >
            <Icons.Upload size={20} style={{ color: dragActive ? "var(--accent-money)" : "var(--text-tertiary)", transition: "transform 0.2s" }}/>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>Quick Drop Call File</div>
              <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 2 }}>
                {uploading ? "Uploading audio/video…" : "Drag audio or video here or click to browse"}
              </div>
            </div>
            <input ref={fileRef} type="file" accept="audio/*,video/*,.m4a,.mp3,.wav,.webm,.ogg" style={{ display: "none" }} onChange={(e) => uploadFiles(e.target.files)}/>
          </div>
        </div>
        <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6, maxHeight: 520, overflowY: "auto" }}>
          {filtered.map(r => (
            <button key={r.id} onClick={() => setSelId(r.id)} className="btn btn-ghost" style={{ justifyContent: "flex-start", padding: 10, background: sel?.id === r.id ? "var(--bg-overlay)" : "var(--bg-raised)", border: "1px solid var(--border-subtle)", flexDirection: "column", alignItems: "stretch", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                <strong style={{ fontSize: 12.5, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.lead || "Uploaded call"}</strong>
                <span className="tabular" style={{ color: scoreColor(r.score), fontSize: 11.5 }}>{r.score ?? "—"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-tertiary)", fontSize: 11 }}>
                <span>{r.date}</span>
                <span className="mono">{fmtDur(r.durSec)}</span>
              </div>
            </button>
          ))}
          {filtered.length === 0 && <div style={{ padding: 20, color: "var(--text-tertiary)", fontSize: 12, textAlign: "center" }}>No recordings match.</div>}
        </div>
      </div>

      {sel && (
        <div className="panel">
          <div className="panel-h">
            <Icons.Headset size={13}/>
            <h3>{sel.lead || "Uploaded call"} · score {sel.score ?? "—"}</h3>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <button className="btn btn-ghost" onClick={() => window.dispatchEvent(new CustomEvent("ai:ask", { detail: { prompt: `Summarize the call with ${sel.lead || "this uploaded call"} and grade my open-ended question rate`, context: "Call · " + (sel.lead || "Uploaded call") }}))}><Icons.Sparkles size={11}/> Analyze</button>
              <button className="btn btn-ghost" onClick={() => window.dispatchEvent(new CustomEvent("ai:ask", { detail: { prompt: `Fix this call: identify the top 3 issues, rewrite the opener, and give me a clean next-call version for ${sel.lead || "this uploaded call"}.`, context: "Call · " + (sel.lead || "Uploaded call") }}))}><Icons.WandSparkles size={11}/> Fix</button>
            </div>
          </div>
          <div style={{ padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-tertiary)", fontSize: 11 }}>
              <span className="mono">00:00</span>
              <div style={{ flex: 1, height: 36, position: "relative", background: "var(--bg-raised)", borderRadius: 4, overflow: "hidden" }}>
                <svg width="100%" height="36" viewBox="0 0 240 36" preserveAspectRatio="none">
                  {Array.from({ length: 80 }).map((_, i) => {
                    const h = 4 + Math.abs(Math.sin(i * 0.5 + (sel.id?.length || 0))) * 26 + (i % 7 === 0 ? 4 : 0);
                    return <rect key={i} x={i * 3} y={(36 - h) / 2} width="1.6" height={h} fill={i < 48 ? "var(--accent-money)" : "var(--text-quaternary)"}/>;
                  })}
                </svg>
              </div>
              <span className="mono">{fmtDur(sel.durSec)}</span>
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span className={`chip ${sel.talkRatio == null ? "" : sel.talkRatio < 50 ? "chip-money" : "chip-status"}`}>Talk: {sel.talkRatio == null ? "—" : `${sel.talkRatio}%`}</span>
              <span className="chip">Open Q: {sel.openQ ?? "—"}</span>
              <span className={`chip ${sel.flags?.tpmo === "ok" ? "chip-money" : sel.flags?.tpmo ? "chip-status" : ""}`}>TPMO {sel.flags?.tpmo === "ok" ? "✓" : sel.flags?.tpmo || "—"}</span>
              <span className={`chip ${sel.flags?.soa === "captured" || sel.flags?.soa === "scheduled" ? "chip-money" : ""}`}>SOA {sel.flags?.soa || "—"}</span>
            </div>
            <div style={{ marginTop: 14, padding: 12, background: "var(--bg-raised)", borderRadius: 6, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.55 }}>
              <strong style={{ color: "var(--text-primary)" }}>AI summary —</strong> {sel.ai || <span style={{ color: "var(--text-tertiary)" }}>processing…</span>}
            </div>
            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
              <div style={{ padding: 10, background: "var(--bg-raised)", borderRadius: 6, border: "1px solid var(--border-subtle)" }}>
                <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", textTransform: "uppercase" }}>Upload</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>Blob lands in `call-recordings` and creates a `call_recordings` row.</div>
              </div>
              <div style={{ padding: 10, background: "var(--bg-raised)", borderRadius: 6, border: "1px solid var(--border-subtle)" }}>
                <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", textTransform: "uppercase" }}>Transcript</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>Cron turns it into text, then the transcript appears here.</div>
              </div>
              <div style={{ padding: 10, background: "var(--bg-raised)", borderRadius: 6, border: "1px solid var(--border-subtle)" }}>
                <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", textTransform: "uppercase" }}>Coach</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>Scoring attaches after transcription, and the AI panel updates automatically.</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProductTrainingPane({ role, store, meId, requiredOpen }) {
  // Management track (can author): owner / super_admin → author UI
  // Manager track (assign + track downline progress): manager → manager UI
  // Everyone else (rep, viewer): take courses
  if (role === "owner" || role === "super_admin") {
    return <ProductTrainingOwner store={store}/>;
  }
  if (role === "manager") {
    return <ProductTrainingManager store={store}/>;
  }
  return <ProductTrainingRep store={store} meId={meId} requiredOpen={requiredOpen}/>;
}

/* ─── ProductTrainingEmbedded ─────────────────────────────────────────────
   Self-contained mount used by PageLibrary's "Courses" tab. Wraps the same
   ProductTraining pane the PageTraining route renders, but pulls the store
   + meId + requiredOpen counter internally so the embedder only passes role.
   Exposed on window so any page can drop it in without duplicating wiring. */
function ProductTrainingEmbedded({ role = "rep" }) {
  const store = ProductTraining.useStore();
  const meId = (window.me && window.me()?.rep_id) || AppData.REPS[0]?.id || null;
  const requiredOpen = meId
    ? ProductTraining.openRequiredCount(meId, store.courses, store.progress, store.assignments)
    : 0;
  return <ProductTrainingPane role={role} store={store} meId={meId} requiredOpen={requiredOpen}/>;
}

/* ─── Default video library + scripts library ─────────────────────────────
   Both seed lists. The user's library is `seeds + localStorage extras`,
   merged at render time. Owner can edit via TrainingOwner authoring view. */
// Placeholder cards — owners paste real training URLs via TrainingOwner authoring view.
// src intentionally empty so the embed renders an empty state, not a placeholder video.
const DEFAULT_VIDEOS = [
  { id: "v-medg",  title: "Med Supp · Plan G — opening + objections",  cat: "Med Supp",      durMin: 12, src: "", thumb: "" },
  { id: "v-fe",    title: "Final Expense — empathy & emotional setup", cat: "Final Expense", durMin: 18, src: "", thumb: "" },
  { id: "v-aep",   title: "AEP — fast switch reasons that close",      cat: "AEP",           durMin: 9,  src: "", thumb: "" },
  { id: "v-iul",   title: "IUL — target premium vs annual premium",    cat: "Life",          durMin: 22, src: "", thumb: "" },
  { id: "v-tpmo",  title: "TPMO disclosure — verbatim walkthrough",    cat: "Compliance",    durMin: 6,  src: "", thumb: "" },
  { id: "v-cross", title: "Cross-sell — Med Supp → FE in one call",    cat: "Med Supp",      durMin: 14, src: "", thumb: "" },
];

const VIDEO_CATS  = ["All", "Med Supp", "Final Expense", "AEP", "Life", "Compliance"];
const SCRIPT_CATS = ["All", "Open", "Discovery", "Cross-sell", "Compliance"];

function useLocalArray(key, seed) {
  const [items, setItems] = React.useState(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch (e) { console.warn("[useLocalArray.read]", key, e); }
    return seed;
  });
  React.useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(items)); } catch (e) { console.warn("[useLocalArray.write]", key, e); }
  }, [items]);
  return [items, setItems];
}

function VideoLibrary({ canEdit = true }) {
  // Resource data is now agency-shared via AppData.VIDEOS (migration 0010);
  // fall back to seed when nothing has been added yet so the page never
  // renders empty for fresh agencies.
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const fn = () => force(n => n + 1);
    window.addEventListener("data:hydrated", fn);
    window.addEventListener("data:mutated", fn);
    window.addEventListener("data:realtime", fn);
    return () => {
      window.removeEventListener("data:hydrated", fn);
      window.removeEventListener("data:mutated", fn);
      window.removeEventListener("data:realtime", fn);
    };
  }, []);
  const live   = (window.AppData && window.AppData.VIDEOS) || [];
  const videos = live.length > 0 ? live : (window.isDemoAgency && window.isDemoAgency() ? DEFAULT_VIDEOS : []);
  const [cat, setCat]             = React.useState("All");
  const [q, setQ]                 = React.useState("");
  const [sel, setSel]             = React.useState(null);
  const [editing, setEditing]     = React.useState(null);  // {id?, title, cat, durMin, url}
  const filtered = videos.filter(v =>
    (cat === "All" || v.cat === cat) &&
    (!q || v.title.toLowerCase().includes(q.toLowerCase()))
  );

  const startNew  = () => setEditing({ id: null, title: "", cat: "Med Supp", durMin: "", url: "" });
  const startEdit = (v) => {
    const guess = v.src && v.src.includes("/embed/")
      ? v.src.replace("youtube.com/embed/", "youtube.com/watch?v=").replace("player.vimeo.com/video/", "vimeo.com/")
      : v.sourceUrl || v.src;
    setEditing({ id: v.id, title: v.title, cat: v.cat, durMin: v.durMin || "", url: guess || "" });
  };
  const saveVideo = async () => {
    const url = (editing.url || "").trim();
    if (!editing.title.trim() || !url) return;
    const src = toEmbedSrc(url);
    const thumb = thumbFromUrl(url) || editing.thumb || "";
    try {
      await window.AppData.mutate.videoUpsert({
        id: editing.id,
        title: editing.title.trim(),
        cat: editing.cat,
        durMin: +editing.durMin || 0,
        src, thumb,
        sourceUrl: url,
        sourceLabel: detectVideoSourceLabel(url),
      });
      window.toast && window.toast(editing.id ? "Video updated" : "Video added", "success");
      setEditing(null);
    } catch (_e) {
      // toast already raised by mutator
    }
  };
  const removeVideo = async (id) => {
    if (sel?.id === id) setSel(null);
    try { await window.AppData.mutate.videoDelete(id); window.toast && window.toast("Video removed", "info"); }
    catch (e) { window.toast?.(`Video delete failed: ${e?.message || e}`, "error"); console.error("[vault.videoDelete]", e); }
  };

  return (
    <div className="panel">
      <div className="panel-h">
        <Icons.Video size={13}/>
        <h3>Video library</h3>
        <span className="meta">{filtered.length} of {videos.length}</span>
        <input className="text-input" style={{ width: 220, marginLeft: "auto" }} placeholder="Search videos…" value={q} onChange={(e) => setQ(e.target.value)}/>
        {canEdit && (
          <button className="btn btn-primary" onClick={startNew}><Icons.Plus size={12}/> Add video</button>
        )}
      </div>
      <div style={{ padding: "10px 14px 0", display: "flex", gap: 4, flexWrap: "wrap" }}>
        {VIDEO_CATS.map(c => (
          <button key={c} className="btn btn-ghost" onClick={() => setCat(c)}
            style={{ padding: "4px 10px", fontSize: 11.5, background: cat === c ? "var(--bg-raised)" : "transparent", color: cat === c ? "var(--text-primary)" : "var(--text-tertiary)" }}>
            {c}
          </button>
        ))}
      </div>
      <div style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
        {filtered.map(v => (
          <div key={v.id} style={{ background: "var(--bg-raised)", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border-subtle)", position: "relative" }}>
            <div onClick={() => setSel(v)} style={{ position: "relative", paddingTop: "56.25%", background: "var(--bg-overlay)", cursor: "pointer" }}>
              {v.thumb && <img src={v.thumb} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}/>}
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.25)" }}>
                <div style={{ width: 40, height: 40, borderRadius: 999, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icons.Play size={16} style={{ color: "white", marginLeft: 2 }}/>
                </div>
              </div>
              {v.durMin > 0 && <div style={{ position: "absolute", bottom: 6, right: 6, padding: "2px 6px", background: "rgba(0,0,0,0.7)", borderRadius: 3, fontSize: 10.5, color: "white" }}>{v.durMin}m</div>}
              {v.sourceLabel && <div style={{ position: "absolute", top: 6, left: 6, padding: "2px 6px", background: "rgba(0,0,0,0.55)", borderRadius: 3, fontSize: 9.5, color: "white", textTransform: "uppercase", letterSpacing: "0.05em" }}>{v.sourceLabel}</div>}
            </div>
            <div style={{ padding: 10, display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 12.5 }} className="cell-truncate">{v.title}</div>
                <div style={{ marginTop: 4 }}><span className="chip">{v.cat}</span></div>
              </div>
              {canEdit && (
                <>
                  <button className="icon-btn" onClick={(e) => { e.stopPropagation(); startEdit(v); }} title="Edit"><Icons.Edit size={11}/></button>
                  <button className="icon-btn" onClick={(e) => { e.stopPropagation(); removeVideo(v.id); }} title="Remove" style={{ color: "var(--state-danger)" }}><Icons.X size={11}/></button>
                </>
              )}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ gridColumn: "1 / -1", padding: 30, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>
            No videos match your filter. {canEdit && <span>Click <strong style={{ color: "var(--text-secondary)" }}>Add video</strong> to paste a YouTube / Vimeo / Loom / Wistia URL.</span>}
          </div>
        )}
      </div>

      {sel && (
        <Shared.Modal title={sel.title} width={800} onClose={() => setSel(null)}>
          {isDirectVideo(sel.src) ? (
            <video src={sel.src} controls autoPlay style={{ width: "100%", borderRadius: 6, background: "black" }}/>
          ) : (
            <div style={{ position: "relative", paddingTop: "56.25%", background: "black", borderRadius: 6, overflow: "hidden" }}>
              <iframe src={sel.src} title={sel.title} allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}/>
            </div>
          )}
          <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
            <Icons.Clock size={11}/> {sel.durMin || 0} min · <span className="chip">{sel.cat}</span>
            {sel.sourceLabel && <span className="chip" style={{ fontSize: 9.5 }}>{sel.sourceLabel}</span>}
          </div>
        </Shared.Modal>
      )}

      {editing && (
        <Shared.Modal title={editing.id ? "Edit video" : "Add video to library"} width={560} onClose={() => setEditing(null)}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
            <Shared.Field label="Video URL (YouTube / Vimeo / Loom / Wistia / direct .mp4)">
              <input className="text-input" value={editing.url} onChange={(e) => setEditing({ ...editing, url: e.target.value })}
                placeholder="https://www.youtube.com/watch?v=… or https://vimeo.com/… etc."
                autoFocus={!editing.id}/>
            </Shared.Field>
            <Shared.Field label="Title">
              <input className="text-input" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Plan G — opening line walkthrough"/>
            </Shared.Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 100px", gap: 10 }}>
              <Shared.Field label="Category">
                <Shared.Select value={editing.cat} onChange={(v) => setEditing({ ...editing, cat: v })}
                  options={VIDEO_CATS.filter(c => c !== "All").map(c => ({ v: c, l: c }))}/>
              </Shared.Field>
              <Shared.Field label="Length (min)">
                <input className="text-input" type="number" value={editing.durMin} onChange={(e) => setEditing({ ...editing, durMin: e.target.value })} placeholder="12"/>
              </Shared.Field>
            </div>
            {editing.url && (
              <div style={{ padding: 10, background: "var(--bg-raised)", borderRadius: 6, fontSize: 11, color: "var(--text-tertiary)" }}>
                <strong style={{ color: "var(--text-secondary)" }}>{detectVideoSourceLabel(editing.url)}</strong> · embed src: <code style={{ wordBreak: "break-all" }}>{toEmbedSrc(editing.url)}</code>
              </div>
            )}
          </div>
          <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
            <button className="btn btn-primary" disabled={!editing.title.trim() || !editing.url.trim()} onClick={saveVideo}>
              {editing.id ? "Save" : "Add to library"}
            </button>
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </Shared.Modal>
      )}
    </div>
  );
}

function ScriptsLibrary({ canEdit = true }) {
  // Agency-shared via AppData.SCRIPTS_LIB (migration 0010); demo fallback only.
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const fn = () => force(n => n + 1);
    window.addEventListener("data:hydrated", fn);
    window.addEventListener("data:mutated", fn);
    window.addEventListener("data:realtime", fn);
    return () => {
      window.removeEventListener("data:hydrated", fn);
      window.removeEventListener("data:mutated", fn);
      window.removeEventListener("data:realtime", fn);
    };
  }, []);
  const scripts = (window.AppData && window.AppData.SCRIPTS_LIB) || [];
  const [cat, setCat]             = React.useState("All");
  const [q, setQ]                 = React.useState("");
  const [openId, setOpenId]       = React.useState(null);
  const [editing, setEditing]     = React.useState(null);   // {id?, title, cat, body}
  const [copyToast, setCopyToast] = React.useState(null);
  const [importOpen, setImportOpen] = React.useState(false);
  const [importMode, setImportMode] = React.useState("text");
  const [importBusy, setImportBusy] = React.useState(false);
  const [importDraft, setImportDraft] = React.useState({
    title: "",
    cat: "Open",
    body: "",
    gdocUrl: "",
    pdfFile: null,
  });

  const filtered = scripts.filter(s =>
    (cat === "All" || s.cat === cat) &&
    (!q || s.title.toLowerCase().includes(q.toLowerCase()) || s.body.toLowerCase().includes(q.toLowerCase()))
  );
  const open = openId ? scripts.find(s => s.id === openId) : null;

  const inferTitle = (text, fallback = "Imported script") => {
    const firstLine = String(text || "")
      .split(/\r?\n/)
      .map(s => s.trim())
      .find(Boolean);
    if (!firstLine) return fallback;
    return firstLine.length > 72 ? `${firstLine.slice(0, 69).trim()}…` : firstLine;
  };

  const startNew  = () => setEditing({ id: null, title: "", cat: "Open", body: "" });
  const startEdit = (s) => setEditing({ id: s.id, title: s.title, cat: s.cat, body: s.body });
  const save = async () => {
    if (!editing.title.trim() || !editing.body.trim()) return;
    try {
      await window.AppData.mutate.scriptUpsert({
        id: editing.id,
        title: editing.title.trim(),
        cat: editing.cat,
        body: editing.body,
      });
      window.toast && window.toast(editing.id ? "Script updated" : "Script added", "success");
      setEditing(null);
    } catch (e) { window.toast?.(`Script save failed: ${e?.message || e}`, "error"); console.error("[scripts.upsert]", e); }
  };
  const remove = async (id) => {
    if (openId === id) setOpenId(null);
    try { await window.AppData.mutate.scriptDelete(id); window.toast && window.toast("Script removed", "info"); }
    catch (e) { window.toast?.(`Script delete failed: ${e?.message || e}`, "error"); console.error("[scripts.delete]", e); }
  };
  const copyBody = async (s) => {
    try {
      await navigator.clipboard.writeText(s.body);
      setCopyToast(s.id);
      setTimeout(() => setCopyToast(null), 1400);
    } catch (_e) {
      window.toast && window.toast("Copy blocked by browser", "warn");
    }
  };
  const openImport = (mode = "text") => {
    setImportMode(mode);
    setImportDraft({ title: "", cat: "Open", body: "", gdocUrl: "", pdfFile: null });
    setImportOpen(true);
  };
  const persistImported = async ({ title, cat, body, description }) => {
    const row = await window.AppData.mutate.scriptUpsert({
      title,
      cat,
      body,
      description,
    });
    setOpenId(row?.id || null);
    return row;
  };
  const runImport = async () => {
    if (!canEdit || importBusy) return;
    const cat = importDraft.cat || "Open";
    try {
      setImportBusy(true);
      if (importMode === "text") {
        const body = importDraft.body.trim();
        if (!body) return;
        const title = (importDraft.title || "").trim() || inferTitle(body);
        await persistImported({ title, cat, body, description: "Imported from pasted text" });
        window.toast && window.toast("Script imported", "success");
      } else if (importMode === "gdoc") {
        const url = importDraft.gdocUrl.trim();
        if (!url) return;
        const r = await fetch("/api/import-gdoc", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok || !data.ok) throw new Error(data.error || `Import failed (${r.status})`);
        const body = String(data.text || "").trim();
        if (!body) throw new Error("Imported document had no text");
        const title = (importDraft.title || "").trim() || data.title || inferTitle(body, "Imported Google Doc");
        await persistImported({ title, cat, body, description: "Imported from Google Docs" });
        window.toast && window.toast(`Imported "${title}"`, "success");
      } else if (importMode === "pdf") {
        const file = importDraft.pdfFile;
        if (!file) return;
        const fd = new FormData();
        fd.append("file", file);
        const r = await fetch("/api/import-pdf", { method: "POST", body: fd });
        const data = await r.json().catch(() => ({}));
        if (!r.ok || !data.ok) throw new Error(data.error || `Import failed (${r.status})`);
        const body = String(data.text || "").trim();
        if (!body) throw new Error("PDF had no extractable text");
        const title = (importDraft.title || "").trim() || data.title || inferTitle(body, file.name.replace(/\.pdf$/i, "") || "Imported PDF");
        await persistImported({ title, cat, body, description: `Imported from PDF${file.name ? `: ${file.name}` : ""}` });
        window.toast && window.toast(`Imported "${title}"`, "success");
      }
      setImportOpen(false);
      setImportDraft({ title: "", cat: "Open", body: "", gdocUrl: "", pdfFile: null });
    } catch (e) {
      window.toast?.(e?.message || "Import failed", "error");
      console.error("[scripts.import]", e);
    } finally {
      setImportBusy(false);
    }
  };

  return (
    <div className="panel">
      <div className="panel-h">
        <Icons.FileText size={13}/>
        <h3>Scripts library</h3>
        <span className="meta">{filtered.length} of {scripts.length}</span>
        <input className="text-input" style={{ width: 200, marginLeft: "auto" }} placeholder="Search title or body…" value={q} onChange={(e) => setQ(e.target.value)}/>
        {canEdit && <button className="btn btn-ghost" onClick={() => openImport("text")}><Icons.ArrowUpRight size={12}/> Import</button>}
        {canEdit && <button className="btn btn-primary" onClick={startNew}><Icons.Plus size={12}/> New</button>}
      </div>
      <div style={{ padding: "10px 14px 0", display: "flex", gap: 4, flexWrap: "wrap" }}>
        {SCRIPT_CATS.map(c => (
          <button key={c} className="btn btn-ghost" onClick={() => setCat(c)}
            style={{ padding: "4px 10px", fontSize: 11.5, background: cat === c ? "var(--bg-raised)" : "transparent", color: cat === c ? "var(--text-primary)" : "var(--text-tertiary)" }}>
            {c}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: open ? "1fr 1.4fr" : "1fr", gap: 0 }}>
        <div className="list" style={{ borderRight: open ? "1px solid var(--border-subtle)" : "none" }}>
          {filtered.map(s => (
            <div key={s.id} className="row" style={{ gridTemplateColumns: "1.4fr 90px 80px 90px", height: 40, cursor: "pointer", background: openId === s.id ? "var(--bg-raised)" : undefined }}
              onClick={() => setOpenId(s.id)}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 12.5 }}>{s.title}</div>
                <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{s.version} · {s.updated}</div>
              </div>
              <div><span className="chip">{s.cat}</span></div>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{s.body.split(" ").length}w</div>
              <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                <button className="icon-btn" onClick={(e) => { e.stopPropagation(); copyBody(s); }} title="Copy">
                  {copyToast === s.id ? <Icons.Check size={11} style={{ color: "var(--accent-money)" }}/> : <Icons.Copy size={11}/>}
                </button>
                {canEdit && <button className="icon-btn" onClick={(e) => { e.stopPropagation(); startEdit(s); }} title="Edit"><Icons.Edit size={11}/></button>}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: 30, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>
              No scripts match your filter.
            </div>
          )}
        </div>

        {open && (
          <div style={{ padding: 16, background: "var(--bg-elevated)" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
              <strong style={{ fontSize: 14 }}>{open.title}</strong>
              <span className="meta" style={{ fontSize: 11 }}>{open.version} · {open.updated}</span>
            </div>
            <div style={{ marginBottom: 12 }}><span className="chip">{open.cat}</span></div>
            <div style={{ padding: 14, background: "var(--bg-raised)", borderRadius: 6, fontSize: 13.5, lineHeight: 1.7, color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>
              {open.body}
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-tertiary)" }}>
              Variables: <code style={{ fontSize: 11 }}>{`{{lead_name}}`}</code> · <code style={{ fontSize: 11 }}>{`{{rep_first}}`}</code> · <code style={{ fontSize: 11 }}>{`{{n_orgs}}`}</code> are filled at speak-time on the dialer.
            </div>
            <div style={{ marginTop: 14, display: "flex", gap: 8, justifyContent: "flex-end" }}>
              {canEdit && (
                <button className="btn btn-ghost" onClick={() => remove(open.id)} style={{ color: "var(--state-danger)" }}>
                  <Icons.X size={11}/> Delete
                </button>
              )}
              <button className="btn" onClick={() => copyBody(open)}>
                {copyToast === open.id ? <><Icons.Check size={11}/> Copied</> : <><Icons.Copy size={11}/> Copy</>}
              </button>
              {canEdit && (
                <button className="btn btn-primary" onClick={() => startEdit(open)}>
                  <Icons.Edit size={11}/> Edit
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {editing && (
        <Shared.Modal title={editing.id ? "Edit script" : "New script"} width={620} onClose={() => setEditing(null)} actions={
          <>
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={!editing.title.trim() || !editing.body.trim()}>
              <Icons.Check size={11}/> {editing.id ? "Save" : "Add"}
            </button>
          </>
        }>
          <Shared.Field label="Title">
            <input className="text-input" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Med Supp · Plan G open" autoFocus/>
          </Shared.Field>
          <Shared.Field label="Category">
            <Shared.Select value={editing.cat} onChange={(v) => setEditing({ ...editing, cat: v })} options={SCRIPT_CATS.filter(c => c !== "All").map(c => ({ v: c, l: c }))}/>
          </Shared.Field>
          <Shared.Field label="Body">
            <textarea className="text-input" rows={10} value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })}
              placeholder={`Hi {{lead_name}}, this is {{rep_first}} with {{agency_name}}...`}
              style={{ width: "100%", lineHeight: 1.6, fontFamily: "var(--font-ui)" }}/>
          </Shared.Field>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
            Use <code style={{ fontSize: 11 }}>{`{{lead_name}}`}</code> / <code style={{ fontSize: 11 }}>{`{{rep_first}}`}</code> for runtime substitution.
          </div>
        </Shared.Modal>
      )}

      {importOpen && (
        <Shared.Modal title="Import script" width={720} onClose={() => !importBusy && setImportOpen(false)} actions={
          <>
            <button className="btn btn-ghost" onClick={() => !importBusy && setImportOpen(false)} disabled={importBusy}>Cancel</button>
            <button className="btn btn-primary" onClick={runImport} disabled={importBusy}>
              {importBusy ? "Importing…" : <><Icons.Check size={11}/> Import</>}
            </button>
          </>
        }>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {[
              { k: "text", l: "Paste text" },
              { k: "gdoc", l: "Google Doc" },
              { k: "pdf", l: "PDF" },
            ].map(t => (
              <button
                key={t.k}
                type="button"
                className="btn btn-ghost"
                onClick={() => setImportMode(t.k)}
                style={{
                  padding: "4px 10px",
                  fontSize: 11.5,
                  background: importMode === t.k ? "var(--bg-raised)" : "transparent",
                  color: importMode === t.k ? "var(--text-primary)" : "var(--text-tertiary)",
                }}
              >
                {t.l}
              </button>
            ))}
          </div>

          <Shared.Field label="Title (optional)">
            <input
              className="text-input"
              value={importDraft.title}
              onChange={(e) => setImportDraft({ ...importDraft, title: e.target.value })}
              placeholder="Leave blank to infer from the source"
            />
          </Shared.Field>
          <Shared.Field label="Category">
            <Shared.Select value={importDraft.cat} onChange={(v) => setImportDraft({ ...importDraft, cat: v })} options={SCRIPT_CATS.filter(c => c !== "All").map(c => ({ v: c, l: c }))}/>
          </Shared.Field>

          {importMode === "text" && (
            <Shared.Field label="Paste script text">
              <textarea
                className="text-input"
                rows={11}
                value={importDraft.body}
                onChange={(e) => setImportDraft({ ...importDraft, body: e.target.value })}
                placeholder="Paste the script here. The first non-empty line will be used as the title if you leave the title blank."
                style={{ width: "100%", lineHeight: 1.6, fontFamily: "var(--font-ui)" }}
              />
            </Shared.Field>
          )}

          {importMode === "gdoc" && (
            <Shared.Field label="Google Docs / Sheets / Slides URL">
              <input
                className="text-input"
                value={importDraft.gdocUrl}
                onChange={(e) => setImportDraft({ ...importDraft, gdocUrl: e.target.value })}
                placeholder="https://docs.google.com/document/d/..."
              />
            </Shared.Field>
          )}

          {importMode === "pdf" && (
            <Shared.Field label="PDF file">
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => setImportDraft({ ...importDraft, pdfFile: e.target.files?.[0] || null })}
              />
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 6 }}>
                {importDraft.pdfFile ? importDraft.pdfFile.name : "Upload a PDF and the text will be extracted into a new script."}
              </div>
            </Shared.Field>
          )}
        </Shared.Modal>
      )}
    </div>
  );
}

/* ─── Status chip helper used across rep/manager/owner views ─────────── */
const STATUS_CHIP_CLASS = {
  "complete":    "chip-money",
  "in-progress": "chip-info",
  "due":         "chip-status",
  "overdue":     "chip-status",
  "assigned":    "",
};
function StatusChip({ status }) {
  return <span className={`chip ${STATUS_CHIP_CLASS[status] || ""}`} style={status === "overdue" ? { color: "var(--state-danger)", borderColor: "var(--state-danger)" } : undefined}>{status}</span>;
}

/* ─── Reusable course list with real progress bars ────────────────────── */
function CourseList({ courses, store, repId, onOpen, showRequiredFlag }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {courses.map(c => {
        const status = ProductTraining.statusFor(repId, c, store.progress, store.assignments);
        const pct    = ProductTraining.percentFor(repId, c, store.progress);
        const cta    = status === "complete" ? "Review" : (pct > 0 ? "Resume" : "Start");
        return (
          <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "12px 14px", background: "var(--bg-raised)", border: "1px solid var(--border-subtle)", borderRadius: 8, flexWrap: "wrap", width: "100%", boxSizing: "border-box" }}>
            <div style={{ flex: "1.5 1 240px", minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--text-primary)" }}>{c.title}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                <span className="chip" style={{ fontSize: 10.5 }}>{c.track}</span>
                <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>· {c.durMin} min</span>
                {showRequiredFlag && c.required && <span style={{ fontSize: 10, color: "var(--accent-status)", fontWeight: 600, textTransform: "uppercase" }}>required</span>}
              </div>
            </div>
            <div style={{ flex: "1 1 180px", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, height: 6, background: "var(--bg-base)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: pct === 100 ? "var(--accent-money)" : "var(--accent-status)" }}></div>
              </div>
              <span className="tabular" style={{ fontSize: 11, color: "var(--text-secondary)", minWidth: 32, textAlign: "right" }}>{pct}%</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0, flexWrap: "wrap" }}>
              <StatusChip status={status}/>
              <button className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => onOpen(c)}>
                <Icons.Play size={11} style={{ marginRight: 4 }}/> {cta}
              </button>
            </div>
          </div>
        );
      })}
      {courses.length === 0 && (
        <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5, border: "1px dashed var(--border-subtle)", borderRadius: 8 }}>
          No courses here.
        </div>
      )}
    </div>
  );
}

/* ─── Course viewer (rep) — walks sections + lessons, marks complete ──── */
function CourseViewerModal({ course, repId, store, onClose }) {
  const sections = course.sections || [];
  const lessons = sections.flatMap((s, si) => (s.lessons || []).map((l, li) => ({ ...l, _sec: s.title, _i: `${si}.${li}` })));
  const total = lessons.length;
  const prog  = ProductTraining.getProgress(store.progress, repId, course.id);

  // Resume at first incomplete lesson, else 0.
  const initial = Math.max(0, lessons.findIndex(l => !prog.completedLessons.includes(l._i)));
  const [idx, setIdx] = React.useState(initial === -1 ? 0 : initial);
  const lesson = lessons[idx];
  const isDone = lesson ? prog.completedLessons.includes(lesson._i) : false;
  const completedCount = prog.completedLessons.length;
  const pct = total ? Math.round((completedCount / total) * 100) : 0;

  const toggle = () => {
    if (!lesson) return;
    if (isDone) ProductTraining.unmarkLessonComplete(repId, course.id, lesson._i);
    else        ProductTraining.markLessonComplete(repId,   course.id, lesson._i);
    if (!isDone && idx < lessons.length - 1) setIdx(idx + 1);  // auto-advance on complete
  };

  return (
    <Shared.Modal title={course.title} width={920} onClose={onClose}>
      {total === 0 ? (
        <div style={{ padding: 30, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
          This course doesn't have any lessons yet.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, fontSize: 12, color: "var(--text-tertiary)" }}>
            <div style={{ flex: 1, height: 5, background: "var(--bg-raised)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: pct === 100 ? "var(--accent-money)" : "var(--accent-status)" }}></div>
            </div>
            <span className="tabular">{completedCount} of {total} complete · {pct}%</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 14, minHeight: 420 }}>
            <div style={{ borderRight: "1px solid var(--border-subtle)", paddingRight: 12, maxHeight: 460, overflowY: "auto" }}>
              {sections.map((s, si) => (
                <div key={si} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--text-tertiary)", marginBottom: 4 }}>{s.title}</div>
                  {(s.lessons || []).map((l, li) => {
                    const lid = `${si}.${li}`;
                    const flat = lessons.findIndex(x => x._i === lid);
                    const done = prog.completedLessons.includes(lid);
                    return (
                      <button key={li} onClick={() => setIdx(flat)} className="btn btn-ghost"
                        style={{ display: "flex", justifyContent: "flex-start", width: "100%", padding: "6px 8px", fontSize: 12, background: flat === idx ? "var(--bg-raised)" : "transparent", marginBottom: 2, gap: 6 }}>
                        {done
                          ? <Icons.Check size={11} style={{ color: "var(--accent-money)" }}/>
                          : <Icons.Play size={10} style={{ color: "var(--text-tertiary)" }}/>}
                        <span style={{ flex: 1, textAlign: "left", color: done ? "var(--text-tertiary)" : "var(--text-primary)" }}>{l.title}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <div>
              {lesson && (
                <>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>{lesson._sec}</div>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>{lesson.title}</div>
                  {lesson.videoUrl ? (
                    isDirectVideo(lesson.videoUrl) ? (
                      <video src={lesson.videoUrl} controls style={{ width: "100%", borderRadius: 6, background: "black" }}/>
                    ) : (
                      <div style={{ position: "relative", paddingTop: "56.25%", background: "black", borderRadius: 6, overflow: "hidden" }}>
                        <iframe src={toEmbedSrc(lesson.videoUrl)} title={lesson.title} allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen
                          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}/>
                      </div>
                    )
                  ) : (
                    <div style={{ padding: 30, textAlign: "center", background: "var(--bg-raised)", borderRadius: 6, color: "var(--text-tertiary)", fontSize: 13 }}>
                      No video on this lesson yet.
                    </div>
                  )}
                  {lesson.description && (
                    <div style={{ marginTop: 12, padding: 12, background: "var(--bg-raised)", borderRadius: 6, fontSize: 13, lineHeight: 1.55, color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>
                      {lesson.description}
                    </div>
                  )}
                  <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
                    <button className="btn" disabled={idx === 0} onClick={() => setIdx(i => Math.max(0, i - 1))}>
                      <Icons.ArrowRight size={11} style={{ transform: "rotate(180deg)" }}/> Previous
                    </button>
                    <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>Lesson {idx + 1} of {total}</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className={isDone ? "btn" : "btn btn-primary"} onClick={toggle}>
                        {isDone ? <><Icons.X size={11}/> Mark incomplete</> : <><Icons.Check size={11}/> Mark complete</>}
                      </button>
                      <button className="btn" disabled={idx === lessons.length - 1} onClick={() => setIdx(i => Math.min(lessons.length - 1, i + 1))}>
                        Next <Icons.ArrowRight size={11}/>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </Shared.Modal>
  );
}

/* ─── Rep · Product Training ──────────────────────────────────────────── */
function ProductTrainingRep({ store, meId, requiredOpen }) {
  const [tab, setTab] = React.useState("courses");
  const [openCourse, setOpenCourse] = React.useState(null);

  const required = ProductTraining.requiredCoursesFor(meId, store.courses, store.progress, store.assignments);
  const optional = store.courses.filter(c => !required.includes(c));
  const activeCount = store.courses.filter(c => ProductTraining.statusFor(meId, c, store.progress, store.assignments) !== "complete")?.length;

  return (
    <>
      {requiredOpen > 0 && (
        <div style={{ marginBottom: 12, padding: 12, background: "color-mix(in oklch, var(--accent-status) 10%, transparent)", border: "1px solid var(--accent-status)", borderRadius: 6, display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
          <Icons.Bell size={14} style={{ color: "var(--accent-status)" }}/>
          <div style={{ flex: 1 }}>
            <strong>{requiredOpen}</strong> required onboarding course{requiredOpen === 1 ? "" : "s"} remaining. Complete these before taking your first live calls.
          </div>
        </div>
      )}

      <div style={{ display: "flex", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: 6, padding: 2, width: "fit-content", marginBottom: 12 }}>
        {[
          { k: "courses", l: "Courses",  icon: "Book" },
          { k: "videos",  l: "Videos",   icon: "Video" },
          { k: "scripts", l: "Scripts",  icon: "FileText" },
        ].map(t => {
          const Ic = Icons[t.icon];
          return (
            <button key={t.k} onClick={() => setTab(t.k)} className="btn btn-ghost"
              style={{ padding: "4px 12px", display: "flex", alignItems: "center", gap: 6, background: tab === t.k ? "var(--bg-raised)" : "transparent", color: tab === t.k ? "var(--text-primary)" : "var(--text-tertiary)" }}>
              <Ic size={12}/> {t.l}
            </button>
          );
        })}
      </div>

      <div className="kpi-row">
        <Shared.KpiCard label="Required remaining" value={requiredOpen} sub={requiredOpen === 0 ? "onboarding complete" : "must finish"}/>
        <Shared.KpiCard label="Active courses" value={activeCount}/>
        {/* Cert progress / CE hours were hardcoded "62%" / "14.5" — every
            agency saw the same fake numbers. Removed until v_user_metrics or
            an equivalent view surfaces real cert + CE counts. */}
      </div>

      {tab === "courses" && (
        <>
          {required.length > 0 && (
            <div className="panel" style={{ marginBottom: 12 }}>
              <div className="panel-h">
                <Icons.Shield size={13} style={{ color: "var(--accent-status)" }}/>
                <h3>Required onboarding</h3>
                <span className="meta">{required.filter(c => ProductTraining.statusFor(meId, c, store.progress, store.assignments) === "complete")?.length} of {required.length} complete</span>
              </div>
              <CourseList courses={required} store={store} repId={meId} onOpen={setOpenCourse}/>
            </div>
          )}
          <div className="panel">
            <div className="panel-h"><Icons.Book size={13}/><h3>My courses</h3></div>
            <CourseList courses={optional} store={store} repId={meId} onOpen={setOpenCourse}/>
          </div>
        </>
      )}

      {tab === "videos"  && <VideoLibrary canEdit={role !== "rep"}/>}
      {tab === "scripts" && <ScriptsLibrary canEdit={role !== "rep"}/>}

      {openCourse && <CourseViewerModal course={openCourse} repId={meId} store={store} onClose={() => setOpenCourse(null)}/>}
    </>
  );
}

/* ─── Manager · Product Training ─────────────────────────────────────── */
function ProductTrainingManager({ store }) {
  const { REPS } = AppData;
  const [showAssign, setShowAssign] = React.useState(false);
  const [editing, setEditing]       = React.useState(null);
  const [openCourse, setOpenCourse] = React.useState(null);
  const meId = (window.me && window.me()?.rep_id) || REPS[0]?.id || null;

  const newCourse = () => setEditing({
    id: "c-" + Date.now(),
    title: "",
    track: "Onboarding",
    durMin: 0,
    status: "assigned",
    required: false,
    description: "",
    sections: [],
    targetRoles: ["owner","manager","rep"],
    coverUrl: "",
    _isNew: true,
  });
  const saveCourse = (course) => {
    const { _isNew, ...c } = course;
    if (_isNew) store.saveCourses(cs => [...cs, c]);
    else        store.saveCourses(cs => cs.map(x => x.id === c.id ? c : x));
    window.toast && window.toast(_isNew ? "Course created" : "Course saved", "success");
    setEditing(null);
  };

  // Per-rep: # required courses overdue or stuck.
  const atRisk = REPS.map(r => {
    const required = ProductTraining.requiredCoursesFor(r.id, store.courses, store.progress, store.assignments);
    const overdue  = required.filter(c => ProductTraining.statusFor(r.id, c, store.progress, store.assignments) === "overdue");
    const open     = required.filter(c => ProductTraining.statusFor(r.id, c, store.progress, store.assignments) !== "complete");
    return { rep: r, overdue, open };
  }).filter(x => x.overdue.length > 0 || (x.open.length >= 2));

  // Avg completion rate column per rep across all courses.
  const repAvg = (rep) => {
    if (store.courses.length === 0) return 0;
    const sum = store.courses.reduce((a, c) => a + ProductTraining.percentFor(rep.id, c, store.progress), 0);
    return Math.round(sum / store.courses.length);
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8, gap: 6 }}>
        <button className="btn" onClick={newCourse}><Icons.Plus size={13}/> New course</button>
        <button className="btn btn-primary" onClick={() => setShowAssign(true)}><Icons.Plus size={13}/> Assign course</button>
      </div>

      {editing && <CourseBuilderModal course={editing} setCourse={setEditing} onSave={saveCourse} onCancel={() => setEditing(null)}/>}

      <div className="panel" style={{ marginBottom: 12 }}>
        <div className="panel-h">
          <Icons.Book size={13}/><h3>Course library</h3>
          <span className="meta">{store.courses.length} available</span>
        </div>
        <div style={{ padding: 10, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 8 }}>
          {store.courses.map(course => {
            const lessonCount = (course.sections || []).reduce((sum, section) => sum + (section.lessons || []).length, 0);
            const pct = meId ? ProductTraining.percentFor(meId, course, store.progress) : 0;
            return (
              <button key={course.id} className="vault-course-card" onClick={() => setOpenCourse(course)}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="cell-truncate" style={{ fontWeight: 600, fontSize: 12.5 }}>{course.title || "Untitled course"}</div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4, color: "var(--text-tertiary)", fontSize: 10.5 }}>
                      <span className="chip" style={{ fontSize: 9.5 }}>{course.track || "Training"}</span>
                      <span>{course.durMin || 0} min · {lessonCount} lesson{lessonCount === 1 ? "" : "s"}</span>
                    </div>
                  </div>
                  <Icons.ArrowUpRight size={12} style={{ color: "var(--text-tertiary)", flexShrink: 0 }}/>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 8 }}>
                  <div style={{ flex: 1, height: 4, background: "var(--bg-base)", borderRadius: 3, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: pct === 100 ? "var(--accent-money)" : "var(--accent-status)" }}/></div>
                  <span className="tabular" style={{ color: "var(--text-tertiary)", fontSize: 10 }}>{pct}%</span>
                </div>
              </button>
            );
          })}
          {store.courses.length === 0 && <div style={{ gridColumn: "1 / -1", padding: 18, color: "var(--text-tertiary)", textAlign: "center", fontSize: 12 }}>No courses created yet. Use New course to add the first one.</div>}
        </div>
      </div>

      {atRisk.length > 0 && (
        <div className="panel" style={{ marginBottom: 12 }}>
          <div className="panel-h">
            <Icons.Bell size={13} style={{ color: "var(--state-danger)" }}/>
            <h3>At-risk producers</h3>
            <span className="meta">{atRisk.length} need attention</span>
          </div>
          <div className="list">
            <div className="list-h" style={{ gridTemplateColumns: "1.4fr 1fr 100px 100px 140px" }}>
              <div>Producer</div><div>Concern</div><div className="tabular" style={{ textAlign: "right" }}>Overdue</div><div className="tabular" style={{ textAlign: "right" }}>Open req.</div><div></div>
            </div>
            {atRisk.map(({ rep, overdue, open }) => (
              <div key={rep.id} className="row" style={{ gridTemplateColumns: "1.4fr 1fr 100px 100px 140px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Shared.Avatar rep={rep} size={20}/>
                  <span style={{ fontWeight: 500 }}>{rep.name}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                  {overdue.length > 0 ? overdue.map(c => c.title).slice(0, 2).join(" · ") : "Multiple open required courses"}
                </div>
                <div className="tabular" style={{ textAlign: "right", color: overdue.length > 0 ? "var(--state-danger)" : "var(--text-tertiary)" }}>{overdue.length}</div>
                <div className="tabular" style={{ textAlign: "right" }}>{open.length}</div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button className="btn btn-ghost" onClick={() => window.toast && window.toast(`Check-in sent to ${rep.name.split(" ")[0]}`, "success")}><Icons.MessageSquare size={11}/> Check in</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-h"><h3>Enrollment matrix</h3><span className="meta">{REPS.length} producers × {store.courses.length} courses</span></div>
        <div style={{ overflowX: "auto" }}>
          <div className="list" style={{ minWidth: Math.max(560, 180 + store.courses.length * 85) }}>
            <div className="list-h" style={{ gridTemplateColumns: `1.4fr repeat(${store.courses.length}, 1fr) 80px` }}>
              <div>Producer</div>
              {store.courses.map(c => <div key={c.id} className="cell-truncate" style={{ fontSize: 11 }} title={c.title}>{c.title}</div>)}
              <div className="tabular" style={{ textAlign: "right" }}>Avg %</div>
            </div>
            {REPS.map(rep => (
              <div key={rep.id} className="row" style={{ gridTemplateColumns: `1.4fr repeat(${store.courses.length}, 1fr) 80px` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Shared.Avatar rep={rep} size={20}/>
                <span style={{ fontWeight: 500 }}>{rep.name}</span>
              </div>
              {store.courses.map(c => {
                const status = ProductTraining.statusFor(rep.id, c, store.progress, store.assignments);
                const pct    = ProductTraining.percentFor(rep.id, c, store.progress);
                return (
                  <div key={c.id} title={`${c.title} · ${pct}%`}>
                    <span className={`chip ${STATUS_CHIP_CLASS[status] || ""}`} style={status === "overdue" ? { color: "var(--state-danger)", borderColor: "var(--state-danger)" } : undefined}>
                      {pct > 0 && pct < 100 ? `${pct}%` : status}
                    </span>
                  </div>
                );
              })}
              <div className="tabular" style={{ textAlign: "right", color: repAvg(rep) >= 80 ? "var(--accent-money)" : repAvg(rep) >= 50 ? "var(--text-secondary)" : "var(--state-warning)" }}>{repAvg(rep)}%</div>
            </div>
          ))}
        </div>
        </div>
      </div>

      {showAssign && <AssignCourseModal store={store} onClose={() => setShowAssign(false)}/>}
      {openCourse && meId && (
        <CourseViewerModal course={openCourse} repId={meId} store={store} onClose={() => setOpenCourse(null)}/>
      )}
    </>
  );
}

/* ─── Manager · Assign Course modal ───────────────────────────────────── */
function AssignCourseModal({ store, onClose }) {
  const { REPS } = AppData;
  // Scope assignment targets to the viewer's downline. Owner/super_admin →
  // scopeRepIds() returns null → see everyone in agency. Manager → only their
  // downline. Operator directive: "higher-level managers should be able to
  // assign courses to anyone below them."
  const scopeIds = (typeof window !== "undefined" && window.scopeRepIds && window.scopeRepIds()) || null;
  const visibleReps = scopeIds ? REPS.filter(r => scopeIds.includes(r.id)) : REPS;
  const [courseId, setCourseId] = React.useState(store.courses[0]?.id || "");
  const [repIds, setRepIds]     = React.useState([]);
  const [dueDate, setDueDate]   = React.useState("");
  const toggle = (id) => setRepIds(rs => rs.includes(id) ? rs.filter(x => x !== id) : [...rs, id]);
  const selectAll = () => setRepIds(visibleReps.map(r => r.id));
  const clearAll  = () => setRepIds([]);

  const save = () => {
    if (!courseId || repIds.length === 0) return;
    const a = {
      id: "asgn-" + Date.now(),
      courseId,
      repIds,
      dueDate: dueDate || null,
      assignedAt: new Date().toISOString(),
    };
    store.saveAssignments(prev => [...prev, a]);
    window.toast && window.toast(`Assigned to ${repIds.length} producer${repIds.length === 1 ? "" : "s"}`, "success");
    onClose();
  };

  return (
    <Shared.Modal title="Assign course" width={560} onClose={onClose} actions={
      <>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={!courseId || repIds.length === 0}>
          <Icons.Check size={11}/> Assign
        </button>
      </>
    }>
      <Shared.Field label="Course">
        <Shared.Select value={courseId} onChange={setCourseId} options={store.courses.map(c => ({ v: c.id, l: c.title }))}/>
      </Shared.Field>
      <Shared.Field label="Due date (optional)">
        <input className="text-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}/>
      </Shared.Field>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
        <div className="field-l" style={{ flex: 1 }}>
          Producers in your downline · {repIds.length} of {visibleReps.length} selected
        </div>
        {visibleReps.length > 0 && (
          <>
            <button className="btn btn-ghost" style={{ padding: "2px 8px", fontSize: 11 }} onClick={selectAll}>Select all</button>
            <button className="btn btn-ghost" style={{ padding: "2px 8px", fontSize: 11 }} onClick={clearAll}>Clear</button>
          </>
        )}
      </div>
      <div style={{ marginTop: 6, maxHeight: 240, overflowY: "auto", border: "1px solid var(--border-subtle)", borderRadius: 6 }}>
        {visibleReps.length === 0 ? (
          <div style={{ padding: 16, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
            No producers in your downline yet. Recruit or invite first, then come back here to assign.
          </div>
        ) : visibleReps.map(r => (
          <label key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", cursor: "pointer", borderBottom: "1px solid var(--border-subtle)", fontSize: 12.5 }}>
            <input type="checkbox" checked={repIds.includes(r.id)} onChange={() => toggle(r.id)}/>
            <Shared.Avatar rep={r} size={20}/>
            <span style={{ flex: 1 }}>{r.name}</span>
            <span className="meta" style={{ fontSize: 11 }}>{r.handle}</span>
          </label>
        ))}
      </div>
    </Shared.Modal>
  );
}

/* ─── Owner · Product Training authoring (Course Builder) ────────────── */
function ProductTrainingOwner({ store }) {
  const { REPS } = AppData;
  const [editing, setEditing] = React.useState(null);

  const newCourse = () => setEditing({
    id: "c-" + Date.now(),
    title: "",
    track: "Onboarding",
    durMin: 0,
    status: "assigned",
    required: false,
    description: "",
    sections: [],
    targetRoles: ["owner","manager","rep"],
    coverUrl: "",
    _isNew: true,
  });
  const editCourse = (c) => setEditing({
    ...c,
    targetRoles: Array.isArray(c.targetRoles) && c.targetRoles.length > 0 ? c.targetRoles : ["owner","manager","rep"],
    coverUrl: c.coverUrl || "",
    sections: (c.sections || []).map(s => ({ ...s, lessons: [...(s.lessons || [])] })),
  });
  const removeCourse = (id) => {
    if (!confirm("Delete this course? This can't be undone.")) return;
    store.saveCourses(cs => cs.filter(c => c.id !== id));
    window.toast && window.toast("Course deleted", "info");
  };
  const saveCourse = (course) => {
    const { _isNew, ...c } = course;
    if (_isNew) store.saveCourses(cs => [...cs, c]);
    else        store.saveCourses(cs => cs.map(x => x.id === c.id ? c : x));
    window.toast && window.toast(_isNew ? "Course created" : "Course saved", "success");
    setEditing(null);
  };
  const toggleRequired = (id) => {
    store.saveCourses(cs => cs.map(c => c.id === id ? { ...c, required: !c.required } : c));
  };

  // Owner library row stats: enrollment + completion rate.
  const enrolledCount = (course) => REPS.filter(r => {
    if (course.required) return true;
    return store.assignments.some(a => a.courseId === course.id && (a.repIds || []).includes(r.id));
  }).length;
  const completionRate = (course) => {
    const enrolled = REPS.filter(r => course.required || store.assignments.some(a => a.courseId === course.id && (a.repIds || []).includes(r.id)));
    if (enrolled.length === 0) return 0;
    const done = enrolled.filter(r => ProductTraining.statusFor(r.id, course, store.progress, store.assignments) === "complete")?.length;
    return Math.round((done / enrolled.length) * 100);
  };

  return (
    <>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginBottom: 8 }}>
        <button className="btn" onClick={() => window.toast && window.toast("Course audit trail opens once you've published a course", "info")}><Icons.ArrowUpRight size={13}/> Audit trail</button>
        <button className="btn btn-primary" onClick={newCourse}><Icons.Plus size={13}/> New course</button>
      </div>

      <div className="panel">
        <div className="panel-h"><h3>Course library</h3><span className="meta">{store.courses.length}</span></div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1.6fr 100px 80px 80px 90px 90px 110px 100px" }}>
            <div>Course</div><div>Track</div><div className="tabular" style={{ textAlign: "right" }}>Sec.</div><div className="tabular" style={{ textAlign: "right" }}>Min</div><div className="tabular" style={{ textAlign: "right" }}>Enrolled</div><div className="tabular" style={{ textAlign: "right" }}>Complete %</div><div>Required</div><div></div>
          </div>
          {store.courses.map(c => {
            const lessonCount = (c.sections || []).reduce((a, s) => a + (s.lessons?.length || 0), 0);
            const enrolled = enrolledCount(c);
            const completed = completionRate(c);
            return (
              <div key={c.id} className="row" style={{ gridTemplateColumns: "1.6fr 100px 80px 80px 90px 90px 110px 100px" }}>
                <div>
                  <div style={{ fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                    {c.title || <span style={{ color: "var(--text-tertiary)" }}>Untitled</span>}
                    {c.isStarter && <span className="chip" style={{ fontSize: 9, color: "var(--text-tertiary)", padding: "1px 6px" }}>starter</span>}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                    {lessonCount} lesson{lessonCount === 1 ? "" : "s"}
                    {Array.isArray(c.targetRoles) && c.targetRoles.length > 0 && c.targetRoles.length < 4 && (
                      <span style={{ color: "var(--text-quaternary)" }}>· {c.targetRoles.join(" · ")}</span>
                    )}
                  </div>
                </div>
                <div><span className="chip">{c.track}</span></div>
                <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{(c.sections || []).length}</div>
                <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{c.durMin}</div>
                <div className="tabular" style={{ textAlign: "right" }}>{enrolled}</div>
                <div className="tabular" style={{ textAlign: "right", color: completed >= 80 ? "var(--accent-money)" : completed >= 50 ? "var(--text-secondary)" : "var(--state-warning)" }}>{completed}%</div>
                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                    <input type="checkbox" checked={!!c.required} onChange={() => toggleRequired(c.id)}/>
                    {c.required ? <span style={{ color: "var(--accent-status)" }}>required</span> : <span style={{ color: "var(--text-tertiary)" }}>optional</span>}
                  </label>
                </div>
                <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                  <button className="icon-btn" onClick={() => editCourse(c)} title="Edit"><Icons.Edit size={11}/></button>
                  <button className="icon-btn" onClick={() => removeCourse(c.id)} title="Delete"><Icons.X size={11}/></button>
                </div>
              </div>
            );
          })}
          {store.courses.length === 0 && (
            <div style={{ padding: 30, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
              No courses yet. Click <strong>New course</strong> to start building.
            </div>
          )}
        </div>
      </div>

      {editing && <CourseBuilderModal course={editing} setCourse={setEditing} onSave={saveCourse} onCancel={() => setEditing(null)}/>}
    </>
  );
}

/* ─── Course Builder modal — sections, lessons, video upload/embed ───── */
function CourseBuilderModal({ course, setCourse, onSave, onCancel }) {
  const c = course;
  const update = (patch) => setCourse({ ...c, ...patch });
  const updateSection = (si, patch) => update({ sections: c.sections.map((s, i) => i === si ? { ...s, ...patch } : s) });
  const updateLesson = (si, li, patch) => update({
    sections: c.sections.map((s, i) => i !== si ? s : ({ ...s, lessons: s.lessons.map((l, j) => j === li ? { ...l, ...patch } : l) })),
  });
  const addSection = () => update({ sections: [...c.sections, { title: `Section ${c.sections.length + 1}`, lessons: [] }] });
  const removeSection = (si) => update({ sections: c.sections.filter((_, i) => i !== si) });
  const moveSection = (si, dir) => {
    const ns = [...c.sections]; const j = si + dir;
    if (j < 0 || j >= ns.length) return;
    [ns[si], ns[j]] = [ns[j], ns[si]];
    update({ sections: ns });
  };
  const addLesson = (si) => update({
    sections: c.sections.map((s, i) => i === si ? { ...s, lessons: [...s.lessons, { title: "New lesson", videoUrl: "", description: "" }] } : s),
  });
  const removeLesson = (si, li) => update({
    sections: c.sections.map((s, i) => i === si ? { ...s, lessons: s.lessons.filter((_, j) => j !== li) } : s),
  });
  const moveLesson = (si, li, dir) => {
    update({
      sections: c.sections.map((s, i) => {
        if (i !== si) return s;
        const ls = [...s.lessons]; const j = li + dir;
        if (j < 0 || j >= ls.length) return s;
        [ls[li], ls[j]] = [ls[j], ls[li]];
        return { ...s, lessons: ls };
      }),
    });
  };
  // Upload to Supabase Storage `vault` bucket under {agency_id}/courses/{course_id}/{lesson_idx}-{name}.
  // Replaces the legacy base64-data-URL pattern (which exploded JSONB at >6MB and broke Realtime).
  const onUploadVideo = async (si, li, file) => {
    if (!file) return;
    try {
      const up = await window.AppData.mutate.storageUpload(file, `courses/${c.id || "draft"}`);
      // Store the storage_path in videoUrl; the lesson player resolves it via storageSign() at render.
      updateLesson(si, li, {
        videoUrl: up.signedUrl,
        videoStoragePath: up.path,
        videoMime: up.mime,
        videoSizeBytes: up.sizeBytes,
      });
      window.toast && window.toast(`Uploaded ${file.name}`, "success");
    } catch (e) {
      window.toast && window.toast(`Upload failed: ${e.message || e}`, "danger");
    }
  };

  const canSave = !!c.title.trim();

  return (
    <Shared.Modal title={c._isNew ? "New course" : "Edit course"} width={860} onClose={onCancel} actions={
      <>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" onClick={() => onSave(c)} disabled={!canSave}>
          <Icons.Check size={11}/> {c._isNew ? "Create course" : "Save changes"}
        </button>
      </>
    }>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Shared.Field label="Title">
          <input className="text-input" value={c.title} onChange={(e) => update({ title: e.target.value })} placeholder="Final Expense Closing 101" autoFocus/>
        </Shared.Field>
        <Shared.Field label="Track">
          <Shared.Select value={c.track} onChange={(v) => update({ track: v })} options={COURSE_TRACKS.map(t => ({ v: t, l: t }))}/>
        </Shared.Field>
      </div>
      <Shared.Field label="Description">
        <textarea className="text-input" rows={2} value={c.description} onChange={(e) => update({ description: e.target.value })}
          placeholder="What this course teaches and who should take it" style={{ width: "100%", lineHeight: 1.55 }}/>
      </Shared.Field>
      <Shared.Field label="Cover image URL (optional)">
        <input className="text-input" value={c.coverUrl || ""}
          onChange={(e) => update({ coverUrl: e.target.value })}
          placeholder="https://… (paste an image link to set the course thumbnail)"/>
      </Shared.Field>
      <RoleVisibilityField value={c.targetRoles || ["owner","manager","rep"]}
        onChange={(v) => update({ targetRoles: v })}/>
      <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 12, alignItems: "center" }}>
        <Shared.Field label="Duration (min)">
          <input className="text-input" type="number" value={c.durMin} onChange={(e) => update({ durMin: +e.target.value || 0 })}/>
        </Shared.Field>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginTop: 18 }}>
          <input type="checkbox" checked={!!c.required} onChange={(e) => update({ required: e.target.checked })}/>
          <span>Required for new reps · must be completed before first live calls</span>
        </label>
      </div>

      <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border-subtle)" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
          <strong style={{ fontSize: 13 }}>Sections</strong>
          <span className="meta" style={{ marginLeft: 8 }}>{c.sections.length}</span>
          <button className="btn btn-ghost" style={{ marginLeft: "auto" }} onClick={addSection}><Icons.Plus size={11}/> Add section</button>
        </div>

        {c.sections.length === 0 && (
          <div style={{ padding: 20, textAlign: "center", background: "var(--bg-raised)", borderRadius: 6, color: "var(--text-tertiary)", fontSize: 12.5 }}>
            No sections yet. Click <strong>Add section</strong> to start.
          </div>
        )}

        {c.sections.map((s, si) => (
          <div key={si} style={{ marginBottom: 10, border: "1px solid var(--border-subtle)", borderRadius: 6, background: "var(--bg-raised)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderBottom: "1px solid var(--border-subtle)" }}>
              <span style={{ fontSize: 11, color: "var(--text-tertiary)", minWidth: 22 }}>#{si + 1}</span>
              <input className="text-input" value={s.title} onChange={(e) => updateSection(si, { title: e.target.value })} placeholder="Section title" style={{ flex: 1 }}/>
              <button className="icon-btn" onClick={() => moveSection(si, -1)} disabled={si === 0} title="Move up"><Icons.ArrowRight size={11} style={{ transform: "rotate(-90deg)" }}/></button>
              <button className="icon-btn" onClick={() => moveSection(si,  1)} disabled={si === c.sections.length - 1} title="Move down"><Icons.ArrowRight size={11} style={{ transform: "rotate(90deg)" }}/></button>
              <button className="icon-btn" onClick={() => removeSection(si)} title="Remove section"><Icons.X size={11}/></button>
            </div>

            <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {s.lessons.map((l, li) => (
                <div key={li} style={{ padding: 10, background: "var(--bg-elevated)", borderRadius: 6, border: "1px solid var(--border-subtle)" }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", minWidth: 28 }}>L{si + 1}.{li + 1}</span>
                    <input className="text-input" value={l.title} onChange={(e) => updateLesson(si, li, { title: e.target.value })} placeholder="Lesson title" style={{ flex: 1 }}/>
                    <button className="icon-btn" onClick={() => moveLesson(si, li, -1)} disabled={li === 0} title="Move up"><Icons.ArrowRight size={11} style={{ transform: "rotate(-90deg)" }}/></button>
                    <button className="icon-btn" onClick={() => moveLesson(si, li,  1)} disabled={li === s.lessons.length - 1} title="Move down"><Icons.ArrowRight size={11} style={{ transform: "rotate(90deg)" }}/></button>
                    <button className="icon-btn" onClick={() => removeLesson(si, li)} title="Remove lesson"><Icons.X size={11}/></button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, alignItems: "center" }}>
                    <input className="text-input"
                      value={l.videoUrl?.startsWith("data:") ? "(uploaded file)" : (l.videoUrl || "")}
                      readOnly={l.videoUrl?.startsWith("data:")}
                      onChange={(e) => updateLesson(si, li, { videoUrl: e.target.value })}
                      placeholder="Paste Loom / YouTube / Vimeo link or upload →"/>
                    <label className="btn btn-ghost" style={{ cursor: "pointer", whiteSpace: "nowrap" }}>
                      <Icons.ArrowUpRight size={11}/> Upload
                      <input type="file" accept="video/*" style={{ display: "none" }} onChange={(e) => onUploadVideo(si, li, e.target.files?.[0])}/>
                    </label>
                  </div>
                  <textarea className="text-input" rows={2} value={l.description} onChange={(e) => updateLesson(si, li, { description: e.target.value })}
                    placeholder="What this lesson covers (optional)" style={{ width: "100%", marginTop: 6, lineHeight: 1.5 }}/>
                  {l.videoUrl && !l.videoUrl.startsWith("data:") && (
                    <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginTop: 4 }}>
                      Embed: <code style={{ fontSize: 10.5 }}>{toEmbedSrc(l.videoUrl).slice(0, 70)}{toEmbedSrc(l.videoUrl).length > 70 ? "…" : ""}</code>
                    </div>
                  )}
                </div>
              ))}
              <button className="btn btn-ghost" style={{ alignSelf: "flex-start" }} onClick={() => addLesson(si)}><Icons.Plus size={11}/> Add lesson</button>
            </div>
          </div>
        ))}
      </div>
    </Shared.Modal>
  );
}


/* ─────────────────────────────────────────────────────────────────────────
   6. Calls — Gong-style cards with waveform, transcript, AI score
   ───────────────────────────────────────────────────────────────────────── */
function PageCalls({ role = "rep" }) {
  const { RECORDINGS, REPS } = AppData;
  const repById = Object.fromEntries(REPS.map(r => [r.id, r]));
  // Resolve the actual signed-in viewer instead of REPS[0]=Marcus.
  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  const meId = meIdent?.rep_id || (window.isDemoAgency && window.isDemoAgency() ? (REPS[0] && REPS[0].id) : null);
  // Manager view scopes to downline; rep to self; owner sees fleet.
  const scopeIds = (typeof window !== "undefined" && window.scopeRepIds && window.scopeRepIds()) || null;
  const visible = role === "rep"
    ? RECORDINGS.filter(r => !r.repId || r.repId === meId)
    : role === "manager" && scopeIds
      ? RECORDINGS.filter(r => !r.repId || scopeIds.includes(r.repId))
      : RECORDINGS;

  const [selId, setSelId] = React.useState(visible[0]?.id);
  const sel = visible.find(r => r.id === selId) || visible[0];

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Calls</div>
          <div className="page-sub">{role === "rep" ? "My calls" : "All recorded calls"} · waveform · talk ratio · AI score</div>
        </div>
      </div>

      <div className="calls-grid" style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 14 }}>
        <div className="panel">
          <div className="panel-h"><h3>Recordings</h3><span className="meta">{visible.length}</span></div>
          <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {visible.map(r => (
              <button key={r.id} onClick={() => setSelId(r.id)} className="btn btn-ghost" style={{ justifyContent: "flex-start", padding: 10, background: sel?.id === r.id ? "var(--bg-overlay)" : "var(--bg-raised)", border: "1px solid var(--border-subtle)", flexDirection: "column", alignItems: "stretch", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                  <strong style={{ fontSize: 12.5 }}>{r.lead}</strong>
                  <span className="tabular" style={{ color: r.score >= 80 ? "var(--accent-money)" : r.score >= 60 ? "var(--state-warning)" : "var(--state-danger)", fontSize: 11.5 }}>{r.score}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-tertiary)", fontSize: 11 }}>
                  <span>{r.date}</span>
                  <span className="mono">{Math.floor(r.durSec / 60)}:{String(r.durSec % 60).padStart(2, "0")}</span>
                </div>
              </button>
            ))}
            {visible.length === 0 && (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>
                {role === "rep" ? "No calls logged yet — make your first dial from the Floor." : "No recorded calls in scope."}
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-h">
            <Icons.Headset size={13}/>
            <h3>{sel?.lead} · score {sel?.score}</h3>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <button className="btn btn-ghost" onClick={() => sel && window.dispatchEvent(new CustomEvent("ai:ask", { detail: { prompt: `Summarize the call with ${sel.lead} and grade my open-ended question rate`, context: "Call · " + sel.lead }}))}><Icons.Sparkles size={11}/> Analyze</button>
              <button className="btn btn-ghost" onClick={() => sel && AppData.mutate.vaultArtifactInsert({ kind: "Recording", lead_name: sel.lead, rep_id: sel.repId, retention: "10y", status: "complete" }).then(() => window.toast && window.toast(`Sent ${sel.lead}'s recording to Vault`, "success"))}><Icons.Shield size={11}/> Send to vault</button>
              <button className="btn btn-ghost" onClick={() => window.dispatchEvent(new CustomEvent("nav:goto", { detail: { page: "vault" }}))}><Icons.ArrowUpRight size={11}/> Open Vault</button>
            </div>
          </div>
          <div style={{ padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-tertiary)", fontSize: 11 }}>
              <span className="mono">00:00</span>
              <div style={{ flex: 1, height: 36, position: "relative", background: "var(--bg-raised)", borderRadius: 4, overflow: "hidden" }}>
                <svg width="100%" height="36" viewBox="0 0 240 36" preserveAspectRatio="none">
                  {Array.from({ length: 80 }).map((_, i) => {
                    const h = 4 + Math.abs(Math.sin(i * 0.5 + (sel?.id?.length || 0))) * 26 + (i % 7 === 0 ? 4 : 0);
                    return <rect key={i} x={i * 3} y={(36 - h) / 2} width="1.6" height={h} fill={i < 48 ? "var(--accent-money)" : "var(--text-quaternary)"}/>;
                  })}
                </svg>
              </div>
              <span className="mono">{Math.floor((sel?.durSec || 0) / 60)}:{String((sel?.durSec || 0) % 60).padStart(2, "0")}</span>
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span className={`chip ${sel?.talkRatio < 50 ? "chip-money" : "chip-status"}`}>Talk: {sel?.talkRatio}%</span>
              <span className="chip">Open Q: {sel?.openQ}</span>
              <span className={`chip ${sel?.flags?.tpmo === "ok" ? "chip-money" : "chip-status"}`}>TPMO {sel?.flags?.tpmo === "ok" ? "✓" : "?"}</span>
              <span className={`chip ${sel?.flags?.soa === "captured" || sel?.flags?.soa === "scheduled" ? "chip-money" : ""}`}>SOA {sel?.flags?.soa}</span>
            </div>
            <div style={{ marginTop: 14, padding: 12, background: "var(--bg-raised)", borderRadius: 6, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.55 }}>
              <strong style={{ color: "var(--text-primary)" }}>AI summary —</strong> {sel?.ai || <span style={{ color: "var(--text-tertiary)" }}>processing…</span>}
            </div>

            {/* Whisper transcript when available — falls back to a hint when the
                transcribe pipeline hasn't run yet for this recording. */}
            {sel && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 500, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                  <Icons.FileText size={11}/> Transcript
                </div>
                {window.PostCallTranscript
                  ? (() => { const T = window.PostCallTranscript; return <T recordingId={sel.id} source={sel.source}/>; })()
                  : <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>Transcript module loading…</div>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI coaching scores — real call_coaching_scores rows from the
          score-recent-calls cron. Reps see their own, managers see downline,
          owners see fleet. Shipped to floor 2026-05-23 — was previously
          buried in the Owner cockpit only. */}
      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-h">
          <Icons.Sparkles size={13}/>
          <h3>AI coaching scores</h3>
          <span className="meta">{role === "rep" ? "your last 20 scored calls" : "downline · last 20 scored"}</span>
        </div>
        {window.CoachingScoresPanel
          ? (() => { const P = window.CoachingScoresPanel; return <P repId={role === "rep" ? meId : null}/>; })()
          : <div style={{ padding: 18, color: "var(--text-tertiary)", fontSize: 12 }}>Coaching panel loading…</div>}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   7. Book Analytics — owner
   ───────────────────────────────────────────────────────────────────────── */
/* ─── Book Analytics — owner-facing book of business surface ───────────────
   Three actually-distinct views (Mix / Cohorts / Cross-sell) instead of one
   panel pair that ignored the tab switcher. KPI row uses compact cards
   (no oversized hero) with mini-trends so density beats size. */

const BOOK_PERIOD_LABELS = { "3mo": "3-mo", "13mo": "13-mo", "24mo": "24-mo" };

function BookKpi({ label, value, sub, tone, trend }) {
  // Compact KPI tile — replaces hero KpiCard. 3:1 density vs the old card.
  const color = tone === "money" ? "var(--accent-money)" : tone === "danger" ? "var(--state-danger)" : tone === "warn" ? "var(--state-warning)" : undefined;
  return (
    <div className="panel" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{label}</div>
      <div className="tabular" style={{ fontSize: 22, fontWeight: 500, color, fontFamily: "var(--font-display)" }}>{value}</div>
      {sub && (
        <div style={{ fontSize: 11, color: trend === "up" ? "var(--accent-money)" : trend === "dn" ? "var(--state-warning)" : "var(--text-tertiary)" }}>
          {trend === "up" && "▲ "}{trend === "dn" && "▼ "}{sub}
        </div>
      )}
    </div>
  );
}

function PageBook() {
  const [period, setPeriod] = React.useState("13mo");
  const [view, setView]     = React.useState("mix");
  const [drill, setDrill]   = React.useState(null);

  // Real data when present; sample when not.
  const policies = window.AppData?.POLICIES || [];
  const carriers = window.AppData?.CARRIERS || [];
  const book     = window.AppData?.BOOK_ENTRIES || [];

  // Demo seed only renders for the demo agency. Real tenants with no policies
  // see an empty-state CTA instead of fabricated UHC/Humana/Aetna AP numbers.
  const isDemo = !!(window.isDemoAgency && window.isDemoAgency());
  const carrierMix = (() => {
    if (carriers.length === 0 || policies.length === 0) {
      return isDemo ? [
        { id: "uhc",   name: "UHC",            apps: 184, ap: 1842000, persist: 94, nigo: 1.4 },
        { id: "hum",   name: "Humana Vantage", apps: 132, ap: 1320000, persist: 92, nigo: 2.0 },
        { id: "aet",   name: "Aetna SRC",      apps: 124, ap: 1108000, persist: 87, nigo: 3.1 },
        { id: "fg",    name: "F&G Annuities",  apps:  42, ap: 1860000, persist: 96, nigo: 0.6 },
        { id: "moo",   name: "Mutual of Omaha",apps:  88, ap:  708000, persist: 78, nigo: 1.9 },
      ] : [];
    }
    return carriers.map(c => {
      const cps = policies.filter(p => p.carrierId === c.id);
      const cBook = book.filter(b => cps.find(p => p.id === b.policyId));
      const persistAvg = cBook.length ? cBook.reduce((a, b) => a + (b.persistency || 0), 0) / cBook.length : null;
      return {
        id: c.id, name: c.name,
        apps: cps.length,
        ap: cps.reduce((a, p) => a + (p.ap || 0), 0),
        persist: persistAvg != null ? Math.round(persistAvg) : null,
        nigo: null,
      };
    }).sort((a, b) => b.ap - a.ap);
  })();
  const totalAp = carrierMix.reduce((a, c) => a + (c.ap || 0), 0);
  const maxAp   = Math.max(1, ...carrierMix.map(c => c.ap || 0));
  const apMM    = totalAp > 0 ? (totalAp / 1_000_000).toFixed(2) + "M" : "—";

  const exportBook = () => {
    const headers = ["Carrier","Apps","AP","Persistency","NIGO"];
    const rows = carrierMix.map(c => [c.name, c.apps, c.ap, c.persist ?? "", c.nigo ?? ""]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `book-${period}-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
    window.toast && window.toast(`Exported ${rows.length} carriers · ${period}`, "success");
  };

  // Drilldown derives from the current carrier mix
  const drillRow = drill ? carrierMix.find(c => c.id === drill) : null;

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Book Analytics</div>
          <div className="page-sub">In-force AP · persistency · lapse · cross-sell pathway · carrier mix</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <Shared.SectionPill items={[{k:"3mo",l:"3mo"},{k:"13mo",l:"13mo"},{k:"24mo",l:"24mo"}]} value={period} onChange={setPeriod} dense/>
          <button className="btn" onClick={exportBook} title="CSV of the carrier mix table"><Icons.ArrowUpRight size={13}/> Export</button>
        </div>
      </div>

      <Shared.SectionPill
        items={[
          {k:"mix",       l:"Carrier mix",  icon:"Folder"},
          {k:"cohorts",   l:"Cohorts",      icon:"Activity"},
          {k:"crosssell", l:"Cross-sell",   icon:"ArrowUpRight"},
        ]}
        value={view}
        onChange={setView}
      />

      {/* Compact KPI strip — 4 equal tiles, no hero. KPIs display "—" for
          real tenants until persistency / lapse / cross-sell rollups are
          computed from policies + book entries. Demo keeps the seed values. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
        <BookKpi label="In-force AP"             value={apMM === "—" ? "—" : "$" + apMM}        sub={isDemo ? "+9.4% YoY" : ""}     trend={isDemo ? "up" : undefined}   tone="money"/>
        <BookKpi label={`Persistency · ${BOOK_PERIOD_LABELS[period]}`} value={isDemo ? "91.4%" : "—"} sub={isDemo ? "goal 90%" : "no data"} trend={isDemo ? "up" : undefined}  tone={isDemo ? "money" : undefined}/>
        <BookKpi label="Lapse rate"              value={isDemo ? "4.2%" : "—"}              sub={isDemo ? "-0.6 WoW" : "no data"}      trend={isDemo ? "up" : undefined}/>
        <BookKpi label="Cross-sell rate"         value={isDemo ? "22%" : "—"}               sub={isDemo ? "FE → Med Supp" : "no data"} trend={isDemo ? "up" : undefined}/>
      </div>

      {/* ─── Carrier mix view ─── */}
      {view === "mix" && (
        <div className="book-grid" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14 }}>
          <div className="panel">
            <div className="panel-h">
              <Icons.Folder size={13}/>
              <h3>Carrier mix · in-force</h3>
              <span className="meta">{carrierMix.length} carriers · ${apMM} AP</span>
            </div>
            <div className="list">
              <div className="list-h" style={{ gridTemplateColumns: "1.4fr 70px 90px 70px 70px 1fr" }}>
                <div>Carrier</div>
                <div className="tabular" style={{ textAlign: "right" }}>Apps</div>
                <div className="tabular" style={{ textAlign: "right" }}>AP</div>
                <div className="tabular" style={{ textAlign: "right" }}>Persist</div>
                <div className="tabular" style={{ textAlign: "right" }}>NIGO</div>
                <div></div>
              </div>
              {carrierMix.length === 0 && (
                <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
                  No carrier data yet — add appointments under Settings → Carriers, then write your first deal on the Floor.
                </div>
              )}
              {carrierMix.map(r => {
                const w = ((r.ap || 0) / maxAp) * 100;
                const persistTone = r.persist == null ? "var(--text-tertiary)" : r.persist >= 90 ? "var(--accent-money)" : r.persist >= 80 ? "var(--state-warning)" : "var(--state-danger)";
                return (
                  <div key={r.id} className="row" style={{ gridTemplateColumns: "1.4fr 70px 90px 70px 70px 1fr", cursor: "pointer", background: drill === r.id ? "var(--bg-raised)" : undefined, height: 32 }} onClick={() => setDrill(drill === r.id ? null : r.id)}>
                    <div style={{ fontWeight: 500 }}>{r.name}</div>
                    <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{r.apps}</div>
                    <div className="tabular" style={{ textAlign: "right" }}>${(r.ap / 1000).toFixed(0)}k</div>
                    <div className="tabular" style={{ textAlign: "right", color: persistTone, fontWeight: 500 }}>{r.persist != null ? r.persist + "%" : "—"}</div>
                    <div className="tabular" style={{ textAlign: "right", color: r.nigo != null && r.nigo > 2 ? "var(--state-warning)" : "var(--text-tertiary)" }}>{r.nigo != null ? r.nigo.toFixed(1) + "%" : "—"}</div>
                    <div style={{ height: 4, background: "var(--bg-raised)", borderRadius: 2, marginLeft: 12, overflow: "hidden", alignSelf: "center" }}>
                      <div style={{ width: `${w}%`, height: "100%", background: "var(--accent-money)" }}></div>
                    </div>
                  </div>
                );
              })}
              {drillRow && (
                <div style={{ padding: 12, background: "var(--bg-raised)", borderTop: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong style={{ fontSize: 13 }}>{drillRow.name}</strong>
                    <button className="icon-btn" onClick={() => setDrill(null)}><Icons.X size={11}/></button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, fontSize: 11.5 }}>
                    <div><span style={{ color: "var(--text-tertiary)" }}>Persistency</span><div style={{ fontWeight: 500 }}>{drillRow.persist != null ? drillRow.persist + "%" : "—"} over {BOOK_PERIOD_LABELS[period]}</div></div>
                    <div><span style={{ color: "var(--text-tertiary)" }}>NIGO rate</span><div style={{ fontWeight: 500, color: drillRow.nigo != null && drillRow.nigo > 2 ? "var(--state-warning)" : undefined }}>{drillRow.nigo != null ? drillRow.nigo.toFixed(1) + "%" : "—"}</div></div>
                    <div><span style={{ color: "var(--text-tertiary)" }}>Avg AP/app</span><div style={{ fontWeight: 500 }}>${drillRow.apps ? Math.round(drillRow.ap / drillRow.apps).toLocaleString() : "—"}</div></div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-ghost" onClick={() => window.dispatchEvent(new CustomEvent("ai:ask", { detail: { prompt: `Break down ${drillRow.name}: top contributors, NIGO drivers, persistency drift over ${period}`, context: "Book · " + drillRow.name }}))}>
                      <Icons.Sparkles size={11}/> Ask the Book
                    </button>
                    <button className="btn btn-ghost" onClick={() => {
                      try { sessionStorage.setItem("repflow.settings.tab", "carriers"); } catch {}
                      if (window.gotoPage) window.gotoPage("settings");
                    }}>Open in Settings → Carriers</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-h">
              <Icons.Activity size={13}/>
              <h3>Persistency cohorts</h3>
              <span className="meta">by carrier × product</span>
            </div>
            <div style={{ padding: 14 }}>
              {(isDemo ? [
                { l: "Med Supp · UHC",        v: 94 },
                { l: "Med Supp · Humana",     v: 92 },
                { l: "FE · UHC",              v: 88 },
                { l: "FE · Mutual of Omaha",  v: 78 },
                { l: "Annuity · F&G",         v: 96 },
              ] : []).map((r, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1.5fr 50px 1fr", padding: "4px 0", alignItems: "center", fontSize: 11.5 }}>
                  <span style={{ color: "var(--text-secondary)" }}>{r.l}</span>
                  <span className="tabular" style={{ textAlign: "right", fontWeight: 500 }}>{r.v}%</span>
                  <div style={{ height: 4, background: "var(--bg-raised)", borderRadius: 2, marginLeft: 12, overflow: "hidden" }}>
                    <div style={{ width: `${r.v}%`, height: "100%", background: r.v >= 90 ? "var(--accent-money)" : r.v >= 80 ? "var(--state-warning)" : "var(--state-danger)" }}></div>
                  </div>
                </div>
              ))}
              {!isDemo && (
                <div style={{ padding: "20px 0", textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
                  No persistency data yet. Cohorts populate as policies hit month 3.
                </div>
              )}
            </div>
            {isDemo && (
              <>
                <div className="divider" style={{ margin: "0 14px" }}></div>
                <div style={{ padding: "10px 14px", fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.55 }}>
                  <strong style={{ color: "var(--state-warning)" }}>Watch:</strong> FE / Mutual of Omaha at 78% — replacement risk. Pull a cancellations report to confirm.
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ─── Cohorts view — issue-month survival curves ─── */}
      {view === "cohorts" && !isDemo && (
        <div className="panel" style={{ padding: 36, textAlign: "center" }}>
          <Icons.Activity size={20} style={{ color: "var(--text-quaternary)" }}/>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8, fontWeight: 500 }}>No cohort data yet</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4, lineHeight: 1.5, maxWidth: 380, marginLeft: "auto", marginRight: "auto" }}>
            Survival curves render once policies have aged at least one month. Each issue-month gets its own row; we track in-force % at every month forward.
          </div>
        </div>
      )}
      {view === "cohorts" && isDemo && (
        <div className="panel">
          <div className="panel-h">
            <Icons.Activity size={13}/>
            <h3>Survival by issue cohort</h3>
            <span className="meta">% in-force at month N · {BOOK_PERIOD_LABELS[period]}</span>
          </div>
          <div style={{ padding: 12, overflowX: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "120px repeat(13, 1fr)", gap: 4, fontSize: 10, alignItems: "center" }}>
              <div style={{ color: "var(--text-tertiary)", fontWeight: 600 }}>Issue cohort</div>
              {Array.from({length: 13}).map((_, i) => <div key={i} style={{ textAlign: "center", color: "var(--text-tertiary)" }}>M{i}</div>)}
              {[
                { c: "Apr 2025", curve: [100,99,98,97,96,95,94,93,92,92,91,90,89] },
                { c: "May 2025", curve: [100,99,99,98,97,95,94,93,92,91,90,89,88] },
                { c: "Jun 2025", curve: [100,98,96,94,92,90,88,86,84,82,80,78,76] },
                { c: "Jul 2025", curve: [100,99,98,97,96,96,95,94,93,92,91,90,90] },
                { c: "Aug 2025", curve: [100,99,99,98,98,97,97,96,95,95,94,93,93] },
                { c: "Sep 2025", curve: [100,99,98,97,96,95,94,93,92,91,90,null,null] },
                { c: "Oct 2025", curve: [100,99,99,98,97,96,95,94,93,92,null,null,null] },
                { c: "Nov 2025", curve: [100,99,98,98,97,96,95,94,93,null,null,null,null] },
                { c: "Dec 2025", curve: [100,99,99,98,98,97,96,95,null,null,null,null,null] },
                { c: "Jan 2026", curve: [100,99,99,98,97,96,95,null,null,null,null,null,null] },
                { c: "Feb 2026", curve: [100,99,99,98,97,96,null,null,null,null,null,null,null] },
                { c: "Mar 2026", curve: [100,99,98,98,97,null,null,null,null,null,null,null,null] },
              ].map(row => (
                <React.Fragment key={row.c}>
                  <div style={{ fontWeight: 500, fontSize: 11 }}>{row.c}</div>
                  {row.curve.map((v, i) => {
                    if (v == null) return <div key={i} style={{ height: 24, background: "transparent" }}/>;
                    const tone = v >= 95 ? "var(--accent-money)" : v >= 88 ? "var(--state-warning)" : "var(--state-danger)";
                    return (
                      <div key={i} title={`${row.c} · M${i} · ${v}%`} style={{ height: 24, background: `color-mix(in oklch, ${tone} ${v - 60}%, transparent)`, borderRadius: 3, display: "grid", placeItems: "center", color: v >= 95 ? "var(--bg-base)" : "var(--text-secondary)", fontWeight: 500, fontSize: 10 }}>
                        {v}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
            <div style={{ marginTop: 12, padding: 10, background: "var(--bg-raised)", borderRadius: 6, fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.55 }}>
              <strong style={{ color: "var(--state-warning)" }}>Jun 2025 cohort</strong> dropped to 76% by month 12 — 14 points below the rolling 12-cohort median.
              <button className="btn btn-ghost" style={{ marginLeft: 8, fontSize: 10.5 }} onClick={() => window.dispatchEvent(new CustomEvent("ai:ask", { detail: { prompt: "Why did the June 2025 cohort lapse so heavily? Pull the policies and replacement notes.", context: "Book · cohort drift" }}))}>
                <Icons.Sparkles size={10}/> Ask
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Cross-sell view — pathway conversion ─── */}
      {view === "crosssell" && !isDemo && (
        <div className="panel" style={{ padding: 36, textAlign: "center" }}>
          <Icons.ArrowUpRight size={20} style={{ color: "var(--text-quaternary)" }}/>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8, fontWeight: 500 }}>No cross-sell data yet</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4, lineHeight: 1.5, maxWidth: 380, marginLeft: "auto", marginRight: "auto" }}>
            Pathways populate once you have multi-policy clients. Each "X issued → Y attached" arc tracks conversion rate and avg time-to-attach.
          </div>
        </div>
      )}
      {view === "crosssell" && isDemo && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div className="panel">
            <div className="panel-h"><Icons.ArrowUpRight size={13}/><h3>Pathway conversion</h3><span className="meta">last {BOOK_PERIOD_LABELS[period]}</span></div>
            <div style={{ padding: 12 }}>
              {[
                { from: "Final Expense issued",  to: "Med Supp",    base: 412, conv: 91, days: 47 },
                { from: "Med Adv issued",        to: "Part D",      base: 304, conv: 78, days: 9 },
                { from: "Med Supp issued",      to: "Annuity",      base: 220, conv: 38, days: 152 },
                { from: "Term Life issued",      to: "IUL",          base: 88, conv: 24, days: 210 },
                { from: "ACA issued",            to: "Med Supp 65",  base: 64, conv: 18, days: 380 },
              ].map((r, i) => {
                const rate = (r.conv / r.base) * 100;
                const tone = rate >= 25 ? "var(--accent-money)" : rate >= 10 ? "var(--state-warning)" : "var(--state-danger)";
                return (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1.6fr 70px 60px 1fr", padding: "8px 0", alignItems: "center", fontSize: 11.5, borderBottom: i < 4 ? "1px solid var(--border-subtle)" : 0 }}>
                    <div>
                      <div style={{ fontWeight: 500 }}>{r.from}</div>
                      <div style={{ color: "var(--text-tertiary)", fontSize: 10.5, marginTop: 2 }}>→ {r.to}</div>
                    </div>
                    <div className="tabular" style={{ textAlign: "right", color: tone, fontWeight: 500 }}>{rate.toFixed(0)}%</div>
                    <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)", fontSize: 10.5 }}>{r.days}d avg</div>
                    <div style={{ height: 4, background: "var(--bg-raised)", borderRadius: 2, marginLeft: 12, overflow: "hidden" }}>
                      <div style={{ width: `${Math.min(100, rate * 2)}%`, height: "100%", background: tone }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="panel">
            <div className="panel-h"><Icons.Activity size={13}/><h3>Untouched cross-sell opportunities</h3><span className="meta">policies eligible · no follow-up logged</span></div>
            <div style={{ padding: 12 }}>
              {[
                { seg: "FE issued > 30d, no Med Supp quote",    n: 78,  ap: 142000 },
                { seg: "MA issued, no PDP attached",             n: 49,  ap:  62000 },
                { seg: "Med Supp issued > 90d, no annuity intro",n: 134, ap: 380000 },
                { seg: "Term Life issued, no IUL conversation",  n: 26,  ap:  88000 },
              ].map((r, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 60px 90px", padding: "9px 0", alignItems: "center", fontSize: 11.5, borderBottom: i < 3 ? "1px solid var(--border-subtle)" : 0 }}>
                  <div style={{ color: "var(--text-secondary)" }}>{r.seg}</div>
                  <div className="tabular" style={{ textAlign: "right", fontWeight: 500 }}>{r.n} clients</div>
                  <div className="tabular" style={{ textAlign: "right", color: "var(--accent-money)", fontWeight: 500 }}>${(r.ap / 1000).toFixed(0)}k AP</div>
                </div>
              ))}
              <div style={{ marginTop: 10, padding: 8, background: "var(--bg-raised)", borderRadius: 6, fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
                <strong style={{ color: "var(--text-secondary)" }}>Total opportunity:</strong> 287 clients · $672k AP if every segment converts at the agency's typical {period} rate.
              </div>
              <button
                className="btn btn-primary"
                style={{ marginTop: 10, width: "100%", justifyContent: "center" }}
                onClick={() => {
                  if (window.gotoPage) window.gotoPage("crm");
                  window.toast && window.toast("Open CRM → filter by 'untouched cross-sell' segment", "info");
                }}
              >
                <Icons.ArrowUpRight size={11}/> Open in CRM
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Settings helper components — used by PageSettings tab routing.
   ───────────────────────────────────────────────────────────────────────── */

// Agency tab: Organization settings + Carriers (owner-only).
function SettingsAgency({ role }) {
  const canEdit = role === "owner" || role === "super_admin";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <SettingsOrg/>
      {window.SettingsCarriers && (() => {
        const C = window.SettingsCarriers;
        return <C canEdit={canEdit} role={role}/>;
      })()}
    </div>
  );
}

// Carrier portal logins card — per-user vault entries for carrier websites.
// Reads agency carrier list + per-user connector_vault (provider = carrier_<slug>).
function CarrierPortalLogins() {
  const CARRIER_PORTAL_URLS = {
    moo:                 "https://igoapp.mutualofomaha.com",
    mutual_omaha:      "https://igoapp.mutualofomaha.com",
    transamerica:      "https://agencylink.transamerica.com",
    americo:           "https://agent.americo.com",
    americanamicable:  "https://agent.americanamicable.com",
    ethos:             "https://partner.ethoslife.com",
    foresters:         "https://link.foresters.com",
    sbli:              "https://producer.sbli.com",
    instabrain:        "https://agent.instabrain.io",
    aig:                "https://aig.myapps.microsoftonline.com",
    corebridge:        "https://aig.myapps.microsoftonline.com",
    fg:                "https://agentservices.fglife.com",
  };

  const carrierAccess = window.repflowCarrierAccess ? window.repflowCarrierAccess("quotes") : null;
  const carriers = (window.AppData?.CARRIERS || [])
    .filter(c => c.status !== "inactive")
    .filter(c => !carrierAccess?.ready || carrierAccess.catalogIds.has(c.id));
  const [vault, setVault] = React.useState({});
  const [open, setOpen]   = React.useState(null); // carrier object being configured
  const [form, setForm]   = React.useState({ username: "", password: "", portal_url: "", mfa_method: "none", capture_mode: "headless" });
  const [saving, setSaving] = React.useState(false);
  const [loadErr, setLoadErr] = React.useState(null);

  const reloadVault = React.useCallback(async () => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return;
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;
      const r = await fetch("/api/agent/connector-list", { headers: { authorization: `Bearer ${session.access_token}` } });
      if (!r.ok) { setLoadErr("Couldn't load saved logins"); return; }
      const { connectors = [] } = await r.json();
      const next = {};
      for (const c of connectors) {
        if (!c.provider?.startsWith("carrier_")) continue;
        const slug = window.repflowCarrierPrefKey ? window.repflowCarrierPrefKey(c.provider.slice(8)) : c.provider.slice(8);
        next[slug] = { username: c.account_metadata?.username || "", _has_password: true, _saved_at: c.connected_at };
      }
      setVault(next);
    } catch (e) { setLoadErr(String(e?.message || e)); }
  }, []);
  React.useEffect(() => { reloadVault(); }, [reloadVault]);

  const carrierSlug = (c) => window.repflowCarrierPrefKey
    ? window.repflowCarrierPrefKey(c)
    : (c.id || c.carrier_id || String(c.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48));

  const openConnect = (c) => {
    const slug = carrierSlug(c);
    const existing = vault[slug] || {};
    const rawId = String(c.id || c.carrier_id || "").toLowerCase();
    setForm({
      username:     existing.username || "",
      password:     "",
      portal_url:   CARRIER_PORTAL_URLS[slug] || CARRIER_PORTAL_URLS[rawId] || "",
      mfa_method:   "none",
      capture_mode: "headless",
    });
    setOpen(c);
  };

  const saveLogin = async () => {
    if (!open) return;
    if (!form.username.trim()) { window.toast && window.toast("Enter a username", "warn"); return; }
    const slug = carrierSlug(open);
    const existing = vault[slug] || {};
    if (!form.password.trim() && !existing._has_password) {
      window.toast && window.toast("Enter a password", "warn"); return;
    }
    setSaving(true);
    try {
      const sb = window.getSupabase && window.getSupabase();
      const { data: { session } } = sb ? await sb.auth.getSession() : { data: { session: null } };
      if (!session) { window.toast && window.toast("Sign in to save", "error"); setSaving(false); return; }

      if (form.password.trim()) {
        const apiKey = JSON.stringify({
          username:     form.username.trim(),
          password:     form.password.trim(),
          portal_url:   form.portal_url.trim() || null,
          mfa_method:   form.mfa_method,
          capture_mode: form.capture_mode,
        });
        const r = await fetch("/api/agent/connector-upsert", {
          method: "POST",
          headers: { authorization: `Bearer ${session.access_token}`, "content-type": "application/json" },
          body: JSON.stringify({
            provider:      window.repflowCarrierProvider ? window.repflowCarrierProvider(slug) : `carrier_${slug}`,
            account_label: `Carrier portal · ${open.name}`,
            api_key:       apiKey,
            metadata:      { username: form.username.trim(), portal_url: form.portal_url.trim() || null },
          }),
        });
        if (!r.ok) { const t = await r.text().catch(() => ""); throw new Error(t || `HTTP ${r.status}`); }
      }

      // Fire placeholder RBA test command so the agent knows to probe the login.
      try {
        const sb2 = window.getSupabase && window.getSupabase();
        if (sb2) {
          await sb2.from("rba_commands").insert({
            kind:    "carrier_portal_test",
            payload: { carrier_slug: slug, carrier_name: open.name, username: form.username.trim() },
            status:  "pending",
          });
        }
      } catch { /* non-blocking — agent will pick it up on next heartbeat */ }

      window.toast && window.toast(`${open.name} login saved`, "success");
      await reloadVault();
      setOpen(null);
    } catch (e) {
      window.toast && window.toast(`Save failed: ${e.message}`, "error");
    } finally { setSaving(false); }
  };

  const clearLogin = async (c) => {
    if (!confirm(`Clear saved login for ${c.name}?`)) return;
    const slug = carrierSlug(c);
    try {
      const sb = window.getSupabase && window.getSupabase();
      if (sb) {
        const providers = window.repflowCarrierProviderAliases
          ? window.repflowCarrierProviderAliases(c?.carrier_id || c?.id || c?.name)
          : [`carrier_${slug}`];
        await sb.from("connector_vault").delete().in("provider", providers);
      }
      window.toast && window.toast(`${c.name} login cleared`, "success");
      await reloadVault();
    } catch (e) { window.toast && window.toast(`Clear failed: ${e.message}`, "error"); }
  };

  const inp = { width: "100%", padding: "7px 10px", background: "var(--bg-raised)", border: "1px solid var(--border-subtle)", borderRadius: 6, fontSize: 13, color: "var(--text-primary)" };
  const radio = (name, val, label, cur, set) => (
    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, cursor: "pointer" }}>
      <input type="radio" name={name} value={val} checked={cur === val} onChange={() => set(val)} style={{ accentColor: "var(--accent-money)" }}/>
      {label}
    </label>
  );

  return (
    <div className="panel">
      <div className="panel-h">
        <Icons.Lock size={13}/>
        <h3>Carrier portal logins</h3>
        <span className="meta">{Object.keys(vault).length} saved · credentials encrypted at rest</span>
      </div>
      <div style={{ padding: "10px 14px 6px", fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.55, background: "color-mix(in oklch, var(--accent-money) 5%, transparent)", borderBottom: "1px solid var(--border-subtle)" }}>
        <details>
          <summary style={{ cursor: "pointer", fontWeight: 500, color: "var(--text-secondary)" }}>How this works</summary>
          <div style={{ marginTop: 6 }}>
            Your credentials are saved to your encrypted connector vault — never localStorage. When you request a quote for a client,
            the Repflow Agent installed on your machine logs in to your carrier portal, fills the quote form, and brings back the rate.
            You're always the user logging in; this just removes the manual step.
          </div>
        </details>
      </div>
      {loadErr && <div style={{ padding: "8px 14px", color: "var(--state-danger)", fontSize: 12 }}>{loadErr}</div>}
      {carriers.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>
          No carriers in your agency yet. Add them in{" "}
          <button className="btn btn-ghost" style={{ fontSize: 12, padding: "1px 6px" }} onClick={() => {
            try { sessionStorage.setItem("repflow.settings.tab", "agency"); } catch {}
            window.dispatchEvent(new CustomEvent("nav:goto", { detail: { page: "settings" } }));
          }}>Settings → Agency</button>.
        </div>
      ) : (
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1.4fr 130px 1fr 160px" }}>
            <div>Carrier</div><div>Status</div><div>Username</div><div></div>
          </div>
          {carriers.map(c => {
            const slug = carrierSlug(c);
            const v = vault[slug];
            const isConnected = !!v;
            return (
              <div key={c.id} className="row" style={{ gridTemplateColumns: "1.4fr 130px 1fr 160px" }}>
                <div style={{ fontWeight: 500 }}>{c.name}</div>
                <div>
                  <span className={`chip ${isConnected ? "chip-money" : ""}`}>
                    {isConnected ? `Connected${v._saved_at ? " · " + new Date(v._saved_at).toLocaleDateString() : ""}` : "Not connected"}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{v?.username || "—"}</div>
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  {isConnected && (
                    <button className="btn btn-ghost" onClick={() => clearLogin(c)} style={{ fontSize: 11 }}>Clear</button>
                  )}
                  <button className="btn btn-primary" onClick={() => openConnect(c)} style={{ fontSize: 11 }}>
                    {isConnected ? "Update" : "Connect"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {open && (
        <Shared.Modal title={`Connect · ${open.name}`} width={520} onClose={() => setOpen(null)} actions={
          <>
            <button className="btn btn-ghost" onClick={() => setOpen(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveLogin} disabled={saving || !form.username.trim()}>
              <Icons.Check size={11}/> {saving ? "Saving…" : "Save login"}
            </button>
          </>
        }>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Shared.Field label="Username (producer portal login)">
              <input style={inp} type="text" value={form.username} autoFocus autoComplete="off"
                onChange={(e) => setForm(f => ({ ...f, username: e.target.value }))}
                placeholder="producer@example.com"/>
            </Shared.Field>
            <Shared.Field label="Password">
              <input style={inp} type="password" value={form.password} autoComplete="new-password"
                onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") saveLogin(); }}
                placeholder={vault[carrierSlug(open)]?._has_password ? "•••••••• (saved · type to replace)" : "password"}/>
            </Shared.Field>
            <Shared.Field label="Portal URL (pre-filled · editable)">
              <input style={inp} type="url" value={form.portal_url}
                onChange={(e) => setForm(f => ({ ...f, portal_url: e.target.value }))}
                placeholder="https://agent.carrier.com"/>
            </Shared.Field>
            <div>
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600 }}>MFA / 2FA method</div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {radio("mfa", "none",          "None",                form.mfa_method, (v) => setForm(f => ({ ...f, mfa_method: v })))}
                {radio("mfa", "totp",          "TOTP (authenticator)",form.mfa_method, (v) => setForm(f => ({ ...f, mfa_method: v })))}
                {radio("mfa", "sms",           "SMS code",            form.mfa_method, (v) => setForm(f => ({ ...f, mfa_method: v })))}
                {radio("mfa", "login_fresh",   "Login fresh each time",form.mfa_method,(v) => setForm(f => ({ ...f, mfa_method: v })))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600 }}>Capture mode</div>
              <div style={{ display: "flex", gap: 16 }}>
                {radio("cap", "headless", "Headless (default)",  form.capture_mode, (v) => setForm(f => ({ ...f, capture_mode: v })))}
                {radio("cap", "headed",   "Headed (visible browser)", form.capture_mode, (v) => setForm(f => ({ ...f, capture_mode: v })))}
              </div>
              <div style={{ marginTop: 4, fontSize: 11, color: "var(--text-tertiary)" }}>
                Headless is faster. Headed lets you see the browser + handle MFA prompts manually.
              </div>
            </div>
            <div style={{ padding: "8px 10px", background: "var(--bg-raised)", borderRadius: 6, fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
              Credentials stored in your encrypted connector vault. Never logged. The Repflow Agent on your machine uses them to fetch live quotes — you're always the authenticated user.
            </div>
          </div>
        </Shared.Modal>
      )}
    </div>
  );
}

// Connectors tab: Twilio capability status + agency integrations catalog + carrier portal logins.
function SettingsConnectors({ role }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {window.CallingSetup && (() => { const C = window.CallingSetup; return <C/>; })()}
      <SettingsIntegrations/>
      <CarrierPortalLogins/>
    </div>
  );
}

// Compliance tab: TCPA consent, recording notice, DNC.
function SettingsCompliance() {
  const US_STATES_CONSENT = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"];
  // All-party consent states (require both parties to consent to recording).
  const ALL_PARTY_STATES = new Set(["CA","CT","DE","FL","IL","MD","MA","MI","MT","NH","OR","PA","WA"]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="panel" style={{ padding: 16 }}>
        <div className="panel-h" style={{ marginBottom: 10 }}>
          <Icons.Shield size={13}/>
          <h3>TCPA — Telephone Consumer Protection Act</h3>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.65 }}>
          <p style={{ margin: "0 0 8px" }}>
            <strong>Prior express written consent</strong> is required before calling or texting leads on a cell phone for marketing purposes.
            The{" "}
            <a href="https://www.fcc.gov/consumers/guides/stop-unwanted-robocalls-and-texts" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-money)" }}>FCC TCPA rule</a>
            {" "}effective January 2025 requires one-to-one consent — a lead can only consent to receive calls from your agency specifically, not a shared-lead marketplace.
          </p>
          <p style={{ margin: "0 0 8px" }}>
            <strong>Safe harbor for inbound leads:</strong> Leads who call <em>you</em> first give implied consent for one return call within the same 24h window.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Action:</strong> Ensure every lead form and vendor contract includes compliant one-to-one consent language before importing leads into Repflow.
          </p>
        </div>
        <div style={{ marginTop: 12, padding: "8px 12px", background: "color-mix(in oklch, var(--state-warning) 10%, transparent)", border: "1px solid color-mix(in oklch, var(--state-warning) 30%, transparent)", borderRadius: 6, fontSize: 12, color: "var(--text-secondary)" }}>
          <Icons.AlertTriangle size={12} style={{ display: "inline-block", verticalAlign: "middle", marginRight: 6, color: "var(--state-warning)" }}/>
          This information is informational only and not legal advice. Consult a licensed compliance attorney for your agency's specific situation.
        </div>
      </div>

      <div className="panel" style={{ padding: 16 }}>
        <div className="panel-h" style={{ marginBottom: 10 }}>
          <Icons.Mic size={13}/>
          <h3>Call recording consent — by state</h3>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 10 }}>
          One-party states require only the rep to consent. All-party (two-party) states require the lead to be notified and consent before recording begins.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(68px, 1fr))", gap: 4 }}>
          {US_STATES_CONSENT.map(s => {
            const allParty = ALL_PARTY_STATES.has(s);
            return (
              <div key={s} style={{
                padding: "5px 8px",
                borderRadius: 5,
                fontSize: 11.5,
                fontWeight: 500,
                textAlign: "center",
                background: allParty ? "color-mix(in oklch, var(--state-warning) 12%, transparent)" : "var(--bg-raised)",
                border: `1px solid ${allParty ? "color-mix(in oklch, var(--state-warning) 30%, transparent)" : "var(--border-subtle)"}`,
                color: allParty ? "var(--state-warning)" : "var(--text-secondary)",
              }} title={allParty ? `${s}: All-party consent required` : `${s}: One-party consent`}>
                {s}
                {allParty && <div style={{ fontSize: 9, marginTop: 1, opacity: 0.8 }}>all-party</div>}
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-tertiary)" }}>
          <strong style={{ color: "var(--state-warning)" }}>All-party states (highlighted):</strong>{" "}
          {[...ALL_PARTY_STATES].sort().join(", ")} — Play a disclosure before recording. Repflow's call recording disclosure is auto-played when configured.
        </div>
      </div>

      <div className="panel" style={{ padding: 16 }}>
        <div className="panel-h" style={{ marginBottom: 8 }}>
          <Icons.X size={13}/>
          <h3>Do Not Call (DNC)</h3>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          <p style={{ margin: "0 0 8px" }}>
            The FTC National DNC Registry covers residential phone numbers. Medicare-supplement and Final Expense cold calling is subject to DNC scrubbing.
            Registered numbers must not be called for solicitation; violations carry fines up to <strong>$51,744 per call</strong>.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Exception:</strong> Leads who have an <em>established business relationship</em> with your agency (purchased a policy in the past 18 months, or made an inquiry in the past 3 months) may be called even if DNC-registered.
          </p>
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <a href="https://telemarketing.donotcall.gov" target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ fontSize: 12 }}>
            <Icons.ArrowUpRight size={11}/> FTC DNC portal
          </a>
          <a href="https://www.fcc.gov/consumers/guides/stop-unwanted-robocalls-and-texts" target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ fontSize: 12 }}>
            <Icons.ArrowUpRight size={11}/> FCC TCPA guide
          </a>
        </div>
      </div>
    </div>
  );
}

// Developer tab: API keys + webhooks. Gated to super_admin / owner.
function SettingsDeveloper({ role }) {
  if (role !== "super_admin" && role !== "owner") {
    return (
      <div className="panel" style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>
        <Icons.Lock size={20} style={{ display: "inline-block", color: "var(--text-quaternary)" }}/>
        <div style={{ fontSize: 13, fontWeight: 500, marginTop: 10 }}>Developer tools are restricted to super-admins</div>
        <div style={{ fontSize: 12, marginTop: 4 }}>API keys and webhook secrets are managed by your agency owner.</div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <SettingsApi/>
      <SettingsRouting/>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   8. Settings — role-aware (8 sections: Profile, Agency, Agents, Connectors,
      Team, Billing, Compliance, Developer).
   ───────────────────────────────────────────────────────────────────────── */
function PageSettings({ role = "owner" }) {
  const isSuperOrOwner = role === "owner" || role === "super_admin";
  const isManagerUp    = isSuperOrOwner || role === "manager";
  const TABS = [
    ["profile",    "Profile"],
    ...(isSuperOrOwner ? [["agency",     "Agency"]]     : []),
    ["agents",     "Agents"],
    ["connectors", "Connectors"],
    ...(isManagerUp    ? [["team",       "Team"]]        : []),
    ...(isSuperOrOwner ? [["billing",    "Billing"]]     : []),
    ...(isManagerUp    ? [["compliance", "Compliance"]]  : []),
    ...(isSuperOrOwner ? [["developer",  "Developer"]]   : []),
  ];
  // Allow other pages to deeplink into a specific tab via sessionStorage
  // (e.g. Resources → "Manage carriers" jumps here with carriers preselected).
  const initialTab = (() => {
    try {
      const stash = sessionStorage.getItem("repflow.settings.tab");
      if (stash) {
        sessionStorage.removeItem("repflow.settings.tab");
        if (TABS.some(([k]) => k === stash)) return stash;
      }
    } catch {}
    return TABS[0][0];
  })();
  const [tab, setTab] = React.useState(initialTab);

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Settings</div>
          <div className="page-sub">{isSuperOrOwner ? "Profile · Agency · Agents · Connectors · Team · Billing · Compliance · Developer" : isManagerUp ? "Profile · Agents · Connectors · Team · Compliance" : "Profile · Agents · Connectors"}</div>
        </div>
        {/* P7: prominent Edit Profile entry point. Works for every role
            (owner / manager / rep / imo_owner). Highlights when active so
            users can find their way back to other tabs after clicking. */}
        <button
          className={"btn " + (tab === "profile" ? "btn-primary" : "")}
          style={{ marginLeft: "auto" }}
          onClick={() => setTab("profile")}
        >
          <Icons.User size={13}/> Edit Profile
        </button>
      </div>

      <div className="settings-grid settings-grid-responsive" style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 14 }}>
        <div className="panel" style={{ padding: 6 }}>
          {TABS.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className="btn btn-ghost" style={{ width: "100%", justifyContent: "flex-start", padding: "8px 10px", background: tab === k ? "var(--bg-raised)" : "transparent", color: tab === k ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: tab === k ? 500 : 400 }}>{l}</button>
          ))}
        </div>

        <div>
          {tab === "profile"     && <SettingsProfile role={role}/>}
          {tab === "agency"      && <SettingsAgency role={role}/>}
          {tab === "agents"      && <SettingsAgents role={role}/>}
          {tab === "connectors"  && <SettingsConnectors role={role}/>}
          {tab === "team"        && (() => { const T = window.SettingsTeam; return T ? <T/> : null; })()}
          {tab === "billing"     && <SettingsBilling/>}
          {tab === "compliance"  && <SettingsCompliance/>}
          {tab === "developer"   && <SettingsDeveloper role={role}/>}
        </div>
      </div>
    </div>
  );
}

function SettingsOrg() {
  // Don't seed real org fields with Atlas demo strings — empty inputs render
  // the placeholder cleanly and signal "fill me in" instead of "this is the
  // seed I should overwrite". Demo agency keeps the seed for the sandbox.
  const isDemo = !!(window.isDemoAgency && window.isDemoAgency());
  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  const [name, setName]     = React.useState(window.AppData?.ORG_SETTINGS?.name || (isDemo ? "Atlas Insurance Group" : (meIdent?.agency_name || "")));
  const [legal, setLegal]   = React.useState(window.AppData?.ORG_SETTINGS?.legal || (isDemo ? "Atlas IMO LLC" : ""));
  const [domain, setDomain] = React.useState(window.AppData?.ORG_SETTINGS?.domain || (isDemo ? "atlasimo.com" : ""));
  const [npn, setNpn]       = React.useState(window.AppData?.ORG_SETTINGS?.npn || (isDemo ? "19384726" : ""));
  const [saving, setSaving] = React.useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await window.AppData.mutate.orgSettingsSave({ name, legal, domain, npn });
      window.toast && window.toast(`Organization saved${AppData.LIVE ? "" : " (demo only — sign in for persistence)"}`, "success");
    } catch (e) { window.toast?.(`Organization save failed: ${e?.message || e}`, "error"); console.error("[org.settingsSave]", e); } finally { setSaving(false); }
  };
  return (
    <div className="panel" style={{ padding: 16 }}>
      <h3 style={{ margin: 0, marginBottom: 12 }}>Organization</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Shared.Field label="Display name"><input className="text-input" value={name} onChange={(e) => setName(e.target.value)}/></Shared.Field>
        <Shared.Field label="Legal entity"><input className="text-input" value={legal} onChange={(e) => setLegal(e.target.value)}/></Shared.Field>
        <Shared.Field label="Domain"><input className="text-input" value={domain} onChange={(e) => setDomain(e.target.value)}/></Shared.Field>
        <Shared.Field label="NPN"><input className="text-input" value={npn} onChange={(e) => setNpn(e.target.value)}/></Shared.Field>
      </div>
      <div className="divider"></div>
      <h3 style={{ margin: 0, marginBottom: 8 }}>Operating states</h3>
      <OperatingStatesEditor/>
      <div className="divider"></div>
      <button className="btn btn-primary" onClick={save} disabled={saving}><Icons.Check size={12}/> {saving ? "Saving..." : "Save organization"}</button>
    </div>
  );
}

const ALL_US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"];

function OperatingStatesEditor() {
  const initial = (window.AppData?.ORG_SETTINGS?.operating_states) || ["TX","FL","CA","NY","GA","NV","AZ","OH","PA","MI","NC","WI","WA"];
  const [states, setStates] = React.useState(initial);
  const [picking, setPicking] = React.useState(false);
  const [busy, setBusy]       = React.useState(false);

  const persist = async (next) => {
    setStates(next);
    if (window.AppData?.ORG_SETTINGS) window.AppData.ORG_SETTINGS.operating_states = next;
    if (window.AppData?.mutate?.orgSettingsSave) {
      setBusy(true);
      try {
        await window.AppData.mutate.orgSettingsSave({ operating_states: next });
      } catch (e) { window.toast?.(`Operating states save failed: ${e?.message || e}`, "error"); console.error("[org.operatingStates]", e); } finally { setBusy(false); }
    }
  };

  const remove = (s) => persist(states.filter(x => x !== s));
  const toggle = (s) => persist(states.includes(s) ? states.filter(x => x !== s) : [...states, s].sort());

  const available = ALL_US_STATES.filter(s => !states.includes(s));

  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {states.map(s => (
          <span key={s} className="chip chip-money" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            {s}
            <button onClick={() => remove(s)} className="icon-btn" style={{ width: 14, height: 14, padding: 0, opacity: 0.6 }} title={`Remove ${s}`}>
              <Icons.X size={9}/>
            </button>
          </span>
        ))}
        <button className="btn btn-ghost" style={{ padding: "3px 10px" }} onClick={() => setPicking(p => !p)} disabled={busy}>
          <Icons.Plus size={11}/> Add{busy && " · saving…"}
        </button>
      </div>
      {picking && (
        <div style={{ marginTop: 10, padding: 10, background: "var(--bg-raised)", borderRadius: 6 }}>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 6 }}>{available.length} states available</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {available.map(s => (
              <button key={s} onClick={() => toggle(s)} className="chip" style={{ cursor: "pointer", border: 0 }}>
                {s}
              </button>
            ))}
            {available.length === 0 && <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>All 51 states + DC already operating.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsBilling() {
  const goBilling = () => {
    if (window.gotoPage) window.gotoPage("billing");
    else window.toast && window.toast("Billing page not yet wired", "info");
  };
  const updatePayment = () => {
    // Stripe-hosted billing portal — env-gated. If no portal URL set, surface
    // a friendly notice rather than the dead button it was before.
    const url = window.AppData?.ORG_SETTINGS?.stripe_portal_url;
    if (url) { window.open(url, "_blank", "noopener,noreferrer"); return; }
    window.toast && window.toast("Add STRIPE_PORTAL_URL to update payment method", "info");
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="panel" style={{ padding: 16 }}>
        <h3 style={{ margin: 0, marginBottom: 8 }}>Plan</h3>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>Network · Annual</div>
            <div style={{ color: "var(--text-tertiary)", fontSize: 12.5, marginTop: 2 }}>Up to 25 producers · all integrations · 24h support</div>
          </div>
          <button className="btn btn-ghost" onClick={goBilling}>Manage plan</button>
        </div>
      </div>
      <div className="panel" style={{ padding: 16 }}>
        <h3 style={{ margin: 0, marginBottom: 8 }}>Usage this month</h3>
        {[
          { l: "Active producers", v: "9 / 25",  w: 36 },
          { l: "Voice AI minutes", v: "12,480 / 50,000", w: 25 },
          { l: "Lead enrichment",  v: "1,840 / 5,000",   w: 37 },
          { l: "Storage",           v: "412 GB / 1 TB",   w: 41 },
        ].map((r, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 120px 200px", padding: "8px 0", alignItems: "center", borderBottom: i < 3 ? "1px solid var(--border-subtle)" : 0, fontSize: 12.5 }}>
            <span style={{ color: "var(--text-secondary)" }}>{r.l}</span>
            <span className="tabular" style={{ textAlign: "right", fontWeight: 500 }}>{r.v}</span>
            <div style={{ height: 5, background: "var(--bg-raised)", borderRadius: 2, marginLeft: 14, overflow: "hidden" }}>
              <div style={{ width: `${r.w}%`, height: "100%", background: "var(--accent-money)" }}></div>
            </div>
          </div>
        ))}
      </div>
      <div className="panel" style={{ padding: 16 }}>
        <h3 style={{ margin: 0, marginBottom: 8 }}>Payment method</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--text-secondary)" }}>
          <span className="chip">VISA</span><span className="mono" style={{ fontSize: 12.5 }}>**** 4419</span><span style={{ color: "var(--text-tertiary)", fontSize: 12.5 }}>· expires 09/27</span>
          <button className="btn btn-ghost" style={{ marginLeft: "auto" }} onClick={updatePayment}>Update</button>
        </div>
      </div>
    </div>
  );
}

function SettingsIntegrations() {
  // Pass 6 (2026-05-11): source of truth is public.connector_catalog crossed
  // with the agency's public.connections rows for connected status.
  // AppData.CONNECTIONS is now [] by default for real agencies (P1 fix), so
  // reading from it directly would hide all available connectors. The
  // catalog table is the catalog; connections is the configured-state side.
  const [catalog, setCatalog]     = React.useState([]);
  const [connections, setConnections] = React.useState([]);
  const [loading, setLoading]     = React.useState(true);
  const [loadErr, setLoadErr]     = React.useState(null);
  const [testing, setTesting]     = React.useState(null);
  const [twilioOpen, setTwilioOpen]     = React.useState(false);
  const [genericOpen, setGenericOpen]   = React.useState(null);

  const refresh = React.useCallback(async () => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) { setLoading(false); return; }
    try {
      const [cat, conn] = await Promise.all([
        sb.from("connector_catalog").select("*"),
        sb.from("connections").select("id, connector_key, status, meta, config"),
      ]);
      // connector_catalog should be queryable by all authed users (it's a
      // global catalog). connections is RLS-scoped to viewer_agency_ids().
      if (cat.error && cat.error.code !== "PGRST116") setLoadErr(cat.error.message || String(cat.error));
      setCatalog(Array.isArray(cat.data) ? cat.data : []);
      setConnections(Array.isArray(conn.data) ? conn.data : []);
    } catch (e) {
      setLoadErr(String(e?.message || e));
    } finally { setLoading(false); }
  }, []);
  React.useEffect(() => { refresh(); }, [refresh]);

  const byKey = React.useMemo(() => {
    const m = new Map();
    connections.forEach(c => m.set(c.connector_key || c.id, c));
    return m;
  }, [connections]);

  const test = async (key, label) => {
    setTesting(key);
    try {
      const r = await fetch("/api/connector/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ connector_key: key }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && (j?.ok || j?.status === "ok")) window.toast && window.toast(`${label}: healthy`, "success");
      else window.toast && window.toast(`${label}: ${j?.error || "test failed"}`, "warn");
    } catch (_e) {
      window.toast && window.toast(`${label}: test endpoint unreachable`, "warn");
    } finally {
      setTesting(null);
      refresh();
    }
  };

  // Fall back to legacy CONNECTIONS list ONLY for demo agencies so the
  // sandbox tour still looks alive. Real agencies see the live catalog.
  const isDemoAgency = !!(window.isDemoAgency && window.isDemoAgency());
  if (isDemoAgency && catalog.length === 0 && (AppData.CONNECTIONS || []).length > 0) {
    const CONNECTIONS = AppData.CONNECTIONS;
    return (
      <div className="panel">
        <div className="panel-h"><h3>Connected services</h3><span className="meta">demo data · {CONNECTIONS.length} configured</span></div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1.4fr 1fr 100px 1.6fr 140px" }}>
            <div>Service</div><div>Category</div><div>Status</div><div>Detail</div><div></div>
          </div>
          {CONNECTIONS.map(c => (
            <div key={c.id} className="row" style={{ gridTemplateColumns: "1.4fr 1fr 100px 1.6fr 140px" }}>
              <div style={{ fontWeight: 500 }}>{c.name}</div>
              <div style={{ color: "var(--text-tertiary)" }}>{c.category}</div>
              <div><span className={`chip ${c.status === "ok" ? "chip-money" : c.status === "warn" ? "chip-status" : "chip-danger"}`}>{c.status === "ok" ? "Connected" : c.status === "warn" ? "Action needed" : "Down"}</span></div>
              <div style={{ color: "var(--text-tertiary)", fontSize: 12 }}>{c.meta}</div>
              <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                <button className="btn btn-ghost" onClick={() => { if (c.id === "twilio") setTwilioOpen(true); else if (window.CONNECTOR_SCHEMAS && window.CONNECTOR_SCHEMAS[c.id]) setGenericOpen(c.id); }}>{c.status === "ok" ? "Configure" : "Reconnect"}</button>
              </div>
            </div>
          ))}
        </div>
        {twilioOpen && window.TwilioConfigModal && (() => { const M = window.TwilioConfigModal; return <M onClose={() => setTwilioOpen(false)}/>; })()}
        {genericOpen && window.ConnectorConfigModal && (() => { const M = window.ConnectorConfigModal; return <M connectorId={genericOpen} onClose={() => setGenericOpen(null)}/>; })()}
      </div>
    );
  }

  if (loading) {
    return <div className="panel" style={{ padding: 24, color: "var(--text-tertiary)", fontSize: 12.5 }}>Loading connector catalog…</div>;
  }
  if (loadErr) {
    return (
      <div className="panel" style={{ padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--state-danger)" }}>Couldn't load connectors</div>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "6px 0 10px" }}>{loadErr}</div>
        <button className="btn" onClick={refresh}>Try again</button>
      </div>
    );
  }
  if (catalog.length === 0) {
    return (
      <div className="panel" style={{ padding: 18 }}>
        <h3 style={{ margin: 0, marginBottom: 6 }}>Connectors</h3>
        <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", lineHeight: 1.55 }}>
          No connectors in <code style={{ fontSize: 10.5 }}>connector_catalog</code> yet. Once your backend seeds the catalog, every integration (Twilio, Stripe, Gmail, iPipeline, etc.) will appear here with status badges.
        </div>
      </div>
    );
  }

  // Group by category for legibility
  const groups = catalog.reduce((acc, c) => {
    const cat = c.category || "Other";
    (acc[cat] = acc[cat] || []).push(c);
    return acc;
  }, {});

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {Object.entries(groups).map(([cat, items]) => (
        <div className="panel" key={cat}>
          <div className="panel-h"><h3>{cat}</h3><span className="meta">{items.filter(c => byKey.get(c.connector_key || c.id)?.status === "ok").length}/{items.length} connected</span></div>
          <div className="list">
            <div className="list-h" style={{ gridTemplateColumns: "1.6fr 100px 1.4fr 200px" }}>
              <div>Service</div><div>Status</div><div>Detail</div><div></div>
            </div>
            {items.map(c => {
              const key  = c.connector_key || c.id;
              const live = byKey.get(key);
              const isConnected = live && live.status === "ok";
              const isWarn      = live && live.status === "warn";
              return (
                <div key={key} className="row" style={{ gridTemplateColumns: "1.6fr 100px 1.4fr 200px" }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>{c.label || c.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{c.description || ""}</div>
                  </div>
                  <div>
                    <span className={`chip ${isConnected ? "chip-money" : isWarn ? "chip-status" : ""}`}>
                      {isConnected ? "Connected" : isWarn ? "Action needed" : "Not connected"}
                    </span>
                  </div>
                  <div style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>{live?.meta || ""}</div>
                  <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                    {isConnected && (
                      <button className="btn btn-ghost" onClick={() => test(key, c.label || c.name)} disabled={testing === key}>
                        {testing === key ? "Testing…" : "Test"}
                      </button>
                    )}
                    <button className="btn" onClick={() => {
                      if (key === "twilio") setTwilioOpen(true);
                      else setGenericOpen(key);
                    }}>
                      {isConnected ? "Configure" : isWarn ? "Reconnect" : "Connect"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {twilioOpen && window.TwilioConfigModal && (() => { const M = window.TwilioConfigModal; return <M onClose={() => { setTwilioOpen(false); refresh(); }}/>; })()}
      {genericOpen && window.ConnectorConfigModal && (() => { const M = window.ConnectorConfigModal; return <M connectorId={genericOpen} onClose={() => { setGenericOpen(null); refresh(); }}/>; })()}
    </div>
  );
}

/* Settings → Agents — device-install management.
 *
 * Migrated 2026-05-15 from the persona-recommendation prototype to the
 * production rba_installs schema (migration 0030). Lists the user's local
 * agent installs (one row per device_id), shows live status from
 * heartbeat, lets the user issue an install token + revoke devices.
 *
 * Per-role capability ledger and tool registry are now server-side
 * (api/agent/_lib.js). The old `suggested_agents_for_role` and
 * `install_agent` RPC paths never existed in the DB; this component used
 * to silently fail.
 */
function SettingsAgents({ role = "owner" }) {
  const [installs, setInstalls]     = React.useState([]);
  const [loading, setLoading]       = React.useState(true);
  const [busyId, setBusyId]         = React.useState(null);
  const [tokenInfo, setTokenInfo]   = React.useState(null);   // { token, expires_at, role, agency_id }
  const [issuing, setIssuing]       = React.useState(false);
  const [err, setErr]               = React.useState(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const sb = window.getSupabase && window.getSupabase();
      const session = sb && (await sb.auth.getSession())?.data?.session;
      const jwt = session?.access_token;
      if (!jwt) { setLoading(false); return; }
      const r = await fetch("/api/agent/installs", { headers: { authorization: `Bearer ${jwt}` } });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
      setInstalls(Array.isArray(data?.installs) ? data.installs : []);
    } catch (e) {
      setErr(String(e?.message || e));
    } finally { setLoading(false); }
  }, []);
  React.useEffect(() => { refresh(); }, [refresh]);

  const issueInstallToken = async () => {
    setIssuing(true);
    setErr(null);
    try {
      const sb = window.getSupabase();
      const session = (await sb.auth.getSession())?.data?.session;
      const jwt = session?.access_token;
      const r = await fetch("/api/agent/install-token", {
        method: "POST",
        headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
        body: JSON.stringify({}),  // role auto-derived from membership
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
      setTokenInfo(data);
    } catch (e) {
      setErr(String(e?.message || e));
    } finally { setIssuing(false); }
  };

  const revoke = async (deviceId) => {
    if (!confirm("Revoke this device? It will self-wipe on its next heartbeat.")) return;
    setBusyId(deviceId);
    try {
      const sb = window.getSupabase();
      const session = (await sb.auth.getSession())?.data?.session;
      const jwt = session?.access_token;
      const r = await fetch("/api/agent/revoke", {
        method: "POST",
        headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
        body: JSON.stringify({ device_id: deviceId }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d?.error || `HTTP ${r.status}`);
      }
      window.toast && window.toast("Device revoked", "success");
      await refresh();
    } catch (e) {
      window.toast && window.toast(`Revoke failed: ${e?.message || e}`, "error");
    } finally { setBusyId(null); }
  };

  const apiBase = (typeof window !== "undefined" && window.location ? `${window.location.protocol}//${window.location.host}` : "https://repflow.koino.capital");
  const installCmds = (token) => ({
    bash:  `curl -fsSL "${apiBase}/api/agent/install.sh?token=${token}" | bash`,
    pwsh:  `iwr -useb "${apiBase}/api/agent/install.ps1?token=${token}" | iex`,
    docker: `docker run -d --name repflow-agent -e RBA_TOKEN=${token} -e API_BASE=${apiBase} -v "$HOME/.repflow/agent:/agent" ghcr.io/koinod/repflow-agent:latest`,
  });

  const fmtAgo = (ts) => {
    if (!ts) return "—";
    const diff = (Date.now() - new Date(ts).getTime()) / 1000;
    if (diff < 60)    return `${Math.floor(diff)}s ago`;
    if (diff < 3600)  return `${Math.floor(diff/60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
    return `${Math.floor(diff/86400)}d ago`;
  };
  const statusChipClass = (s, lastSeen) => {
    if (s === "revoked")     return "chip";
    if (s === "quarantined") return "chip chip-status";
    const stale = lastSeen && (Date.now() - new Date(lastSeen).getTime() > 5 * 60_000);
    return stale ? "chip chip-status" : "chip chip-money";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="panel">
        <div className="panel-h">
          <Icons.Cpu size={13}/>
          <h3>Your devices</h3>
          <span className="meta">
            {installs.filter(i => i.status === "active").length} active · {installs.length} total
          </span>
          <button className="btn" style={{ marginLeft: "auto" }} onClick={refresh}>
            <Icons.RefreshCw size={11}/> Refresh
          </button>
          <button className="btn btn-primary" disabled={issuing} onClick={issueInstallToken}>
            {issuing ? "…" : <><Icons.Plus size={11}/> Install on a machine</>}
          </button>
        </div>
        {err && (
          <div style={{ padding: 12, color: "var(--state-danger)", fontSize: 12 }}>
            {err}
          </div>
        )}
        {loading ? (
          <div style={{ padding: 22, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>Loading devices…</div>
        ) : installs.length === 0 ? (
          <div style={{ padding: 22, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>
            No devices installed. Click <strong>Install on a machine</strong> to issue a one-shot token, then run the curl/iwr command on the target machine.
          </div>
        ) : (
          <div className="list list-responsive">
            <div className="list-h" style={{ gridTemplateColumns: "minmax(140px, 1.4fr) 80px minmax(120px, 1fr) 100px 110px 90px" }}>
              <div>Hostname / OS</div>
              <div>Role</div>
              <div>Models</div>
              <div>Heartbeat</div>
              <div>Status</div>
              <div></div>
            </div>
            {installs.map(d => (
              <div key={d.device_id} className="row" style={{ gridTemplateColumns: "minmax(140px, 1.4fr) 80px minmax(120px, 1fr) 100px 110px 90px" }}>
                <div style={{ overflow: "hidden" }}>
                  <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.hostname || "—"}</div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.os || ""} · {d.version || "v?"}</div>
                </div>
                <div><span className="chip">{d.role}</span></div>
                <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={(d.models_local || []).join(", ")}>{(d.models_local || []).join(", ") || "—"}</div>
                <div style={{ fontSize: 12 }}>{fmtAgo(d.last_seen_at)}</div>
                <div><span className={statusChipClass(d.status, d.last_seen_at)}>{d.status}</span></div>
                <div className="list-actions" style={{ display: "flex", justifyContent: "flex-end" }}>
                  {d.status !== "revoked" && (
                    <button className="btn btn-ghost" disabled={busyId === d.device_id} onClick={() => revoke(d.device_id)}>
                      {busyId === d.device_id ? "…" : "Revoke"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {tokenInfo && (
        <div className="panel">
          <div className="panel-h">
            <Icons.Shield size={13}/>
            <h3>Install token (expires in 5 min)</h3>
            <span className="meta">role: {tokenInfo.role}</span>
            <button className="btn btn-ghost" style={{ marginLeft: "auto", padding: "2px 8px", fontSize: 11 }} onClick={() => setTokenInfo(null)}>Dismiss</button>
          </div>
          <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              ["macOS / Linux (bash)", installCmds(tokenInfo.token).bash],
              ["Windows (PowerShell)", installCmds(tokenInfo.token).pwsh],
              ["Docker (any OS)",      installCmds(tokenInfo.token).docker],
            ].map(([label, cmd]) => (
              <div key={label}>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>{label}</div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", padding: 8, background: "var(--bg-raised)", borderRadius: 6 }}>
                  <code className="mono" style={{ flex: 1, fontSize: 11, wordBreak: "break-all" }}>{cmd}</code>
                  <button className="btn btn-ghost" onClick={() => navigator.clipboard.writeText(cmd).then(() => window.toast && window.toast("Copied", "success"))}>
                    <Icons.Copy size={11}/> Copy
                  </button>
                </div>
              </div>
            ))}
            <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
              The token works once. After install, the device gets a long-lived agent token stored in <code>~/.repflow/agent/config.yaml</code> (chmod 600). Revoke any time from the list above.
            </div>
          </div>
        </div>
      )}

      <UserConnectorVault />
      <AutomationRulesEditor />
      <AgentSettingsEditor />
    </div>
  );
}

// ─── Automation rules — owner-edited, drives post-call/post-meeting/etc.
//
// Fires via SECURITY DEFINER fn automation_fire(agency, trigger, rep, ctx).
// Webhook handlers (twilio-app, fathom-webhook, stripe webhook, etc.) call
// the RPC; this editor lets the owner define which command to fan-out for
// each trigger.

const TRIGGERS = [
  { k: "call_completed",          l: "After a call ends (with answer)" },
  { k: "call_missed",             l: "When a call is missed / no answer" },
  { k: "meeting_completed",       l: "After a Fathom meeting completes" },
  { k: "lead_created",            l: "When a new lead is created" },
  { k: "lead_stage_changed",      l: "When a lead moves stages" },
  { k: "appointment_booked",      l: "When an appointment is booked" },
  { k: "appointment_reminder_24h",l: "24h before an appointment" },
  { k: "appointment_reminder_1h", l: "1h before an appointment" },
  { k: "payment_succeeded",       l: "When a Stripe payment succeeds" },
  { k: "payment_failed",          l: "When a Stripe payment fails" },
  { k: "policy_issued",           l: "When a policy is issued" },
  { k: "nigo_received",           l: "When a NIGO arrives" },
];
const COMMAND_KINDS = [
  { k: "post_call_followup",      l: "Generate post-call follow-up draft" },
  { k: "draft_sms",               l: "Draft SMS (queue for review)" },
  { k: "draft_email",             l: "Draft email" },
  { k: "twilio_dial",             l: "Place outbound call" },
  { k: "sendblue_send",           l: "Send iMessage via SendBlue" },
  { k: "fathom_pull_notes",       l: "Pull Fathom notes for the lead" },
  { k: "auto_quote",              l: "Run auto-quote across carriers" },
  { k: "script_review",           l: "AI review of the rep's last script" },
];

function AutomationRulesEditor() {
  const [rules, setRules] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [agencyId, setAgencyId] = React.useState(null);
  const [adding, setAdding] = React.useState(false);
  const [busy, setBusy] = React.useState(null);

  const sb = window.getSupabase && window.getSupabase();
  const reload = React.useCallback(async () => {
    if (!sb) { setLoading(false); return; }
    setLoading(true);
    try {
      const aid = (await sb.rpc("current_agency_id"))?.data || null;
      setAgencyId(aid);
      const { data } = await sb
        .from("automation_rules")
        .select("id,trigger,command_kind,command_payload,scope,rep_id,enabled,delay_seconds,description,created_at")
        .order("created_at", { ascending: false });
      setRules(data || []);
    } finally { setLoading(false); }
  }, []);
  React.useEffect(() => { reload(); }, [reload]);

  const toggle = async (id, current) => {
    setBusy(id);
    try {
      const { error } = await sb.from("automation_rules").update({ enabled: !current }).eq("id", id);
      if (error) throw error;
      setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !current } : r));
    } catch (e) {
      window.toast && window.toast(`Toggle failed: ${e?.message || e}`, "error");
    } finally { setBusy(null); }
  };
  const remove = async (id) => {
    if (!confirm("Remove this automation?")) return;
    setBusy(id);
    try {
      const { error } = await sb.from("automation_rules").delete().eq("id", id);
      if (error) throw error;
      setRules(prev => prev.filter(r => r.id !== id));
    } catch (e) {
      window.toast && window.toast(`Remove failed: ${e?.message || e}`, "error");
    } finally { setBusy(null); }
  };

  return (
    <div className="panel">
      <div className="panel-h">
        <Icons.Workflow size={13}/>
        <h3>Automations</h3>
        <span className="meta">{rules.length} rules · fired by webhook triggers</span>
        <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={() => setAdding(true)}>
          <Icons.Plus size={11}/> Add rule
        </button>
      </div>
      {loading ? (
        <div style={{ padding: 22, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>Loading rules…</div>
      ) : rules.length === 0 ? (
        <div style={{ padding: 22, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
          No automation rules yet. Add one to e.g. "After a call ends, draft a follow-up SMS for the lead."
        </div>
      ) : (
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1.4fr 1.4fr 1.6fr 90px 100px 90px" }}>
            <div>Trigger</div><div>Command</div><div>Description</div><div>Delay</div><div>Status</div><div></div>
          </div>
          {rules.map(r => {
            const trig = TRIGGERS.find(t => t.k === r.trigger) || { l: r.trigger };
            const cmd  = COMMAND_KINDS.find(c => c.k === r.command_kind) || { l: r.command_kind };
            return (
              <div key={r.id} className="row" style={{ gridTemplateColumns: "1.4fr 1.4fr 1.6fr 90px 100px 90px" }}>
                <div style={{ fontSize: 12 }}>{trig.l}</div>
                <div style={{ fontSize: 12 }}>{cmd.l}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{r.description || "—"}</div>
                <div style={{ fontSize: 11.5 }}>{r.delay_seconds ? `${r.delay_seconds}s` : "—"}</div>
                <div>
                  <span className={`chip ${r.enabled ? "chip-money" : ""}`} style={{ cursor: "pointer" }} onClick={() => toggle(r.id, r.enabled)}>
                    {busy === r.id ? "…" : r.enabled ? "on" : "off"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button className="btn btn-ghost" onClick={() => remove(r.id)}>Remove</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {adding && (
        <AutomationRuleModal agencyId={agencyId} onClose={() => { setAdding(false); reload(); }} />
      )}
    </div>
  );
}

function AutomationRuleModal({ agencyId, onClose }) {
  const [trigger, setTrigger] = React.useState("call_completed");
  const [cmd, setCmd]         = React.useState("draft_sms");
  const [desc, setDesc]       = React.useState("");
  const [delay, setDelay]     = React.useState(0);
  const [intent, setIntent]   = React.useState("follow_up");
  const [busy, setBusy]       = React.useState(false);
  const M = window.Shared && window.Shared.Modal;
  if (!M) return null;

  const save = async () => {
    setBusy(true);
    try {
      const sb = window.getSupabase();
      const payload = {};
      if (cmd === "draft_sms" || cmd === "draft_email") payload.intent = intent;
      const { error } = await sb.from("automation_rules").insert({
        agency_id: agencyId, scope: "agency", trigger, command_kind: cmd,
        command_payload: payload, delay_seconds: parseInt(delay, 10) || 0,
        description: desc || null, enabled: true,
      });
      if (error) throw error;
      window.toast && window.toast("Automation added", "success");
      onClose();
    } catch (e) {
      window.toast && window.toast(`Save failed: ${e?.message || e}`, "error");
      setBusy(false);
    }
  };

  return (
    <M title="New automation" width={520} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Shared.Field label="When this happens">
          <Shared.Select value={trigger} onChange={setTrigger} options={TRIGGERS.map(t => ({ v: t.k, l: t.l }))}/>
        </Shared.Field>
        <Shared.Field label="…the agent should">
          <Shared.Select value={cmd} onChange={setCmd} options={COMMAND_KINDS.map(c => ({ v: c.k, l: c.l }))}/>
        </Shared.Field>
        {(cmd === "draft_sms" || cmd === "draft_email") && (
          <Shared.Field label="Draft intent">
            <Shared.Select value={intent} onChange={setIntent} options={[
              { v: "follow_up",  l: "Follow up" },
              { v: "pre_call",   l: "Pre-call" },
              { v: "pre_appt",   l: "Pre-appointment" },
              { v: "reschedule", l: "Reschedule" },
              { v: "cold_open",  l: "Cold open" },
            ]}/>
          </Shared.Field>
        )}
        <Shared.Field label="Delay (seconds before agent acts)">
          <input className="text-input" type="number" min={0} max={86400} value={delay} onChange={e => setDelay(e.target.value)}/>
        </Shared.Field>
        <Shared.Field label="Description (for your records)">
          <input className="text-input" value={desc} onChange={e => setDesc(e.target.value)} placeholder="e.g. After every call >60s, draft a follow-up SMS"/>
        </Shared.Field>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save automation"}</button>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
        </div>
      </div>
    </M>
  );
}

// ─── agent_settings — per-rep agent preferences (record toggle, etc.)

const _DIAL_PROVIDER_OPTS = [
  {
    key: "twilio",
    label: "Twilio",
    sub: "Bridge dial via cloud — works on any machine",
    mac: false, win: false,
  },
  {
    key: "phone_link",
    label: "Phone Link",
    sub: "Windows → paired iPhone over Bluetooth (Twilio still routes)",
    mac: false, win: true,
  },
  {
    key: "bluetooth_phone",
    label: "macOS Bluetooth",
    sub: "Mac + iPhone Continuity → iPhone places call, Mac is audio (Twilio routes)",
    mac: true, win: false,
  },
  {
    key: "sendblue",
    label: "SendBlue",
    sub: "iMessage / blue-bubble messaging — SMS only, not voice · experimental",
    mac: false, win: false, warn: true,
  },
];

function DialProviderSelector({ value, onChange }) {
  const ua = navigator.userAgent.toLowerCase();
  const isMac = ua.includes("mac");
  const isWin = ua.includes("win");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {_DIAL_PROVIDER_OPTS.map(opt => {
        const active = value === opt.key;
        const recommended = (opt.mac && isMac) || (opt.win && isWin);
        return (
          <div
            key={opt.key}
            onClick={() => onChange(opt.key)}
            style={{
              padding: "10px 12px",
              borderRadius: 7,
              border: active
                ? "1.5px solid color-mix(in oklch, var(--accent-money) 55%, transparent)"
                : "1px solid var(--border-subtle)",
              background: active
                ? "color-mix(in oklch, var(--accent-money) 8%, transparent)"
                : "var(--bg-raised)",
              cursor: "pointer",
              opacity: opt.warn ? 0.6 : 1,
              display: "flex", alignItems: "flex-start", gap: 10,
            }}
          >
            <span style={{
              width: 14, height: 14, borderRadius: 999, flexShrink: 0, marginTop: 2,
              border: active ? "4px solid var(--accent-money)" : "1.5px solid var(--border-subtle)",
              background: active ? "var(--accent-money)" : "transparent",
              transition: "background 0.15s, border 0.15s",
            }}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 550 }}>
                {opt.label}
                {recommended && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: "var(--accent-money)", background: "color-mix(in oklch, var(--accent-money) 12%, transparent)", padding: "1px 6px", borderRadius: 99 }}>
                    recommended for you
                  </span>
                )}
                {opt.warn && (
                  <span style={{ fontSize: 10, color: "var(--state-warning)", background: "color-mix(in oklch, var(--state-warning) 12%, transparent)", padding: "1px 6px", borderRadius: 99 }}>
                    experimental
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 3, lineHeight: 1.45 }}>{opt.sub}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AgentSettingsEditor() {
  const [s, setS] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      const sb = window.getSupabase && window.getSupabase();
      if (!sb) { setLoading(false); return; }
      try {
        const session = (await sb.auth.getSession())?.data?.session;
        if (!session) { setLoading(false); return; }
        const aid = (await sb.rpc("current_agency_id"))?.data || null;
        const { data } = await sb.from("agent_settings").select("*").eq("user_id", session.user.id).maybeSingle();
        const settings = data || {
          user_id: session.user.id, agency_id: aid,
          always_record_on_pickup: true, state_match_outbound: true,
          default_dial_provider: "twilio", confirm_channel_default: "any",
          high_risk_channel: "sms",
        };
        setS(settings);
        window.__agentSettings = settings;
        window.dispatchEvent(new CustomEvent("agent_settings:loaded"));
      } finally { setLoading(false); }
    })();
  }, []);

  const save = async (patch) => {
    setBusy(true);
    try {
      const sb = window.getSupabase();
      const next = { ...s, ...patch };
      setS(next);
      window.__agentSettings = next;
      window.dispatchEvent(new CustomEvent("agent_settings:loaded"));
      const { error } = await sb.from("agent_settings").upsert(next, { onConflict: "user_id" });
      if (error) throw error;
    } catch (e) {
      window.toast && window.toast(`Save failed: ${e?.message || e}`, "error");
    } finally { setBusy(false); }
  };

  if (loading || !s) {
    return <div className="panel" style={{ padding: 22, color: "var(--text-tertiary)" }}>Loading agent settings…</div>;
  }

  return (
    <div className="panel">
      <div className="panel-h">
        <Icons.Cpu size={13}/>
        <h3>Agent preferences</h3>
        <span className="meta">applies to your devices</span>
        {busy && <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-tertiary)" }}>Saving…</span>}
      </div>
      <div style={{ padding: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Shared.Field label="Always record calls on pickup">
          <Shared.Select value={s.always_record_on_pickup ? "y" : "n"} onChange={(v) => save({ always_record_on_pickup: v === "y" })}
            options={[{ v: "y", l: "Yes (default)" }, { v: "n", l: "No — disclose first" }]}/>
        </Shared.Field>
        <Shared.Field label="State-matched outbound number">
          <Shared.Select value={s.state_match_outbound ? "y" : "n"} onChange={(v) => save({ state_match_outbound: v === "y" })}
            options={[{ v: "y", l: "Match lead's area code" }, { v: "n", l: "Use first number" }]}/>
        </Shared.Field>
        <Shared.Field label="Dial provider">
          <DialProviderSelector value={s.default_dial_provider} onChange={(v) => save({ default_dial_provider: v })}/>
        </Shared.Field>
        <Shared.Field label="Default confirm channel">
          <Shared.Select value={s.confirm_channel_default} onChange={(v) => save({ confirm_channel_default: v })}
            options={[{ v: "any", l: "Any (best effort)" }, { v: "web_modal", l: "Web modal" }, { v: "os_push", l: "OS push" }, { v: "sms", l: "SMS" }]}/>
        </Shared.Field>
        <Shared.Field label="High-risk action channel (real SMS, charge, delete)">
          <Shared.Select value={s.high_risk_channel} onChange={(v) => save({ high_risk_channel: v })}
            options={[{ v: "sms", l: "SMS to your phone" }, { v: "os_push", l: "OS push" }, { v: "web_modal", l: "Web modal only" }, { v: "any", l: "Any" }]}/>
        </Shared.Field>
        <Shared.Field label="SMS confirmation number (your personal phone)">
          <input className="text-input" type="tel" defaultValue={(s.config || {}).confirm_sms_number || ""}
            onBlur={(e) => save({ config: { ...(s.config || {}), confirm_sms_number: e.target.value.trim() || null } })}
            placeholder="+15551234567"/>
        </Shared.Field>
        <Shared.Field label="Bluetooth phone (optional — for paired-phone routing)">
          <input className="text-input" defaultValue={s.bluetooth_phone_id || ""}
            onBlur={(e) => save({ bluetooth_phone_id: e.target.value.trim() || null })}
            placeholder="iPhone 15 Pro"/>
        </Shared.Field>
      </div>
    </div>
  );
}

// ─── Per-user connector vault (Twilio, SendBlue, Fathom, …) ───────────────
//
// Drives connector_vault writes via /api/agent/connector-upsert. Tokens live
// per-user (not per-agency) so reps own their personal Twilio number, their
// SendBlue, etc. Health column shows the latest probe result.
//
// Provider-specific forms below (TwilioVaultForm, SendBlueVaultForm,
// FathomVaultForm) handle the field-level UX. Adding a new provider = add
// a row to PROVIDER_FORMS plus the form component.

const PROVIDERS = [
  { key: "twilio",   label: "Twilio",        category: "voice + SMS",  hint: "Outbound dial + SMS via Programmable Voice/Messaging." },
  { key: "sendblue", label: "SendBlue",      category: "iMessage",     hint: "Blue-bubble SMS for higher reply rates." },
  { key: "fathom",   label: "Fathom",        category: "meeting notes",hint: "Pull post-call notes for booked appointments." },
  { key: "gmail",    label: "Gmail",         category: "email",        hint: "Send + read on behalf of the rep." },
  { key: "outlook",  label: "Outlook",       category: "email",        hint: "M365 / Outlook send + read." },
  { key: "linkedin", label: "LinkedIn",      category: "social",       hint: "Cookie-based — paste session cookie below." },
  { key: "fb_ads",   label: "Facebook Ads",  category: "lead gen",     hint: "Pull lead-form submissions automatically." },
  { key: "ig_business", label: "Instagram",  category: "DMs",          hint: "Auto-reply on IG DMs via Meta Graph API." },
  { key: "meta_dm",  label: "Meta DM Send",  category: "DMs",          hint: "FB Page + IG Business outbound DM." },
  { key: "calendly", label: "Calendly",      category: "booking",      hint: "Watch new bookings → fire pre-appt reminders." },
  { key: "stripe",   label: "Stripe",        category: "billing",      hint: "Subscription + payment ops (owner+ only)." },
  { key: "apollo",   label: "Apollo",        category: "prospecting",  hint: "Lead enrichment + cadence import." },
];

function UserConnectorVault() {
  const [connectors, setConnectors] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(null);     // provider key being configured
  const [busy, setBusy] = React.useState(null);

  const reload = React.useCallback(async () => {
    setLoading(true);
    try {
      const sb = window.getSupabase && window.getSupabase();
      const session = sb && (await sb.auth.getSession())?.data?.session;
      const jwt = session?.access_token;
      if (!jwt) { setLoading(false); return; }
      const r = await fetch("/api/agent/connector-list", { headers: { authorization: `Bearer ${jwt}` } });
      const data = await r.json();
      setConnectors(Array.isArray(data?.connectors) ? data.connectors : []);
    } finally { setLoading(false); }
  }, []);
  React.useEffect(() => { reload(); }, [reload]);

  const byProvider = React.useMemo(() => {
    const m = {};
    connectors.forEach(c => { (m[c.provider] ||= []).push(c); });
    return m;
  }, [connectors]);

  const removeConnector = async (id, label) => {
    if (!confirm(`Remove ${label} connector?`)) return;
    setBusy(id);
    try {
      const sb = window.getSupabase();
      const { error } = await sb.from("connector_vault").delete().eq("id", id);
      if (error) throw error;
      window.toast && window.toast(`${label} removed`, "success");
      await reload();
    } catch (e) {
      window.toast && window.toast(`Remove failed: ${e?.message || e}`, "error");
    } finally { setBusy(null); }
  };

  const probeNow = async (id, provider) => {
    setBusy(`probe-${id}`);
    try {
      const sb = window.getSupabase();
      const session = (await sb.auth.getSession())?.data?.session;
      const jwt = session?.access_token;
      const r = await fetch("/api/connector/probe", {
        method: "POST",
        headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
        body: JSON.stringify({ vault_id: id, provider, kind: "manual" }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      window.toast && window.toast(`Probe: ${d?.status || "ok"}`, d?.status === "red" ? "warn" : "success");
      await reload();
    } catch (e) {
      window.toast && window.toast(`Probe failed: ${e?.message || e}`, "error");
    } finally { setBusy(null); }
  };

  const healthChip = (h) => {
    if (!h) return <span className="chip">—</span>;
    const cls = h.status === "green" ? "chip-money" : h.status === "yellow" ? "chip-status" : "chip-danger";
    return <span className={`chip ${cls}`} title={h.detail || ""}>{h.status}</span>;
  };

  return (
    <div className="panel">
      <div className="panel-h">
        <Icons.Workflow size={13}/>
        <h3>Connectors (used by this user's agent)</h3>
        <span className="meta">{connectors.length} connected · tokens encrypted at rest</span>
        <button className="btn btn-ghost" style={{ marginLeft: "auto", padding: "2px 8px", fontSize: 11 }} onClick={reload}>
          <Icons.RefreshCw size={11}/> Reload
        </button>
      </div>
      {loading ? (
        <div style={{ padding: 22, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>Loading connectors…</div>
      ) : (
        // list-responsive: at >900px, render as grid with shrinkable
        // minmax(0, fr) tracks so a long account_label can't push the
        // fixed-pixel sibling tracks past the panel edge. At ≤900px, the
        // .list-h hides and each .row becomes a flex-wrap card (see styles.css).
        <div className="list list-responsive">
          <div className="list-h" style={{ gridTemplateColumns: "minmax(120px, 1.2fr) minmax(140px, 1.5fr) 80px 110px 100px 130px" }}>
            <div>Provider</div><div>Account</div><div>Health</div><div>Last used</div><div>Connected</div><div></div>
          </div>
          {PROVIDERS.map(p => {
            const rows = byProvider[p.key] || [];
            if (rows.length === 0) {
              return (
                <div key={p.key} className="row" style={{ gridTemplateColumns: "minmax(120px, 1.2fr) minmax(140px, 1.5fr) 80px 110px 100px 130px" }}>
                  <div style={{ overflow: "hidden" }}>
                    <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.label}</div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.category}</div>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.hint}>{p.hint}</div>
                  <div><span className="chip">none</span></div>
                  <div style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>—</div>
                  <div style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>—</div>
                  <div className="list-actions" style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button className="btn btn-primary" onClick={() => setOpen(p.key)}>
                      <Icons.Plus size={11}/> Connect
                    </button>
                  </div>
                </div>
              );
            }
            return rows.map(r => (
              <div key={r.id} className="row" style={{ gridTemplateColumns: "minmax(120px, 1.2fr) minmax(140px, 1.5fr) 80px 110px 100px 130px" }}>
                <div style={{ overflow: "hidden" }}>
                  <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.label}</div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.category}</div>
                </div>
                <div style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.account_label || "default"}>{r.account_label || "default"}</div>
                <div>{healthChip(r.health)}</div>
                <div style={{ fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.last_used_at ? new Date(r.last_used_at).toLocaleString() : "—"}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{new Date(r.connected_at).toLocaleDateString()}</div>
                <div className="list-actions" style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                  <button className="btn btn-ghost" disabled={busy === `probe-${r.id}`} onClick={() => probeNow(r.id, p.key)}>
                    {busy === `probe-${r.id}` ? "…" : "Probe"}
                  </button>
                  <button className="btn btn-ghost" disabled={busy === r.id} onClick={() => removeConnector(r.id, p.label)}>
                    {busy === r.id ? "…" : "Remove"}
                  </button>
                </div>
              </div>
            ));
          })}
        </div>
      )}
      {open && <ConnectorVaultModal provider={open} onClose={() => { setOpen(null); reload(); }} />}
    </div>
  );
}

function ConnectorVaultModal({ provider, onClose }) {
  // Per-provider form. Common path: collect creds → POST /api/agent/connector-upsert.
  const Form = {
    twilio:   TwilioVaultForm,
    sendblue: SendBlueVaultForm,
    fathom:   FathomVaultForm,
    linkedin: LinkedInVaultForm,
    gmail:    GenericTokenVaultForm,
    outlook:  GenericTokenVaultForm,
    fb_ads:   GenericTokenVaultForm,
    ig_business: GenericTokenVaultForm,
    meta_dm:  GenericTokenVaultForm,
    calendly: GenericTokenVaultForm,
    stripe:   GenericTokenVaultForm,
    apollo:   GenericTokenVaultForm,
  }[provider] || GenericTokenVaultForm;
  const M = window.Shared && window.Shared.Modal;
  if (!M) return null;
  return (
    <M title={`Connect ${provider}`} width={520} onClose={onClose}>
      <Form provider={provider} onClose={onClose} />
    </M>
  );
}

async function _upsertConnector(payload) {
  const sb = window.getSupabase();
  const session = (await sb.auth.getSession())?.data?.session;
  const jwt = session?.access_token;
  const r = await fetch("/api/agent/connector-upsert", {
    method: "POST",
    headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
  return d;
}

function TwilioVaultForm({ onClose }) {
  const [sid, setSid]       = React.useState("");
  const [tok, setTok]       = React.useState("");
  const [phones, setPhones] = React.useState("");
  const [label, setLabel]   = React.useState("");
  const [busy, setBusy]     = React.useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await _upsertConnector({
        provider: "twilio",
        account_label: label || null,
        access_token: tok,         // auth_token
        api_key: tok,              // mirror; some endpoints use api_key
        metadata: {
          account_sid: sid,
          phone_numbers: phones.split(",").map(s => s.trim()).filter(Boolean),
        },
      });
      window.toast && window.toast("Twilio connected", "success");
      onClose();
    } catch (e) {
      window.toast && window.toast(`Save failed: ${e?.message || e}`, "error");
    } finally { setBusy(false); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Shared.Field label="Account SID *">
        <input className="text-input" value={sid} onChange={e => setSid(e.target.value)} placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"/>
      </Shared.Field>
      <Shared.Field label="Auth Token *">
        <input className="text-input" type="password" value={tok} onChange={e => setTok(e.target.value)} placeholder="32-char auth token"/>
      </Shared.Field>
      <Shared.Field label="Phone numbers (comma-separated, +E.164) *">
        <input className="text-input" value={phones} onChange={e => setPhones(e.target.value)} placeholder="+15551234567, +15559876543"/>
      </Shared.Field>
      <Shared.Field label="Label (optional — for multiple Twilio accounts)">
        <input className="text-input" value={label} onChange={e => setLabel(e.target.value)} placeholder="main"/>
      </Shared.Field>
      <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
        Tokens are stored in connector_vault (column-encrypted at rest, see migration 0030). Find these at console.twilio.com → Account → API Keys.
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button className="btn btn-primary" disabled={!sid || !tok || !phones || busy} onClick={save}>{busy ? "Saving…" : "Connect"}</button>
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
}

function SendBlueVaultForm({ onClose }) {
  const [keyId, setKeyId]   = React.useState("");
  const [secret, setSecret] = React.useState("");
  const [sender, setSender] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await _upsertConnector({
        provider: "sendblue",
        api_key: secret,
        metadata: { api_key_id: keyId, sender_phone: sender },
      });
      window.toast && window.toast("SendBlue connected", "success");
      onClose();
    } catch (e) {
      window.toast && window.toast(`Save failed: ${e?.message || e}`, "error");
    } finally { setBusy(false); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Shared.Field label="API Key ID *">
        <input className="text-input" value={keyId} onChange={e => setKeyId(e.target.value)} placeholder="sb-key-xxxxx"/>
      </Shared.Field>
      <Shared.Field label="API Secret *">
        <input className="text-input" type="password" value={secret} onChange={e => setSecret(e.target.value)}/>
      </Shared.Field>
      <Shared.Field label="Sender phone (your registered iMessage number) *">
        <input className="text-input" value={sender} onChange={e => setSender(e.target.value)} placeholder="+15551234567"/>
      </Shared.Field>
      <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
        Get keys from sendblue.co → Settings → API. The sender number must be activated on your SendBlue account.
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button className="btn btn-primary" disabled={!keyId || !secret || !sender || busy} onClick={save}>{busy ? "Saving…" : "Connect"}</button>
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
}

function FathomVaultForm({ onClose }) {
  const [key, setKey]       = React.useState("");
  const [busy, setBusy]     = React.useState(false);
  const apiBase = (typeof window !== "undefined" && window.location ? `${window.location.protocol}//${window.location.host}` : "");

  const save = async () => {
    setBusy(true);
    try {
      await _upsertConnector({ provider: "fathom", api_key: key });
      window.toast && window.toast("Fathom connected", "success");
      onClose();
    } catch (e) {
      window.toast && window.toast(`Save failed: ${e?.message || e}`, "error");
    } finally { setBusy(false); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Shared.Field label="Fathom API key *">
        <input className="text-input" type="password" value={key} onChange={e => setKey(e.target.value)} placeholder="from fathom.video → Settings → Integrations → API"/>
      </Shared.Field>
      <Shared.Field label="Webhook URL (paste this into Fathom)">
        <input className="text-input mono" readOnly value={`${apiBase}/api/connector/fathom-webhook`} onClick={(e) => e.target.select()} style={{ fontSize: 11 }}/>
      </Shared.Field>
      <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
        After saving, paste the webhook URL into Fathom → Settings → Webhooks for "meeting.completed". Notes will auto-attach to the matching lead.
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button className="btn btn-primary" disabled={!key || busy} onClick={save}>{busy ? "Saving…" : "Connect"}</button>
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
}

function LinkedInVaultForm({ onClose }) {
  const [cookie, setCookie] = React.useState("");
  const [csrf, setCsrf]     = React.useState("");
  const [busy, setBusy]     = React.useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await _upsertConnector({
        provider: "linkedin",
        access_token: cookie,
        metadata: { csrf_token: csrf },
      });
      window.toast && window.toast("LinkedIn cookie saved (high-risk per LI ToS)", "success");
      onClose();
    } catch (e) {
      window.toast && window.toast(`Save failed: ${e?.message || e}`, "error");
    } finally { setBusy(false); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ padding: 10, background: "var(--bg-raised)", borderRadius: 6, fontSize: 11.5, color: "var(--state-warn, var(--text-secondary))" }}>
        ⚠ LinkedIn doesn't sanction cookie-based automation. Use sparingly to avoid restrictions on your account.
      </div>
      <Shared.Field label="li_at cookie *">
        <input className="text-input mono" type="password" value={cookie} onChange={e => setCookie(e.target.value)} style={{ fontSize: 11 }}/>
      </Shared.Field>
      <Shared.Field label="JSESSIONID (CSRF token)">
        <input className="text-input mono" type="password" value={csrf} onChange={e => setCsrf(e.target.value)} style={{ fontSize: 11 }}/>
      </Shared.Field>
      <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
        DevTools → Application → Cookies → linkedin.com → li_at + JSESSIONID. Refresh weekly when LI rotates them.
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button className="btn btn-primary" disabled={!cookie || busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
}

function GenericTokenVaultForm({ provider, onClose }) {
  const [key, setKey]   = React.useState("");
  const [meta, setMeta] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const save = async () => {
    setBusy(true);
    try {
      let metaObj = {};
      if (meta.trim()) {
        try { metaObj = JSON.parse(meta); } catch { metaObj = { note: meta }; }
      }
      await _upsertConnector({ provider, api_key: key, metadata: metaObj });
      window.toast && window.toast(`${provider} connected`, "success");
      onClose();
    } catch (e) {
      window.toast && window.toast(`Save failed: ${e?.message || e}`, "error");
    } finally { setBusy(false); }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Shared.Field label="API token / key *">
        <input className="text-input" type="password" value={key} onChange={e => setKey(e.target.value)}/>
      </Shared.Field>
      <Shared.Field label="Metadata (JSON, optional)">
        <textarea className="text-input mono" rows={3} value={meta} onChange={e => setMeta(e.target.value)} placeholder='{"account_id":"..."}'/>
      </Shared.Field>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button className="btn btn-primary" disabled={!key || busy} onClick={save}>{busy ? "Saving…" : "Connect"}</button>
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
}

function SettingsApi() {
  const [revealed, setRevealed] = React.useState(false);
  // Generate a deterministic-looking but session-local key. Real key issuance
  // would call /api/keys/* — we surface a clear message when that endpoint
  // doesn't exist rather than silently failing.
  const [key, setKey] = React.useState(() => {
    try {
      const stash = sessionStorage.getItem("repflow.api_key");
      if (stash) return stash;
    } catch {}
    return "rfk_live_eyJhbGciOiJIUzI1NiJ9...QzfBn4xT2";
  });
  const newKey = () => {
    const fresh = "rfk_live_" + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);
    setKey(fresh);
    setRevealed(true);
    try { sessionStorage.setItem("repflow.api_key", fresh); } catch {}
    window.toast && window.toast("New API key generated · save it now, you won't see it again", "success");
  };
  const rotate = () => {
    if (!confirm("Rotate the API key? Existing integrations will stop working until updated with the new value.")) return;
    newKey();
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="panel" style={{ padding: 16 }}>
        <h3 style={{ margin: 0, marginBottom: 8 }}>API keys</h3>
        <div style={{ color: "var(--text-tertiary)", fontSize: 12.5, marginBottom: 12 }}>Use this key to push leads or pull pipeline state via REST. Never commit keys to source control.</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", padding: 10, background: "var(--bg-raised)", borderRadius: 6, fontSize: 12.5 }}>
          <span className="mono" style={{ flex: 1, color: "var(--text-secondary)" }}>{revealed ? key : key.slice(0, 12) + "•••••••••••••••••••"}</span>
          <button className="btn btn-ghost" onClick={() => setRevealed(r => !r)}>{revealed ? "Hide" : "Reveal"}</button>
          <button className="btn btn-ghost" onClick={() => navigator.clipboard.writeText(key).then(() => window.toast && window.toast("API key copied to clipboard", "success"))}><Icons.Copy size={12}/> Copy</button>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button className="btn btn-primary" onClick={newKey}><Icons.Plus size={12}/> Create new key</button>
          <button className="btn" onClick={rotate}>Rotate</button>
        </div>
      </div>
      <div className="panel" style={{ padding: 16 }}>
        <h3 style={{ margin: 0, marginBottom: 8 }}>Webhooks</h3>
        <div className="list" style={{ marginTop: 8 }}>
          {[
            { url: "https://atlas.zapier.com/leads",      events: "lead.new · lead.assigned",        last: "2m ago" },
            { url: "https://atlas.n8n.io/issued",         events: "deal.issued",                       last: "14m ago" },
            { url: "https://atlas.app.n8n.cloud/nigo",    events: "deal.nigo",                          last: "yesterday" },
          ].map((w, i) => (
            <div key={i} className="row" style={{ gridTemplateColumns: "1.4fr 1fr 100px 100px" }}>
              <div className="cell-truncate mono" style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>{w.url}</div>
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{w.events}</div>
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{w.last}</div>
              <button className="btn btn-ghost">Edit</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Settings → Routing rules
 *
 * Was: pure local React state — setRules() updated the array in memory, the
 * "Rule added" toast fired, the user closed the modal, then on the next
 * refresh every rule was gone. Zero persistence. Same demo seed every time.
 *
 * Now: load existing rules from public.routing_rules on mount, persist every
 * add/edit/delete/weight-drag through AppData.mutate.routingRuleSave /
 * routingRuleDelete (the same path the page-manager RoutingRulesModal uses,
 * so both surfaces edit the same row set). */
function SettingsRouting() {
  const isDemo = !!(window.isDemoAgency && window.isDemoAgency());
  const [rules, setRules]     = React.useState([]);
  const [loaded, setLoaded]   = React.useState(false);
  const [editing, setEditing] = React.useState(null); // null = closed, {} = new, {id...} = edit existing
  const [busy, setBusy]       = React.useState(false);

  // Load existing rules. In demo mode keep the in-memory seed so the sandbox
  // tour still has something to look at.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = window.getSupabase && window.getSupabase();
      if (sb && window.AppData?.LIVE) {
        try {
          const { data } = await sb.from("routing_rules").select("*").order("created_at", { ascending: false });
          if (!cancelled && Array.isArray(data)) {
            setRules(data.map(r => ({
              id: r.id,
              src: r.source,
              route: r.route_to,
              weight: r.weight ?? 50,
              active: r.active !== false,
            })));
          }
        } catch (e) { console.warn("[routing.rulesLoad]", e); }
      } else if (isDemo) {
        setRules([
          { id: "demo-1", src: "FB Lead Form · T65", route: "Med Supp specialists", weight: 60, active: true },
          { id: "demo-2", src: "Inbound < 30s",      route: "Tier ≥ Gold",          weight: 90, active: true },
          { id: "demo-3", src: "Annuity",             route: "Certified producer",    weight: 100, active: true },
          { id: "demo-4", src: "Spanish",             route: "Bilingual round-robin", weight: 50, active: true },
        ]);
      }
      if (!cancelled) setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [isDemo]);

  const addRule = () => setEditing({ id: null, src: "", route: "", weight: 50, active: true });
  const editRule = (r) => setEditing({ ...r });

  const deleteRule = async (id) => {
    setRules(rs => rs.filter(x => x.id !== id));
    try {
      if (!String(id).startsWith("demo-")) {
        await window.AppData.mutate.routingRuleDelete(id);
      }
      window.toast && window.toast("Rule removed", "success");
    } catch (e) { window.toast && window.toast(`Delete failed: ${e?.message || e}`, "error"); }
  };

  const saveRule = async () => {
    if (!editing.src.trim() || !editing.route.trim()) {
      window.toast && window.toast("Source and route are required", "error");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        id: editing.id || undefined,
        source: editing.src.trim(),
        route_to: editing.route.trim(),
        weight: editing.weight,
        active: editing.active !== false,
      };
      await window.AppData.mutate.routingRuleSave(payload);
      // Optimistic local update. Real id comes from realtime/refresh.
      const localRow = {
        id: editing.id || ("tmp-" + Date.now()),
        src: payload.source,
        route: payload.route_to,
        weight: payload.weight,
        active: payload.active,
      };
      setRules(rs => editing.id
        ? rs.map(x => x.id === editing.id ? localRow : x)
        : [localRow, ...rs]);
      window.toast && window.toast(editing.id ? "Rule updated" : "Rule added", "success");
      setEditing(null);
    } catch (e) {
      window.toast && window.toast(`Save failed: ${e?.message || e}`, "error");
    } finally { setBusy(false); }
  };

  // Weight drag: persist on commit (mouseup / blur), not every tick.
  const commitWeight = async (rule, weight) => {
    if (String(rule.id).startsWith("demo-")) return;
    try {
      await window.AppData.mutate.routingRuleSave({
        id: rule.id, source: rule.src, route_to: rule.route, weight, active: rule.active !== false,
      });
    } catch (e) { window.toast && window.toast(`Save failed: ${e?.message || e}`, "error"); }
  };

  return (
    <div className="panel" style={{ padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Routing rules</h3>
        <button className="btn btn-primary" onClick={addRule}><Icons.Plus size={11}/> New rule</button>
      </div>
      <div className="list">
        <div className="list-h" style={{ gridTemplateColumns: "1.4fr 1.4fr 1fr 90px" }}>
          <div>Source / trigger</div><div>Route to</div><div>Priority</div><div></div>
        </div>
        {rules.map(r => (
          <div key={r.id} className="row" style={{ gridTemplateColumns: "1.4fr 1.4fr 1fr 90px", height: 36 }}>
            <div style={{ fontWeight: 500, fontSize: 12 }}>{r.src}</div>
            <div style={{ color: "var(--text-secondary)", fontSize: 12 }}>{r.route}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="range" min={0} max={100} value={r.weight}
                onChange={(e) => setRules(rs => rs.map(x => x.id === r.id ? { ...x, weight: +e.target.value } : x))}
                onMouseUp={(e) => commitWeight(r, +e.target.value)}
                onTouchEnd={(e) => commitWeight(r, +e.target.value)}
                style={{ flex: 1, accentColor: "var(--accent-money)" }}
              />
              <span className="tabular" style={{ width: 26, fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{r.weight}</span>
            </div>
            <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
              <button className="btn btn-ghost" style={{ fontSize: 10.5, padding: "3px 6px" }} onClick={() => editRule(r)}>Edit</button>
              <button className="btn btn-ghost" style={{ color: "var(--state-danger)" }} onClick={() => deleteRule(r.id)} title="Delete rule"><Icons.X size={11}/></button>
            </div>
          </div>
        ))}
        {loaded && rules.length === 0 && (
          <div style={{ padding: 22, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12, lineHeight: 1.55 }}>
            No routing rules yet. Add one to control which producer gets which lead source. <br/>
            <span style={{ fontSize: 11 }}>Manager view: edit rules here or in <em>Team Board → Routing rules</em>; both edit the same set.</span>
          </div>
        )}
      </div>
      {editing && (
        <Shared.Modal title={editing.id == null ? "New routing rule" : "Edit routing rule"} width={460} onClose={() => setEditing(null)} actions={
          <>
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveRule} disabled={busy}><Icons.Check size={11}/> {busy ? "Saving…" : "Save"}</button>
          </>
        }>
          <Shared.Field label="Source / trigger">
            <input className="text-input" value={editing.src} onChange={(e) => setEditing({ ...editing, src: e.target.value })} placeholder="e.g. FB Lead Form · T65" autoFocus/>
          </Shared.Field>
          <Shared.Field label="Route to">
            <input className="text-input" value={editing.route} onChange={(e) => setEditing({ ...editing, route: e.target.value })} placeholder="e.g. Med Supp specialists"/>
          </Shared.Field>
          <Shared.Field label={`Priority weight · ${editing.weight}`}>
            <input type="range" min={0} max={100} value={editing.weight} onChange={(e) => setEditing({ ...editing, weight: +e.target.value })} style={{ width: "100%", accentColor: "var(--accent-money)" }}/>
          </Shared.Field>
        </Shared.Modal>
      )}
    </div>
  );
}

/* Settings → Notifications
 * Loads existing prefs from public.notification_prefs (keyed on auth user id),
 * persists toggles back through AppData.mutate.notificationPrefsSave. Was
 * previously saving under the literal string "me" which RLS rejected, so
 * no toggle ever persisted across sessions.
 *
 * Overlaps intentionally with SettingsProfile.notification_prefs — that one
 * targets the JSON column on public.profiles; this one targets the legacy
 * notification_prefs row. Both will converge once the profile JSON becomes
 * the canonical source; until then this panel saves to both so a manager who
 * doesn't open Profile still gets their toggles persisted. */
function SettingsNotifications() {
  const DEFAULTS = {
    leadNew: true, leadStuck: true, dealIssued: true, nigo: true,
    coachingNew: false, recruitingNew: true, dailyDigest: true,
  };
  const [prefs, setPrefs]   = React.useState(DEFAULTS);
  const [userId, setUserId] = React.useState(null);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = window.getSupabase && window.getSupabase();
      if (!sb) { setLoaded(true); return; }
      try {
        const s = await sb.auth.getSession();
        const uid = s?.data?.session?.user?.id;
        if (!uid) { setLoaded(true); return; }
        if (!cancelled) setUserId(uid);
        const { data } = await sb.from("notification_prefs")
          .select("prefs")
          .eq("user_id", uid)
          .maybeSingle();
        if (!cancelled && data && data.prefs && typeof data.prefs === "object") {
          setPrefs({ ...DEFAULTS, ...data.prefs });
        }
      } catch (e) { console.warn("[notifications.prefsLoad]", e); }
      finally { if (!cancelled) setLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, []);

  const update = (k, v) => {
    const next = { ...prefs, [k]: v };
    setPrefs(next);
    if (!userId) {
      window.toast && window.toast("Sign in to save notification preferences", "warn");
      return;
    }
    window.AppData.mutate.notificationPrefsSave(userId, next)
      .then(() => window.toast && window.toast("Notification prefs saved", "success"))
      .catch((e) => window.toast && window.toast(`Save failed: ${e?.message || e}`, "error"));
  };
  const t = (k, l, sub) => (
    <label style={{ display: "grid", gridTemplateColumns: "24px 1fr 90px", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border-subtle)", alignItems: "center", cursor: "pointer" }}>
      <input type="checkbox" checked={!!prefs[k]} disabled={!loaded} onChange={(e) => update(k, e.target.checked)} style={{ accentColor: "var(--accent-money)" }}/>
      <div>
        <div style={{ fontWeight: 500, fontSize: 12.5 }}>{l}</div>
        <div style={{ color: "var(--text-tertiary)", fontSize: 11, marginTop: 1 }}>{sub}</div>
      </div>
      <span style={{ textAlign: "right", color: prefs[k] ? "var(--accent-money)" : "var(--text-tertiary)", fontSize: 10.5, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{prefs[k] ? "On" : "Off"}</span>
    </label>
  );
  return (
    <div className="panel" style={{ padding: 14 }}>
      <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Notifications</h3>
      <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 3, marginBottom: 6, lineHeight: 1.5 }}>
        Saved to your account · used by the bell, the morning digest, and SMS / email fan-out when configured.
      </div>
      <div style={{ marginTop: 4 }}>
        {t("leadNew",       "New lead in my queue",         "Push within 30s of routing")}
        {t("leadStuck",     "Lead stuck > 3 days in stage", "Daily")}
        {t("dealIssued",    "Deal issued",                   "Push immediately")}
        {t("nigo",          "NIGO returned",                  "Push + email + escalate to mgr")}
        {t("coachingNew",   "New coaching card for me",      "Daily digest")}
        {t("recruitingNew", "New applicant in funnel",        "Daily")}
        {t("dailyDigest",   "Daily digest",                    "8am · weekdays")}
      </div>
    </div>
  );
}

/* Settings → Profile — bound to public.profiles via save_profile +
 * get_my_profile RPCs (2026-05-11 backend).
 *
 * Was: every input was uncontrolled (defaultValue=) with no onChange,
 * no save button, and hardcoded "marcus@atlasimo.com" / Atlas chips —
 * the "can't save my profile info" bug Ian reported.
 *
 * Now:
 *  - get_my_profile() on mount loads profile + memberships + agency_id
 *  - controlled inputs across every editable field
 *  - save_profile(p jsonb) on click — backend preserves keys not sent
 *  - v_user_metrics rendered as a tiny KPI strip for the signed-in user
 *  - NPN, licensed_states (multi-select), license_expirations
 *    (per-state date), E&O carrier + expiry, notification_prefs
 *    (email / sms / telegram / in_app + digest_frequency) all wired.
 */
const PROFILE_ALL_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"];
const PROFILE_TIMEZONES = [
  { v: "America/New_York",     l: "Eastern (ET)" },
  { v: "America/Chicago",      l: "Central (CT)" },
  { v: "America/Denver",       l: "Mountain (MT)" },
  { v: "America/Phoenix",      l: "Arizona (no DST)" },
  { v: "America/Los_Angeles",  l: "Pacific (PT)" },
  { v: "America/Anchorage",    l: "Alaska" },
  { v: "Pacific/Honolulu",     l: "Hawaii" },
];
const DIGEST_FREQ = [
  { v: "off",     l: "Off" },
  { v: "realtime",l: "Real-time" },
  { v: "daily",   l: "Daily digest" },
  { v: "weekly",  l: "Weekly digest" },
];

function SettingsProfile({ role }) {
  const sb = window.getSupabase && window.getSupabase();
  const [loading,  setLoading]  = React.useState(true);
  const [loadErr,  setLoadErr]  = React.useState(null);
  const [saving,   setSaving]   = React.useState(false);
  const [saveMsg,  setSaveMsg]  = React.useState("");
  const [bundle,   setBundle]   = React.useState(null); // { profile, memberships, current_agency_id, is_platform_admin }
  const [metrics,  setMetrics]  = React.useState(null);
  const [themeSaving, setThemeSaving] = React.useState(false);

  // Form state shadows the bundle.profile fields. We track ONLY user-touched
  // fields in `dirty` so save_profile sends a minimal patch and the backend
  // preserves untouched keys (the contract per the RPC spec).
  const [form,  setForm]  = React.useState({});
  const [dirty, setDirty] = React.useState({});
  // Avatar load-state hook MUST be declared up here, before any early
  // return. If hoisted below the `if (loading) return …` block, the first
  // render skips it and the second render adds it → React error #310
  // ("Rendered more hooks than during the previous render").
  const [avatarOk, setAvatarOk] = React.useState(true);
  const update = (k, v) => { setForm(f => ({ ...f, [k]: v })); setDirty(d => ({ ...d, [k]: true })); };
  const updateNotif = (k, v) => {
    setForm(f => ({ ...f, notification_prefs: { ...(f.notification_prefs || {}), [k]: v } }));
    setDirty(d => ({ ...d, notification_prefs: true }));
  };

  // Auto-save theme immediately on button click (no "Save profile" required).
  // Also syncs localStorage + DOM via applyTheme so the change is instant.
  const saveThemeNow = React.useCallback(async (mode) => {
    window.applyTheme && window.applyTheme(mode);
    setForm(f => ({ ...f, theme: mode }));
    // Remove theme from dirty so the main Save button doesn't double-save it.
    setDirty(d => { const n = { ...d }; delete n.theme; return n; });
    if (!sb) return;
    setThemeSaving(true);
    try {
      const r = await sb.rpc("save_profile", { p: { theme: mode } });
      if (r.error) throw r.error;
      window.toast && window.toast("Theme saved", "success");
    } catch (e) {
      window.toast && window.toast("Theme save failed: " + (e?.message || e), "error");
    } finally { setThemeSaving(false); }
  }, [sb]);

  const load = React.useCallback(async () => {
    if (!sb) { setLoading(false); return; }
    setLoading(true); setLoadErr(null);
    try {
      const r = await sb.rpc("get_my_profile");
      if (r.error) throw r.error;
      const b = (typeof r.data === "string") ? JSON.parse(r.data) : (r.data || {});
      setBundle(b);
      const p = b?.profile || {};
      // Apply the DB-stored theme preference immediately on profile load.
      // localStorage is already set by the anti-FOUC script on page load;
      // this call syncs from DB so the choice follows the user across devices.
      if (p.theme && typeof window.applyTheme === "function") {
        window.applyTheme(p.theme);
      }
      setForm({
        display_name:        p.display_name || "",
        full_name:           p.full_name || "",
        email:               p.email || "",
        phone:               p.phone || "",
        title:               p.title || "",
        bio:                 p.bio || "",
        pronouns:            p.pronouns || "",
        avatar_url:          p.avatar_url || "",
        linkedin_url:        p.linkedin_url || "",
        website_url:         p.website_url || "",
        timezone:            p.timezone || "America/New_York",
        theme:               p.theme || "dark",
        density:             p.density || "comfortable",
        default_landing:     p.default_landing || "",
        npn:                 p.npn || "",
        licensed_states:     Array.isArray(p.licensed_states) ? p.licensed_states : [],
        license_expirations: (p.license_expirations && typeof p.license_expirations === "object") ? p.license_expirations : {},
        eando_carrier:       p.eando_carrier || "",
        eando_expires_at:    p.eando_expires_at || "",
        background_check_status: p.background_check_status || "",
        notification_prefs:  (p.notification_prefs && typeof p.notification_prefs === "object") ? p.notification_prefs : {
          email: true, sms: false, telegram: false, in_app: true, digest_frequency: "daily",
        },
      });
      setDirty({});
      // Fetch metrics in the background — don't block the form on this.
      try {
        const mr = await sb.from("v_user_metrics").select("*").maybeSingle();
        if (mr.data) setMetrics(mr.data);
      } catch (e) { console.warn("[profile.metricsLoad]", e); }
    } catch (e) {
      setLoadErr(String(e?.message || e));
    } finally { setLoading(false); }
  }, [sb]);
  React.useEffect(() => { load(); }, [load]);
  // Reset avatar-load flag whenever the avatar URL changes (declared up here
  // for the same hooks-order reason as the useState above).
  React.useEffect(() => { setAvatarOk(true); }, [form.avatar_url]);

  const save = async () => {
    if (!sb) return;
    setSaving(true); setSaveMsg("");
    try {
      // Build minimal patch — only dirty keys + their current value.
      const patch = {};
      Object.keys(dirty).forEach(k => { patch[k] = form[k]; });
      if (Object.keys(patch).length === 0) {
        setSaveMsg("Nothing to save."); setSaving(false);
        setTimeout(() => setSaveMsg(""), 1500);
        return;
      }
      const r = await sb.rpc("save_profile", { p: patch });
      if (r.error) throw r.error;
      // Analytics: capture for PostHog onboarding-completion signal.
      try {
        window.posthog && window.posthog.capture && window.posthog.capture("profile_saved", {
          source:        "settings",
          fields:        Object.keys(patch),
          field_count:   Object.keys(patch).length,
          has_avatar:    !!patch.avatar_url,
          has_npn:       !!patch.npn,
          has_licensing: Array.isArray(patch.licensed_states) && patch.licensed_states.length > 0,
        });
      } catch (_e) { /* analytics never blocks */ }
      setSaveMsg("Saved.");
      window.toast && window.toast("Profile saved", "success");
      // Refresh me() so any header chip / sidebar greeting picks up the new
      // display_name without a full reload.
      if (window.refreshMe) await window.refreshMe();
      await load();
      setTimeout(() => setSaveMsg(""), 1500);
    } catch (e) {
      setSaveMsg("");
      window.toast && window.toast(`Save failed: ${e?.message || e}`, "error");
    } finally { setSaving(false); }
  };

  const toggleState = (s) => {
    const cur = Array.isArray(form.licensed_states) ? form.licensed_states : [];
    const next = cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s].sort();
    update("licensed_states", next);
  };
  const setStateExpiry = (s, iso) => {
    const cur = (form.license_expirations && typeof form.license_expirations === "object") ? form.license_expirations : {};
    const next = { ...cur };
    if (iso) next[s] = iso; else delete next[s];
    update("license_expirations", next);
  };

  if (loading) {
    return <div className="panel" style={{ padding: 24, color: "var(--text-tertiary)", fontSize: 12.5 }}>Loading profile…</div>;
  }
  if (loadErr) {
    return (
      <div className="panel" style={{ padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--state-danger)" }}>Couldn't load your profile</div>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "6px 0 10px" }}>{loadErr}</div>
        <button className="btn" onClick={load}>Try again</button>
        <button className="btn btn-ghost" style={{ marginLeft: 8 }} onClick={() => window.signOut && window.signOut()}>Sign out</button>
      </div>
    );
  }

  const memberships = bundle?.memberships || [];
  const isPlatformAdmin = !!bundle?.is_platform_admin;
  const np = form.notification_prefs || {};

  // P7: Licensing section is only relevant for producer-side roles
  // (owner / manager / rep / admin). A user whose ONLY memberships are
  // imo_owner has no producer license to manage from this surface — hide.
  // Falls open if memberships isn't populated yet so we don't accidentally
  // hide a section the user needs on a slow load.
  const licensingRoles = new Set(["owner", "manager", "rep", "admin"]);
  const showLicensing = memberships.length === 0
    || memberships.some(m => licensingRoles.has(m.role));

  // Live avatar — if avatar_url is present and loads, render the image;
  // on error fall through to Shared.Avatar's initials block.
  // (avatarOk state + effect declared at the top of the component to keep
  // hooks order stable across loading→loaded transitions.)
  const previewName = form.display_name || form.full_name || form.email || "—";
  const previewHandle = form.display_name ? "@" + form.display_name.split(/\s+/)[0].toLowerCase() : "";
  const avatarBlock = (form.avatar_url && avatarOk) ? (
    <img
      src={form.avatar_url}
      alt={previewName}
      onError={() => setAvatarOk(false)}
      style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover", background: "var(--bg-raised)", flexShrink: 0 }}
    />
  ) : (
    <Shared.Avatar rep={{ name: previewName, handle: previewHandle, color: "var(--text-tertiary)" }} size={48}/>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="panel" style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {avatarBlock}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 500 }}>{previewName === "—" ? "Set your name" : previewName}</div>
            <div style={{ color: "var(--text-tertiary)", fontSize: 12 }}>
              {form.title || role}
              {isPlatformAdmin && <span className="chip chip-status" style={{ marginLeft: 8, fontSize: 10 }}>platform admin</span>}
              {memberships.length > 0 && <span style={{ marginLeft: 8 }}>· {memberships.length} membership{memberships.length === 1 ? "" : "s"}</span>}
            </div>
          </div>
        </div>

        {/* Metrics strip (best-effort — hidden if v_user_metrics is missing). */}
        {metrics && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginTop: 14 }}>
            {[
              ["Commissions",       metrics.commissions_count       ?? 0],
              ["Calls recorded",    metrics.calls_recorded          ?? 0],
              ["Agency policies",   metrics.agency_policies_total   ?? 0],
              ["Agency open pipe",  metrics.agency_pipeline_open    ?? 0],
            ].map(([l, v]) => (
              <div key={l} style={{ padding: "8px 10px", background: "var(--bg-raised)", borderRadius: 6 }}>
                <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600 }}>{l}</div>
                <div className="tabular" style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}>{v}</div>
              </div>
            ))}
          </div>
        )}

        <div className="divider"></div>

        <h4 style={{ margin: "0 0 8px 0", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--text-tertiary)" }}>Identity</h4>
        <div className="profile-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Shared.Field label="Display name"><input className="text-input" value={form.display_name} onChange={(e) => update("display_name", e.target.value)} placeholder="What teammates call you"/></Shared.Field>
          <Shared.Field label="Legal full name"><input className="text-input" value={form.full_name} onChange={(e) => update("full_name", e.target.value)} placeholder="On your producer license"/></Shared.Field>
          <Shared.Field label="Email"><input className="text-input" value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="you@agency.com"/></Shared.Field>
          <Shared.Field label="Phone"><input className="text-input" value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="+1 (404) 555-0142"/></Shared.Field>
          <Shared.Field label="Title"><input className="text-input" value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="Senior producer"/></Shared.Field>
          <Shared.Field label="Pronouns"><input className="text-input" value={form.pronouns} onChange={(e) => update("pronouns", e.target.value)} placeholder="they/them"/></Shared.Field>
          <Shared.Field label="Avatar URL"><input className="text-input" value={form.avatar_url} onChange={(e) => update("avatar_url", e.target.value)} placeholder="https://…"/></Shared.Field>
          <Shared.Field label="Website"><input className="text-input" value={form.website_url} onChange={(e) => update("website_url", e.target.value)} placeholder="https://your.site"/></Shared.Field>
          <Shared.Field label="LinkedIn"><input className="text-input" value={form.linkedin_url} onChange={(e) => update("linkedin_url", e.target.value)} placeholder="https://linkedin.com/in/…"/></Shared.Field>
          <Shared.Field label="Time zone"><Shared.Select value={form.timezone} onChange={(v) => update("timezone", v)} options={PROFILE_TIMEZONES}/></Shared.Field>
        </div>
        <Shared.Field label="Bio"><textarea className="text-input" rows={3} value={form.bio} onChange={(e) => update("bio", e.target.value)} placeholder="Short bio — appears in your producer profile."/></Shared.Field>
      </div>

      {showLicensing && (
      <div className="panel" style={{ padding: 16 }}>
        <h4 style={{ margin: "0 0 8px 0", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--text-tertiary)" }}>Licensing</h4>
        <div className="profile-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Shared.Field label="NPN" hint="National Producer Number"><input className="text-input" value={form.npn} onChange={(e) => update("npn", e.target.value.replace(/\D/g, ""))} placeholder="19384726"/></Shared.Field>
          <Shared.Field label="E&O carrier"><input className="text-input" value={form.eando_carrier} onChange={(e) => update("eando_carrier", e.target.value)} placeholder="NAPA / E&amp;O Pro / Hiscox"/></Shared.Field>
          <Shared.Field label="E&O expiration"><input className="text-input" type="date" value={form.eando_expires_at || ""} onChange={(e) => update("eando_expires_at", e.target.value || null)}/></Shared.Field>
          <Shared.Field label="Background check" hint="Status from your IMO / E&O carrier">
            <Shared.Select value={form.background_check_status} onChange={(v) => update("background_check_status", v)} options={[
              { v: "",          l: "—" },
              { v: "pending",   l: "Pending" },
              { v: "submitted", l: "Submitted" },
              { v: "in_review", l: "In review" },
              { v: "cleared",   l: "Cleared" },
              { v: "flagged",   l: "Flagged" },
              { v: "expired",   l: "Expired" },
            ]}/>
          </Shared.Field>
        </div>
        <Shared.Field label={`Licensed states (${(form.licensed_states || []).length})`} hint="Click a state to toggle. Set its expiration on the right when active.">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: 8, background: "var(--bg-raised)", borderRadius: 6, maxHeight: 200, overflowY: "auto" }}>
            {PROFILE_ALL_STATES.map(s => {
              const on = (form.licensed_states || []).includes(s);
              return (
                <button key={s} onClick={() => toggleState(s)} className={`chip ${on ? "chip-money" : ""}`} style={{ cursor: "pointer", border: 0, fontWeight: 500 }}>
                  {s}
                </button>
              );
            })}
          </div>
        </Shared.Field>
        {(form.licensed_states || []).length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
            {(form.licensed_states || []).map(s => (
              <div key={s} style={{ padding: "8px 10px", background: "var(--bg-raised)", borderRadius: 6, display: "flex", alignItems: "center", gap: 8 }}>
                <span className="chip chip-money" style={{ fontSize: 10.5 }}>{s}</span>
                <input className="text-input" type="date" style={{ flex: 1, fontSize: 11.5, padding: "4px 6px" }} value={(form.license_expirations || {})[s] || ""} onChange={(e) => setStateExpiry(s, e.target.value || null)}/>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      <div className="panel" style={{ padding: 16 }}>
        <h4 style={{ margin: "0 0 8px 0", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--text-tertiary)" }}>Notification preferences</h4>
        <div className="profile-grid-4" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
          {[
            ["email",    "Email"],
            ["sms",      "SMS"],
            ["telegram", "Telegram"],
            ["in_app",   "In-app"],
          ].map(([k, l]) => {
            const on = !!np[k];
            return (
              <label key={k} style={{ display: "flex", gap: 8, alignItems: "center", padding: 10, background: on ? "color-mix(in oklch, var(--accent-money) 10%, var(--bg-raised))" : "var(--bg-raised)", borderRadius: 6, cursor: "pointer", fontSize: 12.5, border: on ? "1px solid var(--accent-money)" : "1px solid var(--border-subtle)" }}>
                <input type="checkbox" checked={on} onChange={() => updateNotif(k, !on)}/>
                <span>{l}</span>
              </label>
            );
          })}
        </div>
        <div style={{ marginTop: 10 }}>
          <Shared.Field label="Digest frequency"><Shared.Select value={np.digest_frequency || "daily"} onChange={(v) => updateNotif("digest_frequency", v)} options={DIGEST_FREQ}/></Shared.Field>
        </div>
      </div>

      <div className="panel" style={{ padding: 16 }}>
        <h4 style={{ margin: "0 0 8px 0", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--text-tertiary)" }}>App preferences</h4>
        <div className="profile-grid-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Shared.Field label="Theme">
            <div style={{ display: "flex", gap: 6 }}>
              {[{v:"dark",l:"Dark"},{v:"light",l:"Light"},{v:"system",l:"System"}].map(opt => {
                const active = form.theme === opt.v;
                return (
                  <button key={opt.v} type="button"
                    disabled={themeSaving}
                    onClick={() => saveThemeNow(opt.v)}
                    style={{
                      flex: 1, padding: "6px 0", fontSize: 12, fontWeight: active ? 600 : 400,
                      borderRadius: "var(--radius-md)", cursor: "pointer",
                      background: active ? "var(--accent-money)" : "var(--bg-raised)",
                      color: active ? "#fff" : "var(--text-secondary)",
                      border: active ? "1px solid var(--accent-money)" : "1px solid var(--border-subtle)",
                      transition: "background 100ms, color 100ms",
                    }}
                  >{opt.l}</button>
                );
              })}
            </div>
          </Shared.Field>
          <Shared.Field label="Density"><Shared.Select value={form.density} onChange={(v) => update("density", v)} options={[
            { v: "comfortable", l: "Comfortable" }, { v: "compact",     l: "Compact" },
          ]}/></Shared.Field>
          <Shared.Field label="Default landing page"><input className="text-input" value={form.default_landing} onChange={(e) => update("default_landing", e.target.value)} placeholder="today / floor / pipeline …"/></Shared.Field>
        </div>
      </div>

      <div className="panel" style={{ padding: 16, display: "flex", gap: 10, alignItems: "center" }}>
        <button className="btn btn-primary" onClick={save} disabled={saving || Object.keys(dirty).length === 0}>
          <Icons.Check size={12}/> {saving ? "Saving…" : "Save profile"}
        </button>
        {saveMsg && <span style={{ color: "var(--accent-money)", fontSize: 12 }}>{saveMsg}</span>}
        {Object.keys(dirty).length > 0 && !saving && <span style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>{Object.keys(dirty).length} unsaved change{Object.keys(dirty).length === 1 ? "" : "s"}</span>}
      </div>

      <div className="panel" style={{ padding: 16 }}>
        <h3 style={{ margin: 0 }}>Session</h3>
        <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn" onClick={() => window.signOut && window.signOut()}><Icons.X size={12}/> Sign out</button>
          <span style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>Ends your Supabase session and clears local state.</span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   9. Notifications panel (slide-out from Bell icon)
   ───────────────────────────────────────────────────────────────────────── */
function NotificationsPanel({ open, onClose, goto }) {
  if (!open) return null;
  // Demo-only illustrative notifications. Real tenants get an empty state
  // ("no notifications yet") instead of seeing Cheryl Hampton / Robert Mendez.
  const isDemo = !!(window.isDemoAgency && window.isDemoAgency());
  const FALLBACK = isDemo ? [
    { kind: "lead",     t: "Hot inbound · Cheryl Hampton",    d: "14s",       sub: "FB T65 · score 92 · TX",                page: "queue" },
    { kind: "issued",   t: "Deal issued · Naomi Reese",        d: "8m",        sub: "Aetna SRC Plan G · $1,780 AP",          page: "commissions" },
    { kind: "nigo",     t: "NIGO returned · Linda Cho",         d: "1h",        sub: "Sigs missing · Plan N",                  page: "calls" },
    { kind: "coaching", t: "New coaching card",                  d: "2h",        sub: "Open-ended Q drill assigned",            page: "coaching" },
    { kind: "anomaly",  t: "Persistency drift · Tampa",          d: "3h",        sub: "FE 13-mo cohort -3.2pts WoW",           page: "book" },
    { kind: "recruit",  t: "New applicant · Stacy V",            d: "yesterday", sub: "Already licensed in TX",                  page: "recruiting" },
  ] : [];
  // Live notifications: AppData.NOTIFICATIONS, mapped onto the panel shape.
  // Sort unread first, then most recent. Fallback to FALLBACK if empty.
  const fmtDelta = (iso) => {
    if (!iso) return "";
    const ms = Date.now() - new Date(iso).getTime();
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d`;
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  const linkToPage = (link) => {
    if (!link) return null;
    const m = String(link).match(/page=([a-z-]+)/);
    return m ? m[1] : null;
  };
  const live = (AppData.NOTIFICATIONS || []).map(n => ({
    kind: n.kind,
    t: n.title,
    d: fmtDelta(n.createdAt),
    sub: n.body || "",
    page: linkToPage(n.link),
    unread: !n.readAt,
    id: n.id,
  })).sort((a, b) => (a.unread === b.unread) ? 0 : (a.unread ? -1 : 1));
  const items = live.length > 0 ? live : FALLBACK;
  const unreadCount = live.length > 0 ? live.filter(i => i.unread).length : items.length;
  const colorOf = (k) => k === "lead_assigned" || k === "lead" ? "var(--accent-money)" :
                       k === "commission_paid" || k === "issued" ? "var(--accent-money)" :
                       k === "nigo" ? "var(--state-danger)" :
                       k === "tier_promo" ? "var(--accent-money)" :
                       k === "anomaly" ? "var(--state-warning)" :
                       "var(--accent-status)";
  const markAllRead = async () => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb || live.length === 0) { onClose(); return; }
    const ids = live.filter(i => i.unread).map(i => i.id);
    if (ids.length === 0) { onClose(); return; }
    await sb.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
    window.hydrateFromSupabase && window.hydrateFromSupabase();
    onClose();
  };
  return (
    <div className="slideout-overlay" onClick={onClose}>
      <aside className="slideout" onClick={(e) => e.stopPropagation()} style={{ width: 380 }}>
        <div className="slideout-h">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icons.Bell size={14}/>
            <div style={{ fontSize: 14, fontWeight: 500 }}>Notifications</div>
            <span className="chip chip-money">{unreadCount}</span>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button className="btn btn-ghost" onClick={markAllRead}>Mark read</button>
            <button className="icon-btn" onClick={onClose}><Icons.X size={14}/></button>
          </div>
        </div>
        <div className="slideout-body" style={{ padding: 0 }}>
          {items.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>
              <Icons.Bell size={20} style={{ color: "var(--text-quaternary)" }}/>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8, fontWeight: 500 }}>No notifications yet</div>
              <div style={{ fontSize: 11.5, marginTop: 4 }}>Lead assignments, NIGO returns, and team activity will land here.</div>
            </div>
          ) : items.map((n, i) => (
            <div key={i} onClick={() => { goto && goto(n.page); onClose(); }} style={{ display: "flex", gap: 10, padding: "12px 14px", borderBottom: "1px solid var(--border-subtle)", cursor: "pointer" }}>
              <span className="dot" style={{ background: colorOf(n.kind), marginTop: 6 }}></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{n.t}</div>
                <div style={{ color: "var(--text-tertiary)", fontSize: 11.5, marginTop: 2 }}>{n.sub}</div>
              </div>
              <span style={{ color: "var(--text-quaternary)", fontSize: 11 }}>{n.d}</span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   10. Keyboard shortcuts help (?)
   ───────────────────────────────────────────────────────────────────────── */
function ShortcutsHelp({ open, onClose }) {
  if (!open) return null;
  const groups = [
    { title: "Global", items: [
      ["⌘K / Ctrl+K", "Command palette"],
      ["?",            "Shortcut help"],
      ["Esc",           "Close any overlay"],
    ]},
    { title: "Navigation (in palette)", items: [
      ["↑ ↓",  "Move selection"],
      ["Enter", "Open page or run action"],
    ]},
    { title: "On a call", items: [
      ["M",     "Mute / unmute"],
      ["S",     "Send SOA"],
      ["Space", "Pause transcript"],
    ]},
    { title: "Pipeline", items: [
      ["F",   "Filter"],
      ["N",   "New lead"],
      ["1-5", "Move selected lead to stage"],
    ]},
  ];
  return (
    <Shared.Modal title="Keyboard shortcuts" width={520} onClose={onClose} actions={
      <button className="btn btn-primary" onClick={onClose}>Got it</button>
    }>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        {groups.map(g => (
          <div key={g.title}>
            <div className="field-l" style={{ marginBottom: 6 }}>{g.title}</div>
            {g.items.map(([k, l]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 12.5 }}>
                <span style={{ color: "var(--text-secondary)" }}>{l}</span>
                <span className="kbd mono">{k}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Shared.Modal>
  );
}

/* Stub fallback retained for unknown page IDs */
function PageStub({ title, sub }) {
  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">{title}</div>
          <div className="page-sub">{sub}</div>
        </div>
      </div>
      <div className="panel" style={{ padding: 36, textAlign: "center", color: "var(--text-tertiary)" }}>
        <Icons.Sparkles size={20} style={{ color: "var(--accent-money)" }}/>
        <div style={{ marginTop: 8, fontSize: 14, fontWeight: 500 }}>Page coming online</div>
        <div style={{ fontSize: 12, marginTop: 4 }}>This view is wired in the data layer; UI ships in the next build.</div>
      </div>
    </div>
  );
}

window.PageVault          = PageVault;
window.PageTiering        = PageTiering;
window.PageCommissions    = PageCommissions;
window.PageTraining       = PageTraining;
window.ProductTrainingEmbedded = ProductTrainingEmbedded;
/* PageRecruiting moved to page-recruiting.jsx */
window.PageCalls          = PageCalls;
window.PageBook           = PageBook;
window.PageSettings       = PageSettings;
window.PageStub           = PageStub;
window.NotificationsPanel = NotificationsPanel;
window.ShortcutsHelp      = ShortcutsHelp;
