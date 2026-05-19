/* Mobile rep view — swipe-to-act on real data.
   Scope cards to "my queue" (own pipeline rows + unassigned inbound)
   instead of the global QUEUE. Resolves the rep identity via me() so SMS
   bodies and outbound dials use the actual signed-in producer rather than
   the seeded Marcus row. */
function MobileRep({ onExitMobile } = {}) {
  const [tab, setTab] = React.useState("dial");
  const [drag, setDrag] = React.useState({ x: 0, y: 0 });
  const [actionFlash, setActionFlash] = React.useState(null);
  const startRef = React.useRef(null);
  const [hydrated, setHydrated] = React.useState(!!window.AppData);
  const [vaultCat, setVaultCat] = React.useState("scripts");
  const [vaultQ, setVaultQ] = React.useState("");
  const [vaultOpenScript, setVaultOpenScript] = React.useState(null);

  React.useEffect(() => {
    const onHydrate = () => setHydrated(true);
    window.addEventListener("data:hydrated", onHydrate);
    return () => window.removeEventListener("data:hydrated", onHydrate);
  }, []);

  if (!hydrated) {
    return <div className="mobile-stage"><div className="mobile-frame" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)" }}>Loading Repflow...</div></div>;
  }

  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  const myRepId = meIdent?.rep_id || (AppData.REPS && AppData.REPS[0] && AppData.REPS[0].id);
  const myFirst = (meIdent?.full_name || (AppData.REPS && AppData.REPS[0]?.name) || "your producer").split(" ")[0];

  // Mirror desktop PagePipeline's in-session state when present. The pipe
  // tab and the dial-queue cards both apply these so optimistic edits the
  // user just made on desktop don't disappear when they hop to mobile.
  const [session, setSession] = React.useState(() => (typeof window !== "undefined" ? window.PipelineSession : null) || null);
  React.useEffect(() => {
    const fn = (e) => setSession(e.detail || null);
    window.addEventListener("pipeline:session", fn);
    return () => window.removeEventListener("pipeline:session", fn);
  }, []);

  const applySession = React.useCallback((rows) => {
    if (!session) return rows;
    const { extra = [], overrides = {}, filters } = session;
    const merged = [...extra, ...rows].map(p => overrides[p.id] ? { ...p, ...overrides[p.id] } : p);
    if (!filters) return merged;
    return merged.filter(p =>
      (filters.stage  === "all" || p.stage  === filters.stage) &&
      (filters.heat   === "all" || p.heat   === filters.heat) &&
      (filters.owner  === "all" || p.owner  === filters.owner) &&
      (filters.state  === "all" || p.state  === filters.state) &&
      (filters.source === "all" || p.source === filters.source) &&
      (p.days == null || p.days <= filters.maxDays)
    );
  }, [session]);

  const buildCards = React.useCallback(() => {
    const base = applySession(AppData.PIPELINE || []);
    const myPipe = base
      .filter(p => p.owner === myRepId && (p.stage === "New" || p.stage === "Contacted"))
      .map(p => ({
        id: "p-" + p.id, lead: p.lead, age: p.age, state: p.state,
        source: p.source, product: p.product, phone: p.phone || null,
        score: p.heat === "hot" ? 92 : p.heat === "fresh" ? 88 : p.heat === "warm" ? 78 : 60,
      }));
    const inbound = (AppData.QUEUE || []).map(q => ({ ...q, _inbound: true }));
    return [...myPipe, ...inbound].slice(0, 8);
  }, [myRepId, applySession]);

  const [cards, setCards] = React.useState(buildCards);
  React.useEffect(() => {
    setCards(buildCards());
    const refresh = () => setCards(buildCards());
    window.addEventListener("data:hydrated", refresh);
    window.addEventListener("data:mutated", refresh);
    window.addEventListener("data:realtime", refresh);
    return () => {
      window.removeEventListener("data:hydrated", refresh);
      window.removeEventListener("data:mutated", refresh);
      window.removeEventListener("data:realtime", refresh);
    };
  }, [buildCards]);

  const top = cards[0];

  const onPtrDown = (e) => { startRef.current = { x: e.clientX, y: e.clientY }; };
  const onPtrMove = (e) => {
    if (!startRef.current) return;
    setDrag({ x: e.clientX - startRef.current.x, y: e.clientY - startRef.current.y });
  };
  const onPtrUp = () => {
    if (!startRef.current) return;
    const { x, y } = drag;
    const ax = Math.abs(x), ay = Math.abs(y);
    if (Math.max(ax, ay) > 80) {
      const dir = ax > ay ? (x > 0 ? "right" : "left") : (y < 0 ? "up" : "down");
      handleSwipe(dir, top);
    }
    startRef.current = null;
    setDrag({ x: 0, y: 0 });
  };

  const handleSwipe = (dir, lead) => {
    if (!lead) return;
    const phone = lead.phone || null;
    if (dir === "right") {
      // Dial — only when we have a real phone on file
      if (!phone) {
        window.toast && window.toast(`No phone on file for ${lead.lead}`, "warn");
        flash("right", "NO #");
        return;
      }
      window.repflowDial && window.repflowDial(phone, lead.lead);
      flash("right", "DIAL");
    } else if (dir === "left") {
      window.toast && window.toast(`Skipped ${lead.lead}`, "info");
      flash("left", "SKIP");
    } else if (dir === "up") {
      if (!phone) {
        window.toast && window.toast(`No phone on file for ${lead.lead}`, "warn");
        flash("up", "NO #");
        return;
      }
      const sms = `sms:${phone}?body=${encodeURIComponent("Hi " + (lead.lead || "").split(" ")[0] + ", this is " + myFirst + " — got a sec to talk " + (lead.product || "Medicare") + "?")}`;
      window.location.href = sms;
      flash("up", "SMS");
    } else if (dir === "down") {
      setCards(c => [...c.slice(1), c[0]]);
      window.toast && window.toast(`${lead.lead} re-queued`, "info");
      flash("down", "LATER");
      return;
    }
    setCards(c => c.slice(1));
  };

  const flash = (dir, label) => {
    setActionFlash({ dir, label });
    setTimeout(() => setActionFlash(null), 700);
  };

  const dir = drag.x > 40 ? "right" : drag.x < -40 ? "left" : drag.y < -40 ? "up" : drag.y > 40 ? "down" : null;

  return (
    <div className="mobile-stage">
      {onExitMobile && (
        <button
          type="button"
          onClick={onExitMobile}
          aria-label="Back to desktop"
          className="mobile-exit-pill"
          style={{
            position: "fixed", top: 14, left: 14, zIndex: 100,
            height: 32, padding: "0 12px",
            background: "rgba(20,22,28,0.7)",
            WebkitBackdropFilter: "blur(20px)", backdropFilter: "blur(20px)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 999,
            color: "#ddd", fontSize: 12, fontFamily: "var(--font-ui)",
            display: "inline-flex", alignItems: "center", gap: 6,
            cursor: "pointer",
          }}>
          ← Desktop
        </button>
      )}
      <div className="mobile-frame">
        <div className="m-statusbar">
          <span>9:41</span>
          <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <Icons.Bolt size={11}/> <Icons.Volume size={11}/>
          </span>
        </div>

        <div className="m-content">
          {tab === "dial" && (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "4px 0 14px" }}>
                <div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}>Dial Queue</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{cards.length} fresh · swipe → dial · ← skip · ↑ SMS · ↓ later</div>
                </div>
                <div className="lb-pill" style={{ padding: "3px 8px" }}>
                  <Icons.Trophy size={11} style={{ color: "var(--accent-status)" }}/>
                  <span className="rank tabular">#3</span>
                  <span className="delta-up tabular"><Icons.ArrowUp size={9}/>2</span>
                </div>
              </div>

              <div className="cardstack">
                {cards.length === 0 && (
                  <div className="swipe-card" style={{ alignItems: "center", justifyContent: "center", textAlign: "center" }}>
                    <Icons.Sparkles size={20} style={{ color: "var(--accent-money)" }}/>
                    <div style={{ fontSize: 14, fontWeight: 500, marginTop: 6 }}>Queue empty</div>
                    <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Pull from AEP pool?</div>
                    <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setCards((AppData.QUEUE || []).slice(0, 6))}>Pull 6 leads</button>
                  </div>
                )}
                {cards.slice(0, 3).reverse().map((c, idx, arr) => {
                  const isTop = idx === arr.length - 1;
                  const offset = (arr.length - 1 - idx);
                  const transform = isTop
                    ? `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x * 0.04}deg)`
                    : `translateY(${offset * 8}px) scale(${1 - offset * 0.04})`;
                  const phone = "+1512555" + String(c.id || "").replace(/\D/g, "").padStart(4, "0").slice(0, 4);
                  return (
                    <div key={c.id} className="swipe-card" style={{ transform, zIndex: idx, transition: isTop && !startRef.current ? "transform 200ms var(--ease-spring)" : "none" }}
                         onPointerDown={isTop ? onPtrDown : undefined}
                         onPointerMove={isTop ? onPtrMove : undefined}
                         onPointerUp={isTop ? onPtrUp : undefined}
                         onPointerCancel={isTop ? onPtrUp : undefined}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span className="chip chip-money" style={{ fontSize: 10 }}>LeadiD ✓</span>
                        <span className="tabular mono" style={{ fontSize: 11, color: c.elapsed < 30 ? "var(--accent-money)" : "var(--state-warning)" }}>
                          <Icons.Clock size={10}/> {c.elapsed}s SLA
                        </span>
                      </div>
                      <div>
                        <div style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em" }}>{c.lead}</div>
                        <div style={{ color: "var(--text-tertiary)", fontSize: 12 }}>{c.age} · {c.state} · {c.product}</div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <span className="chip">{c.source}</span>
                        <span className="chip chip-info">Score {c.score}</span>
                      </div>
                      <div style={{ flex: 1, display: "grid", placeItems: "center" }}>
                        <button className="btn btn-primary" style={{ width: 80, height: 80, borderRadius: "50%", padding: 0 }} onClick={() => isTop && handleSwipe("right", c)}>
                          <Icons.Phone size={28}/>
                        </button>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 10.5, color: "var(--text-tertiary)" }}>
                        <div>← Skip</div>
                        <div style={{ textAlign: "right" }}>Dial →</div>
                        <div>↓ Later</div>
                        <div style={{ textAlign: "right" }}>↑ SMS</div>
                      </div>
                      {isTop && dir && (
                        <div style={{ position: "absolute", inset: 14, pointerEvents: "none", display: "grid", placeItems: "center" }}>
                          <div style={{ padding: "6px 14px", borderRadius: 6, fontWeight: 700, fontSize: 16, letterSpacing: "0.05em", textTransform: "uppercase",
                            background: dir === "right" ? "color-mix(in oklch, var(--accent-money) 25%, transparent)" : dir === "left" ? "color-mix(in oklch, var(--state-danger) 25%, transparent)" : "color-mix(in oklch, var(--state-info) 25%, transparent)",
                            color: dir === "right" ? "var(--accent-money)" : dir === "left" ? "var(--state-danger)" : "var(--state-info)" }}>
                            {dir === "right" ? "DIAL" : dir === "left" ? "SKIP" : dir === "up" ? "SMS" : "LATER"}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {actionFlash && (
                <div style={{ position: "fixed", inset: 0, pointerEvents: "none", display: "grid", placeItems: "center", animation: "rise 240ms var(--ease-out)" }}>
                  <div style={{ padding: "12px 24px", borderRadius: 999, fontSize: 18, fontWeight: 700, color: actionFlash.dir === "right" ? "var(--accent-money)" : actionFlash.dir === "left" ? "var(--state-danger)" : "var(--state-info)", background: "color-mix(in oklch, var(--bg-elevated) 90%, transparent)", border: "1px solid var(--border-strong)" }}>{actionFlash.label}</div>
                </div>
              )}
            </>
          )}

          {tab === "pipe" && (() => {
            // Mobile mirror of the desktop pipeline list. When the desktop
            // PagePipeline is mounted, we honor its filters / overrides /
            // extra / openLead so the rep sees the same scoped view they
            // were just working in. With no session, fall back to the
            // rep's own pipeline (own deals across all stages).
            const heatColor = (h) => h === "hot" ? "var(--accent-heat)" : h === "warm" ? "var(--state-warning)" : h === "fresh" ? "var(--accent-money)" : "var(--text-quaternary)";
            const base = applySession(AppData.PIPELINE || []);
            const rows = session
              ? base
              : base.filter(p => p.owner === myRepId);
            const open = session?.openLead || null;
            const subtitle = session
              ? `Mirroring desktop · ${rows.length} active`
              : `My pipeline · ${rows.length} active`;
            return (
              <>
                <div style={{ margin: "4px 0 10px" }}>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}>Pipeline</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{subtitle}</div>
                </div>
                {open && (
                  <div style={{ padding: 10, marginBottom: 10, background: "var(--bg-raised)", border: "1px solid var(--border-subtle)", borderRadius: 8 }}>
                    <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Open on desktop</div>
                    <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{open.lead}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{open.stage} · {open.product} · {open.days}d in stage</div>
                  </div>
                )}
                <div className="panel">
                  {rows.length === 0 && (
                    <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "var(--text-tertiary)" }}>No matching leads.</div>
                  )}
                  {rows.slice(0, 40).map(p => (
                    <div key={p.id}
                      className="row"
                      style={{ gridTemplateColumns: "12px 1fr 60px", height: 56, padding: "0 12px", gap: 8, alignItems: "center", borderBottom: "1px solid var(--border-subtle)" }}
                      onClick={() => { if (p.phone) { window.repflowDial && window.repflowDial(p.phone, p.lead); } else { window.toast && window.toast(`No phone on file for ${p.lead}`, "warn"); } }}>
                      <span className="dot" style={{ background: heatColor(p.heat), width: 8, height: 8, borderRadius: 999 }}></span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.lead}</div>
                        <div style={{ fontSize: 11, color: "var(--text-tertiary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.stage} · {p.product}</div>
                      </div>
                      <div className="tabular" style={{ textAlign: "right", fontSize: 11, color: p.days > 5 ? "var(--state-danger)" : "var(--text-tertiary)" }}>{p.days != null ? `${p.days}d` : "—"}</div>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}

          {tab === "lb" && (
            <>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", margin: "4px 0 4px" }}>Leaderboard</div>
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginBottom: 14 }}>Atlas · MTD · live</div>
              <div className="panel">
                {[...AppData.REPS].sort((a,b) => b.mtd - a.mtd).slice(0, 6).map((r, i) => (
                  <div key={r.id} className="row" style={{ gridTemplateColumns: "24px 1fr 80px", height: 50, padding: "0 12px" }}>
                    <span className="tabular" style={{ fontWeight: 600, color: i < 3 ? "var(--accent-status)" : "var(--text-tertiary)" }}>{i + 1}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Shared.Avatar rep={r} size={24}/>
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 500 }}>{r.name}</div>
                        <Shared.TierChip tier={r.tier} compact/>
                      </div>
                    </div>
                    <div className="tabular" style={{ textAlign: "right", fontWeight: 500, fontSize: 13 }}>${(r.mtd/1000).toFixed(1)}k</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === "vault" && (() => {
            // Mobile vault — focused on the high-frequency mid-call surfaces:
            // Scripts (tap to expand + copy with live-call token sub),
            // Videos / Docs / Carriers / Links (tap to open).
            // Mirrors PageVault's roleAllowed filter and vaultSubstitute()
            // tokens so the rep sees the same content the desktop scopes.
            const role = meIdent?.role || "rep";
            const roleOk = (target) => {
              if (!Array.isArray(target) || target.length === 0) return true;
              if (role === "super_admin" || role === "owner") return true;
              return target.includes(role);
            };
            const sub = (body) => {
              if (!body) return "";
              const map = {
                lead_name: "your lead", lead_first: "your lead", lead_state: "your state",
                product: "your coverage",
                rep_first: myFirst, rep_full: meIdent?.full_name || myFirst,
                agency: meIdent?.agency_name || "the agency",
                n_orgs: "8", n_plans: "32",
              };
              return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (full, k) => map[k.toLowerCase()] != null ? map[k.toLowerCase()] : full);
            };
            const A = (k) => (window.AppData && window.AppData[k]) || [];
            const ql = vaultQ.trim().toLowerCase();
            const m = (s) => !ql || (s || "").toLowerCase().includes(ql);

            const scripts  = A("SCRIPTS_LIB").filter(s => roleOk(s.targetRoles)).filter(s => m(s.title) || m(s.body) || m(s.cat));
            const videos   = A("VIDEOS").filter(v => m(v.title) || m(v.cat));
            const docs     = A("DOCS").filter(d => roleOk(d.targetRoles)).filter(d => m(d.title) || m(d.cat) || m(d.text));
            const carriers = A("CARRIERS").filter(c => m(c.name) || m(c.category || ""));
            const links    = A("QUICK_LINKS").filter(l => m(l.label) || m(l.cat));

            const cats = [
              { k: "scripts",  l: "Scripts",  n: scripts.length },
              { k: "videos",   l: "Videos",   n: videos.length },
              { k: "docs",     l: "Docs",     n: docs.length },
              { k: "carriers", l: "Carriers", n: carriers.length },
              { k: "links",    l: "Links",    n: links.length },
            ];

            const copyScript = (s) => {
              try {
                navigator.clipboard.writeText(sub(s.body));
                window.toast && window.toast("Script copied", "success");
              } catch (_e) {}
            };
            const openExternal = (url) => { if (url) window.open(url, "_blank", "noopener"); };

            const activeRows = vaultCat === "scripts" ? scripts
              : vaultCat === "videos"   ? videos
              : vaultCat === "docs"     ? docs
              : vaultCat === "carriers" ? carriers
              : vaultCat === "links"    ? links
              : [];

            return (
              <>
                <div style={{ margin: "4px 0 10px" }}>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}>Vault</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>Scripts · videos · docs · carriers · links</div>
                </div>
                <input
                  className="text-input"
                  type="search"
                  placeholder="Search the vault…"
                  value={vaultQ}
                  onChange={(e) => setVaultQ(e.target.value)}
                  style={{ width: "100%", marginBottom: 10 }}
                />
                <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 10, paddingBottom: 2 }}>
                  {cats.map(c => (
                    <button
                      key={c.k}
                      className={`chip ${vaultCat === c.k ? "chip-info" : ""}`}
                      onClick={() => setVaultCat(c.k)}
                      style={{ flexShrink: 0, cursor: "pointer", border: 0 }}>
                      {c.l} · {c.n}
                    </button>
                  ))}
                </div>

                {vaultCat === "scripts" && (
                  <div className="panel">
                    {scripts.length === 0 && <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "var(--text-tertiary)" }}>No scripts.</div>}
                    {scripts.map(s => {
                      const open = vaultOpenScript === s.id;
                      return (
                        <div key={s.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                          <div
                            onClick={() => setVaultOpenScript(open ? null : s.id)}
                            style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", cursor: "pointer" }}>
                            <Icons.FileText size={13} style={{ color: "var(--text-tertiary)", flexShrink: 0 }}/>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</div>
                              {s.cat && <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{s.cat}</div>}
                            </div>
                            <button className="icon-btn" onClick={(e) => { e.stopPropagation(); copyScript(s); }} title="Copy"><Icons.Copy size={13}/></button>
                          </div>
                          {open && (
                            <div style={{ padding: "0 12px 12px 30px", fontSize: 12, color: "var(--text-secondary)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                              {sub(s.body)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {vaultCat === "videos" && (
                  <div className="panel">
                    {videos.length === 0 && <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "var(--text-tertiary)" }}>No videos.</div>}
                    {videos.map(v => (
                      <div key={v.id}
                        onClick={() => openExternal(v.url)}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px", borderBottom: "1px solid var(--border-subtle)", cursor: "pointer" }}>
                        <Icons.Video size={14} style={{ color: "var(--text-tertiary)", flexShrink: 0 }}/>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.title}</div>
                          {v.cat && <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{v.cat}{v.duration ? ` · ${v.duration}` : ""}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {vaultCat === "docs" && (
                  <div className="panel">
                    {docs.length === 0 && <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "var(--text-tertiary)" }}>No docs.</div>}
                    {docs.map(d => (
                      <div key={d.id}
                        onClick={() => d.url && openExternal(d.url)}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px", borderBottom: "1px solid var(--border-subtle)", cursor: d.url ? "pointer" : "default" }}>
                        <Icons.Folder size={14} style={{ color: "var(--text-tertiary)", flexShrink: 0 }}/>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.title}</div>
                          {d.cat && <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{d.cat}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {vaultCat === "carriers" && (
                  <div className="panel">
                    {carriers.length === 0 && <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "var(--text-tertiary)" }}>No carriers.</div>}
                    {carriers.map(c => (
                      <div key={c.id || c.name}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px", borderBottom: "1px solid var(--border-subtle)" }}>
                        <Icons.Shield size={14} style={{ color: "var(--text-tertiary)", flexShrink: 0 }}/>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                          {c.category && <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{c.category}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {vaultCat === "links" && (
                  <div className="panel">
                    {links.length === 0 && <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "var(--text-tertiary)" }}>No links.</div>}
                    {links.map(l => (
                      <div key={l.id || l.label}
                        onClick={() => openExternal(l.url)}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px", borderBottom: "1px solid var(--border-subtle)", cursor: "pointer" }}>
                        <Icons.ArrowUpRight size={14} style={{ color: "var(--text-tertiary)", flexShrink: 0 }}/>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.label}</div>
                          {l.cat && <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{l.cat}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            );
          })()}

          {tab === "me" && (() => {
            // Real signed-in identity only. We don't borrow REPS[0] anymore —
            // that's how new accounts ended up showing Marcus's name.
            const matchedRep = myRepId ? (AppData.REPS || []).find(r => r.id === myRepId) : null;
            const meRep = matchedRep || (meIdent
              ? { id: meIdent.rep_id || "viewer", name: meIdent.full_name || myFirst, tier: meIdent.tier || "bronze" }
              : { id: "viewer", name: myFirst, tier: "bronze" });
            const mtd = matchedRep?.mtd || 0;
            const displayName = meIdent?.full_name || matchedRep?.name || myFirst;
            const displayTier = meIdent?.tier || matchedRep?.tier || "bronze";
            const agencyLine = meIdent?.agency_name || (meIdent?.is_demo ? "Demo · Atlas seed" : null);
            return (
            <>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 0" }}>
                <Shared.Avatar rep={meRep} size={64}/>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 600, marginTop: 10 }}>{displayName}</div>
                {agencyLine && <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>{agencyLine}</div>}
                <Shared.TierChip tier={displayTier}/>
                <div className="tabular" style={{ fontFamily: "var(--font-display)", fontSize: 44, fontWeight: 600, letterSpacing: "-0.03em", marginTop: 16 }}>${mtd.toLocaleString()}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>MTD · keep going</div>
                <div style={{ width: "100%", height: 6, background: "var(--bg-raised)", borderRadius: 3, marginTop: 12, overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(100, mtd / 600)}%`, height: "100%", background: "linear-gradient(90deg, var(--tier-platinum), var(--tier-diamond))" }}></div>
                </div>
              </div>
              <button className="btn btn-ghost" style={{ width: "100%", justifyContent: "center", marginTop: 16, color: "var(--state-danger)" }} onClick={() => window.signOut && window.signOut()}>Sign out</button>
            </>
            );
          })()}
        </div>

        <div className="m-tabbar">
          {[
            { k: "dial", l: "Dial", icon: "Phone" },
            { k: "pipe", l: "Pipeline", icon: "Pipeline" },
            { k: "lb", l: "Board", icon: "Trophy" },
            { k: "vault", l: "Vault", icon: "Shield" },
            { k: "me", l: "Me", icon: "Award" },
          ].map(t => {
            const Ico = Icons[t.icon];
            return (
              <button key={t.k} className={`m-tab ${tab === t.k ? "active" : ""}`} onClick={() => setTab(t.k)}>
                <Ico size={18}/>
                <span>{t.l}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

window.MobileRep = MobileRep;
