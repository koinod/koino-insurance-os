/* page-library.jsx — Rep-grade knowledge surface.
   Purpose-built for reps: scripts, training videos, documents, carrier
   directory, quick links. NO lead-vendor / NO spend-tracker / NO carrier-
   underwriting math (those are owner + manager tools).

   Reads everything from agency-shared AppData (migration 0010):
     SCRIPTS_LIB, VIDEOS, DOCS, QUICK_LINKS, CARRIERS

   Listens for library:openScript event so ⌘K → script result lands here
   with the right script pre-opened. */

(function () {

const TABS = [
  { k: "all",       l: "All",        icon: "Search" },
  { k: "scripts",   l: "Scripts",    icon: "FileText" },
  { k: "videos",    l: "Videos",     icon: "Video" },
  { k: "docs",      l: "Documents",  icon: "Folder" },
  { k: "carriers",  l: "Carriers",   icon: "Shield" },
  { k: "links",     l: "Quick links", icon: "Bookmark" },
];

function useResources() {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const fn = () => force(n => n + 1);
    window.addEventListener("data:hydrated", fn);
    window.addEventListener("data:mutated",  fn);
    window.addEventListener("data:realtime", fn);
    return () => {
      window.removeEventListener("data:hydrated", fn);
      window.removeEventListener("data:mutated",  fn);
      window.removeEventListener("data:realtime", fn);
    };
  }, []);
  return {
    scripts:  (window.AppData && window.AppData.SCRIPTS_LIB) || [],
    videos:   (window.AppData && window.AppData.VIDEOS)      || [],
    docs:     (window.AppData && window.AppData.DOCS)        || [],
    links:    (window.AppData && window.AppData.QUICK_LINKS) || [],
    carriers: (window.AppData && window.AppData.CARRIERS)    || [],
  };
}

