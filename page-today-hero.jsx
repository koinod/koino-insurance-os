/* Today Hero — gamified entry band for the Today page.
   Three sections (responsive: stacked on mobile, 3-col on desktop):
     COMMIT  → today's expectation: dials, contacts, sets, premium $
     LOG     → one-tap activity buttons (rep) or live team log feed (manager)
     HYPE    → streak, % to commitment, leaderboard slice (rep) / team rollup + top rep callout (manager)

   v0 storage = localStorage keyed by `commit:<YYYY-MM-DD>:<rep_id>`.
   No new Supabase migration in this PR — daily_commitments table is the
   v1 upgrade path (acceptance criteria in LEARNINGS.md after merge).

   Renders ABOVE the existing sub-tabs in page-today.jsx — does not
   replace existing tier/commission/dial KPIs (those are real signal). */

const { useState: useStateH, useEffect: useEffectH, useMemo: useMemoH, useCallback: useCallbackH } = React;

const COMMIT_FIELDS = [
  { key: "dials",    label: "Dials",       icon: "Phone",    placeholder: 60 },
  { key: "contacts", label: "Contacts",    icon: "Users",    placeholder: 12 },
  { key: "sets",     label: "Sets",        icon: "Calendar", placeholder: 4  },
  { key: "premium",  label: "AP $",        icon: "Wallet",   placeholder: 800 },
];

const LOG_TAPS = [
  { key: "dial",    label: "Dial",    icon: "Phone",    tone: "var(--text-secondary)" },
  { key: "contact", label: "Contact", icon: "Users",    tone: "var(--accent-status)"  },
  { key: "set",     label: "Set",     icon: "Calendar", tone: "var(--accent-heat)"    },
  { key: "sale",    label: "Sale",    icon: "Wallet",   tone: "var(--accent-money)"   },
];

function _todayKey() {
  const d = new Date(); d.setHours(0,0,0,0);
  return d.toISOString().slice(0, 10);
}

