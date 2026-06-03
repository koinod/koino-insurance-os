/* page-licensing.jsx — Licensing teaching surface (practice-first).

   Top-level route /?page=licensing inside the SPA, or /licensing standalone.

   Layout (2026-06-03 refactor):
     Top picker: State + Exam variety (Life Only / Life & Annuities /
       Life & Health / etc. — states have different combos)
     Tabs: PRACTICE (default) · STUDY GUIDE · TUTOR · LOGISTICS
       * PRACTICE     — variety-scoped questions; domain weights honor
                        content outline %s; per-domain accuracy in
                        localStorage; "Drill weakest domain" CTA.
       * STUDY GUIDE  — multi-section guide rendered like Ian's VA
                        Series 1105 cheat sheet (heading / table /
                        bullets / callouts / numeric drills). Sections
                        come from /api/licensing-tutor mode=study_guide,
                        one fetch per content-outline domain. Cached in
                        sessionStorage so navigating away doesn't lose
                        them.
       * TUTOR        — chat Q&A scoped to (state, variety).
       * LOGISTICS    — Requirements card + Approved courses card +
                        step-by-step roadmap. The honest "research
                        pending" cells live here, out of the way of the
                        practice loop.

   Data: GET /lib/licensing-data.json. exam_varieties[] under
   states[CODE] (top 15 markets) drives the variety picker. States with
   no curated varieties fall back to a synthesized default per line so
   the UI still works everywhere. */

