/* Page: Leaderboard
   GAP-P2 — when role === 'rep', other reps' exact $$ are masked. The rep
   sees their own number in clear; everyone else shows a relative bar +
   percentile. Manager + owner views show real numbers (those roles have a
   right to know the org-level economics).
   GAP-ML1 — manager view filters to their downline via window.scopeRepIds().
   Owner sees the full agency; rep sees the same scope as manager but with
   teammate numbers masked. */
function PageLeaderboard({ role = "rep" }) {
  // Re-render on me:loaded / data:mutated so the scope picks up correctly on
  // first paint (was rendering empty when REPS hadn't hydrated yet).
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

  const allReps = (AppData && AppData.REPS) || [];
  // Manager scope: filter REPS to viewer's downline via scopeRepIds().
  //   null  = no filter (owner / super_admin)
  //   []    = me() not loaded yet — fall back to full list so the page renders
  //   [ids] = downline restriction
  const scopeIds = (typeof window !== "undefined" && window.scopeRepIds && window.scopeRepIds()) || null;
  const scopedReps = scopeIds === null || scopeIds.length === 0
    ? allReps
    : allReps.filter(r => scopeIds.includes(r.id));
  const [period, setPeriod] = React.useState("MTD");
  // GAP-ML2 — period switcher was previously dead: setPeriod flipped state
  // but sorted always read .mtd. Now the sort field tracks the active period.
  //   Today → r.today   · WTD → derived from policies issued this week
  //   MTD   → r.mtd     · YTD → derived from policies issued this year
  const periodValue = React.useCallback((rep) => {
    if (period === "Today") return rep.today || 0;
    if (period === "MTD")   return rep.mtd   || 0;
    if (period === "WTD") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - start.getDay());
      const sliced = (AppData.POLICIES || [])
        .filter(p => p.owner === rep.id && (p.status === "issued" || p.status === "active") && p.issuedAt && new Date(p.issuedAt) >= start);
      return sliced.reduce((a, p) => a + (p.ap || 0), 0);
    }
    return rep.mtd || 0;
  }, [period]);
  const sorted = [...scopedReps].sort((a, b) => periodValue(b) - periodValue(a));
  const max = periodValue(sorted[0] || {}) || 1;

  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  const myId = meIdent?.rep_id || (sorted[0] && sorted[0].id);
  const agencyName = meIdent?.agency_name || "Leaderboard";
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
    : formatMoney(periodValue(r));
  const displayMtdTone = (r, rank) => (masksOthers && r.id !== myId)
    ? bandFor(rank, sorted.length).tone
    : "var(--text-primary)";
  const totalAp = sorted.reduce((sum, r) => sum + periodValue(r), 0);
  const totalDials = sorted.reduce((sum, r) => sum + (Number(r.dials) || 0), 0);
  const totalStreak = sorted.reduce((sum, r) => sum + (Number(r.streak) || 0), 0);
  const leader = sorted[0] || null;

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Team Progress</div>
          <div className="page-sub">{agencyName} · {period} · {sorted.length} producer{sorted.length === 1 ? "" : "s"}{role === "manager" ? " in your downline" : " active"}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <div style={{ display: "flex", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: 6, padding: 2 }}>
            {["Today","WTD","MTD"].map(p => (
              <button key={p} onClick={() => setPeriod(p)} className="btn btn-ghost" style={{ padding: "3px 10px", background: period === p ? "var(--bg-raised)" : "transparent", color: period === p ? "var(--text-primary)" : "var(--text-tertiary)" }}>{p}</button>
            ))}
          </div>
          {!masksOthers && (
            <button className="btn" onClick={() => window.AppData.exportCsv(
              sorted.map((r, i) => ({ ...r, rank: i + 1, periodAp: periodValue(r) })),
              `leaderboard-${period.toLowerCase()}`,
              [
                { k: "rank",     l: "Rank" },
                { k: "name",     l: "Producer" },
                { k: "handle",   l: "Handle" },
                { k: "tier",     l: "Tier" },
                { k: "periodAp", l: `${period} AP`, fmt: (v) => "$" + (v || 0) },
                { k: "streak",   l: "Streak (d)" },
                { k: "dials",    l: "Dials today" },
              ])}>
              <Icons.ArrowDown size={13}/> Export
            </button>
          )}
          <button
            className="btn"
            onClick={() => window.dispatchEvent(new CustomEvent("ai:ask", { detail: {
              prompt: `Set a practical one-day focus for my ${role === "manager" ? "downline" : "team"} based on current production: choose the clearest next action from dials, appointments, AP, or persistency.`,
              context: "Team Progress · set focus",
            }}))}
            title="Draft a challenge with the AI co-pilot"
          >
            <Icons.Calendar size={13}/> Set team focus
          </button>
        </div>
      </div>

      {sorted.length === 0 && (
        <div className="panel" style={{ padding: 28, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
          {role === "manager"
            ? <>No producers visible in your downline yet. <a href="#" onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent("nav:goto", { detail: { page: "recruiting" } })); }} style={{ color: "var(--accent-money)" }}>Invite reps from Recruiting</a>.</>
            : "No producers yet — invite reps to see standings."}
        </div>
      )}

      {sorted.length > 0 && (
        <div className="panel" style={{ padding: "11px 14px", marginBottom: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.5fr repeat(3, 1fr)", gap: 14, alignItems: "center" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: "var(--text-tertiary)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>Current leader</div>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 5, minWidth: 0 }}>
                {leader && <Shared.Avatar rep={leader} size={22}/>}<strong style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{leader?.name || "No leader yet"}</strong>
                {leader && <Shared.TierChip tier={leader.tier} compact/>}
              </div>
            </div>
            <div><div style={{ color: "var(--text-tertiary)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>{period} AP</div><div className="tabular" style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>{masksOthers && leader?.id !== myId ? "—" : formatMoney(totalAp)}</div></div>
            <div><div style={{ color: "var(--text-tertiary)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>Dials today</div><div className="tabular" style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>{totalDials.toLocaleString()}</div></div>
            <div><div style={{ color: "var(--text-tertiary)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>Streak days</div><div className="tabular" style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>{totalStreak.toLocaleString()}</div></div>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-h">
          <h3>Production standings</h3>
          <span className="meta">select a producer to view progress</span>
        </div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "32px 1.4fr 90px 110px 60px 1fr" }}>
            <div>#</div><div>Rep</div><div>Tier</div><div style={{textAlign:"right"}}>{period} AP</div><div style={{textAlign:"right"}}>Streak</div><div></div>
          </div>
          {sorted.map((r, i) => (
            <div key={r.id} className="row" style={{ gridTemplateColumns: "32px 1.4fr 90px 110px 60px 1fr", height: 32 }}>
              <div className="tabular" style={{ fontWeight: 600, color: i < 3 ? "var(--accent-money)" : "var(--text-tertiary)" }}>{i + 1}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Shared.Avatar rep={r} size={18}/>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 12 }}>{r.name} {r.id === myId && <span className="chip chip-money" style={{ marginLeft: 4, fontSize: 9 }}>YOU</span>}</div>
                  <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{r.handle} · {r.dials} dials today</div>
                </div>
              </div>
              <div><Shared.TierChip tier={r.tier} compact/></div>
              <div className="tabular" style={{ textAlign: "right", fontWeight: 500, fontFamily: "var(--font-mono)", color: displayMtdTone(r, i) }}>{displayMtd(r, i)}</div>
              <div className="tabular" style={{ textAlign: "right", color: r.streak > 0 ? "var(--accent-heat)" : "var(--text-quaternary)", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 3, fontFamily: "var(--font-mono)" }}>
                {r.streak > 0 && <Icons.Flame size={10}/>}{r.streak}d
              </div>
              <div style={{ height: 4, background: "var(--bg-raised)", borderRadius: 2, overflow: "hidden", margin: "0 8px" }}>
                <div style={{ width: `${(periodValue(r) / max) * 100}%`, height: "100%", background: i < 3 ? "var(--accent-money)" : "var(--accent-money-dim)" }}></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
        <div className="panel">
          <div className="panel-h"><Icons.Award size={12}/><h3>Team highlights</h3></div>
          {(() => {
            // Derive badges from real signals in scope. Falls back to an empty
            // state if no rep has earned anything yet — was a hardcoded list of
            // demo reps which leaked into a fresh agency's view.
            const earned = sorted.flatMap(r => {
              const out = [];
              if ((r.streak || 0) >= 30) out.push({ who: r.name, what: `${r.streak}-day dial streak`, icon: "Flame", color: "var(--accent-heat)" });
              else if ((r.streak || 0) >= 7) out.push({ who: r.name, what: `${r.streak}-day streak`, icon: "Flame", color: "var(--accent-heat)" });
              const tierIdx = ["bronze","silver","gold","platinum","diamond"].indexOf(r.tier);
              if (tierIdx >= 3) out.push({ who: r.name, what: `${r.tier.charAt(0).toUpperCase()}${r.tier.slice(1)} tier`, icon: "Trophy", color: "var(--accent-money)" });
              if ((r.mtd || 0) >= 50000) out.push({ who: r.name, what: `$${Math.round((r.mtd||0)/1000)}K month`, icon: "Diamond", color: "var(--accent-money)" });
              return out;
            }).slice(0, 6);
            if (earned.length === 0) {
              return (
                <div style={{ padding: 14, color: "var(--text-tertiary)", fontSize: 11.5, textAlign: "center", lineHeight: 1.5 }}>
                  No badges yet. Streaks, tier promotions, and $50K months will surface here as your team earns them.
                </div>
              );
            }
            return (
              <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
                {earned.map((b, i) => {
                  const Ico = Icons[b.icon] || Icons.Award;
                  const rep = sorted.find(r => r.name === b.who);
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: "var(--bg-raised)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
                      <Ico size={12} style={{ color: b.color }}/>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11.5 }}><span style={{ fontWeight: 500 }}>{b.who}</span> <span style={{ color: b.color }}>· {b.what}</span></div>
                      </div>
                      {role !== "rep" && rep && (
                        <button
                          className="btn btn-ghost"
                          style={{ padding: "2px 5px" }}
                          title={`Send a congrats note to ${b.who.split(" ")[0]}`}
                          onClick={() => AppData.mutate.coachingNoteCreate && AppData.mutate.coachingNoteCreate(rep.id, `Nice — ${b.what}. Keep it going.`).then(() => window.toast && window.toast(`Noted ${rep.name.split(" ")[0]}'s win`, "success")).catch(() => {})}
                        >
                          <Icons.MessageSquare size={10}/>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        <div className="panel">
          <div className="panel-h"><Icons.Users size={12} style={{ color: "var(--accent-money)" }}/><h3>Team availability</h3><span className="meta">today</span></div>
          <div style={{ padding: "8px 12px 10px" }}>
            {(() => {
              const live = sorted.filter(r => r.presence === "live").length;
              return (
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, color: live > 0 ? "var(--accent-money)" : "var(--text-tertiary)", marginBottom: 6, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  <span className={live > 0 ? "dot dot-live" : "dot"}></span>
                  {live > 0 ? `${live} on calls now` : "No live calls"}
                </div>
              );
            })()}
            {sorted.slice(0, 6).map(r => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                <Shared.Avatar rep={r} size={18}/>
                <div style={{ flex: 1, fontSize: 11.5 }}>{r.name}</div>
                {r.presence === "live"
                  ? <span className="chip chip-money" style={{ fontSize: 9.5 }}><span className="dot dot-live" style={{marginRight:4}}></span>dialing</span>
                  : r.presence === "off" ? <span className="chip" style={{ color: "var(--text-quaternary)", fontSize: 9.5 }}>off</span>
                  : <span className="chip" style={{ fontSize: 9.5 }}>idle</span>}
              </div>
            ))}
            {sorted.length === 0 && (
              <div style={{ padding: 10, fontSize: 11.5, color: "var(--text-tertiary)" }}>No producers in scope.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

window.PageLeaderboard = PageLeaderboard;
