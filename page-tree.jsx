/* page-tree.jsx — Agency hierarchy visualizer
   IMO → agencies → managers → reps
   Pure JSX + CSS connector lines (no d3 / react-flow / external libs) */

const _TREE_SECTION_ITEMS = [
  {k:"team",l:"Floor"},{k:"coaching",l:"Coaching"},{k:"nigo",l:"NIGO Queue"},
  {k:"recruiting",l:"Recruiting"},{k:"queue",l:"Dispatch"},
  {k:"downline",l:"Tree"},{k:"leaddrip",l:"Lead Drip"},
];

function useTreeReady() {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const fn = () => force(n => n + 1);
    window.addEventListener("me:loaded", fn);
    window.addEventListener("data:hydrated", fn);
    window.addEventListener("data:mutated", fn);
    return () => {
      window.removeEventListener("me:loaded", fn);
      window.removeEventListener("data:hydrated", fn);
      window.removeEventListener("data:mutated", fn);
    };
  }, []);
}

function _repTree(reps) {
  const byUpline = {};
  reps.forEach(r => {
    const key = r.upline_id || "__root__";
    (byUpline[key] = byUpline[key] || []).push(r);
  });
  function makeNode(rep) {
    const downs = byUpline[rep.id] || [];
    return {
      kind: "rep", id: rep.id, name: rep.name,
      handle: rep.handle || ("@" + rep.id),
      tier: rep.tier, teamSize: downs.length,
      children: downs.map(makeNode),
    };
  }
  const roots = byUpline["__root__"] || reps.filter(r => !r.upline_id);
  return roots.map(makeNode);
}

function useFetchHierarchy() {
  const [nodes, setNodes] = React.useState(null);

  React.useEffect(() => {
    const sb = window.getSupabase && window.getSupabase();
    const fallback = () => {
      const reps = (AppData.REPS || []).map(r => ({ ...r, upline_id: null }));
      setNodes(reps.length
        ? [{ kind: "agency", id: "__agency", name: "Agency", children: _repTree(reps) }]
        : []);
    };
    if (!sb || !AppData.LIVE) { fallback(); return; }

    Promise.all([
      sb.from("agencies").select("id, name, imo_id").catch(() => ({ data: [] })),
      sb.from("reps").select("id, name, handle, tier, upline_id, agency_id").catch(() => ({ data: [] })),
      sb.from("imos").select("id, name").catch(() => ({ data: [] })),
    ]).then(([agR, repR, imoR]) => {
      const agencies = agR.data || [];
      const reps     = repR.data || [];
      const imos     = imoR.data || [];

      if (agencies.length === 0 && reps.length === 0) { fallback(); return; }

      const imoMap = {};
      imos.forEach(i => { imoMap[i.id] = { kind: "imo", id: i.id, name: i.name, children: [] }; });
      const noImo = { kind: "imo", id: "__no_imo", name: "Direct Agencies", children: [] };

      agencies.forEach(a => {
        const node = {
          kind: "agency", id: a.id, name: a.name,
          children: _repTree(reps.filter(r => r.agency_id === a.id)),
        };
        const parent = (a.imo_id && imoMap[a.imo_id]) || noImo;
        parent.children.push(node);
      });

      const roots = [
        ...Object.values(imoMap).filter(i => i.children.length > 0),
        ...(noImo.children.length ? [noImo] : []),
      ];

      if (roots.length === 0) {
        setNodes([{ kind: "agency", id: "__agency", name: "Agency", children: _repTree(reps) }]);
      } else {
        setNodes(roots);
      }
    }).catch(fallback);
  }, []);

  return nodes;
}

const _KIND_COLOR = { imo: "var(--accent-money)", agency: "#7c6af7", rep: "var(--text-secondary)" };
const _KIND_LABEL = { imo: "IMO", agency: "Agency", rep: "Rep" };

function _countTeam(node) {
  if (!node.children || node.children.length === 0) return 0;
  return node.children.length + node.children.reduce((s, c) => s + _countTeam(c), 0);
}

