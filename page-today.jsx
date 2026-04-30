/* Page: Today — role-aware
   Rep    → "my day": queue, coaching, tier progress, recent calls, ritual.
   Mgr    → "team day": who's live, dial heat, today's coaching cards, dispatch CPA.
   Owner  → "agency day": live revenue, anomalies, recruiting today.
   Each view shows a Spend congruency strip — small badges keeping unit economics
   visible per role (cost-per-issued for rep, team CPA for mgr, lead-spend ROI for owner). */

const { useState: useStateT, useEffect: useEffectT } = React;

function PageToday({ aep, role = "rep" }) {
  if (role === "manager") return <TodayManager aep={aep}/>;
  if (role === "owner")   return <TodayOwner aep={aep}/>;
  return <TodayRep aep={aep}/>;
}

/* Spend congruency strip — appears under page header on every Today view */
function SpendStrip({ items }) {
  return (
    <div className="spend-strip">
      <Icons.Wallet size={11} style={{ color: "var(--text-tertiary)" }}/>
      {items.map((i, idx) => (
        <React.Fragment key={idx}>
          <span className="spend-l">{i.l}</span>
          <span className={`spend-v ${i.tone || ""}`}>{i.v}</span>
          {idx < items.length - 1 && <span className="spend-sep">·</span>}
        </React.Fragment>
      ))}
    </div>
  );
}

