/* Page: Leaderboard
   GAP-P2 — when role === 'rep', other reps' exact $$ are masked. The rep
   sees their own number in clear; everyone else shows a relative bar +
   percentile. Manager + owner views show real numbers (those roles have a
   right to know the org-level economics). */
function PageLeaderboard({ role = "rep" }) {
  const { REPS } = AppData;
  const sorted = [...REPS].sort((a, b) => b.mtd - a.mtd);
  const max = sorted[0]?.mtd || 1;
  const [period, setPeriod] = React.useState("MTD");

  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  const myId = meIdent?.rep_id || (REPS[0] && REPS[0].id);
  const masksOthers = role === "rep";
  const formatMoney = (n) => "$" + Math.round(n).toLocaleString();
  // Percentile-based bands so reps can still feel competitive context
  // without a teammate's exact paycheck.
  const bandFor = (rank, total) => {
    const pct = 1 - (rank / total);                    // 0..1, top=1
    if (pct >= 0.9) return { label: "Top 10%",   tone: "var(--accent-status)" };
    if (pct >= 0.7) return { label: "Top 30%",   tone: "var(--accent-money)"  };
    if (pct >= 0.4) return { label: "Mid pack",  tone: "var(--text-secondary)"};
    return                  { label: "Bottom 40%", tone: "var(--text-tertiary)" };
  };
  const displayMtd = (r, rank) => (masksOthers && r.id !== myId)
    ? bandFor(rank, sorted.length).label
    : formatMoney(r.mtd);
  const displayMtdTone = (r, rank) => (masksOthers && r.id !== myId)
    ? bandFor(rank, sorted.length).tone
    : "var(--text-primary)";

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Leaderboard</div>
          <div className="page-sub">Atlas Insurance · {period} · {sorted.length} producers active</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <div style={{ display: "flex", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: 6, padding: 2 }}>
            {["Today","WTD","MTD","AEP"].map(p => (
              <button key={p} onClick={() => setPeriod(p)} className="btn btn-ghost" style={{ padding: "3px 10px", background: period === p ? "var(--bg-raised)" : "transparent", color: period === p ? "var(--text-primary)" : "var(--text-tertiary)" }}>{p}</button>
            ))}
          </div>
          <button className="btn"><Icons.Calendar size={13}/> Issue challenge</button>
        </div>
      </div>

      {/* Podium */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr 1fr", gap: 14, marginBottom: 14 }}>
        {[1, 0, 2].map(i => {
          const r = sorted[i];
          const podium = i === 0;
          return (
            <div key={r.id} className="panel" style={{ padding: 0, position: "relative", overflow: "hidden", background: podium ? "linear-gradient(180deg, color-mix(in oklch, var(--accent-status) 8%, var(--bg-elevated)), var(--bg-elevated))" : undefined, border: podium ? "1px solid color-mix(in oklch, var(--accent-status) 35%, var(--border-subtle))" : undefined }}>
              <div style={{ padding: 18, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                <div className="mono tabular" style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 8 }}>RANK</div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: podium ? 56 : 40, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1, color: podium ? "var(--accent-status)" : "var(--text-secondary)" }}>{i + 1}</div>
                <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
                  <Shared.Avatar rep={r} size={28}/>
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{r.name}</div>
                    <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{r.handle}</div>
                  </div>
                </div>
                <div style={{ marginTop: 10 }}><Shared.TierChip tier={r.tier}/></div>
                <div className="tabular" style={{ marginTop: 10, fontFamily: "var(--font-display)", fontSize: podium ? 36 : 26, fontWeight: 600, letterSpacing: "-0.025em", color: displayMtdTone(r, i) }}>{displayMtd(r, i)}</div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{(masksOthers && r.id !== myId) ? "Relative band" : "MTD AP"} · streak {r.streak}d</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="panel">
        <div className="panel-h">
          <h3>Full standings</h3>
          <span className="meta">click rep for scorecard</span>
        </div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "40px 1.4fr 100px 110px 70px 70px 1fr" }}>
            <div>#</div><div>Rep</div><div>Tier</div><div style={{textAlign:"right"}}>MTD AP</div><div style={{textAlign:"right"}}>Streak</div><div style={{textAlign:"right"}}>Δ</div><div>Bar</div>
          </div>
          {sorted.map((r, i) => (
            <div key={r.id} className="row" style={{ gridTemplateColumns: "40px 1.4fr 100px 110px 70px 70px 1fr", height: 44 }}>
              <div className="tabular" style={{ fontWeight: 600, color: i < 3 ? "var(--accent-status)" : "var(--text-tertiary)" }}>{i + 1}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Shared.Avatar rep={r} size={22}/>
                <div>
                  <div style={{ fontWeight: 500 }}>{r.name} {r.id === myId && <span className="chip chip-money" style={{ marginLeft: 4, fontSize: 9.5 }}>YOU</span>}</div>
                  <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{r.handle} · {r.dials} dials today</div>
                </div>
              </div>
              <div><Shared.TierChip tier={r.tier}/></div>
              <div className="tabular" style={{ textAlign: "right", fontWeight: 500, color: displayMtdTone(r, i) }}>{displayMtd(r, i)}</div>
              <div className="tabular" style={{ textAlign: "right", color: r.streak > 0 ? "var(--accent-heat)" : "var(--text-quaternary)", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                {r.streak > 0 && <Icons.Flame size={11}/>}{r.streak}d
              </div>
              <div className="tabular" style={{ textAlign: "right", color: i < 3 ? "var(--accent-money)" : i > 5 ? "var(--state-danger)" : "var(--text-tertiary)", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 2 }}>
                {i < 3 ? <Icons.ArrowUp size={11}/> : i > 5 ? <Icons.ArrowDown size={11}/> : "—"}{i < 3 ? `${3 - i}` : i > 5 ? `${i - 5}` : ""}
              </div>
              <div style={{ height: 6, background: "var(--bg-raised)", borderRadius: 3, overflow: "hidden", margin: "0 8px" }}>
                <div style={{ width: `${(r.mtd / max) * 100}%`, height: "100%", background: i < 3 ? "linear-gradient(90deg, var(--accent-status), var(--accent-money))" : "var(--accent-money-dim)" }}></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
        <div className="panel">
          <div className="panel-h"><Icons.Award size={13}/><h3>Recent badges</h3></div>
          <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { who: "Dani Rivera", what: "First $50K month", when: "2h ago", icon: "Diamond", color: "var(--tier-diamond)" },
              { who: "Marcus Avila", what: "30-day dial streak", when: "Yesterday", icon: "Flame", color: "var(--accent-heat)" },
              { who: "Tony Park", what: "Persistency 95%+ Q1", when: "2d ago", icon: "Shield", color: "var(--accent-money)" },
              { who: "Kira Walsh", what: "AEP Top 1%", when: "3d ago", icon: "Trophy", color: "var(--accent-status)" },
            ].map((b, i) => {
              const Ico = Icons[b.icon];
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "var(--bg-raised)", borderRadius: 6 }}>
                  <Ico size={14} style={{ color: b.color }}/>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5 }}><span style={{ fontWeight: 500 }}>{b.who}</span> earned <span style={{ color: b.color }}>{b.what}</span></div>
                    <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{b.when}</div>
                  </div>
                  <button className="btn btn-ghost" style={{ padding: "3px 6px" }}><Icons.MessageSquare size={11}/></button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel">
          <div className="panel-h"><Icons.Bolt size={13} style={{ color: "var(--accent-heat)" }}/><h3>AEP war-room</h3><span className="meta">Discord-style</span></div>
          <div style={{ padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--accent-money)", marginBottom: 10 }}>
              <span className="dot dot-live"></span> 6 producers in voice · "Power Hour 4-5p"
            </div>
            {AppData.REPS.slice(0, 5).map(r => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
                <Shared.Avatar rep={r} size={20}/>
                <div style={{ flex: 1, fontSize: 12.5 }}>{r.name}</div>
                {r.presence === "live" ? <span className="chip chip-money"><span className="dot dot-live" style={{marginRight:4}}></span>dialing</span> : <span className="chip">idle</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

window.PageLeaderboard = PageLeaderboard;