function TreeNode({ node, depth, onSelect }) {
  const [open, setOpen] = React.useState(depth < 1);
  const hasKids = node.children && node.children.length > 0;
  const color = _KIND_COLOR[node.kind] || "var(--text-secondary)";
  const total = hasKids ? _countTeam(node) : 0;

  return (
    <div style={{ position: "relative" }}>
      <div
        onClick={() => { if (hasKids) setOpen(o => !o); onSelect(node); }}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "7px 10px",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-subtle)",
          borderLeft: `3px solid ${color}`,
          borderRadius: 6,
          cursor: "pointer",
          minWidth: 180, maxWidth: 280,
          userSelect: "none",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {node.name}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginTop: 2, display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ color, fontWeight: 600 }}>{_KIND_LABEL[node.kind]}</span>
            {node.handle && <><span>·</span><span>{node.handle}</span></>}
            {node.tier && <Shared.TierChip tier={node.tier} compact/>}
          </div>
        </div>
        {total > 0 && (
          <span style={{ background: "var(--bg-raised)", color: "var(--text-tertiary)", fontSize: 10.5, borderRadius: 10, padding: "1px 7px", fontWeight: 600, flexShrink: 0 }}>
            {total}
          </span>
        )}
        {hasKids && (
          <span style={{ color: "var(--text-quaternary)", fontSize: 10, flexShrink: 0 }}>{open ? "▾" : "▸"}</span>
        )}
      </div>

      {open && hasKids && (
        <div style={{ marginLeft: 20, marginTop: 4, paddingLeft: 14, paddingTop: 2, borderLeft: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: 4 }}>
          {node.children.map(ch => (
            <TreeNode key={ch.id} node={ch} depth={depth + 1} onSelect={onSelect}/>
          ))}
        </div>
      )}
    </div>
  );
}

function NodeSlideout({ node, onClose }) {
  const liveRep = node.kind === "rep"
    ? (AppData.REPS || []).find(r => r.id === node.id)
    : null;
  const pipeCount = node.kind === "rep"
    ? (AppData.PIPELINE || []).filter(p => p.owner === node.id).length
    : null;

  return (
    <div className="slideout-overlay" onClick={onClose}>
      <aside className="slideout" onClick={e => e.stopPropagation()} style={{ width: 380 }}>
        <div className="slideout-h">
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, fontFamily: "var(--font-display)" }}>{node.name}</div>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
              <span style={{ color: _KIND_COLOR[node.kind], fontWeight: 600 }}>{_KIND_LABEL[node.kind]}</span>
              {node.handle && <><span>·</span><span>{node.handle}</span></>}
              {node.tier && <Shared.TierChip tier={node.tier} compact/>}
            </div>
          </div>
          <button className="icon-btn" onClick={onClose}><Icons.X size={14}/></button>
        </div>
        <div className="slideout-body">
          {node.kind === "rep" && (
            <>
              <div className="kpi-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <Shared.KpiCard label="Downline" value={String(_countTeam(node) || node.teamSize || 0)}/>
                <Shared.KpiCard label="Active deals" value={String(pipeCount ?? "—")}/>
                {liveRep && <>
                  <Shared.KpiCard label="MTD" prefix="$" value={(liveRep.mtd || 0).toLocaleString()}/>
                  <Shared.KpiCard label="Streak" value={(liveRep.streak || 0) + "d"}/>
                </>}
              </div>
              <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
                <button className="btn" onClick={() => { onClose(); window.dispatchEvent(new CustomEvent("nav:goto", { detail: { page: "coaching" } })); }}>
                  <Icons.Activity size={12}/> Coaching
                </button>
                <button className="btn btn-primary" onClick={() => { onClose(); window.dispatchEvent(new CustomEvent("nav:goto", { detail: { page: "team" } })); }}>
                  <Icons.Users size={12}/> Floor view
                </button>
              </div>
            </>
          )}
          {(node.kind === "agency" || node.kind === "imo") && (
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              <div><strong>{node.children?.length || 0}</strong> direct report{node.children?.length !== 1 ? "s" : ""}</div>
              <div><strong>{_countTeam(node)}</strong> total in hierarchy</div>
              <div style={{ marginTop: 14 }}>
                <button className="btn" onClick={() => { onClose(); window.dispatchEvent(new CustomEvent("nav:goto", { detail: { page: "recruiting" } })); }}>
                  <Icons.Plus size={12}/> Add member
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function PageTree() {
  useTreeReady();
  const nodes = useFetchHierarchy();
  const [selected, setSelected] = React.useState(null);

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Org Tree</div>
          <div className="page-sub">IMO → agency → manager → rep · click any node to drill in · badge = full downline count</div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <button className="btn btn-primary" onClick={() => window.dispatchEvent(new CustomEvent("nav:goto", { detail: { page: "recruiting" } }))}>
            <Icons.Plus size={12}/> Invite member
          </button>
        </div>
      </div>

      <Shared.SectionPill
        items={_TREE_SECTION_ITEMS}
        value="downline"
        onChange={k => window.dispatchEvent(new CustomEvent("nav:goto", { detail: { page: k } }))}
      />

      {!nodes && (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
          Loading hierarchy…
        </div>
      )}

      {nodes && nodes.length === 0 && (
        <div className="panel" style={{ padding: 40, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>
          {/* tree · empty — invite members to start your downline */}
          tree · empty — invite members to start your downline
        </div>
      )}

      {nodes && nodes.length > 0 && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          {nodes.map(root => (
            <TreeNode key={root.id} node={root} depth={0} onSelect={setSelected}/>
          ))}
        </div>
      )}

      {selected && <NodeSlideout node={selected} onClose={() => setSelected(null)}/>}
    </div>
  );
}

window.PageTree = PageTree;
