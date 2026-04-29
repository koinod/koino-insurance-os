/* Mobile rep view */
function MobileRep() {
  const [tab, setTab] = React.useState("dial");
  const [cards, setCards] = React.useState(AppData.QUEUE.slice(0, 4));
  const [drag, setDrag] = React.useState({ x: 0, y: 0 });
  const startRef = React.useRef(null);

  const top = cards[0];

  const onPtrDown = (e) => { startRef.current = { x: e.clientX, y: e.clientY }; };
  const onPtrMove = (e) => {
    if (!startRef.current) return;
    setDrag({ x: e.clientX - startRef.current.x, y: e.clientY - startRef.current.y });
  };
  const onPtrUp = () => {
    if (!startRef.current) return;
    const { x, y } = drag;
    if (Math.abs(x) > 80 || Math.abs(y) > 80) {
      setCards(c => c.slice(1));
    }
    startRef.current = null;
    setDrag({ x: 0, y: 0 });
  };
  const dir = drag.x > 40 ? "right" : drag.x < -40 ? "left" : drag.y < -40 ? "up" : drag.y > 40 ? "down" : null;

  return (
    <div className="mobile-stage">
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
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{cards.length} fresh · swipe to dispatch</div>
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
                    <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setCards(AppData.QUEUE.slice(0, 4))}>Pull 4 leads</button>
                  </div>
                )}
                {cards.slice(0, 3).reverse().map((c, idx, arr) => {
                  const isTop = idx === arr.length - 1;
                  const offset = (arr.length - 1 - idx);
                  const transform = isTop
                    ? `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x * 0.04}deg)`
                    : `translateY(${offset * 8}px) scale(${1 - offset * 0.04})`;
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
                        <div style={{ width: 80, height: 80, borderRadius: "50%", border: "1.5px dashed var(--border-strong)", display: "grid", placeItems: "center", color: "var(--text-tertiary)" }}>
                          <Icons.Phone size={28}/>
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 10.5, color: "var(--text-tertiary)" }}>
                        <div>← Skip</div>
                        <div style={{ textAlign: "right" }}>Dial →</div>
                        <div>↓ Re-queue</div>
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
            </>
          )}

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

          {tab === "me" && (
            <>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 0" }}>
                <Shared.Avatar rep={AppData.REPS[0]} size={64}/>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 600, marginTop: 10 }}>Marcus Avila</div>
                <Shared.TierChip tier="platinum"/>
                <div className="tabular" style={{ fontFamily: "var(--font-display)", fontSize: 44, fontWeight: 600, letterSpacing: "-0.03em", marginTop: 16 }}>$42,310</div>
                <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>MTD · $8,690 to Diamond</div>
                <div style={{ width: "100%", height: 6, background: "var(--bg-raised)", borderRadius: 3, marginTop: 12, overflow: "hidden" }}>
                  <div style={{ width: "82%", height: "100%", background: "linear-gradient(90deg, var(--tier-platinum), var(--tier-diamond))" }}></div>
                </div>
              </div>
              <div className="panel" style={{ marginTop: 12 }}>
                <div className="panel-h"><Icons.Flame size={13} style={{ color: "var(--accent-heat)" }}/><h3>18-day dial streak</h3></div>
                <div style={{ padding: 12, display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {Array.from({ length: 18 }).map((_, i) => (
                    <div key={i} style={{ width: 22, height: 22, borderRadius: 4, background: "color-mix(in oklch, var(--accent-heat) 35%, transparent)", display: "grid", placeItems: "center", color: "var(--accent-heat)", fontSize: 9, fontWeight: 600 }}>✓</div>
                  ))}
                  <div style={{ width: 22, height: 22, borderRadius: 4, border: "1px dashed var(--border-strong)", display: "grid", placeItems: "center", color: "var(--text-quaternary)", fontSize: 9 }}>?</div>
                </div>
              </div>
            </>
          )}
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
