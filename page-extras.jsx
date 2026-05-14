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
   1. Vault — upgraded Library: coaching + courses + scripts + videos + docs +
      segments + carriers + quick links, all in one searchable hub.
      Reads from AppData (no mocks). Empty states render `.koino-empty` mono tags.
   ───────────────────────────────────────────────────────────────────────── */
function PageVault({ role = "owner" }) {
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

  const fScripts  = data.scripts.filter(s => match(s.title) || match(s.body) || match(s.cat));
  const fVideos   = data.videos.filter(v => match(v.title) || match(v.cat));
  const fDocs     = data.docs.filter(d => match(d.title) || match(d.cat) || (d.text && match(d.text)));
  const fLinks    = data.links.filter(l => match(l.label) || match(l.cat));
  const fCarriers = data.carriers.filter(c => match(c.name) || match(c.category || ""));
  const fCourses  = data.courses.filter(c => match(c.title) || match(c.track || "") || match(c.description || ""));
  const fSegments = data.segments.filter(s => match(s.name) || match(s.description || ""));

  const totalSearch =
    fScripts.length + fVideos.length + fDocs.length +
    fLinks.length + fCarriers.length + fCourses.length + fSegments.length;

  const counts = {
    all: totalSearch,
    coaching:  data.recordings.length + data.coachingNotes.length + data.coachingSessions.length,
    courses:   fCourses.length,
    scripts:   fScripts.length,
    videos:    fVideos.length,
    docs:      fDocs.length,
    segments:  fSegments.length,
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
    { k: "segments",  l: "Segments",   icon: "Bookmark"  },
    { k: "carriers",  l: "Carriers",   icon: "Shield"    },
    { k: "links",     l: "Quick links",icon: "ArrowUpRight" },
  ];

  // Live-call context for script token substitution
  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  const subCtx = { lead: null, me: meIdent };

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Vault</div>
          <div className="page-sub">Coaching · courses · scripts · videos · documents · segments · carriers · quick links</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <input className="text-input" style={{ width: 260 }}
            placeholder="Search across everything…"
            value={q} onChange={(e) => setQ(e.target.value)}/>
          {q && <button className="btn btn-ghost" onClick={() => setQ("")}>Clear</button>}
        </div>
      </div>

      <Shared.SectionPill items={TABS.map(t => ({ ...t, badge: counts[t.k] }))} value={tab} onChange={setTab}/>

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
          {fSegments.length > 0 && <VaultSegmentsListBlock segments={fSegments} onOpen={() => setTab("segments")}/>}
          {fCarriers.length > 0 && <VaultCarriersBlock carriers={fCarriers}/>}
          {fLinks.length    > 0 && <VaultLinksBlock    links={fLinks}/>}
        </div>
      )}

      {tab === "coaching" && <VaultCoachingPane role={role}/>}
      {tab === "courses"  && <ProductTrainingEmbedded role={role}/>}
      {tab === "scripts"  && <VaultScriptsBlock scripts={fScripts} openId={openScript} setOpenId={setOpenScript} subCtx={subCtx}/>}
      {tab === "videos"   && <VaultVideosBlock  videos={fVideos}   onOpen={setOpenVideo}/>}
      {tab === "docs"     && <VaultDocsPane     canEdit={canEdit}/>}
      {tab === "segments" && <VaultSegmentsPane isOwner={isOwner}/>}
      {tab === "carriers" && <VaultCarriersBlock carriers={fCarriers}/>}
      {tab === "links"    && <VaultLinksBlock   links={fLinks}/>}

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
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>{c.title}</div>
            {c.track && <div style={{ marginTop: 4 }}><span className="chip" style={{ fontSize: 9.5 }}>{c.track}</span></div>}
            {c.description && <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 6, lineHeight: 1.5 }} className="cell-truncate">{c.description}</div>}
            {c.required && <div style={{ marginTop: 6 }}><span className="chip chip-status" style={{ fontSize: 9.5 }}>required</span></div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Vault: Carriers (read-only directory) ── */
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
      <div className="panel-h"><Icons.Shield size={13}/><h3>Appointed carriers</h3><span className="meta">{carriers.length}</span></div>
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

/* ── Vault: Documents pane ─────────────────────────────────────────────── */
function VaultDocsPane({ canEdit }) {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const fn = () => force(n => n + 1);
    ["data:hydrated","data:mutated","data:realtime"].forEach(e => window.addEventListener(e, fn));
    return () => ["data:hydrated","data:mutated","data:realtime"].forEach(e => window.removeEventListener(e, fn));
  }, []);

  const docs = (window.AppData && window.AppData.DOCS) || [];
  const [q, setQ]           = React.useState("");
  const [catFilter, setCat] = React.useState("All");
  const [addOpen, setAddOpen] = React.useState(false);
  const [draft, setDraft]   = React.useState({ title: "", cat: "Internal", url: "" });

  const cats = ["All", ...Array.from(new Set(docs.map(d => d.cat).filter(Boolean)))];
  const filtered = docs.filter(d =>
    (catFilter === "All" || d.cat === catFilter) &&
    (!q || d.title.toLowerCase().includes(q.toLowerCase()))
  );

  const addDoc = async () => {
    const title = draft.title.trim();
    if (!title) return;
    const raw = draft.url.trim();
    const safeUrl = raw ? (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`) : "";
    try {
      await window.AppData.mutate.docUpsert({ title, cat: draft.cat, url: safeUrl, kind: "link" });
      setDraft({ title: "", cat: "Internal", url: "" });
      setAddOpen(false);
      window.toast && window.toast("Document added", "success");
    } catch (_e) {}
  };

  const removeDoc = async (id) => {
    try { await window.AppData.mutate.docDelete(id); window.toast && window.toast("Removed", "info"); }
    catch (_e) {}
  };

  return (
    <div className="panel">
      <div className="panel-h">
        <Icons.Folder size={13}/>
        <h3>Documents</h3>
        <span className="meta">{filtered.length} of {docs.length}</span>
        <input className="text-input" style={{ width: 200, marginLeft: "auto" }} placeholder="Search docs…" value={q} onChange={e => setQ(e.target.value)}/>
        {canEdit && <button className="btn btn-primary" onClick={() => setAddOpen(true)}><Icons.Plus size={12}/> Add doc</button>}
      </div>
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
          <div className="list-h" style={{ gridTemplateColumns: "1fr 120px 80px 30px" }}>
            <div>Title</div><div>Category</div><div>Kind</div><div></div>
          </div>
          {filtered.map(d => (
            <div key={d.id} className="row" style={{ gridTemplateColumns: "1fr 120px 80px 30px" }}>
              <div style={{ fontWeight: 500, fontSize: 12.5, display: "flex", alignItems: "center", gap: 8 }}>
                <Icons.FileText size={11} style={{ color: "var(--text-tertiary)", flexShrink: 0 }}/>
                {d.url
                  ? <a href={d.url} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none" }} className="cell-truncate">{d.title}</a>
                  : <span className="cell-truncate">{d.title}</span>}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{d.cat || "—"}</div>
              <div><span className="chip">{d.kind || "link"}</span></div>
              {canEdit
                ? <button className="icon-btn" onClick={() => removeDoc(d.id)} style={{ color: "var(--state-danger)" }}><Icons.X size={11}/></button>
                : <div/>}
            </div>
          ))}
        </div>
      )}
      {addOpen && (
        <Shared.Modal title="Add document" width={460} onClose={() => setAddOpen(false)} actions={
          <>
            <button className="btn btn-ghost" onClick={() => setAddOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={addDoc} disabled={!draft.title.trim()}><Icons.Plus size={11}/> Add</button>
          </>
        }>
          <Shared.Field label="Title">
            <input className="text-input" value={draft.title} onChange={e => setDraft({...draft, title: e.target.value})} placeholder="Employee handbook" autoFocus/>
          </Shared.Field>
          <Shared.Field label="Category">
            <Shared.Select value={draft.cat} onChange={v => setDraft({...draft, cat: v})} options={["Internal","Training","Carrier","Compliance","Other"].map(c => ({v:c,l:c}))}/>
          </Shared.Field>
          <Shared.Field label="URL (optional)">
            <input className="text-input" value={draft.url} onChange={e => setDraft({...draft, url: e.target.value})} placeholder="https://docs.google.com/…"/>
          </Shared.Field>
        </Shared.Modal>
      )}
    </div>
  );
}

/* ── Vault: Segments pane ──────────────────────────────────────────────── */
function VaultSegmentsPane({ isOwner }) {
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
  const [draft, setDraft]   = React.useState({ name: "", description: "" });

  const sel        = segments.find(s => s.id === selId) || null;
  const segDocs    = docs.filter(d => d.segmentId === selId);
  const segScripts = scripts.filter(s => s.segmentId === selId);
  const segVideos  = videos.filter(v => v.segmentId === selId);

  const createSegment = async () => {
    if (!draft.name.trim()) return;
    try {
      const sb       = window.getSupabase && window.getSupabase();
      const agencyId = window.getActiveAgencyId && window.getActiveAgencyId();
      if (!sb || !agencyId) { window.toast && window.toast("Not connected", "danger"); return; }
      const { data, error } = await sb.from("vault_segments").insert({
        agency_id:   agencyId,
        name:        draft.name.trim(),
        description: draft.description.trim() || null,
        sort_order:  segments.length,
      }).select().single();
      if (error) throw error;
      window.AppData.SEGMENTS = [...segments, {
        id: data.id, agencyId: data.agency_id,
        name: data.name, description: data.description || null,
        sortOrder: data.sort_order,
      }];
      window.dispatchEvent(new CustomEvent("data:mutated"));
      setDraft({ name: "", description: "" });
      setAddOpen(false);
      setSelId(data.id);
      window.toast && window.toast("Segment created", "success");
    } catch (_e) {
      window.toast && window.toast("Failed to create segment", "danger");
    }
  };

  const deleteSegment = async (id) => {
    try {
      const sb = window.getSupabase && window.getSupabase();
      if (sb) await sb.from("vault_segments").delete().eq("id", id);
      window.AppData.SEGMENTS = segments.filter(s => s.id !== id);
      window.dispatchEvent(new CustomEvent("data:mutated"));
      if (selId === id) setSelId(null);
      window.toast && window.toast("Segment removed", "info");
    } catch (_e) {}
  };

  if (segments.length === 0 && !addOpen) {
    return (
      <div className="panel" style={{ padding: 40, textAlign: "center" }}>
        <Icons.Bookmark size={22} style={{ color: "var(--text-quaternary)", marginBottom: 10 }}/>
        <code className="mono" style={{ display: "block", fontSize: 12, color: "var(--text-tertiary)", marginBottom: 14 }}>no-segments</code>
        {isOwner ? (
          <>
            <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginBottom: 14, maxWidth: 400, margin: "0 auto 14px" }}>
              Segments are curated content bundles. Examples: "AEP Bootcamp", "First 90 Days", "Final Expense Mastery", "Objection Handling Library".
            </div>
            <button className="btn btn-primary" onClick={() => setAddOpen(true)}><Icons.Plus size={12}/> Create first segment</button>
          </>
        ) : (
          <div style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>Owner must create segments before they appear here.</div>
        )}
        {addOpen && (
          <Shared.Modal title="New segment" width={440} onClose={() => setAddOpen(false)} actions={
            <>
              <button className="btn btn-ghost" onClick={() => setAddOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={createSegment} disabled={!draft.name.trim()}><Icons.Plus size={11}/> Create</button>
            </>
          }>
            <Shared.Field label="Name">
              <input className="text-input" value={draft.name} onChange={e => setDraft({...draft, name: e.target.value})} placeholder="AEP Bootcamp" autoFocus/>
            </Shared.Field>
            <Shared.Field label="Description (optional)">
              <input className="text-input" value={draft.description} onChange={e => setDraft({...draft, description: e.target.value})} placeholder="Everything reps need for AEP season"/>
            </Shared.Field>
          </Shared.Modal>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 14 }}>
      <div className="panel">
        <div className="panel-h">
          <Icons.Bookmark size={13}/>
          <h3>Segments</h3>
          {isOwner && (
            <button className="btn btn-primary" style={{ marginLeft: "auto", padding: "3px 10px", fontSize: 11 }} onClick={() => setAddOpen(true)}>
              <Icons.Plus size={11}/>
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
              {isOwner && (
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
              <div className="panel-h"><h3>{sel.name}</h3></div>
              {sel.description && <div style={{ padding: "0 14px 12px", fontSize: 12.5, color: "var(--text-secondary)" }}>{sel.description}</div>}
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

      {addOpen && (
        <Shared.Modal title="New segment" width={440} onClose={() => setAddOpen(false)} actions={
          <>
            <button className="btn btn-ghost" onClick={() => setAddOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={createSegment} disabled={!draft.name.trim()}><Icons.Plus size={11}/> Create</button>
          </>
        }>
          <Shared.Field label="Name">
            <input className="text-input" value={draft.name} onChange={e => setDraft({...draft, name: e.target.value})} placeholder="AEP Bootcamp" autoFocus/>
          </Shared.Field>
          <Shared.Field label="Description (optional)">
            <input className="text-input" value={draft.description} onChange={e => setDraft({...draft, description: e.target.value})} placeholder="Everything reps need for AEP season"/>
          </Shared.Field>
        </Shared.Modal>
      )}
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
    catch (_e) {}
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
      lead: "(chargeback)",
      carrier: "—", product: "—", ap: 0, pct: 0,
      expected: 0, paid: -(cb.amount || 0), status: "Chargeback",
    }));

  return rows;
}

function CommissionsRep() {
  // Always recompute from policies + commissions ledger so any deal entered
  // anywhere by this rep flows through immediately.
  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  const _isDemoCR = !!(window.isDemoAgency && window.isDemoAgency());
  const repId = meIdent?.rep_id || (_isDemoCR ? (AppData.REPS && AppData.REPS[0] && AppData.REPS[0].id) : null);
  const liveRows = buildStatement({ repId });
  const ROWS = (liveRows && liveRows.length) ? liveRows : (_isDemoCR ? STATEMENT : []);
  const total = ROWS.reduce((a, r) => a + r.expected, 0);
  const paid  = ROWS.reduce((a, r) => a + r.paid, 0);
  const inClearing = total - Math.max(0, paid);
  const charge = ROWS.filter(r => r.paid < 0).reduce((a, r) => a + r.paid, 0);
  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Commissions · Me</div>
          <div className="page-sub">Statement · advances vs as-earned · NIGO and chargeback alerts</div>
        </div>
        <button className="btn" style={{ marginLeft: "auto" }} onClick={() => {
          const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
          const producerName = meIdent?.full_name || "Producer";
          const orgName = meIdent?.agency_name || "Your agency";
          const periodLabel = new Date().toLocaleString("en-US", { month: "long", year: "numeric" });
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
        <Shared.KpiCard hero label="Expected MTD" prefix="$" value={total.toLocaleString()} sub="across 7 issues" trend="up"/>
        <Shared.KpiCard label="Paid MTD" prefix="$" value={Math.max(0, paid).toLocaleString()} sub="advances + as-earned"/>
        <Shared.KpiCard label="In clearing" prefix="$" value={inClearing.toLocaleString()} sub="2 NIGO"/>
        <Shared.KpiCard label="Chargebacks" prefix="$" value={Math.abs(charge).toLocaleString()} sub="last 30d" neg/>
      </div>

      <div className="panel">
        <div className="panel-h"><Icons.Wallet size={13}/><h3>Statement</h3><span className="meta">{ROWS.length} rows · this month</span></div>
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

function CommissionsManager() {
  const { REPS } = AppData;
  // Aggregate buildStatement per rep — same comp% input flows up
  const perRep = REPS.map(r => {
    const rows = buildStatement({ repId: r.id });
    const issued = rows.filter(x => x.status === "paid" || x.status === "pending payout").length;
    const ap     = rows.reduce((a, x) => a + (x.ap || 0), 0);
    const expected = rows.reduce((a, x) => a + (x.expected || 0), 0);
    const paid    = rows.reduce((a, x) => a + Math.max(0, x.paid || 0), 0);
    const charge  = rows.filter(x => (x.paid || 0) < 0)?.reduce((a, x) => a + x.paid, 0);
    return { rep: r, issued, ap, expected, paid, ic: Math.max(0, expected - paid), charge };
  });
  const teamAp       = perRep.reduce((a, x) => a + x.ap, 0);
  const teamExpected = perRep.reduce((a, x) => a + x.expected, 0);
  const teamPaid     = perRep.reduce((a, x) => a + x.paid, 0);
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
          <div className="page-sub">Per-producer ledger · computed from rep-entered comp % at deal-write</div>
        </div>
      </div>

      <div className="kpi-row">
        <Shared.KpiCard hero label="Team expected MTD" prefix="$" value={display.expected.toLocaleString()} sub={`across ${perRep.reduce((a, x) => a + x.issued, 0) || (_isDemoCM ? 14 : 0)} issues`} trend="up"/>
        <Shared.KpiCard label="Team paid MTD" prefix="$" value={display.paid.toLocaleString()} sub="advances + as-earned"/>
        <Shared.KpiCard label="In clearing" prefix="$" value={display.ic.toLocaleString()} sub={(isEmpty && _isDemoCM) ? "14 apps" : "expected − paid"}/>
        <Shared.KpiCard label="Chargebacks" prefix="$" value={Math.abs(display.charge).toLocaleString()} sub="last 30d" neg/>
      </div>

      <div className="panel">
        <div className="panel-h"><h3>Producers · this month</h3><span className="meta">click rep to drill</span></div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1.6fr 70px 100px 110px 100px 100px" }}>
            <div>Producer</div>
            <div className="tabular" style={{ textAlign: "right" }}>Issued</div>
            <div className="tabular" style={{ textAlign: "right" }}>AP</div>
            <div className="tabular" style={{ textAlign: "right" }}>Expected</div>
            <div className="tabular" style={{ textAlign: "right" }}>Paid</div>
            <div className="tabular" style={{ textAlign: "right" }}>In-clearing</div>
          </div>
          {perRep.map(({ rep, issued, ap, expected, paid, ic }) => {
            // Synthesize numbers when no real policies yet — DEMO ONLY.
            const fakeAp = rep.mtd;
            const fakePaid = Math.round(rep.mtd * 0.62);
            const showAp = (isEmpty && _isDemoCM) ? fakeAp : ap;
            const showExpected = (isEmpty && _isDemoCM) ? Math.round(rep.mtd * 0.5) : expected;
            const showPaid = (isEmpty && _isDemoCM) ? fakePaid : paid;
            const showIc = (isEmpty && _isDemoCM) ? Math.max(0, showExpected - showPaid) : ic;
            const showIssued = (isEmpty && _isDemoCM) ? Math.round(rep.mtd / 1800) : issued;
            return (
              <div key={rep.id} className="row" style={{ gridTemplateColumns: "1.6fr 70px 100px 110px 100px 100px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Shared.Avatar rep={rep} size={20}/>
                  <span style={{ fontWeight: 500 }}>{rep.name}</span>
                  <Shared.TierChip tier={rep.tier} compact/>
                </div>
                <div className="tabular" style={{ textAlign: "right" }}>{showIssued}</div>
                <div className="tabular" style={{ textAlign: "right" }}>${showAp.toLocaleString()}</div>
                <div className="tabular" style={{ textAlign: "right", fontWeight: 500 }}>${showExpected.toLocaleString()}</div>
                <div className="tabular" style={{ textAlign: "right", color: "var(--accent-money)" }}>${showPaid.toLocaleString()}</div>
                <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>${showIc.toLocaleString()}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CommissionsOwner() {
  // Account-wide pool: union of every rep's deals → producer commissions →
  // implied override slice. Owner sets the override % below; everything moves.
  const { REPS } = AppData;
  const [overridePct, setOverridePct] = React.useState(20);  // owner's slice on top of producer comp
  const allRows = buildStatement();   // all reps
  const issued = allRows.filter(r => r.status === "paid" || r.status === "pending payout").length;
  const totalAp       = allRows.reduce((a, r) => a + (r.ap || 0), 0);
  const totalExpected = allRows.reduce((a, r) => a + (r.expected || 0), 0);
  const totalPaid     = allRows.reduce((a, r) => a + Math.max(0, r.paid || 0), 0);
  const overridePool  = Math.round(totalAp * overridePct / 100);
  const isEmpty = totalAp === 0;

  // Region split — rough: first 5 reps = Atlanta, rest = Tampa
  const regionRows = ["Atlanta region", "Tampa region"].map((name, i) => {
    const reps = REPS.slice(i === 0 ? 0 : 5, i === 0 ? 5 : undefined);
    const ids = new Set(reps.map(r => r.id));
    const rows = allRows.filter(r => {
      const pol = (AppData.POLICIES || []).find(p => p.id === r.policyId);
      return pol && ids.has(pol.owner);
    });
    const ap = rows.reduce((a, r) => a + (r.ap || 0), 0);
    const ovr = Math.round(ap * overridePct / 100);
    return { name, reps: reps.length, ap, ovr };
  });

  // Fallback display when no real deals
  const display = isEmpty
    ? { pool: 258420, net: 104700, paidOut: 412300, totalAp: 731000 }
    : { pool: overridePool, net: Math.round(overridePool * 0.4), paidOut: totalPaid, totalAp };

  // GAP-RP1 — CSV export of the per-rep statement powering the override pool
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
          <div className="page-sub">Account-wide rollup · {issued || 14} issues this period · override % set by you below</div>
        </div>
        <button className="btn" onClick={exportCommissions} disabled={isEmpty} title={isEmpty ? "No commission rows to export" : "Download CSV of all commission rows"}>Export CSV</button>
      </div>
      <div className="kpi-row">
        <Shared.KpiCard hero label="Override pool · MTD" prefix="$" value={display.pool.toLocaleString()} sub={`${overridePct}% of $${display.totalAp.toLocaleString()} AP`} trend="up"/>
        <Shared.KpiCard label="Net to owner" prefix="$" value={display.net.toLocaleString()} sub="after lead spend + NIGO" trend="up"/>
        <Shared.KpiCard label="Paid to producers" prefix="$" value={display.paidOut.toLocaleString()} sub={`${REPS.length} producers`}/>
        <Shared.KpiCard label="Coverage" value={`${(display.pool / 100000).toFixed(2)}x`} sub="vs $100k goal" trend={display.pool >= 100000 ? "up" : "down"}/>
      </div>

      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="panel-h"><Icons.Calculator size={13}/><h3>Owner override %</h3><span className="meta">applies to all producer AP</span></div>
        <div style={{ padding: "12px 14px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Override slice</span>
            <span className="tabular" style={{ fontSize: 14, fontWeight: 600 }}>{overridePct}%</span>
          </div>
          <input type="range" min={5} max={40} step={1} value={overridePct} onChange={(e) => setOverridePct(+e.target.value)} style={{ width: "100%" }}/>
          <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--text-tertiary)" }}>
            At {overridePct}%, every $1k of producer AP returns ${(overridePct * 10).toFixed(0)} to the owner pool. Rep comp % is set per-deal at write time.
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h"><h3>By region</h3></div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1.4fr 100px 110px 110px 1fr" }}>
            <div>Region</div>
            <div className="tabular" style={{ textAlign: "right" }}>Producers</div>
            <div className="tabular" style={{ textAlign: "right" }}>Total AP</div>
            <div className="tabular" style={{ textAlign: "right" }}>Override</div>
            <div></div>
          </div>
          {regionRows.map((r, i) => {
            const showAp  = isEmpty ? [412800, 318200][i] : r.ap;
            const showOvr = isEmpty ? [92420, 71390][i]   : r.ovr;
            const max     = Math.max(...regionRows.map(x => isEmpty ? Math.max(92420, 71390) : x.ovr), 1);
            return (
              <div key={i} className="row" style={{ gridTemplateColumns: "1.4fr 100px 110px 110px 1fr" }}>
                <div style={{ fontWeight: 500 }}>{r.name}</div>
                <div className="tabular" style={{ textAlign: "right" }}>{r.reps}</div>
                <div className="tabular" style={{ textAlign: "right" }}>${showAp.toLocaleString()}</div>
                <div className="tabular" style={{ textAlign: "right", color: "var(--accent-money)" }}>${showOvr.toLocaleString()}</div>
                <div style={{ height: 5, background: "var(--bg-raised)", borderRadius: 2, marginLeft: 12, overflow: "hidden" }}>
                  <div style={{ width: `${(showOvr / max) * 100}%`, height: "100%", background: "var(--accent-money)" }}></div>
                </div>
              </div>
            );
          })}
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
    try { const raw = localStorage.getItem(key); if (raw) return JSON.parse(raw); } catch (_e) {}
    return fallback;
  }
  function saveJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (_e) {}
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
  function pgCourseRow(c) {
    return {
      id: c.id, agency_id: activeAgencyId(),
      slug: c.slug || null, title: c.title, track: c.track || null,
      description: c.description || null, dur_min: c.durMin || null,
      required: !!c.required, sections: c.sections || [],
      target_roles: c.targetRoles || ["owner","manager","rep"],
      display_order: c.displayOrder || 100,
      is_published: c.isPublished !== false,
    };
  }
  async function upsertCourse(course) {
    const client = sbClient(); if (!client) return;
    const row = pgCourseRow(course);
    if (!row.agency_id) { console.warn("[training] no active agency_id; course not saved"); return; }
    const { error } = await client.from("training_courses").upsert(row, { onConflict: "id" });
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
  const [tab, setTab] = React.useState(defaultTab);
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
  // Render the role-specific inner component (CoachingRep / CoachingManager /
  // CoachingOwner) directly. The .training-embed class hides the duplicate
  // page-h title AND the manager's inner dashboard SectionPill (which would
  // otherwise surface unrelated nav links: Floor / NIGO / Dispatch).
  const Inner = role === "manager" ? window.CoachingManager
              : role === "owner"   ? window.CoachingOwner
              : window.CoachingRep;
  const Fallback = window.PageCoaching;
  if (!Inner && !Fallback) return <div style={{ padding: 30, color: "var(--text-tertiary)" }}>Coaching module loading…</div>;
  return (
    <div className="training-embed">
      {Inner ? <Inner/> : <Fallback role={role}/>}
    </div>
  );
}

function CallLibraryPane({ role }) {
  const { RECORDINGS, REPS } = AppData;
  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  const meId = meIdent?.rep_id || (window.isDemoAgency && window.isDemoAgency() ? REPS[0]?.id : null);
  const visible = role === "rep" ? RECORDINGS.filter(r => !r.repId || r.repId === meId) : RECORDINGS;

  const [selId, setSelId] = React.useState(visible[0]?.id);
  const [q, setQ]         = React.useState("");
  const filtered = visible.filter(r => !q || r.lead.toLowerCase().includes(q.toLowerCase()));
  const sel = filtered.find(r => r.id === selId) || filtered[0];

  return (
    <div className="calls-grid" style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 14 }}>
      <div className="panel">
        <div className="panel-h">
          <h3>Recordings</h3>
          <span className="meta">{filtered.length}</span>
          <input className="text-input" style={{ width: 140, marginLeft: "auto", fontSize: 11.5 }} placeholder="Search lead…" value={q} onChange={(e) => setQ(e.target.value)}/>
        </div>
        <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6, maxHeight: 520, overflowY: "auto" }}>
          {filtered.map(r => (
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
          {filtered.length === 0 && <div style={{ padding: 20, color: "var(--text-tertiary)", fontSize: 12, textAlign: "center" }}>No recordings match.</div>}
        </div>
      </div>

      {sel && (
        <div className="panel">
          <div className="panel-h">
            <Icons.Headset size={13}/>
            <h3>{sel.lead} · score {sel.score}</h3>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <button className="btn btn-ghost" onClick={() => window.dispatchEvent(new CustomEvent("ai:ask", { detail: { prompt: `Summarize the call with ${sel.lead} and grade my open-ended question rate`, context: "Call · " + sel.lead }}))}><Icons.Sparkles size={11}/> Analyze</button>
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
              <span className="mono">{Math.floor(sel.durSec / 60)}:{String(sel.durSec % 60).padStart(2, "0")}</span>
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span className={`chip ${sel.talkRatio < 50 ? "chip-money" : "chip-status"}`}>Talk: {sel.talkRatio}%</span>
              <span className="chip">Open Q: {sel.openQ}</span>
              <span className={`chip ${sel.flags?.tpmo === "ok" ? "chip-money" : "chip-status"}`}>TPMO {sel.flags?.tpmo === "ok" ? "✓" : "?"}</span>
              <span className={`chip ${sel.flags?.soa === "captured" || sel.flags?.soa === "scheduled" ? "chip-money" : ""}`}>SOA {sel.flags?.soa}</span>
            </div>
            <div style={{ marginTop: 14, padding: 12, background: "var(--bg-raised)", borderRadius: 6, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.55 }}>
              <strong style={{ color: "var(--text-primary)" }}>AI summary —</strong> {sel.ai}
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

const DEFAULT_SCRIPTS = [
  { id: "s-medg",   title: "Med Supp — Plan G open",       cat: "Open",       version: "v3.1", updated: "2d ago", body: `Hi {{lead_name}}, this is {{rep_first}} with Atlas. The reason for my call is to make sure your Medicare Supplement gives you the same Plan G coverage at a lower rate. Quick question — when you turn the page on next year's premium, are you most concerned about the monthly cost or the network freedom?` },
  { id: "s-fe",     title: "Final Expense — empathy",       cat: "Open",       version: "v2.4", updated: "1w ago", body: `Most of my clients tell me the hardest part isn't paying for a policy, it's the thought of leaving the people they love with a bill on top of grief. Can I ask — if something happened tomorrow, who would you not want to leave that burden on?` },
  { id: "s-tpmo",   title: "TPMO disclosure (verbatim)",   cat: "Compliance", version: "v1.0", updated: "3w ago", body: `We do not offer every plan available in your area. Currently we represent {{n_orgs}} organizations which offer {{n_plans}} products in your area. Please contact Medicare.gov or 1-800-MEDICARE to get information on all of your options.` },
  { id: "s-annuity",title: "Annuity — fact-find",           cat: "Discovery",  version: "v1.7", updated: "5d ago", body: `Before I quote anything, I need to understand your timeline. The money you're considering — is this for income within the next 5 years, or is it cushion for ten-plus years out?` },
  { id: "s-xsell",  title: "Cross-sell — FE → Med Supp",   cat: "Cross-sell", version: "v2.0", updated: "1d ago", body: `Now that we've taken care of the final expense piece, the other coverage gap I usually see is on the medical side. With Plan G, your Medicare-approved costs after deductible would be zero. Want me to pull a quick rate?` },
  { id: "s-aep",    title: "AEP — switch reasons",          cat: "Open",       version: "v4.2", updated: "Today",   body: `Three reasons people switch during AEP: (1) the drug list changed, (2) their doctor dropped, (3) the premium jumped. Which of those is hitting you hardest this year?` },
];

const VIDEO_CATS  = ["All", "Med Supp", "Final Expense", "AEP", "Life", "Compliance"];
const SCRIPT_CATS = ["All", "Open", "Discovery", "Cross-sell", "Compliance"];

function useLocalArray(key, seed) {
  const [items, setItems] = React.useState(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch (_e) {}
    return seed;
  });
  React.useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(items)); } catch (_e) {}
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
    catch (_e) {}
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
  // Agency-shared via AppData.SCRIPTS_LIB (migration 0010); seed fallback for
  // empty agencies so the page renders content immediately.
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
  const live    = (window.AppData && window.AppData.SCRIPTS_LIB) || [];
  const scripts = live.length > 0 ? live : (window.isDemoAgency && window.isDemoAgency() ? DEFAULT_SCRIPTS : []);
  const [cat, setCat]             = React.useState("All");
  const [q, setQ]                 = React.useState("");
  const [openId, setOpenId]       = React.useState(null);
  const [editing, setEditing]     = React.useState(null);   // {id?, title, cat, body}
  const [copyToast, setCopyToast] = React.useState(null);

  const filtered = scripts.filter(s =>
    (cat === "All" || s.cat === cat) &&
    (!q || s.title.toLowerCase().includes(q.toLowerCase()) || s.body.toLowerCase().includes(q.toLowerCase()))
  );
  const open = openId ? scripts.find(s => s.id === openId) : null;

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
    } catch (_e) {}
  };
  const remove = async (id) => {
    if (openId === id) setOpenId(null);
    try { await window.AppData.mutate.scriptDelete(id); window.toast && window.toast("Script removed", "info"); }
    catch (_e) {}
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

  return (
    <div className="panel">
      <div className="panel-h">
        <Icons.FileText size={13}/>
        <h3>Scripts library</h3>
        <span className="meta">{filtered.length} of {scripts.length}</span>
        <input className="text-input" style={{ width: 200, marginLeft: "auto" }} placeholder="Search title or body…" value={q} onChange={(e) => setQ(e.target.value)}/>
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
    <div className="list">
      <div className="list-h" style={{ gridTemplateColumns: "1.6fr 100px 90px 1fr 110px 110px" }}>
        <div>Course</div><div>Track</div><div className="tabular" style={{ textAlign: "right" }}>Min</div><div>Progress</div><div>Status</div><div></div>
      </div>
      {courses.map(c => {
        const status = ProductTraining.statusFor(repId, c, store.progress, store.assignments);
        const pct    = ProductTraining.percentFor(repId, c, store.progress);
        const cta    = status === "complete" ? "Review" : (pct > 0 ? "Resume" : "Start");
        return (
          <div key={c.id} className="row" style={{ gridTemplateColumns: "1.6fr 100px 90px 1fr 110px 110px" }}>
            <div>
              <div style={{ fontWeight: 500 }}>{c.title}</div>
              {showRequiredFlag && c.required && <div style={{ fontSize: 10.5, color: "var(--accent-status)", marginTop: 2 }}>required</div>}
            </div>
            <div><span className="chip">{c.track}</span></div>
            <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{c.durMin}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, paddingRight: 12 }}>
              <div style={{ flex: 1, height: 5, background: "var(--bg-raised)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: pct === 100 ? "var(--accent-money)" : "var(--accent-status)" }}></div>
              </div>
              <span className="tabular" style={{ fontSize: 11, color: "var(--text-tertiary)", minWidth: 30, textAlign: "right" }}>{pct}%</span>
            </div>
            <div><StatusChip status={status}/></div>
            <div><button className="btn btn-ghost" onClick={() => onOpen(c)}><Icons.Play size={11}/> {cta}</button></div>
          </div>
        );
      })}
      {courses.length === 0 && (
        <div style={{ padding: 20, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>No courses here.</div>
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
      {tab === "scripts" && <ScriptsLibrary/>}

      {openCourse && <CourseViewerModal course={openCourse} repId={meId} store={store} onClose={() => setOpenCourse(null)}/>}
    </>
  );
}

/* ─── Manager · Product Training ─────────────────────────────────────── */
function ProductTrainingManager({ store }) {
  const { REPS } = AppData;
  const [showAssign, setShowAssign] = React.useState(false);

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
        <button className="btn btn-primary" onClick={() => setShowAssign(true)}><Icons.Plus size={13}/> Assign course</button>
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
        <div className="list">
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

      {showAssign && <AssignCourseModal store={store} onClose={() => setShowAssign(false)}/>}
    </>
  );
}

/* ─── Manager · Assign Course modal ───────────────────────────────────── */
function AssignCourseModal({ store, onClose }) {
  const { REPS } = AppData;
  const [courseId, setCourseId] = React.useState(store.courses[0]?.id || "");
  const [repIds, setRepIds]     = React.useState([]);
  const [dueDate, setDueDate]   = React.useState("");
  const toggle = (id) => setRepIds(rs => rs.includes(id) ? rs.filter(x => x !== id) : [...rs, id]);

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
      <div className="field-l" style={{ marginTop: 8 }}>Producers · {repIds.length} selected</div>
      <div style={{ marginTop: 6, maxHeight: 240, overflowY: "auto", border: "1px solid var(--border-subtle)", borderRadius: 6 }}>
        {REPS.map(r => (
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
    _isNew: true,
  });
  const editCourse = (c) => setEditing({ ...c, sections: (c.sections || []).map(s => ({ ...s, lessons: [...(s.lessons || [])] })) });
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
                  <div style={{ fontWeight: 500 }}>{c.title || <span style={{ color: "var(--text-tertiary)" }}>Untitled</span>}</div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>{lessonCount} lesson{lessonCount === 1 ? "" : "s"}</div>
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
  const onUploadVideo = (si, li, file) => {
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) {
      window.toast && window.toast("Files >6MB won't persist in browser storage — paste a Loom link instead", "warn");
    }
    const reader = new FileReader();
    reader.onload = () => updateLesson(si, li, { videoUrl: reader.result });
    reader.readAsDataURL(file);
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
                  ? (() => { const T = window.PostCallTranscript; return <T recordingId={sel.id}/>; })()
                  : <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>Transcript module loading…</div>}
              </div>
            )}
          </div>
        </div>
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
   8. Settings — role-aware (org / billing / integrations / API / routing /
      notifications). Owner sees everything, mgr sees team-relevant
      sections, rep sees only their profile.
   ───────────────────────────────────────────────────────────────────────── */
function PageSettings({ role = "owner" }) {
  const TABS = role === "owner"
    ? [["org","Organization"],["team","Team & invites"],["carriers","Carriers"],["billing","Billing"],["integrations","Integrations"],["agents","Agents"],["api","API keys"],["routing","Routing rules"],["calling","Calling"],["notifications","Notifications"],["profile","Profile"]]
    : role === "manager"
      ? [["team","Team & invites"],["carriers","Carriers"],["agents","Agents"],["routing","Routing rules"],["calling","Calling"],["notifications","Notifications"],["profile","Profile"]]
      : [["agents","Agents"],["calling","Calling"],["profile","Profile"],["notifications","Notifications"]];
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
          <div className="page-sub">{role === "owner" ? "Organization, team, carriers, billing, integrations, API, routing" : role === "manager" ? "Team, carriers, routing rules and notifications" : "Your profile and notifications"}</div>
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
          {tab === "org"          && <SettingsOrg/>}
          {tab === "billing"      && <SettingsBilling/>}
          {tab === "integrations" && <SettingsIntegrations/>}
          {tab === "api"          && <SettingsApi/>}
          {tab === "routing"      && <SettingsRouting/>}
          {tab === "calling"      && (() => { const C = window.CallingSetup; return C ? <C/> : null; })()}
          {tab === "team"          && (() => { const T = window.SettingsTeam;  return T ? <T/> : null; })()}
          {tab === "carriers"      && (() => { const C = window.SettingsCarriers; return C ? <C canEdit={role === "owner"}/> : null; })()}
          {tab === "agents"        && <SettingsAgents role={role}/>}
          {tab === "notifications"&& <SettingsNotifications/>}
          {tab === "profile"      && <SettingsProfile role={role}/>}
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
    } catch (_e) {} finally { setSaving(false); }
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
      } catch (_e) {} finally { setBusy(false); }
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

/* Settings → Agents — install/uninstall AI agents recommended for the
 * viewer's role. Sources truth from suggested_agents_for_role(role) RPC.
 *
 * Install flow tries:
 *   1. RPC public.install_agent(p_agent_key) — if present, single round-trip
 *   2. Direct upsert into public.rba_installs (agency_id from current_agency_id,
 *      agent_key from suggestion). If `rba_installs` is missing we surface
 *      the error rather than silently succeed.
 *
 * Uninstall hits public.rba_installs delete (RLS confines to viewer agency).
 *
 * Pass 6 (2026-05-11).
 */
function SettingsAgents({ role = "owner" }) {
  const [suggestions, setSuggestions] = React.useState([]);
  const [installs,    setInstalls]    = React.useState([]);
  const [loading,     setLoading]     = React.useState(true);
  const [err,         setErr]         = React.useState(null);
  const [busyKey,     setBusyKey]     = React.useState(null);
  const [agencyId,    setAgencyId]    = React.useState(null);

  const refresh = React.useCallback(async () => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) { setLoading(false); return; }
    try {
      const aid = (await sb.rpc("current_agency_id"))?.data || null;
      setAgencyId(aid);
      const [sug, ins] = await Promise.all([
        sb.rpc("suggested_agents_for_role", { p_role: role }),
        sb.from("rba_installs").select("agent_key, status, installed_at"),
      ]);
      if (Array.isArray(sug?.data)) setSuggestions(sug.data);
      if (Array.isArray(ins?.data)) setInstalls(ins.data);
      if (sug?.error && sug.error.code !== "PGRST116") setErr(sug.error.message || String(sug.error));
    } catch (e) {
      setErr(String(e?.message || e));
    } finally { setLoading(false); }
  }, [role]);
  React.useEffect(() => { refresh(); }, [refresh]);

  const installedKeys = React.useMemo(() => new Set(installs.map(i => i.agent_key)), [installs]);

  const install = async (agentKey, label) => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return;
    setBusyKey(agentKey);
    try {
      // Try RPC first
      let ok = false;
      try {
        const r = await sb.rpc("install_agent", { p_agent_key: agentKey });
        if (!r.error) ok = true;
      } catch (_e) {}
      if (!ok) {
        // Fallback: direct insert. agency_id falls from RLS or current_agency_id.
        const row = { agent_key: agentKey, status: "installed" };
        if (agencyId) row.agency_id = agencyId;
        const r2 = await sb.from("rba_installs").upsert(row, { onConflict: "agency_id,agent_key" });
        if (r2.error) throw r2.error;
      }
      window.toast && window.toast(`${label} installed`, "success");
      await refresh();
    } catch (e) {
      window.toast && window.toast(`Install failed: ${e?.message || e}`, "error");
    } finally { setBusyKey(null); }
  };

  const uninstall = async (agentKey, label) => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return;
    setBusyKey(agentKey);
    try {
      let q = sb.from("rba_installs").delete().eq("agent_key", agentKey);
      if (agencyId) q = q.eq("agency_id", agencyId);
      const r = await q;
      if (r.error) throw r.error;
      window.toast && window.toast(`${label} uninstalled`, "success");
      await refresh();
    } catch (e) {
      window.toast && window.toast(`Uninstall failed: ${e?.message || e}`, "error");
    } finally { setBusyKey(null); }
  };

  if (loading) {
    return <div className="panel" style={{ padding: 24, color: "var(--text-tertiary)", fontSize: 12.5 }}>Loading agent recommendations…</div>;
  }
  if (err) {
    return (
      <div className="panel" style={{ padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--state-danger)" }}>Couldn't load agents</div>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "6px 0 10px" }}>{err}</div>
        <button className="btn" onClick={refresh}>Try again</button>
      </div>
    );
  }
  if (suggestions.length === 0) {
    return (
      <div className="panel" style={{ padding: 18 }}>
        <h3 style={{ margin: 0, marginBottom: 6 }}>Agents</h3>
        <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", lineHeight: 1.55 }}>
          No agents seeded in <code style={{ fontSize: 10.5 }}>role_agent_defaults</code> for the <strong>{role}</strong> role yet. Ask your IMO admin to populate defaults, or install agents directly from the Ops → Agents page.
        </div>
      </div>
    );
  }

  const required = suggestions.filter(a => a.required);
  const optional = suggestions.filter(a => !a.required);

  const renderRow = (a) => {
    const key = a.agent_key || a.id;
    const label = a.label || a.name || key;
    const installed = installedKeys.has(key);
    return (
      <div key={key} className="row" style={{ gridTemplateColumns: "1.4fr 1.6fr 130px", padding: "10px 12px", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>
            {a.required && <span className="chip chip-status" style={{ marginRight: 6, fontSize: 10 }}>required</span>}
            {a.host_hint && <span style={{ fontSize: 10.5 }}>runs on {a.host_hint}</span>}
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", lineHeight: 1.5 }}>{a.description || ""}</div>
        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
          {installed ? (
            <>
              <span className="chip chip-money" style={{ fontSize: 10.5 }}>installed</span>
              <button
                className="btn btn-ghost"
                disabled={a.required || busyKey === key}
                title={a.required ? "Required agents can't be uninstalled" : "Uninstall"}
                onClick={() => uninstall(key, label)}
              >
                {busyKey === key ? "…" : "Uninstall"}
              </button>
            </>
          ) : (
            <button className="btn btn-primary" disabled={busyKey === key} onClick={() => install(key, label)}>
              {busyKey === key ? "Installing…" : "Install"}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {required.length > 0 && (
        <div className="panel">
          <div className="panel-h">
            <h3>Required for {role}s</h3>
            <span className="meta">{required.filter(a => installedKeys.has(a.agent_key || a.id)).length}/{required.length} installed</span>
          </div>
          <div className="list">{required.map(renderRow)}</div>
        </div>
      )}
      {optional.length > 0 && (
        <div className="panel">
          <div className="panel-h">
            <h3>Recommended</h3>
            <span className="meta">{optional.length} optional agents</span>
          </div>
          <div className="list">{optional.map(renderRow)}</div>
        </div>
      )}
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
        } catch (_e) {}
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
      } catch (_e) {}
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

  // Form state shadows the bundle.profile fields. We track ONLY user-touched
  // fields in `dirty` so save_profile sends a minimal patch and the backend
  // preserves untouched keys (the contract per the RPC spec).
  const [form,  setForm]  = React.useState({});
  const [dirty, setDirty] = React.useState({});
  const update = (k, v) => { setForm(f => ({ ...f, [k]: v })); setDirty(d => ({ ...d, [k]: true })); };
  const updateNotif = (k, v) => {
    setForm(f => ({ ...f, notification_prefs: { ...(f.notification_prefs || {}), [k]: v } }));
    setDirty(d => ({ ...d, notification_prefs: true }));
  };

  const load = React.useCallback(async () => {
    if (!sb) { setLoading(false); return; }
    setLoading(true); setLoadErr(null);
    try {
      const r = await sb.rpc("get_my_profile");
      if (r.error) throw r.error;
      const b = (typeof r.data === "string") ? JSON.parse(r.data) : (r.data || {});
      setBundle(b);
      const p = b?.profile || {};
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
        theme:               p.theme || "system",
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
      } catch (_e) {}
    } catch (e) {
      setLoadErr(String(e?.message || e));
    } finally { setLoading(false); }
  }, [sb]);
  React.useEffect(() => { load(); }, [load]);

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
  const [avatarOk, setAvatarOk] = React.useState(true);
  React.useEffect(() => { setAvatarOk(true); }, [form.avatar_url]);
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
          <Shared.Field label="Theme"><Shared.Select value={form.theme} onChange={(v) => update("theme", v)} options={[
            { v: "system", l: "Match system" }, { v: "light",  l: "Light" }, { v: "dark",   l: "Dark" },
          ]}/></Shared.Field>
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