function PageLibrary({ role = "rep" }) {
  const data = useResources();
  const [tab, setTab]       = React.useState("all");
  const [q, setQ]           = React.useState("");
  const [openScript, setOpenScript] = React.useState(null);
  const [openVideo, setOpenVideo]   = React.useState(null);

  // ⌘K → script handoff
  React.useEffect(() => {
    const fn = (e) => {
      const s = e.detail;
      if (s?.id) { setTab("scripts"); setOpenScript(s.id); }
    };
    window.addEventListener("library:openScript", fn);
    return () => window.removeEventListener("library:openScript", fn);
  }, []);

  const ql = q.trim().toLowerCase();
  const match = (s) => !ql || s.toLowerCase().includes(ql);

  const fScripts  = data.scripts.filter(s => match(s.title) || match(s.body) || match(s.cat));
  const fVideos   = data.videos.filter(v => match(v.title) || match(v.cat));
  const fDocs     = data.docs.filter(d => match(d.title) || match(d.cat) || (d.text && match(d.text)));
  const fLinks    = data.links.filter(l => match(l.label) || match(l.cat));
  const fCarriers = data.carriers.filter(c => match(c.name) || match(c.category || ""));

  const totalAcrossSearch = fScripts.length + fVideos.length + fDocs.length + fLinks.length + fCarriers.length;

  const counts = { all: totalAcrossSearch, scripts: fScripts.length, videos: fVideos.length, docs: fDocs.length, carriers: fCarriers.length, links: fLinks.length };

  // Live-call context for token substitution in scripts (matches InCallScripts)
  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  const subCtx = { lead: null, me: meIdent };

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Library</div>
          <div className="page-sub">Scripts · videos · documents · carriers · quick links — everything you need on a call</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <input className="text-input" style={{ width: 260 }}
            placeholder="Search across everything…"
            value={q} onChange={(e) => setQ(e.target.value)}
            autoFocus/>
          {q && <button className="btn btn-ghost" onClick={() => setQ("")}>Clear</button>}
        </div>
      </div>

      <Shared.SectionPill items={TABS.map(t => ({ ...t, badge: counts[t.k] }))} value={tab} onChange={setTab}/>

      {/* ALL — render every section in priority order, tightened to filtered hits */}
      {tab === "all" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {q && totalAcrossSearch === 0 && (
            <div className="panel" style={{ padding: 30, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
              No matches for <strong style={{ color: "var(--text-secondary)" }}>"{q}"</strong> across scripts, videos, docs, carriers, or links.
            </div>
          )}
          {fScripts.length  > 0 && <ScriptsBlock  scripts={fScripts}  openId={openScript} setOpenId={setOpenScript} subCtx={subCtx}/>}
          {fVideos.length   > 0 && <VideosBlock   videos={fVideos}    onOpen={setOpenVideo}/>}
          {fDocs.length     > 0 && <DocsBlock     docs={fDocs}/>}
          {fCarriers.length > 0 && <CarriersBlock carriers={fCarriers}/>}
          {fLinks.length    > 0 && <LinksBlock    links={fLinks}/>}
        </div>
      )}
      {tab === "scripts"  && <ScriptsBlock  scripts={fScripts}  openId={openScript} setOpenId={setOpenScript} subCtx={subCtx}/>}
      {tab === "videos"   && <VideosBlock   videos={fVideos}    onOpen={setOpenVideo}/>}
      {tab === "docs"     && <DocsBlock     docs={fDocs}/>}
      {tab === "carriers" && <CarriersBlock carriers={fCarriers}/>}
      {tab === "links"    && <LinksBlock    links={fLinks}/>}

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

// ─── Scripts ──────────────────────────────────────────────────────────────
// Mid-call substitution: tokens swap to the lead's name when on an active
// call (subCtx is passed in). Empty subCtx still renders gracefully.
function substitute(body, ctx) {
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

function ScriptsBlock({ scripts, openId, setOpenId, subCtx }) {
  if (!scripts.length) return null;
  const copy = (s) => {
    try { navigator.clipboard.writeText(substitute(s.body, subCtx)); window.toast && window.toast("Script copied", "success"); }
    catch (_e) {}
  };
  return (
    <div className="panel">
      <div className="panel-h">
        <Icons.FileText size={13}/>
        <h3>Scripts</h3>
        <span className="meta">{scripts.length}</span>
      </div>
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
        {scripts.map(s => {
          const open = openId === s.id;
          const Chev = open ? Icons.ChevronDown : Icons.ChevronRight;
          return (
            <div key={s.id} style={{ background: "var(--bg-raised)", borderRadius: 5, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", cursor: "pointer" }} onClick={() => setOpenId(open ? null : s.id)}>
                <Chev size={11} style={{ color: "var(--text-tertiary)" }}/>
                <span style={{ flex: 1, fontWeight: 500, fontSize: 12 }} className="cell-truncate">{s.title}</span>
                <span className="chip" style={{ fontSize: 9.5 }}>{s.cat}</span>
                <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{s.version}</span>
                <button className="icon-btn" onClick={(e) => { e.stopPropagation(); copy(s); }} title="Copy"><Icons.Copy size={11}/></button>
              </div>
              {open && (
                <div style={{ padding: "10px 12px 12px 30px", fontSize: 12, color: "var(--text-secondary)", borderTop: "1px solid var(--border-subtle)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                  {substitute(s.body, subCtx)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Videos ───────────────────────────────────────────────────────────────
function VideosBlock({ videos, onOpen }) {
  if (!videos.length) return null;
  return (
    <div className="panel">
      <div className="panel-h">
        <Icons.Video size={13}/>
        <h3>Training videos</h3>
        <span className="meta">{videos.length}</span>
      </div>
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
              <div style={{ marginTop: 4 }}><span className="chip" style={{ fontSize: 9.5 }}>{v.cat}</span></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Documents ────────────────────────────────────────────────────────────
function DocsBlock({ docs }) {
  if (!docs.length) return null;
  return (
    <div className="panel">
      <div className="panel-h">
        <Icons.Folder size={13}/>
        <h3>Documents</h3>
        <span className="meta">{docs.length}</span>
      </div>
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
              <span className="chip" style={{ fontSize: 9.5 }}>{d.cat}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Carriers (read-only directory) ──────────────────────────────────────
function CarriersBlock({ carriers }) {
  if (!carriers.length) return null;
  return (
    <div className="panel">
      <div className="panel-h">
        <Icons.Shield size={13}/>
        <h3>Appointed carriers</h3>
        <span className="meta">{carriers.length}</span>
      </div>
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

// ─── Quick links ──────────────────────────────────────────────────────────
function LinksBlock({ links }) {
  if (!links.length) return null;
  // Group by category for scannability
  const groups = links.reduce((acc, l) => { (acc[l.cat || "Internal"] ||= []).push(l); return acc; }, {});
  return (
    <div className="panel">
      <div className="panel-h">
        <Icons.Bookmark size={13}/>
        <h3>Quick links</h3>
        <span className="meta">{links.length}</span>
      </div>
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

window.PageLibrary = PageLibrary;

})();