/* ───── Rep view ─────────────────────────────────────────────────────────── */
function TodayRep({ aep }) {
  const { REPS, QUEUE, RECORDINGS } = AppData;
  const me = REPS[0];
  const spark1 = [12,18,15,22,30,28,35,42];
  const spark2 = [4,6,5,8,11,9,12,14];

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Today, Tuesday — {aep ? <span style={{ color: "var(--accent-heat)" }}>AEP Day 14</span> : "Q2"}</div>
          <div className="page-sub">$2,840 booked · 3 hrs of dial time logged · You're $8,690 from Diamond</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn"><Icons.Calendar size={13}/> Schedule</button>
          <button className="btn btn-primary"><Icons.Phone size={13}/> Power Hour</button>
        </div>
      </div>

      <SpendStrip items={[
        { l: "Cost / issued (you)",  v: "$112",  tone: "money" },
        { l: "Lead spend MTD",        v: "$680" },
        { l: "Comp / dial",            v: "$32.6", tone: "money" },
        { l: "NIGO drag",              v: "$0",    tone: "money" },
      ]}/>

      <div className="kpi-row">
        <Shared.KpiCard hero label="Today's Commission" value="2,840" prefix="$" sub="+$1,200 vs avg Tue" trend="up" spark={spark1}/>
        <Shared.KpiCard label="Apps submitted" value="4" sub="goal: 5" trend="up" spark={spark2}/>
        <Shared.KpiCard label="Dials" value="87" sub="streak: 18d" trend="up" spark={[60,72,68,75,80,78,85,87]}/>
      </div>

      <div className="today-grid" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14 }}>
        <div className="panel">
          <div className="panel-h">
            <Icons.Phone size={14} style={{ color: "var(--accent-money)" }}/>
            <h3>Next in queue</h3>
            <span className="meta">47 leads · sorted by speed-to-lead</span>
          </div>
          <div className="list">
            <div className="list-h" style={{ gridTemplateColumns: "1.2fr 60px 1fr 80px 90px 30px" }}>
              <div>Lead</div><div>Age/St</div><div>Source</div><div>Product</div><div style={{ textAlign: "right" }}>SLA clock</div><div></div>
            </div>
            {QUEUE.slice(0, 6).map(l => {
              const heat = l.elapsed < 30 ? "fresh" : l.elapsed < 90 ? "warm" : "late";
              const heatColor = heat === "fresh" ? "var(--accent-money)" : heat === "warm" ? "var(--state-warning)" : "var(--state-danger)";
              return (
                <div key={l.id} className="row" style={{ gridTemplateColumns: "1.2fr 60px 1fr 80px 90px 30px" }}>
                  <div className="cell-truncate" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span className="dot" style={{ background: heatColor }}></span>
                    <strong style={{ fontWeight: 500 }}>{l.lead}</strong>
                  </div>
                  <div className="cell-truncate tabular" style={{ color: "var(--text-tertiary)" }}>{l.age} · {l.state}</div>
                  <div className="cell-truncate" style={{ color: "var(--text-secondary)" }}>{l.source}</div>
                  <div><span className="chip">{l.product}</span></div>
                  <div className="tabular" style={{ textAlign: "right", color: heatColor, fontWeight: 500 }}>{l.elapsed}s</div>
                  <button className="icon-btn"><Icons.Phone size={13}/></button>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="panel">
            <div className="panel-h">
              <Icons.Activity size={14} style={{ color: "var(--accent-status)" }}/>
              <h3>This week's coaching</h3>
              <span className="meta">from Tuesday's call review</span>
            </div>
            <div style={{ padding: "14px 16px" }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Ask 3 more open-ended questions per hour.</div>
              <div style={{ color: "var(--text-secondary)", fontSize: 12.5, lineHeight: 1.55 }}>
                On Cheryl Hampton's call, you asked "Do you take medications?" instead of "Walk me through your day with your medications." 4 closed-ended in the first 6 min cost rapport.
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                <button className="btn btn-primary"><Icons.Play size={11}/> Replay moment</button>
                <button className="btn">Mark practiced</button>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-h">
              <Icons.Trophy size={14} style={{ color: "var(--accent-status)" }}/>
              <h3>Tier progress</h3>
              <Shared.TierChip tier="platinum"/>
            </div>
            <div style={{ padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span className="tabular" style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em" }}>$42,310</span>
                <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>MTD AP</span>
              </div>
              <div style={{ height: 6, background: "var(--bg-raised)", borderRadius: 3, marginTop: 12, overflow: "hidden" }}>
                <div style={{ width: "82%", height: "100%", background: "linear-gradient(90deg, var(--tier-platinum), var(--tier-diamond))" }}></div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11.5, color: "var(--text-tertiary)" }}>
                <span><Shared.TierChip tier="platinum" compact/> $35K</span>
                <span className="tabular" style={{ color: "var(--accent-money)" }}>$8,690 to Diamond</span>
                <span><Shared.TierChip tier="diamond" compact/> $50K</span>
              </div>
              <div style={{ marginTop: 10, fontSize: 11.5, color: "var(--text-tertiary)" }}>3 days left in month · pace: <span className="tabular" style={{ color: "var(--accent-money)" }}>+$1,420/day needed</span></div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }} className="today-grid">
        <div className="panel">
          <div className="panel-h">
            <Icons.Headset size={14}/>
            <h3>Recent calls</h3>
            <span className="meta">AI-scored</span>
          </div>
          <div className="list">
            {RECORDINGS.map(r => (
              <div key={r.id} className="row" style={{ gridTemplateColumns: "1.2fr 70px 80px 80px 1fr", height: 44 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Icons.Volume size={13} style={{ color: "var(--text-tertiary)" }}/>
                  <div>
                    <div style={{ fontWeight: 500 }}>{r.lead}</div>
                    <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{r.date}</div>
                  </div>
                </div>
                <div className="tabular" style={{ color: "var(--text-secondary)" }}>{Math.floor(r.durSec/60)}:{String(r.durSec%60).padStart(2,"0")}</div>
                <div className="tabular" style={{ color: r.talkRatio > 50 ? "var(--state-danger)" : "var(--text-secondary)" }}>{r.talkRatio}% talk</div>
                <div><span className={`chip ${r.score >= 80 ? "chip-money" : r.score >= 70 ? "chip-status" : "chip-danger"}`}>{r.score}</span></div>
                <div className="cell-truncate" style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>{r.ai}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-h">
            <Icons.Bolt size={14} style={{ color: "var(--accent-heat)" }}/>
            <h3>Daily ritual</h3>
            <span className="meta">{aep ? "AEP cadence" : "regular"}</span>
          </div>
          <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { t: "9:00a",  n: "Lead Drop",          s: "47 fresh leads in queue",        d: "done" },
              { t: "12:00p", n: "Mid-day check-in",   s: "Talk-ratio review w/ AI",         d: "done" },
              { t: "4:00p",  n: "Power Hour",         s: "Group dial · Discord war-room",   d: "now"  },
              { t: "7:00p",  n: "Today's Closes",     s: "Leaderboard freeze · post wins",  d: "next" },
            ].map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 6, background: r.d === "now" ? "color-mix(in oklch, var(--accent-heat) 12%, transparent)" : "var(--bg-raised)" }}>
                <span className="tabular mono" style={{ width: 50, fontSize: 11, color: r.d === "now" ? "var(--accent-heat)" : "var(--text-tertiary)" }}>{r.t}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500 }}>{r.n}</div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{r.s}</div>
                </div>
                {r.d === "done" && <Icons.Check size={13} style={{ color: "var(--accent-money)" }}/>}
                {r.d === "now"  && <span className="chip chip-heat">LIVE</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───── Manager view ─────────────────────────────────────────────────────── */
function TodayManager({ aep }) {
  const { REPS } = AppData;
  const live  = REPS.filter(r => r.presence === "live");
  const idle  = REPS.filter(r => r.presence !== "live");
  const teamMTD = REPS.reduce((a, r) => a + r.mtd, 0);
  const teamToday = REPS.reduce((a, r) => a + r.today, 0);
  const totalDials = REPS.reduce((a, r) => a + r.dials, 0);

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Today · Atlanta team — {aep ? <span style={{ color: "var(--accent-heat)" }}>AEP Day 14</span> : "Q2"}</div>
          <div className="page-sub">{live.length} of {REPS.length} live · {totalDials} dials · ${teamToday.toLocaleString()} closed today</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn"><Icons.MessageSquare size={13}/> Standup notes</button>
          <button className="btn btn-primary"><Icons.Phone size={13}/> Power Hour · all hands</button>
        </div>
      </div>

      <SpendStrip items={[
        { l: "Team CPA today",  v: "$87",   tone: "money" },
        { l: "Lead spend today", v: "$1,240" },
        { l: "Comp paid today",  v: `$${(teamToday * 0.62).toFixed(0)}`, tone: "money" },
        { l: "Open NIGO",        v: "2",    tone: "warn" },
      ]}/>

      <div className="kpi-row">
        <Shared.KpiCard hero label="Team MTD AP" prefix="$" value={teamMTD.toLocaleString()} sub="+12% vs last month" trend="up"/>
        <Shared.KpiCard label="Booked today" prefix="$" value={teamToday.toLocaleString()} sub={`${live.length} producers live`}/>
        <Shared.KpiCard label="Total dials" value={totalDials} sub="goal 700" trend="up"/>
      </div>

      <div className="today-grid" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14 }}>
        <div className="panel">
          <div className="panel-h"><Icons.Users size={13}/><h3>Producers · live floor</h3></div>
          <div className="list">
            <div className="list-h" style={{ gridTemplateColumns: "1.4fr 60px 80px 90px 100px 70px" }}>
              <div>Producer</div>
              <div className="tabular" style={{ textAlign: "right" }}>Dials</div>
              <div className="tabular" style={{ textAlign: "right" }}>Appts</div>
              <div className="tabular" style={{ textAlign: "right" }}>Today</div>
              <div className="tabular" style={{ textAlign: "right" }}>MTD</div>
              <div></div>
            </div>
            {[...live, ...idle].map(r => (
              <div key={r.id} className="row" style={{ gridTemplateColumns: "1.4fr 60px 80px 90px 100px 70px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Shared.Avatar rep={r} size={20}/>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 12.5 }}>{r.name}</div>
                    <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 5 }}>
                      <span className={`dot dot-${r.presence === "live" ? "live" : "idle"}`}></span>
                      {r.presence === "live" ? "on call" : "idle"}
                    </div>
                  </div>
                </div>
                <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{r.dials}</div>
                <div className="tabular" style={{ textAlign: "right" }}>{r.appts}</div>
                <div className="tabular" style={{ textAlign: "right", color: r.today > 1000 ? "var(--accent-money)" : "var(--text-secondary)" }}>${r.today.toLocaleString()}</div>
                <div className="tabular" style={{ textAlign: "right", fontWeight: 500 }}>${(r.mtd / 1000).toFixed(1)}k</div>
                <button className="btn btn-ghost"><Icons.MessageSquare size={11}/></button>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="panel">
            <div className="panel-h"><Icons.Activity size={13} style={{ color: "var(--accent-status)" }}/><h3>Today's coaching cards</h3></div>
            <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { rep: REPS[0], note: "4 closed-ended Q on first call. Replay ready." },
                { rep: REPS[2], note: "Talk ratio 58% on Robert Mendez. Pull moment." },
                { rep: REPS[5], note: "Skipped Plan G anchor on 14 quotes." },
              ].map((c, i) => (
                <div key={i} style={{ padding: 10, background: "var(--bg-raised)", borderRadius: 6, display: "flex", gap: 10, alignItems: "center" }}>
                  <Shared.Avatar rep={c.rep} size={20}/>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500 }}>{c.rep.name}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{c.note}</div>
                  </div>
                  <button className="btn btn-ghost"><Icons.Play size={10}/></button>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-h"><Icons.Bell size={13} style={{ color: "var(--state-warning)" }}/><h3>Needs me</h3></div>
            <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { l: "Robert Mendez App In · carrier review pending",   a: "Push" },
                { l: "Ramona Diaz · beneficiary form not signed",       a: "Nudge" },
                { l: "Henry Akins · annuity sigs · 4d in stage",         a: "Escalate" },
              ].map((x, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                  <span className="dot dot-warn"></span>
                  <span style={{ flex: 1 }}>{x.l}</span>
                  <button className="btn btn-ghost" style={{ padding: "3px 8px", fontSize: 11 }}>{x.a}</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───── Owner view ───────────────────────────────────────────────────────── */
function TodayOwner({ aep }) {
  const { REPS } = AppData;
  const teamToday = REPS.reduce((a, r) => a + r.today, 0);
  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Today · Atlas IMO — {aep ? <span style={{ color: "var(--accent-heat)" }}>AEP Day 14</span> : "Q2"}</div>
          <div className="page-sub">9 producers · 2 regions · ${teamToday.toLocaleString()} AP closed today</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn"><Icons.Calendar size={13}/> Audit week</button>
          <button className="btn btn-primary"><Icons.Sparkles size={13}/> Ask the Book</button>
        </div>
      </div>

      <SpendStrip items={[
        { l: "Lead spend ROI today", v: "4.2x", tone: "money" },
        { l: "Lead spend today",      v: "$1,840" },
        { l: "Override pool today",   v: `$${(teamToday * 0.22).toFixed(0)}`, tone: "money" },
        { l: "Anomalies open",        v: "4",   tone: "warn" },
      ]}/>

      <div className="kpi-row">
        <Shared.KpiCard hero label="AP closed today" prefix="$" value={teamToday.toLocaleString()} sub="+22% vs avg Tue" trend="up"/>
        <Shared.KpiCard label="Override revenue MTD" prefix="$" value="258,420" sub="+18% MoM" trend="up"/>
        <Shared.KpiCard label="Active producers" value={REPS.filter(r => r.presence === "live").length + "/" + REPS.length}/>
      </div>

      <div className="today-grid" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14 }}>
        <div className="panel">
          <div className="panel-h"><Icons.TrendingUp size={13}/><h3>Live revenue · last hour</h3></div>
          <div style={{ padding: 14 }}>
            <svg width="100%" height="120" viewBox="0 0 600 120" preserveAspectRatio="none">
              {(() => {
                const pts = Array.from({ length: 60 }).map((_, i) => 50 + Math.sin(i * 0.4) * 18 + (i > 40 ? (i - 40) * 1.4 : 0));
                const max = Math.max(...pts), min = Math.min(...pts);
                const path = pts.map((v, i) => `${i === 0 ? "M" : "L"} ${(i / 59) * 600} ${100 - ((v - min) / (max - min)) * 80}`).join(" ");
                const fill = path + ` L 600 100 L 0 100 Z`;
                return <><path d={fill} fill="var(--accent-money)" opacity="0.12"/><path d={path} stroke="var(--accent-money)" strokeWidth="1.6" fill="none"/></>;
              })()}
            </svg>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 11.5, color: "var(--text-tertiary)" }}>
              <span>−60m</span><span>−45m</span><span>−30m</span><span>−15m</span><span>now</span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="panel">
            <div className="panel-h"><Icons.Bell size={13} style={{ color: "var(--state-warning)" }}/><h3>Anomalies</h3></div>
            <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { sev: "warn",   t: "Persistency drift",  b: "FE 13-mo · Tampa downline · -3.2pts" },
                { sev: "danger", t: "NIGO spike",          b: "Aetna SRC · 4 returned · age verification" },
                { sev: "info",   t: "Lead source ROI",    b: "FB T65 v3 creative · -22% CPL" },
                { sev: "warn",   t: "AEP cert lag",        b: "3 producers under 80% on TPMO" },
              ].map((x, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: 8, borderRadius: 6, background: "var(--bg-raised)" }}>
                  <span className={`dot dot-${x.sev === "danger" ? "danger" : x.sev === "warn" ? "warn" : "live"}`} style={{ marginTop: 5 }}></span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500 }}>{x.t}</div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 1 }}>{x.b}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-h"><Icons.ArrowUpRight size={13}/><h3>Recruiting today</h3></div>
            <div style={{ padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: "var(--text-secondary)" }}>New applicants</span>
                <span className="tabular" style={{ fontWeight: 600 }}>14</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 6 }}>
                <span style={{ color: "var(--text-secondary)" }}>Contracted today</span>
                <span className="tabular" style={{ fontWeight: 600, color: "var(--accent-money)" }}>2</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 6 }}>
                <span style={{ color: "var(--text-secondary)" }}>Cost / applicant</span>
                <span className="tabular" style={{ fontWeight: 600 }}>$28</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.PageToday = PageToday;