(function () {
  const { useState, useEffect, useMemo, useRef } = React;

  const DATA_URL = "/lib/licensing-data.json?v=5";

  /* ───── Default-variety synthesis ─────
     For states that don't yet have curated exam_varieties[], we build a
     generic per-line variety so the UI keeps working. content_outline
     here is the universal 8-domain skeleton derived from Ian's VA
     Series 1105 guide; it's not state-specific but it gives the
     practice loop something to weight against. */
  const UNIVERSAL_LIFE_OUTLINE = [
    { domain: "Insurance Regulation",      weight_pct: 12, topics: ["State DOI rules", "License + appointment", "Unfair trade practices"] },
    { domain: "General Insurance Concepts", weight_pct: 8,  topics: ["Contract law", "Risk concepts", "Insurable interest", "Underwriting"] },
    { domain: "Life Insurance Basics",     weight_pct: 9,  topics: ["Types of insurers", "Parts of a policy"] },
    { domain: "Life Insurance Policies",   weight_pct: 18, topics: ["Term", "Whole life", "UL", "IUL", "Variable"] },
    { domain: "Policy Provisions & Riders", weight_pct: 18, topics: ["Free look", "Grace period", "Riders", "Nonforfeiture", "Settlement"] },
    { domain: "Annuities",                  weight_pct: 14, topics: ["Types", "Payout options", "Tax treatment", "Suitability"] },
    { domain: "Federal Tax Considerations", weight_pct: 12, topics: ["MEC", "1035 exchange", "Business insurance", "Group"] },
    { domain: "Qualified Plans",            weight_pct: 9,  topics: ["IRA / Roth", "401k / 403b", "SEP / SIMPLE"] },
  ];
  const UNIVERSAL_HEALTH_OUTLINE = [
    { domain: "Insurance Regulation",       weight_pct: 12, topics: ["State DOI rules", "Licensing + appointment"] },
    { domain: "General Insurance Concepts", weight_pct: 8,  topics: ["Risk", "Contract law", "Underwriting"] },
    { domain: "Health Insurance Basics",    weight_pct: 14, topics: ["Insurable interest", "HMO / PPO / POS", "Group vs individual"] },
    { domain: "Health Policy Provisions",   weight_pct: 18, topics: ["Mandatory provisions", "Optional provisions", "Riders"] },
    { domain: "Medicare & Medicaid",        weight_pct: 12, topics: ["Parts A/B/C/D", "Med Supp", "MAPD"] },
    { domain: "Disability Income",          weight_pct: 9,  topics: ["Short term", "Long term", "Group LTD"] },
    { domain: "Long Term Care",             weight_pct: 9,  topics: ["LTC policy types", "Tax-qualified vs non"] },
    { domain: "Federal Tax + ACA",          weight_pct: 10, topics: ["ACA marketplace", "HDHP/HSA"] },
    { domain: "Group + Senior Markets",     weight_pct: 8,  topics: ["Employer group", "Senior market"] },
  ];
  const UNIVERSAL_ANNUITY_OUTLINE = [
    { domain: "Insurance Regulation",       weight_pct: 14, topics: ["State DOI rules", "NAIC Model 275 / Best Interest", "Suitability training"] },
    { domain: "Annuity Basics",             weight_pct: 18, topics: ["Fixed vs variable vs indexed", "Immediate vs deferred"] },
    { domain: "Annuity Contract Provisions", weight_pct: 18, topics: ["Accumulation phase", "Annuitization", "Surrender charges"] },
    { domain: "Payout / Settlement Options", weight_pct: 14, topics: ["Life only", "Period certain", "Joint & survivor"] },
    { domain: "Tax Treatment",              weight_pct: 16, topics: ["Qualified vs non-qualified", "1035 exchange", "LIFO withdrawals", "Pre-59½ penalty"] },
    { domain: "Suitability + Best Interest", weight_pct: 12, topics: ["Senior protections", "Replacement"] },
    { domain: "Variable Annuity + Securities", weight_pct: 8, topics: ["Series 6/7", "Prospectus"] },
  ];
  const UNIVERSAL_MP_OUTLINE = [
    { domain: "Mortgage Protection Concept", weight_pct: 14, topics: ["Sold under Life LoA", "Term-life mechanics"] },
    { domain: "Marketing & Advertising Rules", weight_pct: 28, topics: ["NAIC Model 880 UTPA", "No misrepresentation", "No false affiliation with lender"] },
    { domain: "Unfair Trade Practices",      weight_pct: 18, topics: ["Twisting", "Churning", "Sliding", "Rebating"] },
    { domain: "Policy Form + Form Numbers",  weight_pct: 12, topics: ["State-approved forms", "Carrier filings"] },
    { domain: "State Statute",               weight_pct: 18, topics: ["State-specific UTPA chapter", "State DOI bulletins"] },
    { domain: "Replacement",                 weight_pct: 10, topics: ["Replacement notice", "Free look extensions"] },
  ];
  function synthesizeVariety(stateCode, lineId, lineLabel) {
    const outline = lineId === "health" ? UNIVERSAL_HEALTH_OUTLINE
                  : lineId === "annuity" ? UNIVERSAL_ANNUITY_OUTLINE
                  : lineId === "mortgage_protection" ? UNIVERSAL_MP_OUTLINE
                  : UNIVERSAL_LIFE_OUTLINE;
    return {
      id: `${stateCode.toLowerCase()}_${lineId}_generic`,
      name: `${stateCode} · ${lineLabel} (generic outline)`,
      synthesized: true,
      series_code: null,
      exam_vendor: null,
      question_count: null,
      time_minutes: null,
      passing_score_pct: null,
      candidate_handbook_url: null,
      content_outline: outline,
      source_url: null,
      source_quote: "Generic content outline — exam-vendor handbook not yet captured for this state. Numbers and section weights are typical of US Life-line producer exams (universal NAIC / federal-tax content). State-specific rules in the Insurance Regulation section will still be ${state}-accurate via the tutor + practice modes.",
    };
  }
  function varietiesFor(data, stateCode, lineId, lineLabel) {
    const state = data?.states?.[stateCode];
    const curated = Array.isArray(state?.exam_varieties)
      ? state.exam_varieties.filter(v => v.line === lineId || !v.line || v.applies_to_lines?.includes(lineId))
      : [];
    if (curated.length > 0) return curated;
    return [synthesizeVariety(stateCode, lineId, lineLabel)];
  }

  /* ───── Top-level page ───── */
  function PageLicensing({ role = "manager" }) {
    const [data, setData] = useState(null);
    const [err, setErr]   = useState(null);
    const [stateCode, setStateCode] = useState("");
    const [lineId, setLineId]       = useState("life");
    const [varietyId, setVarietyId] = useState("");
    const [tab, setTab]             = useState("practice");

    useEffect(() => {
      let alive = true;
      fetch(DATA_URL, { cache: "no-store" })
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then(j => { if (alive) setData(j); })
        .catch(e => { if (alive) setErr(e.message || String(e)); });
      return () => { alive = false; };
    }, []);

    // Persist last-picked state + variety so a return visit starts where you left off.
    useEffect(() => {
      try {
        const raw = localStorage.getItem("repflow.licensing.last");
        if (raw) {
          const j = JSON.parse(raw);
          if (j.stateCode) setStateCode(j.stateCode);
          if (j.lineId) setLineId(j.lineId);
          if (j.varietyId) setVarietyId(j.varietyId);
          if (j.tab) setTab(j.tab);
        }
      } catch {}
    }, []);
    useEffect(() => {
      try { localStorage.setItem("repflow.licensing.last", JSON.stringify({ stateCode, lineId, varietyId, tab })); } catch {}
    }, [stateCode, lineId, varietyId, tab]);

    const states = useMemo(() => {
      if (!data) return [];
      return Object.entries(data.states).map(([code, s]) => ({ code, name: s.name }));
    }, [data]);

    const lines = data?._lines || [];
    const lineLabel = (lines.find(l => l.id === lineId) || {}).label || lineId;

    const cell = useMemo(() => {
      if (!data || !stateCode) return null;
      const s = data.states[stateCode];
      return s?.lines?.[lineId] || null;
    }, [data, stateCode, lineId]);

    const varieties = useMemo(() => {
      if (!data || !stateCode) return [];
      return varietiesFor(data, stateCode, lineId, lineLabel);
    }, [data, stateCode, lineId, lineLabel]);

    // Auto-select first variety when state/line changes and current pick is gone.
    useEffect(() => {
      if (!varieties.length) return;
      if (!varieties.find(v => v.id === varietyId)) setVarietyId(varieties[0].id);
    }, [varieties, varietyId]);

    const variety = varieties.find(v => v.id === varietyId) || varieties[0] || null;

    if (err) {
      return (
        <div className="page-pad">
          <div className="panel" style={{ padding: 18, fontSize: 12, color: "var(--state-danger)" }}>
            Licensing data failed to load: {err}
          </div>
        </div>
      );
    }
    if (!data) {
      return <div className="page-pad"><div className="panel" style={{ padding: 24, fontSize: 12, color: "var(--text-tertiary)" }}>Loading licensing data…</div></div>;
    }

    return (
      <div className="page-pad">
        <div className="page-h">
          <div>
            <div className="page-title">Licensing</div>
            <div className="page-sub">
              Practice the exact exam your state offers. Pick your state and variety.
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <a className="btn btn-ghost" href="https://nipr.com/" target="_blank" rel="noopener noreferrer">
              <Icons.FileText size={12}/> NIPR
            </a>
            {typeof window !== "undefined" && typeof window.gotoPage === "function" && (
              <button className="btn btn-ghost" onClick={() => window.gotoPage("recruits")}>
                <Icons.Users size={12}/> Recruits
              </button>
            )}
          </div>
        </div>

        {/* Picker row — state + line chips + variety dropdown */}
        <div className="panel" style={{ padding: 12, marginBottom: 12, display: "grid", gridTemplateColumns: "1fr 1fr 1.6fr", gap: 12, alignItems: "end" }}>
          <Shared.Field label="State">
            <select className="text-input" value={stateCode} onChange={(e) => { setStateCode(e.target.value); setVarietyId(""); }}>
              <option value="">Pick a state…</option>
              {states.map(s => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}
            </select>
          </Shared.Field>
          <Shared.Field label="Line of authority">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {lines.map(l => (
                <button key={l.id}
                  className={`chip ${lineId === l.id ? "chip-money" : ""}`}
                  style={{ cursor: "pointer", border: 0, fontWeight: 500 }}
                  onClick={() => { setLineId(l.id); setVarietyId(""); }}>
                  {l.label}
                </button>
              ))}
            </div>
          </Shared.Field>
          <Shared.Field label={`Exam variety${variety?.synthesized ? " (generic — handbook not yet captured)" : ""}`}>
            <select className="text-input" value={varietyId} onChange={(e) => setVarietyId(e.target.value)} disabled={!stateCode}>
              {!stateCode && <option value="">Pick a state first…</option>}
              {varieties.map(v => <option key={v.id} value={v.id}>{v.name}{v.question_count ? ` · ${v.question_count}q, ${v.time_minutes}min, ${v.exam_vendor || ""}` : ""}</option>)}
            </select>
          </Shared.Field>
        </div>

        {/* Empty state — no state picked */}
        {!stateCode ? (
          <div className="panel" style={{ padding: 28, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13, lineHeight: 1.6 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 }}>Pick a state to start practicing.</div>
            Practice questions are weighted by the state's exam content outline.
            Study guides are generated in the style of the Virginia Series 1105 cheat sheet.
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div style={{ display: "flex", gap: 4, marginBottom: 12, borderBottom: "1px solid var(--border-subtle)" }}>
              {[
                { id: "practice",    label: "Practice",     icon: "Sparkles" },
                { id: "study_guide", label: "Study Guide",  icon: "FileText" },
                { id: "tutor",       label: "Tutor",        icon: "MessageSquare" },
                { id: "logistics",   label: "Logistics",    icon: "Folder" },
              ].map(t => {
                const Ico = Icons[t.icon];
                return (
                  <button key={t.id}
                    onClick={() => setTab(t.id)}
                    className="btn btn-ghost"
                    style={{
                      border: 0, borderRadius: 0,
                      borderBottom: tab === t.id ? "2px solid var(--accent-money)" : "2px solid transparent",
                      color: tab === t.id ? "var(--text-primary)" : "var(--text-tertiary)",
                      fontWeight: tab === t.id ? 600 : 500,
                      paddingBottom: 10,
                    }}>
                    {Ico && <Ico size={12}/>} {t.label}
                  </button>
                );
              })}
            </div>

            {tab === "practice"    && variety && <PracticeTab    stateCode={stateCode} lineId={lineId} lineLabel={lineLabel} variety={variety}/>}
            {tab === "study_guide" && variety && <StudyGuideTab  stateCode={stateCode} lineId={lineId} lineLabel={lineLabel} variety={variety}/>}
            {tab === "tutor"       && variety && <TutorTab       stateCode={stateCode} lineId={lineId} lineLabel={lineLabel} variety={variety}/>}
            {tab === "logistics"   &&             <LogisticsTab  stateCode={stateCode} lineId={lineId} lineLabel={lineLabel} cell={cell} stepByStep={data._step_by_step_template}/>}
          </>
        )}
      </div>
    );
  }

  /* ───── Practice tab — weighted by content outline, per-domain stats ───── */
  const PRACTICE_LS_KEY = (state, varietyId) => `repflow.licensing.practice.${state}.${varietyId}`;

  function PracticeTab({ stateCode, lineId, lineLabel, variety }) {
    const [q, setQ]       = useState(null);
    const [picked, setPicked] = useState(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr]   = useState(null);
    const [stats, setStats] = useState(() => loadStats(stateCode, variety.id));
    const [drillDomain, setDrillDomain] = useState(null); // forced domain for next fetch

    useEffect(() => {
      setQ(null); setPicked(null); setErr(null); setDrillDomain(null);
      setStats(loadStats(stateCode, variety.id));
    }, [stateCode, variety.id]);

    const pickWeightedDomain = () => {
      if (drillDomain) return drillDomain;
      const outline = Array.isArray(variety.content_outline) ? variety.content_outline : [];
      if (outline.length === 0) return null;
      const total = outline.reduce((s, d) => s + (d.weight_pct || 0), 0) || outline.length;
      const r = Math.random() * total;
      let cum = 0;
      for (const d of outline) {
        cum += (d.weight_pct || (total / outline.length));
        if (r <= cum) return d.domain;
      }
      return outline[outline.length - 1].domain;
    };

    const fetchOne = async () => {
      setBusy(true); setErr(null); setPicked(null); setQ(null);
      const domain = pickWeightedDomain();
      try {
        const resp = await fetch("/api/licensing-tutor", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode: "practice", state: stateCode, line: lineId, domain, variety_name: variety.name })
        });
        const j = await resp.json();
        if (!resp.ok) throw new Error(j.error || `HTTP ${resp.status}`);
        setQ(j);
        setDrillDomain(null); // consume the one-shot drill
      } catch (e) {
        setErr(e.message || String(e));
      } finally {
        setBusy(false);
      }
    };

    const onPick = (i) => {
      if (picked != null || !q) return;
      setPicked(i);
      const correct = i === q.correct_index;
      const next = recordResult(stats, q.domain || "Unknown", correct);
      setStats(next);
      saveStats(stateCode, variety.id, next);
    };

    const totalAnswered = Object.values(stats).reduce((s, d) => s + d.total, 0);
    const totalCorrect  = Object.values(stats).reduce((s, d) => s + d.correct, 0);
    const overallPct = totalAnswered ? Math.round(100 * totalCorrect / totalAnswered) : null;

    const weakestDomain = useMemo(() => {
      const rows = Object.entries(stats).filter(([, d]) => d.total >= 3);
      if (rows.length === 0) return null;
      rows.sort((a, b) => (a[1].correct / a[1].total) - (b[1].correct / b[1].total));
      return rows[0][0];
    }, [stats]);

    return (
      <div style={{ display: "grid", gridTemplateColumns: "1.7fr 1fr", gap: 12, alignItems: "start" }}>
        {/* Question card */}
        <div className="panel">
          <div className="panel-h">
            <h3>{variety.name}</h3>
            {variety.question_count && <span className="meta">{variety.question_count} q · {variety.time_minutes} min · {variety.passing_score_pct || 70}% pass</span>}
          </div>
          <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12, minHeight: 360 }}>
            {!q && !busy && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                  Each question is randomly drawn from the official content outline below.
                  Higher-weight domains show up more often. Per-domain accuracy is tracked
                  locally so you can drill what's weak before exam day.
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn btn-primary" onClick={fetchOne}>Start a question</button>
                  {weakestDomain && (
                    <button className="btn btn-ghost" onClick={() => { setDrillDomain(weakestDomain); }} title="Next question will be drawn from your weakest domain">
                      <Icons.Sparkles size={11}/> Drill weakest: {weakestDomain}
                    </button>
                  )}
                </div>
                {drillDomain && (
                  <div style={{ fontSize: 11, color: "var(--accent-status)" }}>
                    Next question will be from <strong>{drillDomain}</strong>.
                  </div>
                )}
              </div>
            )}
            {busy && <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Writing a fresh question…</div>}
            {err && <div style={{ fontSize: 12, color: "var(--state-danger)" }}>{err}</div>}
            {q && (
              <>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {q.domain && <span className="chip">{q.domain}</span>}
                  {q.difficulty && <span className="chip chip-status">{q.difficulty}</span>}
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.55 }}>{q.stem}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {q.options.map((opt, i) => {
                    const isPicked     = picked === i;
                    const isCorrect    = picked != null && i === q.correct_index;
                    const isWrongPick  = picked != null && isPicked && i !== q.correct_index;
                    const bg = isCorrect ? "color-mix(in oklch, var(--accent-money) 18%, transparent)"
                             : isWrongPick ? "color-mix(in oklch, var(--state-danger) 18%, transparent)"
                             : isPicked ? "var(--bg-elevated)" : "var(--bg-raised)";
                    return (
                      <button key={i} className="btn" onClick={() => onPick(i)} disabled={picked != null}
                        style={{
                          justifyContent: "flex-start", textAlign: "left",
                          background: bg,
                          border: "1px solid var(--border-subtle)",
                          padding: "10px 12px", fontSize: 12.5, fontWeight: 400,
                          cursor: picked != null ? "default" : "pointer"
                        }}>
                        <span style={{ fontFamily: "var(--font-mono)", marginRight: 10, color: "var(--text-tertiary)" }}>
                          {String.fromCharCode(65 + i)}.
                        </span>
                        {opt}
                      </button>
                    );
                  })}
                </div>
                {picked != null && (
                  <div style={{ padding: 12, background: "var(--bg-raised)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", fontSize: 12, lineHeight: 1.6 }}>
                    <strong style={{ color: picked === q.correct_index ? "var(--accent-money)" : "var(--state-danger)" }}>
                      {picked === q.correct_index ? "Correct." : `Incorrect — answer was ${String.fromCharCode(65 + q.correct_index)}.`}
                    </strong>
                    {q.explanation && <span style={{ color: "var(--text-secondary)" }}> {q.explanation}</span>}
                  </div>
                )}
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn btn-primary" onClick={fetchOne} disabled={busy}>Next question</button>
                  {weakestDomain && picked != null && (
                    <button className="btn btn-ghost" onClick={() => { setDrillDomain(weakestDomain); }}>
                      <Icons.Sparkles size={11}/> Drill weakest: {weakestDomain}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Stats + content outline sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="panel">
            <div className="panel-h">
              <h3>Your accuracy</h3>
              {overallPct != null && <span className="chip chip-money">{overallPct}% · {totalAnswered} q</span>}
            </div>
            <div style={{ padding: 12 }}>
              {totalAnswered === 0 ? (
                <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>Answer your first question to start tracking accuracy.</div>
              ) : (
                <DomainBars stats={stats} outline={variety.content_outline || []}/>
              )}
            </div>
          </div>
          <ContentOutlineCard variety={variety}/>
        </div>
      </div>
    );
  }

  function DomainBars({ stats, outline }) {
    // Render in outline order (so domains stay consistent), then any extras at the end.
    const outlineDomains = outline.map(o => o.domain);
    const orderedKeys = [
      ...outlineDomains.filter(d => stats[d]),
      ...Object.keys(stats).filter(d => !outlineDomains.includes(d)),
    ];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {orderedKeys.map(dom => {
          const d = stats[dom];
          const pct = d.total ? Math.round(100 * d.correct / d.total) : 0;
          return (
            <div key={dom} style={{ display: "grid", gridTemplateColumns: "1fr 70px 36px", gap: 8, alignItems: "center", fontSize: 11 }}>
              <div style={{ color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={dom}>{dom}</div>
              <div style={{ height: 4, background: "var(--bg-raised)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: pct >= 70 ? "var(--accent-money)" : pct >= 50 ? "var(--accent-status)" : "var(--state-danger)" }}/>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", textAlign: "right" }}>{d.total}q</div>
            </div>
          );
        })}
      </div>
    );
  }

  function ContentOutlineCard({ variety }) {
    const outline = Array.isArray(variety.content_outline) ? variety.content_outline : [];
    if (outline.length === 0) return null;
    const total = outline.reduce((s, d) => s + (d.weight_pct || 0), 0);
    return (
      <div className="panel">
        <div className="panel-h">
          <h3>Content outline</h3>
          <span className="meta">{variety.synthesized ? "generic" : "from candidate handbook"}{total ? ` · ${total}%` : ""}</span>
        </div>
        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {outline.map((d, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 36px", gap: 8, alignItems: "center", fontSize: 12 }}>
                <div style={{ fontWeight: 500 }}>{d.domain}</div>
                <div style={{ fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", textAlign: "right" }}>{d.weight_pct ?? "—"}%</div>
              </div>
              <div style={{ height: 4, background: "var(--bg-raised)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: `${(d.weight_pct || 0)}%`, height: "100%", background: "var(--accent-money)" }}/>
              </div>
              {Array.isArray(d.topics) && d.topics.length > 0 && (
                <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", lineHeight: 1.5 }}>{d.topics.join(" · ")}</div>
              )}
            </div>
          ))}
          {variety.candidate_handbook_url && (
            <a className="btn btn-ghost" href={variety.candidate_handbook_url} target="_blank" rel="noopener noreferrer" style={{ justifyContent: "flex-start", marginTop: 4 }}>
              <Icons.FileText size={11}/> Candidate handbook
            </a>
          )}
        </div>
      </div>
    );
  }

  /* ───── Study Guide tab — one section per outline domain, structured blocks ───── */
  function StudyGuideTab({ stateCode, lineId, lineLabel, variety }) {
    const outline = Array.isArray(variety.content_outline) ? variety.content_outline : [];
    const sections = [
      ...outline.map((d, i) => ({
        section_number: pad2(i + 1),
        domain: d.domain,
        weight_pct: d.weight_pct,
        topics: d.topics,
      })),
      { section_number: "M", domain: "Master Numbers Drill", weight_pct: null, topics: ["Every testable number — time periods, fees, percentages, claims windows"] },
    ];
    const [activeIdx, setActiveIdx] = useState(0);

    return (
      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 12, alignItems: "start" }}>
        {/* Section list */}
        <div className="panel" style={{ position: "sticky", top: 12 }}>
          <div className="panel-h"><h3>Sections</h3><span className="meta">{variety.name}</span></div>
          <div style={{ padding: 6, display: "flex", flexDirection: "column", gap: 2 }}>
            {sections.map((s, i) => (
              <button key={s.section_number}
                onClick={() => setActiveIdx(i)}
                className="btn btn-ghost"
                style={{
                  justifyContent: "flex-start", textAlign: "left",
                  background: activeIdx === i ? "var(--bg-elevated)" : "transparent",
                  fontWeight: activeIdx === i ? 600 : 400,
                  padding: "8px 10px", fontSize: 12,
                  borderLeft: activeIdx === i ? "2px solid var(--accent-money)" : "2px solid transparent",
                }}>
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", marginRight: 8 }}>{s.section_number}</span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.domain}</span>
                {s.weight_pct != null && <span style={{ color: "var(--text-quaternary)", fontFamily: "var(--font-mono)", fontSize: 10.5 }}>{s.weight_pct}%</span>}
              </button>
            ))}
          </div>
        </div>

        <StudyGuideSection
          key={`${stateCode}|${variety.id}|${activeIdx}`}
          stateCode={stateCode}
          lineId={lineId}
          variety={variety}
          section={sections[activeIdx]}
        />
      </div>
    );
  }

  function pad2(n) { return n < 10 ? "0" + n : String(n); }

  const SG_CACHE_KEY = (state, varietyId, section_number) => `repflow.licensing.sg.${state}.${varietyId}.${section_number}`;

  function StudyGuideSection({ stateCode, lineId, variety, section }) {
    const [section_doc, setDoc] = useState(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr]   = useState(null);

    useEffect(() => {
      let alive = true;
      // Cache by (state, variety, section_number) so re-opening doesn't re-cost.
      try {
        const raw = sessionStorage.getItem(SG_CACHE_KEY(stateCode, variety.id, section.section_number));
        if (raw) {
          const cached = JSON.parse(raw);
          if (cached && cached.blocks) { setDoc(cached); return; }
        }
      } catch {}
      // Auto-fetch on mount.
      (async () => {
        setBusy(true); setErr(null);
        try {
          const resp = await fetch("/api/licensing-tutor", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              mode: "study_guide",
              state: stateCode,
              line: lineId,
              variety_name: variety.name,
              domain: section.domain,
              weight_pct: section.weight_pct,
              topics: section.topics,
              section_number: section.section_number,
            })
          });
          const j = await resp.json();
          if (!resp.ok) throw new Error(j.error || `HTTP ${resp.status}`);
          if (!alive) return;
          setDoc(j);
          try { sessionStorage.setItem(SG_CACHE_KEY(stateCode, variety.id, section.section_number), JSON.stringify(j)); } catch {}
        } catch (e) {
          if (alive) setErr(e.message || String(e));
        } finally {
          if (alive) setBusy(false);
        }
      })();
      return () => { alive = false; };
    }, [stateCode, variety.id, section.section_number]);

    const regenerate = () => {
      try { sessionStorage.removeItem(SG_CACHE_KEY(stateCode, variety.id, section.section_number)); } catch {}
      setDoc(null);
      setBusy(false);
      // Force re-mount by toggling state — useEffect dep on doc won't fire, so just trigger directly.
      // Simplest: set busy true and re-call. We mimic the effect body.
      (async () => {
        setBusy(true); setErr(null);
        try {
          const resp = await fetch("/api/licensing-tutor", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              mode: "study_guide",
              state: stateCode,
              line: lineId,
              variety_name: variety.name,
              domain: section.domain,
              weight_pct: section.weight_pct,
              topics: section.topics,
              section_number: section.section_number,
            })
          });
          const j = await resp.json();
          if (!resp.ok) throw new Error(j.error || `HTTP ${resp.status}`);
          setDoc(j);
          try { sessionStorage.setItem(SG_CACHE_KEY(stateCode, variety.id, section.section_number), JSON.stringify(j)); } catch {}
        } catch (e) { setErr(e.message || String(e)); }
        finally { setBusy(false); }
      })();
    };

    return (
      <div className="panel">
        <div className="panel-h">
          <h3>
            <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", marginRight: 8 }}>{section.section_number}</span>
            {section_doc?.title || section.domain.toUpperCase()}
          </h3>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {section.weight_pct != null && <span className="chip">{section.weight_pct}% of exam</span>}
            <button className="btn btn-ghost" onClick={regenerate} disabled={busy} title="Regenerate this section">
              <Icons.Sparkles size={11}/> Regen
            </button>
          </div>
        </div>
        <div style={{ padding: 16 }}>
          {section_doc?.subtitle && (
            <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", fontStyle: "italic", marginBottom: 12 }}>{section_doc.subtitle}</div>
          )}
          {busy && !section_doc && <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Generating section… this takes ~5-10 seconds.</div>}
          {err && <div style={{ fontSize: 12, color: "var(--state-danger)" }}>{err}</div>}
          {section_doc?.blocks && <BlocksRenderer blocks={section_doc.blocks}/>}
          {section_doc && (
            <div style={{ marginTop: 16, fontSize: 10.5, color: "var(--text-quaternary)" }}>
              AI-generated from the {variety.synthesized ? "generic Life outline" : `${variety.exam_vendor || "exam vendor"} candidate handbook`}.
              Verify state-specific numbers against the {stateCode} DOI before exam day.
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ───── Block renderer — the heart of "looks like the VA guide" ───── */
  function BlocksRenderer({ blocks }) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {blocks.map((b, i) => {
          if (!b || typeof b !== "object") return null;
          switch (b.type) {
            case "heading":  return <SectionHeading key={i} text={b.text}/>;
            case "intro":    return <Intro key={i} text={b.text}/>;
            case "table":    return <KeyValueTable key={i} rows={b.rows || []}/>;
            case "bullets":  return <BulletList key={i} items={b.items || []}/>;
            case "callout":  return <Callout key={i} kind={b.kind || "info"} text={b.text}/>;
            default:         return null;
          }
        })}
      </div>
    );
  }

  function SectionHeading({ text }) {
    return (
      <div style={{
        fontSize: 14, fontWeight: 600, color: "var(--accent-money)",
        paddingBottom: 6, borderBottom: "1px solid color-mix(in oklch, var(--accent-money) 25%, transparent)"
      }}>{text}</div>
    );
  }
  function Intro({ text }) {
    return <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.65, padding: "8px 12px", background: "color-mix(in oklch, var(--accent-money) 6%, transparent)", borderRadius: "var(--radius-sm)" }}>{text}</div>;
  }
  function KeyValueTable({ rows }) {
    if (!rows.length) return null;
    const anyValue = rows.some(r => r && r.value);
    return (
      <div style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
        {rows.map((r, i) => {
          if (!r || !r.label) return null;
          return (
            <div key={i} style={{
              display: "grid",
              gridTemplateColumns: anyValue ? "minmax(160px, 1fr) minmax(80px, auto) 2fr" : "minmax(160px, 1fr) 3fr",
              gap: 0,
              borderTop: i === 0 ? "none" : "1px solid var(--border-subtle)",
              fontSize: 12,
            }}>
              <div style={{ padding: "8px 12px", background: "var(--bg-elevated)", fontWeight: 500, color: "var(--text-primary)" }}>{r.label}</div>
              {anyValue && (
                <div style={{ padding: "8px 12px", background: r.value ? "color-mix(in oklch, var(--accent-money) 8%, var(--bg-raised))" : "var(--bg-raised)", fontFamily: r.value ? "var(--font-mono)" : "inherit", fontWeight: 600, color: r.value ? "var(--accent-money)" : "var(--text-quaternary)", textAlign: "center", whiteSpace: "nowrap" }}>
                  {r.value || "—"}
                </div>
              )}
              <div style={{ padding: "8px 12px", background: "var(--bg-raised)", color: "var(--text-secondary)", lineHeight: 1.55 }}>{r.description || ""}</div>
            </div>
          );
        })}
      </div>
    );
  }
  function BulletList({ items }) {
    if (!items.length) return null;
    return (
      <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, lineHeight: 1.6 }}>
        {items.map((it, i) => {
          if (!it) return null;
          return (
            <li key={i} style={{ color: "var(--text-secondary)" }}>
              {it.bold && <strong style={{ color: "var(--text-primary)", marginRight: 6 }}>{it.bold}</strong>}
              {it.text || (typeof it === "string" ? it : "")}
            </li>
          );
        })}
      </ul>
    );
  }
  function Callout({ kind, text }) {
    const style = {
      test_trick: { bg: "color-mix(in oklch, var(--accent-money) 10%, transparent)",   bd: "color-mix(in oklch, var(--accent-money) 35%, transparent)", color: "var(--accent-money)",  prefix: "✓ Test trick: " },
      warning:    { bg: "color-mix(in oklch, var(--state-danger) 10%, transparent)",   bd: "color-mix(in oklch, var(--state-danger) 35%, transparent)", color: "var(--state-danger)",  prefix: "■ " },
      info:       { bg: "color-mix(in oklch, var(--accent-status) 10%, transparent)",  bd: "color-mix(in oklch, var(--accent-status) 35%, transparent)", color: "var(--accent-status)", prefix: "ℹ︎ " },
    }[kind] || { bg: "var(--bg-raised)", bd: "var(--border-subtle)", color: "var(--text-secondary)", prefix: "" };
    return (
      <div style={{ padding: "10px 14px", background: style.bg, border: `1px solid ${style.bd}`, borderRadius: "var(--radius-sm)", fontSize: 12.5, lineHeight: 1.6, color: "var(--text-primary)" }}>
        <span style={{ color: style.color, fontWeight: 600 }}>{style.prefix}</span>{text}
      </div>
    );
  }

  /* ───── Tutor tab (chat) ───── */
  function TutorTab({ stateCode, lineId, lineLabel, variety }) {
    const [turns, setTurns] = useState([]);
    const [draft, setDraft] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr]   = useState(null);
    const bottomRef = useRef(null);

    useEffect(() => { setTurns([]); setErr(null); }, [stateCode, variety.id]);
    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [turns]);

    const ask = async () => {
      const q = draft.trim();
      if (!q || busy) return;
      setDraft(""); setBusy(true); setErr(null);
      const history = turns.slice(-3).map(t => ({ q: t.q, a: t.a }));
      const pendingTurn = { q, a: null };
      setTurns(prev => [...prev, pendingTurn]);
      try {
        const resp = await fetch("/api/licensing-tutor", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode: "tutor", state: stateCode, line: lineId, prompt: q, history })
        });
        const j = await resp.json();
        if (!resp.ok) throw new Error(j.error || `HTTP ${resp.status}`);
        setTurns(prev => prev.map((t, i) => i === prev.length - 1 ? { q, a: j.text || "(empty)", model: j.model, ms: j.ms } : t));
      } catch (e) {
        setErr(e.message || String(e));
        setTurns(prev => prev.slice(0, -1));
      } finally { setBusy(false); }
    };
    const onKey = (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); ask(); } };

    return (
      <div className="panel">
        <div className="panel-h"><h3>Tutor · {variety.name}</h3><span className="meta">⌘↵ to send</span></div>
        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 480, minHeight: 240, overflowY: "auto" }}>
            {turns.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.6, padding: "4px 0" }}>
                Ask anything about {stateCode} {lineLabel} concepts. Plain-language explanations,
                term definitions, mechanics with examples. NOT exam-question content (that's the
                Practice tab — this is concept Q&amp;A only).
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ alignSelf: "flex-end", maxWidth: "80%", background: "var(--bg-elevated)", borderRadius: "var(--radius-sm)", padding: "8px 12px", fontSize: 12.5 }}>{t.q}</div>
                <div style={{ alignSelf: "flex-start", maxWidth: "92%", background: "var(--bg-raised)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", padding: "10px 14px", fontSize: 12.5, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                  {t.a == null ? <span style={{ color: "var(--text-quaternary)" }}>thinking…</span> : t.a}
                </div>
              </div>
            ))}
            <div ref={bottomRef}/>
          </div>
          {err && <div style={{ fontSize: 11, color: "var(--state-danger)" }}>{err}</div>}
          <div style={{ display: "flex", gap: 6 }}>
            <input className="text-input" style={{ flex: 1 }} placeholder={`Ask about ${stateCode} ${lineLabel}…`} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={onKey} disabled={busy}/>
            <button className="btn btn-primary" onClick={ask} disabled={busy || !draft.trim()}>{busy ? "…" : "Send"}</button>
          </div>
        </div>
      </div>
    );
  }

  /* ───── Logistics tab (Requirements + Courses + step-by-step) ───── */
  function LogisticsTab({ stateCode, lineId, lineLabel, cell, stepByStep }) {
    const isPending = !cell || cell.research_pending !== false;
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <RequirementsCard cell={cell} isPending={isPending} stateCode={stateCode} lineLabel={lineLabel}/>
        <CoursesCard cell={cell} isPending={isPending}/>
        <div className="panel" style={{ gridColumn: "1 / -1" }}>
          <div className="panel-h"><h3>How to get licensed — step by step</h3><span className="meta">Applies in every state · specifics above</span></div>
          <div style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
            {(stepByStep || []).map(s => (
              <div key={s.step} style={{ display: "grid", gridTemplateColumns: "28px 1fr", gap: 10, alignItems: "start" }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--bg-raised)", border: "1px solid var(--border-subtle)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 600, fontFamily: "var(--font-mono)" }}>{s.step}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{s.title}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2, lineHeight: 1.55 }}>{s.what}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function Row({ label, value, mono }) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--border-subtle)" }}>
        <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{label}</div>
        <div style={{ fontSize: 12, fontWeight: 500, fontFamily: mono ? "var(--font-mono)" : undefined }}>
          {value == null || value === "" ? <span style={{ color: "var(--text-quaternary)", fontWeight: 400 }}>—</span> : value}
        </div>
      </div>
    );
  }

  function RequirementsCard({ cell, isPending, stateCode, lineLabel }) {
    return (
      <div className="panel">
        <div className="panel-h"><h3>{stateCode} · {lineLabel} requirements</h3>{isPending && <span className="chip chip-status">research pending</span>}</div>
        <div style={{ padding: 12 }}>
          {isPending ? (
            <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", lineHeight: 1.5, padding: "8px 0 12px" }}>
              No cited values yet for this state + line. Fields shown below are the
              shape we'll fill — every value will trace to the state DOI, NIPR, or statute.
            </div>
          ) : null}
          <Row label="Pre-licensing hours" value={cell?.prelicense_hours_required}/>
          <Row label="Course required" value={cell?.prelicense_required_course == null ? null : (cell.prelicense_required_course ? "Yes" : "No")}/>
          <Row label="Exam vendor"        value={cell?.exam_vendor} mono/>
          <Row label="Exam fee"           value={cell?.exam_fee_usd != null ? `$${cell.exam_fee_usd}` : null}/>
          <Row label="Passing score"      value={cell?.exam_passing_score_pct != null ? `${cell.exam_passing_score_pct}%` : null}/>
          <Row label="Question count"     value={cell?.exam_question_count}/>
          <Row label="Time (min)"         value={cell?.exam_time_minutes}/>
          <Row label="Fingerprint req'd"  value={cell?.fingerprint_required == null ? null : (cell.fingerprint_required ? "Yes" : "No")}/>
          <Row label="Fingerprint vendor" value={cell?.fingerprint_vendor}/>
          <Row label="Fingerprint code"   value={cell?.fingerprint_code} mono/>
          <Row label="Fingerprint fee"    value={cell?.fingerprint_fee_usd != null ? `$${cell.fingerprint_fee_usd}` : null}/>
          <Row label="App fee"            value={cell?.license_application_fee_usd != null ? `$${cell.license_application_fee_usd}` : null}/>
          <Row label="Renewal (years)"    value={cell?.license_renewal_years}/>
          <Row label="CE hours / cycle"   value={cell?.ce_hours_per_cycle}/>
          <Row label="CE ethics hours"    value={cell?.ce_ethics_hours}/>
          <Row label="Background check"   value={cell?.background_check}/>
          <Row label="Reciprocity"        value={cell?.reciprocity_notes}/>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {cell?.nipr_path_url && (
              <a className="btn btn-primary" href={cell.nipr_path_url} target="_blank" rel="noopener noreferrer">
                <Icons.FileText size={11}/> Apply on NIPR
              </a>
            )}
            {cell?.state_doi_url && (
              <a className="btn btn-ghost" href={cell.state_doi_url} target="_blank" rel="noopener noreferrer">
                <Icons.FileText size={11}/> State DOI
              </a>
            )}
            {cell?.source_url && (
              <a className="btn btn-ghost" href={cell.source_url} target="_blank" rel="noopener noreferrer" title={cell?.source_quote || ""}>
                <Icons.FileText size={11}/> Source
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  function CoursesCard({ cell, isPending }) {
    const vendors = Array.isArray(cell?.approved_course_vendors) ? cell.approved_course_vendors : [];
    return (
      <div className="panel">
        <div className="panel-h"><h3>Approved pre-licensing courses</h3>{isPending && <span className="chip chip-status">research pending</span>}</div>
        <div style={{ padding: 12 }}>
          {vendors.length === 0 ? (
            <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
              State-approved provider list will appear here once research lands.
              Generic national providers (Kaplan, ExamFX, Insurance Schools Inc.) cover most
              states but are NOT a substitute for the state-DOI-approved list.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {vendors.map((v, i) => (
                <a key={i} className="btn btn-ghost" href={v.url} target="_blank" rel="noopener noreferrer" style={{ justifyContent: "flex-start" }}>
                  <Icons.FileText size={11}/> {v.name}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ───── localStorage helpers ───── */
  function loadStats(state, varietyId) {
    try {
      const raw = localStorage.getItem(PRACTICE_LS_KEY(state, varietyId));
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }
  function saveStats(state, varietyId, stats) {
    try { localStorage.setItem(PRACTICE_LS_KEY(state, varietyId), JSON.stringify(stats)); } catch {}
  }
  function recordResult(stats, domain, correct) {
    const next = { ...stats };
    const prev = next[domain] || { total: 0, correct: 0 };
    next[domain] = { total: prev.total + 1, correct: prev.correct + (correct ? 1 : 0) };
    return next;
  }

  window.PageLicensing = PageLicensing;
})();