function _loadCommit(date, repId) {
  if (!repId) return {};
  try {
    const raw = localStorage.getItem(`commit:${date}:${repId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch { return {}; }
}

function _saveCommit(date, repId, next) {
  if (!repId) return;
  try { localStorage.setItem(`commit:${date}:${repId}`, JSON.stringify(next)); } catch {}
}

function _loadTaps(date, repId) {
  if (!repId) return {};
  try {
    const raw = localStorage.getItem(`taps:${date}:${repId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch { return {}; }
}

function _saveTaps(date, repId, next) {
  if (!repId) return;
  try { localStorage.setItem(`taps:${date}:${repId}`, JSON.stringify(next)); } catch {}
}

/* COMMIT band — rep sets today's number. Manager sees aggregate of downline commitments. */
function CommitBand({ role, repId, commit, setCommit, locked, setLocked, teamCommit }) {
  const Ico = Icons.Trophy || Icons.ChevronRight;
  if (role === "manager") {
    const total = COMMIT_FIELDS.reduce((acc, f) => {
      acc[f.key] = (teamCommit || []).reduce((s, c) => s + (Number(c[f.key]) || 0), 0);
      return acc;
    }, {});
    const lockedCount = (teamCommit || []).filter(c => c._locked).length;
    return (
      <div className="today-band commit-band">
        <div className="today-band-head">
          <Ico size={13}/> <span>Team commitments today</span>
          <span className="today-band-meta">
            {lockedCount} of {(teamCommit || []).length} reps locked in
          </span>
        </div>
        <div className="commit-grid">
          {COMMIT_FIELDS.map(f => {
            const Fic = Icons[f.icon] || Icons.ChevronRight;
            return (
              <div key={f.key} className="commit-cell commit-cell-readonly">
                <div className="commit-cell-label"><Fic size={11}/> {f.label}</div>
                <div className="commit-cell-val">{f.key === "premium" ? "$" : ""}{(total[f.key] || 0).toLocaleString()}</div>
                <div className="commit-cell-sub">team target</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  return (
    <div className={"today-band commit-band" + (locked ? " is-locked" : "")}>
      <div className="today-band-head">
        <Ico size={13}/> <span>{locked ? "Locked in for today" : "What's today's number?"}</span>
        {locked && (
          <button className="today-band-edit" onClick={() => setLocked(false)}>
            <Icons.Edit size={11}/> edit
          </button>
        )}
      </div>
      <div className="commit-grid">
        {COMMIT_FIELDS.map(f => {
          const Fic = Icons[f.icon] || Icons.ChevronRight;
          return (
            <label key={f.key} className="commit-cell">
              <div className="commit-cell-label"><Fic size={11}/> {f.label}</div>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                disabled={locked}
                placeholder={String(f.placeholder)}
                value={commit[f.key] ?? ""}
                onChange={(e) => setCommit({ ...commit, [f.key]: e.target.value })}
                className="commit-cell-input"
              />
            </label>
          );
        })}
      </div>
      {!locked && (
        <button
          className="btn btn-primary commit-lock-btn"
          disabled={!repId || !COMMIT_FIELDS.some(f => Number(commit[f.key]) > 0)}
          onClick={() => setLocked(true)}
        >Lock it in</button>
      )}
    </div>
  );
}

/* LOG band — rep taps activity. Manager sees scrolling team log. */
function LogBand({ role, repId, taps, setTaps, teamFeed }) {
  const onTap = useCallbackH((key) => {
    if (!repId) return;
    const next = { ...taps, [key]: (Number(taps[key]) || 0) + 1 };
    setTaps(next);
    // Light haptic feedback if available
    try { if (navigator.vibrate) navigator.vibrate(20); } catch {}
  }, [taps, repId, setTaps]);

  const onUntap = useCallbackH((key) => {
    if (!repId) return;
    const cur = Number(taps[key]) || 0;
    if (cur <= 0) return;
    const next = { ...taps, [key]: cur - 1 };
    setTaps(next);
  }, [taps, repId, setTaps]);

  if (role === "manager") {
    return (
      <div className="today-band log-band">
        <div className="today-band-head">
          <Icons.Activity size={13}/> <span>Team activity · live</span>
          <span className="today-band-meta">{(teamFeed || []).length} events today</span>
        </div>
        <div className="log-feed">
          {(teamFeed || []).length === 0 ? (
            <div className="log-feed-empty">No activity logged yet — first dial sets the day in motion.</div>
          ) : (
            (teamFeed || []).slice(0, 10).map((row, i) => {
              const Lic = Icons[row.icon] || Icons.ChevronRight;
              return (
                <div key={i} className="log-feed-row">
                  <Lic size={11} style={{ color: row.tone || "var(--text-secondary)" }}/>
                  <span className="log-feed-who">{row.who}</span>
                  <span className="log-feed-what">{row.what}</span>
                  <span className="log-feed-when">{row.when}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="today-band log-band">
      <div className="today-band-head">
        <Icons.Activity size={13}/> <span>Log it as you go</span>
        <span className="today-band-meta">tap +, long-press to subtract</span>
      </div>
      <div className="log-grid">
        {LOG_TAPS.map(t => {
          const Lic = Icons[t.icon] || Icons.ChevronRight;
          const count = Number(taps[t.key]) || 0;
          return (
            <button
              key={t.key}
              className="log-tap"
              style={{ "--tap-tone": t.tone }}
              onClick={() => onTap(t.key)}
              onContextMenu={(e) => { e.preventDefault(); onUntap(t.key); }}
              title={`+1 ${t.label} (right-click to subtract)`}
            >
              <Lic size={16}/>
              <span className="log-tap-count">{count}</span>
              <span className="log-tap-label">{t.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* HYPE band — streak, % to commit, leaderboard slice (rep) or team rollup (manager). */
function HypeBand({ role, repId, myRow, commit, taps, REPS, scopeIds }) {
  if (role === "manager") {
    const scoped = (REPS || []).filter(r => !scopeIds || scopeIds.includes(r.id));
    const teamToday   = scoped.reduce((s, r) => s + (r.today  || 0), 0);
    const teamDials   = scoped.reduce((s, r) => s + (r.dials  || 0), 0);
    const topRep      = [...scoped].sort((a, b) => (b.today || 0) - (a.today || 0))[0];
    const topStreak   = [...scoped].sort((a, b) => (b.streak || 0) - (a.streak || 0))[0];
    const totalStreak = scoped.reduce((s, r) => s + (r.streak || 0), 0);
    const liveCount   = scoped.filter(r => r.presence === "live").length;
    return (
      <div className="today-band hype-band">
        <div className="today-band-head">
          <Icons.TrendingUp size={13}/> <span>Hype rail</span>
        </div>
        <div className="hype-rail">
          <div className="hype-tile hype-tile-hero">
            <div className="hype-tile-num">${teamToday.toLocaleString()}</div>
            <div className="hype-tile-label">team booked today</div>
            <div className="hype-tile-sub">{teamDials} dials · {liveCount} live</div>
          </div>
          {topRep && (
            <div className="hype-tile">
              <div className="hype-tile-num">{(topRep.name || "").split(" ")[0] || topRep.handle}</div>
              <div className="hype-tile-label">top closer today</div>
              <div className="hype-tile-sub">${(topRep.today || 0).toLocaleString()} booked</div>
            </div>
          )}
          {topStreak && (
            <div className="hype-tile">
              <div className="hype-tile-num">
                <span className="streak-flame">🔥</span>{topStreak.streak || 0}
              </div>
              <div className="hype-tile-label">longest streak</div>
              <div className="hype-tile-sub">{(topStreak.name || "").split(" ")[0] || topStreak.handle}</div>
            </div>
          )}
          <div className="hype-tile">
            <div className="hype-tile-num">{totalStreak}</div>
            <div className="hype-tile-label">team streak days</div>
            <div className="hype-tile-sub">sum across {scoped.length} producer{scoped.length === 1 ? "" : "s"}</div>
          </div>
        </div>
      </div>
    );
  }

  // Rep view: streak + % to commitment for smallest gap + leaderboard slice
  const streak = myRow?.streak || 0;
  const actuals = {
    dials:    Number(taps.dial)    || (myRow?.dials || 0),
    contacts: Number(taps.contact) || 0,
    sets:     Number(taps.set)     || (myRow?.appts || 0),
    premium:  Number(taps.sale)    > 0 ? Number(taps.sale) : (myRow?.today || 0),
  };
  const progress = COMMIT_FIELDS
    .map(f => {
      const t = Number(commit[f.key]) || 0;
      const a = actuals[f.key] || 0;
      const pct = t > 0 ? Math.round((a / t) * 100) : null;
      return { key: f.key, label: f.label, actual: a, target: t, pct };
    })
    .filter(p => p.target > 0);

  const scoped = (REPS || []);
  const peers = [...scoped]
    .sort((a, b) => (b.today || 0) - (a.today || 0))
    .slice(0, 3);
  const myRank = scoped
    .map((r, i) => ({ id: r.id, i }))
    .sort((a, b) => (scoped[b.i].today || 0) - (scoped[a.i].today || 0))
    .findIndex(r => r.id === repId);

  return (
    <div className="today-band hype-band">
      <div className="today-band-head">
        <Icons.TrendingUp size={13}/> <span>Where you stand</span>
      </div>
      <div className="hype-rail hype-rail-rep">
        <div className="hype-tile hype-tile-hero">
          <div className="hype-tile-num">
            <span className="streak-flame">🔥</span>{streak}
          </div>
          <div className="hype-tile-label">day streak</div>
          <div className="hype-tile-sub">{streak === 0 ? "today restarts it" : streak >= 7 ? "compounding hard" : "keep stacking"}</div>
        </div>
        {progress.length > 0 ? (
          progress.map(p => (
            <div key={p.key} className="hype-tile">
              <div className="hype-tile-num">{p.pct == null ? "—" : `${p.pct}%`}</div>
              <div className="hype-tile-label">{p.label} to goal</div>
              <div className="hype-tile-sub">
                {p.key === "premium" ? "$" : ""}{p.actual.toLocaleString()} / {p.key === "premium" ? "$" : ""}{p.target.toLocaleString()}
              </div>
            </div>
          ))
        ) : (
          <div className="hype-tile hype-tile-empty">
            <div className="hype-tile-num">—</div>
            <div className="hype-tile-label">commit to see progress</div>
            <div className="hype-tile-sub">set today's number above</div>
          </div>
        )}
        {peers.length > 0 && (
          <div className="hype-tile hype-tile-peers">
            <div className="hype-tile-label">top closers</div>
            <ol className="hype-peers-list">
              {peers.map((p, i) => (
                <li key={p.id} className={p.id === repId ? "is-me" : ""}>
                  <span className="hype-peer-rank">{i + 1}</span>
                  <span className="hype-peer-name">{(p.name || "").split(" ")[0] || p.handle}</span>
                  <span className="hype-peer-val">${(p.today || 0).toLocaleString()}</span>
                </li>
              ))}
            </ol>
            {myRank >= 0 && myRank > 2 && (
              <div className="hype-tile-sub">you · #{myRank + 1}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TodayHero({ role = "rep" }) {
  // Re-render on me:loaded and data:mutated so we pick up identity + rep updates.
  const [, force] = useStateH(0);
  useEffectH(() => {
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

  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  const REPS = (window.AppData && window.AppData.REPS) || [];
  const myRow = REPS.find(r => meIdent && (r.id === meIdent.rep_id || r.handle === meIdent.handle))
              || REPS[0]
              || null;
  const repId = myRow?.id || meIdent?.rep_id || null;
  const date = _todayKey();

  const [commit, setCommitState] = useStateH(() => _loadCommit(date, repId));
  const [taps, setTapsState]     = useStateH(() => _loadTaps(date, repId));
  const [locked, setLocked]      = useStateH(() => {
    const c = _loadCommit(date, repId);
    return !!c._locked;
  });

  // Re-hydrate from localStorage when repId resolves (first paint had null)
  useEffectH(() => {
    if (!repId) return;
    const c = _loadCommit(date, repId);
    setCommitState(c);
    setLocked(!!c._locked);
    setTapsState(_loadTaps(date, repId));
  }, [repId, date]);

  const setCommit = (next) => {
    setCommitState(next);
    _saveCommit(date, repId, { ...next, _locked: locked });
  };
  const setTaps = (next) => {
    setTapsState(next);
    _saveTaps(date, repId, next);
  };
  const setLockedAndPersist = (val) => {
    setLocked(val);
    _saveCommit(date, repId, { ...commit, _locked: val });
  };

  // Manager-scope helpers
  const scopeIds = (typeof window !== "undefined" && window.scopeRepIds && window.scopeRepIds()) || null;
  const teamCommit = useMemoH(() => {
    if (role !== "manager") return [];
    const scoped = scopeIds === null || scopeIds.length === 0 ? REPS : REPS.filter(r => scopeIds.includes(r.id));
    return scoped.map(r => {
      const c = _loadCommit(date, r.id);
      return { ...c, _rep_id: r.id, _name: r.name };
    });
  }, [role, scopeIds && scopeIds.join(","), REPS.length, date]);

  // Team activity feed (manager view) — derived from REPS in scope; no event log yet
  const teamFeed = useMemoH(() => {
    if (role !== "manager") return [];
    const scoped = scopeIds === null || scopeIds.length === 0 ? REPS : REPS.filter(r => scopeIds.includes(r.id));
    const out = [];
    scoped.forEach(r => {
      const first = (r.name || "").split(" ")[0] || r.handle;
      if ((r.today || 0) > 0)  out.push({ icon: "Wallet",   tone: "var(--accent-money)",  who: first, what: `closed $${(r.today).toLocaleString()}`, when: "today" });
      if ((r.appts || 0) > 0)  out.push({ icon: "Calendar", tone: "var(--accent-heat)",   who: first, what: `${r.appts} set${r.appts === 1 ? "" : "s"}`, when: "today" });
      if ((r.dials || 0) > 0)  out.push({ icon: "Phone",    tone: "var(--text-secondary)", who: first, what: `${r.dials} dial${r.dials === 1 ? "" : "s"}`, when: "today" });
    });
    return out.sort((a, b) => {
      const o = { "Wallet": 0, "Calendar": 1, "Phone": 2 };
      return (o[a.icon] || 9) - (o[b.icon] || 9);
    });
  }, [role, scopeIds && scopeIds.join(","), REPS.length]);

  return (
    <div className="today-hero">
      <CommitBand
        role={role}
        repId={repId}
        commit={commit}
        setCommit={setCommit}
        locked={locked}
        setLocked={setLockedAndPersist}
        teamCommit={teamCommit}
      />
      <LogBand
        role={role}
        repId={repId}
        taps={taps}
        setTaps={setTaps}
        teamFeed={teamFeed}
      />
      <HypeBand
        role={role}
        repId={repId}
        myRow={myRow}
        commit={commit}
        taps={taps}
        REPS={REPS}
        scopeIds={scopeIds}
      />
    </div>
  );
}

window.TodayHero = TodayHero;
