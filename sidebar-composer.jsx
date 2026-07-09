/* sidebar-composer.jsx — Customizable sidebar composer modal.
 *
 * Exposes on window:
 *   SidebarComposer   — the full-screen composer modal (props: onClose, role)
 *
 * Drag-and-drop: HTML5 native API on desktop. Touch devices get
 * explicit "+ Add" / "Remove" buttons (detected via ontouchstart).
 */
const { useState, useEffect, useRef, useCallback } = React;

/* ─────────────────────────── Composer Modal ──────────────────────────────── */

const CATEGORIES = [
  { key: "nav",     label: "Nav Links" },
];

const isTouch = () => "ontouchstart" in window;

function WidgetPreview({ item }) {
  const Ico = (Icons && Icons[item.icon]) ? Icons[item.icon] : null;
  return (
    <span className="sw-preview-label">
      {Ico && <Ico size={13} style={{ marginRight: 4, flexShrink: 0 }}/>}
      {item.label}
    </span>
  );
}

function SidebarComposer({ onClose, role }) {
  const [layout, setLayout]         = useState([]);
  const [saving, setSaving]         = useState(false);
  const [dirty, setDirty]           = useState(false);
  const [catTab, setCatTab]         = useState("nav");
  const [search, setSearch]         = useState("");
  const [dragSrc, setDragSrc]       = useState(null); // { widgetId, fromRight, fromIdx }
  const [dropTarget, setDropTarget] = useState(null); // index in right pane
  const [confirmClose, setConfirmClose] = useState(false);
  const searchRef = useRef(null);

  // Load saved layout (or role default) on open. Pass role so a super_admin
  // previewing as "manager" sees the manager default, not their saved admin
  // layout.
  useEffect(() => {
    let cancelled = false;
    const refresh = () => window.loadSidebarLayout(role).then(l => {
      if (!cancelled) setLayout((l || []).filter(item => item.kind !== "stat" && (item.label || "").toLowerCase().trim() !== "start coaching" && !(item.id || "").includes("start-coaching")));
    });
    refresh();
    // Focus search on open (keyboard a11y)
    setTimeout(() => searchRef.current?.focus(), 80);
    const onIdentity = () => refresh();
    window.addEventListener("me:loaded", onIdentity);
    return () => {
      cancelled = true;
      window.removeEventListener("me:loaded", onIdentity);
    };
  }, [role]);

  // Escape key → close (with dirty guard).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") handleClose();
      if (e.key === "Backspace" && document.activeElement?.dataset?.widgetIdx != null) {
        const idx = +document.activeElement.dataset.widgetIdx;
        removeItem(idx);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function handleClose() {
    if (dirty) { setConfirmClose(true); return; }
    onClose();
  }

  function removeItem(idx) {
    setLayout(l => { const n = [...l]; n.splice(idx, 1); return n; });
    setDirty(true);
  }

  function addItem(widget) {
    if (layout.find(i => i.id === widget.id)) return; // no duplicates
    setLayout(l => [...l, widget]);
    setDirty(true);
  }

  // ── HTML5 Drag-and-Drop ────────────────────────────────────────────────────

  function onLibDragStart(e, widget) {
    setDragSrc({ widgetId: widget.id, fromRight: false });
    e.dataTransfer.setData("text/plain", widget.id);
    e.dataTransfer.effectAllowed = "copy";
  }

  function onRightDragStart(e, idx) {
    setDragSrc({ widgetId: layout[idx].id, fromRight: true, fromIdx: idx });
    e.dataTransfer.effectAllowed = "move";
  }

  function onRightDragOver(e, idx) {
    e.preventDefault();
    e.dataTransfer.dropEffect = dragSrc?.fromRight ? "move" : "copy";
    setDropTarget(idx);
  }

  function onRightDrop(e, atIdx) {
    e.preventDefault();
    setDropTarget(null);
    if (!dragSrc) return;

    if (!dragSrc.fromRight) {
      // Adding from library
      const all = _flatWidgets();
      const widget = all.find(w => w.id === dragSrc.widgetId);
      if (!widget || layout.find(i => i.id === widget.id)) return;
      setLayout(l => {
        const n = [...l];
        n.splice(atIdx, 0, widget);
        return n;
      });
    } else {
      // Reordering within right pane
      const from = dragSrc.fromIdx;
      if (from === atIdx) return;
      setLayout(l => {
        const n = [...l];
        const [moved] = n.splice(from, 1);
        n.splice(atIdx > from ? atIdx - 1 : atIdx, 0, moved);
        return n;
      });
    }
    setDragSrc(null);
    setDirty(true);
  }

  function onRightDragEnd() {
    setDragSrc(null);
    setDropTarget(null);
  }

  function onDropZoneDrop(e) {
    e.preventDefault();
    setDropTarget(null);
    if (!dragSrc || dragSrc.fromRight) return;
    const all = _flatWidgets();
    const widget = all.find(w => w.id === dragSrc.widgetId);
    if (!widget || layout.find(i => i.id === widget.id)) return;
    setLayout(l => [...l, widget]);
    setDragSrc(null);
    setDirty(true);
  }

  // ── Save / Reset ────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    await window.saveSidebarLayout(layout.filter(item => item.kind !== "stat"), role);
    setSaving(false);
    setDirty(false);
    onClose();
  }

  async function handleReset() {
    setSaving(true);
    const defaultLayout = await window.resetSidebarLayout(role);
    setLayout(defaultLayout || []);
    setSaving(false);
    setDirty(false);
  }

  // ── Widget library (role-filtered) ──────────────────────────────────────────
  // `role` is the CURRENT view role (could be a super_admin previewing as
  // manager via the role-switch). The library is filtered to what that role
  // can actually use — admin widgets only for super_admin, ag-ops only for
  // manager/owner/rep, etc.

  const roleFilteredRegistry = window.widgetsForRole?.(role) || window.SIDEBAR_WIDGETS || {};

  function _flatWidgets() {
    return Object.values(roleFilteredRegistry).flat();
  }

  const catWidgets = (roleFilteredRegistry[catTab] || []).filter(w =>
    !search || w.label.toLowerCase().includes(search.toLowerCase())
  );

  const inLayout = new Set(layout.map(i => i.id));

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div
      className="sw-overlay"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label="Customize sidebar"
    >
      <div className="sw-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sw-header">
          <div style={{ fontWeight: 600, fontSize: 14 }}>
            Customize sidebar
            {role && (
              <span style={{ marginLeft: 8, fontSize: 11, color: "var(--text-tertiary)", textTransform: "capitalize", fontWeight: 400 }}>
                — {String(role).replace("_", " ")} view
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 12 }}
              onClick={handleReset}
              disabled={saving}
              title="Reset to role default"
            >
              Reset
            </button>
            <button
              className="btn btn-primary"
              style={{ fontSize: 12 }}
              onClick={handleSave}
              disabled={saving || !dirty}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button className="icon-btn" onClick={handleClose} title="Close">
              <Icons.X size={14}/>
            </button>
          </div>
        </div>

        {/* Body — two panes */}
        <div className="sw-body">
          {/* Left: widget library */}
          <div className="sw-library">
            <div style={{ padding: "0 12px 10px" }}>
              <input
                ref={searchRef}
                className="sw-search"
                placeholder="Search widgets…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                aria-label="Search widgets"
              />
            </div>
            {/* Category tabs */}
            <div className="sw-cat-tabs" role="tablist">
              {CATEGORIES.map(c => (
                <button
                  key={c.key}
                  role="tab"
                  aria-selected={catTab === c.key}
                  className={`sw-cat-tab ${catTab === c.key ? "active" : ""}`}
                  onClick={() => setCatTab(c.key)}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {/* Widget list */}
            <div className="sw-lib-list">
              {catWidgets.length === 0 && (
                <div style={{ padding: "20px 12px", fontSize: 12, color: "var(--text-tertiary)" }}>
                  No widgets found.
                </div>
              )}
              {catWidgets.map(w => {
                const already = inLayout.has(w.id);
                return (
                  <div
                    key={w.id}
                    className={`sw-lib-item ${already ? "already-in" : ""}`}
                    draggable={!isTouch() && !already}
                    onDragStart={!isTouch() ? e => onLibDragStart(e, w) : undefined}
                    title={already ? "Already in your sidebar" : `Drag or click + to add "${w.label}"`}
                  >
                    <WidgetPreview item={w}/>
                    {!already && (
                      <button
                        className="sw-add-btn"
                        onClick={() => addItem(w)}
                        aria-label={`Add ${w.label}`}
                        tabIndex={0}
                        onKeyDown={e => e.key === "Enter" && addItem(w)}
                      >
                        <Icons.Plus size={11}/>
                      </button>
                    )}
                    {already && (
                      <span style={{ fontSize: 10, color: "var(--accent-money)", opacity: 0.7, paddingRight: 4 }}>✓</span>
                    )}
                    {!isTouch() && !already && (
                      <span className="sw-drag-hint">drag</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: current layout */}
          <div
            className="sw-layout-pane"
            onDragOver={e => { e.preventDefault(); }}
            onDrop={onDropZoneDrop}
          >
            <div className="sw-layout-header">
              Your sidebar
              <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginLeft: 6 }}>
                {layout.length} item{layout.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="sw-layout-list" role="list">
              {layout.length === 0 && (
                <div className="sw-drop-hint">
                  {isTouch() ? "Tap + to add widgets" : "Drag widgets here"}
                </div>
              )}
              {layout.map((item, idx) => (
                <div
                  key={item.id}
                  role="listitem"
                  className={`sw-layout-item ${dropTarget === idx ? "drop-before" : ""}`}
                  draggable={!isTouch()}
                  data-widget-idx={idx}
                  tabIndex={0}
                  onDragStart={!isTouch() ? e => onRightDragStart(e, idx) : undefined}
                  onDragOver={!isTouch() ? e => onRightDragOver(e, idx) : undefined}
                  onDrop={!isTouch() ? e => onRightDrop(e, idx) : undefined}
                  onDragEnd={!isTouch() ? onRightDragEnd : undefined}
                  aria-label={item.label}
                >
                  {!isTouch() && (
                    <Icons.GripVertical size={12} style={{ color: "var(--text-tertiary)", flexShrink: 0, cursor: "grab" }}/>
                  )}
                  <WidgetPreview item={item}/>
                  <span className="sw-item-kind">{item.kind}</span>
                  <button
                    className="sw-remove-btn"
                    onClick={() => removeItem(idx)}
                    aria-label={`Remove ${item.label}`}
                    title="Remove"
                    tabIndex={0}
                  >
                    <Icons.X size={11}/>
                  </button>
                </div>
              ))}
              {/* Drop zone at end of list */}
              {layout.length > 0 && !isTouch() && (
                <div
                  className={`sw-drop-zone ${dropTarget === layout.length ? "active" : ""}`}
                  onDragOver={e => { e.preventDefault(); setDropTarget(layout.length); }}
                  onDrop={onDropZoneDrop}
                >
                  + drop here
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Confirm discard dialog */}
      {confirmClose && (
        <div className="sw-confirm-overlay" onClick={e => e.stopPropagation()}>
          <div className="sw-confirm-box">
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Discard changes?</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 16 }}>
              Your sidebar layout hasn't been saved.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setConfirmClose(false)}>Keep editing</button>
              <button className="btn btn-danger" style={{ fontSize: 12 }} onClick={() => { setConfirmClose(false); onClose(); }}>Discard</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

window.SidebarComposer = SidebarComposer;

/* ────────────────── Composer Styles (injected once) ──────────────────────── */
(function injectComposerStyles() {
  if (document.getElementById("sw-styles")) return;
  const s = document.createElement("style");
  s.id = "sw-styles";
  s.textContent = `
    .sw-overlay {
      position: fixed; inset: 0; z-index: 1000;
      background: color-mix(in oklch, black 55%, transparent);
      display: flex; align-items: center; justify-content: center;
      padding: 24px;
    }
    .sw-modal {
      background: var(--bg-base, #0e1012);
      border: 1px solid var(--border-subtle, #2a2d32);
      border-radius: 10px;
      width: min(820px, 100%);
      max-height: min(640px, calc(100vh - 48px));
      display: flex; flex-direction: column;
      overflow: hidden;
      box-shadow: 0 24px 64px color-mix(in oklch, black 50%, transparent);
    }
    .sw-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 14px 16px;
      border-bottom: 1px solid var(--border-subtle, #2a2d32);
      flex-shrink: 0;
    }
    .sw-body {
      display: flex; flex: 1; overflow: hidden;
    }
    .sw-library {
      width: 280px; flex-shrink: 0;
      border-right: 1px solid var(--border-subtle, #2a2d32);
      display: flex; flex-direction: column; overflow: hidden;
      padding-top: 10px;
    }
    .sw-search {
      width: 100%; box-sizing: border-box;
      background: var(--bg-raised, #1a1d21);
      border: 1px solid var(--border-subtle, #2a2d32);
      border-radius: 6px;
      color: var(--text-primary, #e8eaed);
      font-size: 12px; padding: 6px 10px;
      outline: none;
    }
    .sw-search:focus { border-color: var(--accent-money, #00d4aa); }
    .sw-cat-tabs {
      display: flex; gap: 0; padding: 0 12px; margin-bottom: 4px; flex-shrink: 0;
    }
    .sw-cat-tab {
      flex: 1; padding: 6px 4px; font-size: 11px;
      background: none; border: none; cursor: pointer;
      color: var(--text-tertiary, #6b7280); border-bottom: 2px solid transparent;
      transition: color 120ms, border-color 120ms;
    }
    .sw-cat-tab.active, .sw-cat-tab:hover {
      color: var(--text-primary, #e8eaed); border-bottom-color: var(--accent-money, #00d4aa);
    }
    .sw-lib-list { flex: 1; overflow-y: auto; padding: 4px 0; }
    .sw-lib-item {
      display: flex; align-items: center; gap: 6px;
      padding: 7px 12px; cursor: grab;
      transition: background 100ms;
      font-size: 12.5px; color: var(--text-primary, #e8eaed);
    }
    .sw-lib-item:hover { background: var(--bg-raised, #1a1d21); }
    .sw-lib-item.already-in { opacity: 0.45; cursor: default; }
    .sw-drag-hint {
      font-size: 9px; color: var(--text-tertiary, #6b7280);
      margin-left: auto; opacity: 0; transition: opacity 100ms;
      letter-spacing: 0.02em; text-transform: uppercase;
    }
    .sw-lib-item:hover .sw-drag-hint { opacity: 1; }
    .sw-add-btn {
      margin-left: auto; width: 20px; height: 20px; border-radius: 4px;
      background: var(--bg-raised, #1a1d21); border: 1px solid var(--border-subtle, #2a2d32);
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      color: var(--accent-money, #00d4aa); flex-shrink: 0;
      transition: background 100ms, border-color 100ms;
    }
    .sw-add-btn:hover { background: color-mix(in oklch, var(--accent-money, #00d4aa) 15%, transparent); border-color: var(--accent-money, #00d4aa); }
    .sw-layout-pane {
      flex: 1; display: flex; flex-direction: column; overflow: hidden;
    }
    .sw-layout-header {
      padding: 14px 16px 10px; font-size: 12px; font-weight: 600;
      color: var(--text-secondary, #9ca3af); flex-shrink: 0;
    }
    .sw-layout-list {
      flex: 1; overflow-y: auto; padding: 0 12px 12px;
    }
    .sw-drop-hint {
      margin: 40px 0; text-align: center;
      font-size: 12px; color: var(--text-tertiary, #6b7280);
      border: 1.5px dashed var(--border-subtle, #2a2d32);
      border-radius: 8px; padding: 24px;
    }
    .sw-layout-item {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 10px; border-radius: 6px; margin-bottom: 3px;
      background: var(--bg-raised, #1a1d21);
      border: 1px solid var(--border-subtle, #2a2d32);
      cursor: grab; transition: border-color 100ms, background 100ms;
      font-size: 12.5px; color: var(--text-primary, #e8eaed);
      outline: none;
    }
    .sw-layout-item:focus { border-color: var(--accent-money, #00d4aa); }
    .sw-layout-item:hover { background: color-mix(in oklch, var(--bg-raised, #1a1d21) 80%, var(--accent-money, #00d4aa) 4%); }
    .sw-layout-item.drop-before {
      border-top: 2px solid var(--accent-money, #00d4aa);
    }
    .sw-item-kind {
      margin-left: auto; font-size: 9.5px; color: var(--text-tertiary, #6b7280);
      text-transform: uppercase; letter-spacing: 0.04em;
    }
    .sw-remove-btn {
      background: none; border: none; cursor: pointer;
      color: var(--text-tertiary, #6b7280); display: flex; align-items: center;
      padding: 2px; border-radius: 3px; transition: color 100ms, background 100ms;
      flex-shrink: 0;
    }
    .sw-remove-btn:hover { color: var(--state-danger, #ef4444); background: color-mix(in oklch, var(--state-danger, #ef4444) 15%, transparent); }
    .sw-drop-zone {
      border: 1.5px dashed var(--border-subtle, #2a2d32); border-radius: 6px;
      padding: 8px; text-align: center; font-size: 11px;
      color: var(--text-tertiary, #6b7280); margin-top: 4px;
      transition: border-color 100ms, background 100ms;
    }
    .sw-drop-zone.active {
      border-color: var(--accent-money, #00d4aa);
      background: color-mix(in oklch, var(--accent-money, #00d4aa) 8%, transparent);
    }
    .sw-confirm-overlay {
      position: absolute; inset: 0; background: color-mix(in oklch, black 40%, transparent);
      display: flex; align-items: center; justify-content: center; border-radius: 10px;
    }
    .sw-confirm-box {
      background: var(--bg-base, #0e1012);
      border: 1px solid var(--border-subtle, #2a2d32);
      border-radius: 8px; padding: 20px; min-width: 280px;
    }
    .sw-preview-label {
      display: flex; align-items: center; font-size: 12.5px;
    }
    @media (max-width: 600px) {
      .sw-modal { width: 100%; max-height: 100vh; border-radius: 0; }
      .sw-body { flex-direction: column; }
      .sw-library { width: 100%; max-height: 50%; border-right: none; border-bottom: 1px solid var(--border-subtle, #2a2d32); }
    }
  `;
  document.head.appendChild(s);
})();
