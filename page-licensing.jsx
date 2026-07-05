/* page-licensing.jsx — Licensing teaching surface (practice-first).

   Top-level route /?page=licensing inside the SPA, or /licensing standalone.

   Layout:
     Top picker: State + Exam variety (Life Only / Life & Annuities /
       Life & Health / etc. — states have different combos)
     Tabs: PRACTICE (default) · STUDY GUIDE · TUTOR · LOGISTICS
       * PRACTICE     — variety-scoped questions; domain weights honor
                        content outline %s; per-domain accuracy in
                        localStorage; "Drill weakest domain" CTA.
                        NEW: "Create Exam" mode = adaptive N-question
                        session that reweights toward weak domains in
                        real time.
       * STUDY GUIDE  — STATIC hardcoded sections. No LLM generation.
                        Instant load; curated exam-grade content per
                        domain. Export to Markdown or Print.
       * TUTOR        — chat Q&A scoped to (state, variety) with
                        starter question prompts.
       * LOGISTICS    — Requirements card + Approved courses card +
                        step-by-step roadmap.

   Study guide data lives in /lib/licensing-study-guides.js — an
   inline IIFE exposes window.LicensingStudyGuides = { getStaticGuideSection, domainKey }.

   Data: GET /lib/licensing-data.json. exam_varieties[] under
   states[CODE] (top 15 markets) drives the variety picker. States with
   no curated varieties fall back to a synthesized default per line so
   the UI still works everywhere. */

(function () {
  const { useState, useEffect, useMemo, useRef, useCallback } = React;

  const DATA_URL = "/lib/licensing-data.json?v=12";

  /* ── Static study guide lookup (from lib/licensing-study-guides.js) ──
     That file exposes window.LicensingStudyGuides when loaded as a script.
     We inline a minimal fallback here so the page works even if the
     external file fails to load. */
  function domainKeyLocal(domain) {
    return (domain || "").toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
  }
  function getStaticGuide(lineId, domainName, stateCode, varietyId) {
    const guides = window.LicensingStudyGuides;
    if (guides && guides.getStaticGuideSection) {
      return guides.getStaticGuideSection(lineId, domainName, stateCode, varietyId);
    }
    // Inline fallback — minimal skeleton so the UI doesn't blank out
    return {
      title: (domainName || "Section").toUpperCase(),
      subtitle: "Static guide — full content loads from lib/licensing-study-guides.js",
      blocks: [
        { type: "callout", kind: "info", text: "Study guide content is loading. If this persists, refresh the page." }
      ]
    };
  }

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
            {tab === "logistics"   &&             <LogisticsTab  stateCode={stateCode} lineId={lineId} lineLabel={lineLabel} cell={cell} stepByStep={data._step_by_step_template} stateRec={data.states[stateCode]}/>}
          </>
        )}
      </div>
    );
  }

  /* ───── Practice tab — weighted by content outline, per-domain stats ───── */
  const PRACTICE_LS_KEY = (state, varietyId) => `repflow.licensing.practice.${state}.${varietyId}`;

  /* ── Exam session state machine ──
     mode: "free" | "exam"
     In exam mode, we track questions answered, score per domain, and
     bias the next-question domain selection toward weak domains. */
  function PracticeTab({ stateCode, lineId, lineLabel, variety }) {
    const [mode, setMode]           = useState("free"); // "free" | "exam"
    const [q, setQ]                 = useState(null);
    const [picked, setPicked]       = useState(null);
    const [busy, setBusy]           = useState(false);
    const [err, setErr]             = useState(null);
    const [stats, setStats]         = useState(() => loadStats(stateCode, variety.id));
    const [drillDomain, setDrillDomain] = useState(null);

    // Exam session state
    const [examTotal, setExamTotal]   = useState(20);
    const [examIdx, setExamIdx]       = useState(0);   // 0-based question number
    const [examResults, setExamResults] = useState([]); // [{domain, correct}]
    const [examDone, setExamDone]     = useState(false);

    useEffect(() => {
      setQ(null); setPicked(null); setErr(null); setDrillDomain(null);
      setStats(loadStats(stateCode, variety.id));
      setMode("free"); setExamIdx(0); setExamResults([]); setExamDone(false);
    }, [stateCode, variety.id]);

    const outline = useMemo(() =>
      Array.isArray(variety.content_outline) ? variety.content_outline : [],
    [variety]);

    /* Weighted domain picker — in exam mode, double-weight weak domains */
    const pickWeightedDomain = useCallback((forceWeak = false) => {
      if (drillDomain && !forceWeak) return drillDomain;
      if (outline.length === 0) return null;

      // Build per-domain accuracy from exam results so far (exam mode)
      // OR from lifetime stats (free mode)
      const accuracy = {};
      if (mode === "exam" && examResults.length > 0) {
        examResults.forEach(({ domain, correct }) => {
          if (!accuracy[domain]) accuracy[domain] = { total: 0, correct: 0 };
          accuracy[domain].total++;
          if (correct) accuracy[domain].correct++;
        });
      } else {
        Object.entries(stats).forEach(([d, v]) => { accuracy[d] = v; });
      }

      // Assign weights: outline weight × boost factor for weak domains
      const weighted = outline.map(d => {
        const acc = accuracy[d.domain];
        let boost = 1;
        if (acc && acc.total >= 2) {
          const pct = acc.correct / acc.total;
          if (pct < 0.5) boost = 2.5;      // very weak → 2.5×
          else if (pct < 0.7) boost = 1.7; // weak → 1.7×
        }
        return { domain: d.domain, weight: (d.weight_pct || 1) * boost };
      });
      const total = weighted.reduce((s, w) => s + w.weight, 0);
      const r = Math.random() * total;
      let cum = 0;
      for (const w of weighted) {
        cum += w.weight;
        if (r <= cum) return w.domain;
      }
      return weighted[weighted.length - 1].domain;
    }, [drillDomain, outline, mode, examResults, stats]);

    const fetchOne = useCallback(async (domainOverride, _retryCount = 0) => {
      setBusy(true); setErr(null); setPicked(null); setQ(null);
      const domain = domainOverride || pickWeightedDomain();
      try {
        const resp = await fetch("/api/licensing-tutor", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode: "practice", state: stateCode, line: lineId, domain, variety_id: variety.id, variety_name: variety.name })
        });
        const j = await resp.json();
        if (!resp.ok) throw new Error(j.error || `HTTP ${resp.status}`);
        // Validate that the response has the expected shape
        if (!j.stem || !Array.isArray(j.options) || j.options.length !== 4) {
          throw new Error("Question format issue — retrying with a different model…");
        }
        setQ(j);
        setDrillDomain(null);
      } catch (e) {
        // Auto-retry once before showing error
        if (_retryCount < 1) {
          return fetchOne(domainOverride, _retryCount + 1);
        }
        const msg = String(e.message || e);
        // Strip long technical details for user-friendliness
        if (msg.includes("All models failed") || msg.includes("invalid question")) {
          setErr("AI models are busy — try again in a moment.");
        } else {
          setErr(msg.length > 100 ? msg.slice(0, 100) + "…" : msg);
        }
      } finally {
        setBusy(false);
      }
    }, [stateCode, lineId, variety, pickWeightedDomain]);

    const onPick = (i) => {
      if (picked != null || !q) return;
      setPicked(i);
      const correct = i === q.correct_index;
      const domain = q.domain || "Unknown";
      // Update lifetime stats
      const next = recordResult(stats, domain, correct);
      setStats(next);
      saveStats(stateCode, variety.id, next);
      // Update exam results
      if (mode === "exam") {
        setExamResults(prev => [...prev, { domain, correct }]);
      }
    };

    const onNextExam = () => {
      const nextIdx = examIdx + 1;
      if (nextIdx >= examTotal) {
        setExamDone(true);
      } else {
        setExamIdx(nextIdx);
        fetchOne(); // adaptive domain pick happens inside fetchOne
      }
    };

    const startExam = (total = 20) => {
      setExamTotal(total); setExamIdx(0);
      setExamResults([]); setExamDone(false);
      setMode("exam");
      fetchOne();
    };

    const endExam = () => {
      setMode("free"); setQ(null); setPicked(null);
      setExamDone(false); setExamIdx(0); setExamResults([]);
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

    // Exam session score summary
    const examScore = useMemo(() => {
      if (!examResults.length) return null;
      const correct = examResults.filter(r => r.correct).length;
      const pct = Math.round(100 * correct / examResults.length);
      // Domain breakdown
      const byDomain = {};
      examResults.forEach(({ domain, correct: c }) => {
        if (!byDomain[domain]) byDomain[domain] = { total: 0, correct: 0 };
        byDomain[domain].total++;
        if (c) byDomain[domain].correct++;
      });
      return { correct, total: examResults.length, pct, byDomain };
    }, [examResults]);

    // ── Exam done screen ──
    // Build a shareable text summary of exam results
    const buildResultsSummary = useCallback(() => {
      if (!examScore) return "";
      const passPct = variety.passing_score_pct || 70;
      const passed = examScore.pct >= passPct;
      let txt = `Practice Exam Results — ${variety.name}\n`;
      txt += `Score: ${examScore.correct}/${examScore.total} (${examScore.pct}%) — ${passed ? "PASS" : "NEEDS WORK"}\n`;
      txt += `Passing threshold: ${passPct}%\n\n`;
      txt += `Domain Breakdown:\n`;
      Object.entries(examScore.byDomain)
        .sort((a, b) => (a[1].correct / a[1].total) - (b[1].correct / b[1].total))
        .forEach(([dom, d]) => {
          const pct = Math.round(100 * d.correct / d.total);
          txt += `  ${dom}: ${d.correct}/${d.total} (${pct}%)\n`;
        });
      txt += `\nDate: ${new Date().toLocaleString()}\n`;
      return txt;
    }, [examScore, variety]);

    const copyResults = useCallback(async () => {
      const txt = buildResultsSummary();
      try { await navigator.clipboard.writeText(txt); } catch {}
    }, [buildResultsSummary]);

    // Save session results to localStorage for history
    useEffect(() => {
      if (examDone && examScore) {
        try {
          const key = `repflow_exam_history_${stateCode}_${variety.id}`;
          const history = JSON.parse(localStorage.getItem(key) || "[]");
          history.push({
            date: new Date().toISOString(),
            total: examScore.total,
            correct: examScore.correct,
            pct: examScore.pct,
            byDomain: examScore.byDomain,
          });
          // Keep last 20 sessions
          if (history.length > 20) history.splice(0, history.length - 20);
          localStorage.setItem(key, JSON.stringify(history));
        } catch {}
      }
    }, [examDone, examScore, stateCode, variety.id]);

    // ── Exam done screen ──
    if (examDone && examScore) {
      const passPct = variety.passing_score_pct || 70;
      const passed = examScore.pct >= passPct;
      return (
        <div style={{ display: "grid", gridTemplateColumns: "1.7fr 1fr", gap: 12, alignItems: "start" }}>
          <div className="panel">
            <div className="panel-h">
              <h3>Exam Complete</h3>
              <span className={`chip ${passed ? "chip-money" : ""}`} style={{ background: passed ? undefined : "color-mix(in oklch, var(--state-danger) 18%, transparent)", color: passed ? undefined : "var(--state-danger)" }}>
                {examScore.pct}% · {passed ? "PASS" : "Not yet"}
              </span>
            </div>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-secondary)" }}>
                You answered <strong style={{ color: "var(--text-primary)" }}>{examScore.correct}/{examScore.total}</strong> correctly ({examScore.pct}%).
                {passed
                  ? " Great work — you're trending above the passing threshold."
                  : ` Need ${passPct}% to pass. Focus on your weak domains below.`}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {Object.entries(examScore.byDomain)
                  .sort((a, b) => (a[1].correct / a[1].total) - (b[1].correct / b[1].total))
                  .map(([dom, d]) => {
                    const pct = Math.round(100 * d.correct / d.total);
                    return (
                      <div key={dom} style={{ display: "grid", gridTemplateColumns: "1fr 70px 40px", gap: 8, alignItems: "center", fontSize: 11.5 }}>
                        <div style={{ color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dom}</div>
                        <div style={{ height: 5, background: "var(--bg-raised)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: pct >= 70 ? "var(--accent-money)" : pct >= 50 ? "var(--accent-status)" : "var(--state-danger)" }}/>
                        </div>
                        <div style={{ fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", textAlign: "right" }}>{d.correct}/{d.total}</div>
                      </div>
                    );
                  })}
              </div>
              {/* Action buttons */}
              <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                <button className="btn btn-primary" onClick={() => startExam(examTotal)}>Retry same length</button>
                <button className="btn btn-ghost" onClick={() => startExam(Math.min(examTotal + 10, 100))}>Longer exam ({Math.min(examTotal + 10, 100)}q)</button>
                <button className="btn btn-ghost" onClick={endExam}>Free practice</button>
              </div>
              {/* Share / AI tips row */}
              <div style={{ display: "flex", gap: 8, borderTop: "1px solid var(--border-subtle)", paddingTop: 10 }}>
                <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={copyResults} title="Copy your results to the clipboard — paste into ChatGPT, the tutor tab, or share with a mentor">
                  <Icons.Copy size={11}/> Copy Results
                </button>
                <button className="btn btn-ghost" style={{ fontSize: 11, background: "color-mix(in oklch, var(--accent-status) 10%, transparent)", border: "1px solid color-mix(in oklch, var(--accent-status) 25%, transparent)", color: "var(--accent-status)" }}
                  onClick={() => {
                    // Pre-fill the tutor with the results summary
                    const summary = buildResultsSummary();
                    const prompt = `Here are my practice exam results:\n\n${summary}\n\nBased on these results, what specific topics should I focus on to improve my weak areas? Give me a targeted study plan.`;
                    // Store in sessionStorage so the tutor tab can pick it up
                    try { sessionStorage.setItem("repflow_tutor_prefill", prompt); } catch {}
                    // Switch to tutor tab via URL hash
                    const url = new URL(window.location);
                    url.searchParams.set("tab", "tutor");
                    window.history.pushState({}, "", url);
                    window.dispatchEvent(new PopStateEvent("popstate"));
                  }}
                  title="Send your results to the AI tutor for personalized study tips">
                  <Icons.Sparkles size={11}/> Get AI Study Tips
                </button>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <ExamProgressCard examIdx={examIdx} examTotal={examTotal} examScore={examScore} />
            <ContentOutlineCard variety={variety}/>
          </div>
        </div>
      );
    }

    return (
      <div style={{ display: "grid", gridTemplateColumns: "1.7fr 1fr", gap: 12, alignItems: "start" }}>
        {/* Question card */}
        <div className="panel">
          <div className="panel-h">
            <h3>{variety.name}</h3>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {mode === "exam" && (
                <span className="chip chip-status">Exam {examIdx + 1}/{examTotal}</span>
              )}
              {variety.question_count && <span className="meta">{variety.question_count} q · {variety.time_minutes} min · {variety.passing_score_pct || 70}% pass</span>}
            </div>
          </div>
          <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12, minHeight: 360 }}>
            {!q && !busy && mode === "free" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                  Practice one question at a time, or launch a full practice exam. Questions are weighted by
                  the official content outline — weak domains get extra reps automatically.
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button className="btn btn-primary" onClick={() => fetchOne()}>Start a question</button>
                  <button className="btn btn-ghost" style={{ background: "color-mix(in oklch, var(--accent-money) 10%, transparent)", border: "1px solid color-mix(in oklch, var(--accent-money) 30%, transparent)", color: "var(--accent-money)" }}
                    onClick={() => startExam(20)}>
                    <Icons.Sparkles size={11}/> Create Exam (20q)
                  </button>
                  <button className="btn btn-ghost" onClick={() => startExam(50)}>
                    <Icons.Sparkles size={11}/> Create Exam (50q)
                  </button>
                  <button className="btn btn-ghost" style={{ background: "color-mix(in oklch, var(--accent-status) 10%, transparent)", border: "1px solid color-mix(in oklch, var(--accent-status) 30%, transparent)", color: "var(--accent-status)" }}
                    onClick={() => startExam(100)}>
                    <Icons.Sparkles size={11}/> Full Exam (100q)
                  </button>
                  {weakestDomain && (
                    <button className="btn btn-ghost" onClick={() => { setDrillDomain(weakestDomain); fetchOne(weakestDomain); }} title="Next question will be drawn from your weakest domain">
                      Drill weakest: {weakestDomain}
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
            {busy && (
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ display: "inline-block", width: 12, height: 12, border: "2px solid var(--border-subtle)", borderTopColor: "var(--accent-money)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
                {mode === "exam" ? `Generating question ${examIdx + 1} of ${examTotal}…` : "Writing a fresh question…"}
              </div>
            )}
            {err && <div style={{ fontSize: 12, color: "var(--state-danger)" }}>{err}<button className="btn btn-ghost" style={{ marginLeft: 8 }} onClick={() => fetchOne()}>Retry</button></div>}
            {q && (
              <>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {q.domain && <span className="chip">{q.domain}</span>}
                  {q.difficulty && <span className="chip chip-status">{q.difficulty}</span>}
                  {q.source === "bank" && <span className="chip chip-money" title="From the pre-generated question bank">bank</span>}
                  {mode === "exam" && examScore && (
                    <span className="chip" style={{ marginLeft: "auto" }}>{examScore.correct}/{examResults.length} correct so far</span>
                  )}
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
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {mode === "exam" ? (
                    picked != null ? (
                      <button className="btn btn-primary" onClick={onNextExam} disabled={busy}>
                        {examIdx + 1 >= examTotal ? "Finish exam" : `Next (${examIdx + 2}/${examTotal})`}
                      </button>
                    ) : null
                  ) : (
                    <>
                      <button className="btn btn-primary" onClick={() => fetchOne()} disabled={busy}>Next question</button>
                      {weakestDomain && picked != null && (
                        <button className="btn btn-ghost" onClick={() => { setDrillDomain(weakestDomain); }}>
                          Drill weakest: {weakestDomain}
                        </button>
                      )}
                    </>
                  )}
                  {mode === "exam" && (
                    <button className="btn btn-ghost" onClick={endExam} style={{ marginLeft: "auto" }}>Exit exam</button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Stats + content outline sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {mode === "exam" && examScore ? (
            <ExamProgressCard examIdx={examIdx} examTotal={examTotal} examScore={examScore} />
          ) : (
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
          )}
          <ContentOutlineCard variety={variety}/>
        </div>
      </div>
    );
  }

  function ExamProgressCard({ examIdx, examTotal, examScore }) {
    const pct = examScore ? examScore.pct : 0;
    return (
      <div className="panel">
        <div className="panel-h">
          <h3>Exam progress</h3>
          <span className="chip">{examIdx}/{examTotal} answered</span>
        </div>
        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ textAlign: "center", padding: "8px 0" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: pct >= 70 ? "var(--accent-money)" : pct >= 50 ? "var(--accent-status)" : "var(--state-danger)" }}>{pct}%</div>
              <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>current score</div>
            </div>
            <div style={{ textAlign: "center", padding: "8px 0" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text-secondary)" }}>{examScore?.correct || 0}/{examScore?.total || 0}</div>
              <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>correct</div>
            </div>
          </div>
          <div style={{ height: 6, background: "var(--bg-raised)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: `${Math.round(100 * (examIdx) / examTotal)}%`, height: "100%", background: "var(--accent-money)", transition: "width 0.3s" }}/>
          </div>
          <div style={{ fontSize: 10.5, color: "var(--text-quaternary)", textAlign: "center" }}>
            Questions adapt toward your weakest domains in real time.
          </div>
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

  /* ───── Study Guide tab — STATIC hardcoded sections, instant load ───── */
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

    const activeSection = sections[activeIdx];
    const guideDoc = activeSection ? getStaticGuide(lineId, activeSection.domain, stateCode, variety?.id) : null;

    const handleExport = () => {
      if (!guideDoc) return;
      const lines = [];
      lines.push(`# ${guideDoc.title}`);
      if (guideDoc.subtitle) lines.push(`*${guideDoc.subtitle}*`);
      lines.push("");
      (guideDoc.blocks || []).forEach(b => {
        if (!b) return;
        if (b.type === "heading") { lines.push(`## ${b.text}`); lines.push(""); }
        else if (b.type === "intro") { lines.push(b.text); lines.push(""); }
        else if (b.type === "table") {
          lines.push("| Term | Value | Description |");
          lines.push("|---|---|---|");
          (b.rows || []).forEach(r => {
            if (r) lines.push(`| ${r.label || ""} | ${r.value || "—"} | ${r.description || ""} |`);
          });
          lines.push("");
        } else if (b.type === "bullets") {
          (b.items || []).forEach(it => {
            if (!it) return;
            const bold = it.bold ? `**${it.bold}** ` : "";
            const text = it.text || (typeof it === "string" ? it : "");
            lines.push(`- ${bold}${text}`);
          });
          lines.push("");
        } else if (b.type === "callout") {
          lines.push(`> **${b.kind === "test_trick" ? "Test Trick" : b.kind === "warning" ? "Warning" : "Info"}:** ${b.text}`);
          lines.push("");
        }
      });
      lines.push(`---`);
      lines.push(`*Source: RepFlow Licensing Study Guide · ${stateCode} · ${lineLabel} · Verify state-specific details against the ${stateCode} DOI before exam day.*`);
      const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${stateCode}-${lineId}-${(activeSection.domain || "guide").replace(/\s+/g, "-").toLowerCase()}.md`;
      a.click(); URL.revokeObjectURL(url);
    };

    const handleDownloadAllPDF = () => {
      // Collect all sections from static guide
      const allSections = sections.map((s, idx) => {
        const doc = getStaticGuide(lineId, s.domain, stateCode, variety?.id);
        if (!doc || !doc.blocks) return null;
        return { section: s, doc };
      }).filter(Boolean);

      const renderBlocks = (blocks) => {
        if (!blocks) return "";
        return blocks.map(b => {
          if (!b) return "";
          if (b.type === "heading") {
            return `<h3 style="color:#00d4aa;font-size:13pt;margin:18pt 0 6pt;border-bottom:1px solid #e5dfd3;padding-bottom:4pt;">${b.text}</h3>`;
          }
          if (b.type === "intro") {
            return `<p style="font-size:10pt;color:#555;line-height:1.65;background:#f0f8f5;padding:8pt 12pt;border-radius:4pt;">${b.text}</p>`;
          }
          if (b.type === "table") {
            const rows = (b.rows || []).filter(Boolean).map(r =>
              `<tr><td style="padding:5pt 10pt;font-weight:600;background:#f8f8f8;width:160pt;">${r.label||""}</td><td style="padding:5pt 10pt;font-family:monospace;color:#007a66;">${r.value||"\u2014"}</td><td style="padding:5pt 10pt;color:#555;">${r.description||""}</td></tr>`
            ).join("");
            return `<table style="width:100%;border-collapse:collapse;border:1px solid #e0e0e0;font-size:9.5pt;margin:8pt 0;">${rows}</table>`;
          }
          if (b.type === "bullets") {
            const items = (b.items || []).filter(Boolean).map(it => {
              const bold = it.bold ? `<strong>${it.bold}</strong> ` : "";
              const text = it.text || (typeof it === "string" ? it : "");
              return `<li style="margin:3pt 0;color:#333;">${bold}${text}</li>`;
            }).join("");
            return `<ul style="margin:6pt 0;padding-left:20pt;font-size:10pt;">${items}</ul>`;
          }
          if (b.type === "callout") {
            const colors = {
              test_trick: { bg: "#e8f7f3", bd: "#00d4aa", label: "✓ Test Trick" },
              warning:    { bg: "#fef2f2", bd: "#dc2626", label: "⚠ Warning" },
              info:       { bg: "#eff6ff", bd: "#2563eb", label: "ℹ Info" },
            }[b.kind] || { bg: "#f8f8f8", bd: "#ccc", label: "Note" };
            return `<div style="background:${colors.bg};border-left:3pt solid ${colors.bd};padding:8pt 12pt;margin:8pt 0;font-size:9.5pt;border-radius:3pt;"><strong style="color:${colors.bd};">${colors.label}:</strong> ${b.text}</div>`;
          }
          return "";
        }).join("\n");
      };

      const sectionHTML = allSections.map(({ section, doc }, i) => {
        const pct = section.weight_pct != null ? ` <span style="font-size:9pt;color:#888;">(${section.weight_pct}% of exam)</span>` : "";
        return `
          <div style="page-break-before:${i > 0 ? "always" : "auto"};padding:0;">
            <div style="display:flex;align-items:baseline;gap:10pt;margin-bottom:10pt;">
              <span style="font-family:monospace;font-size:10pt;color:#888;">${section.section_number}</span>
              <h2 style="font-size:15pt;margin:0;color:#111;">${doc.title}</h2>${pct}
            </div>
            ${doc.subtitle ? `<p style="font-size:9.5pt;color:#888;font-style:italic;margin:0 0 12pt;">${doc.subtitle}</p>` : ""}
            ${renderBlocks(doc.blocks)}
          </div>`;
      }).join("\n");

      const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${stateCode} ${lineLabel} — Complete Study Guide — RepFlow</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; font-family: Inter, system-ui, sans-serif; background: #fff; color: #111; }
    body { padding: 36pt 48pt 72pt; }
    h1 { font-size: 22pt; margin: 0 0 4pt; color: #111; }
    .cover-meta { font-size: 10pt; color: #666; margin-bottom: 24pt; }
    .cover-meta span { color: #00a88a; font-weight: 600; }
    .divider { border: none; border-top: 2px solid #00d4aa; margin: 18pt 0; }
    .footer-bar { position: fixed; bottom: 0; left: 0; right: 0;
      padding: 6pt 24pt; border-top: 1pt solid #ddd;
      display: flex; justify-content: space-between;
      font-size: 7.5pt; color: #999; background: #fff; }
    @media print {
      body { padding: 0.5in 0.65in 1.1in; }
      .footer-bar { display: flex !important; }
    }
    table tr:nth-child(even) td { background: #f9f9f9; }
  </style>
</head>
<body>
  <div class="footer-bar">
    <span>${stateCode} ${lineLabel} Complete Study Guide &mdash; RepFlow by Koino Capital</span>
    <span>repflow.koino.capital/licensing &bull; &copy; ${new Date().getFullYear()} koino.capital &bull; ${today}</span>
  </div>
  <h1>${stateCode} ${lineLabel}</h1>
  <p style="font-size:18pt;font-weight:600;color:#00a88a;margin:0 0 8pt;">Complete Study Guide</p>
  <div class="cover-meta">
    <span>${allSections.length} sections</span> &nbsp;&middot;&nbsp;
    Generated by <strong>RepFlow</strong> by Koino Capital &nbsp;&middot;&nbsp; ${today}<br/>
    <em>Verify all state-specific figures (fees, CE hours, time limits) against the ${stateCode} DOI or official candidate handbook before exam day.</em>
  </div>
  <hr class="divider"/>
  ${sectionHTML}
  <div style="margin-top:40pt;padding-top:16pt;border-top:1pt solid #e0e0e0;font-size:8.5pt;color:#888;">
    <strong>Disclaimer:</strong> This study guide is compiled from publicly available state DOI handbooks and NIPR records for educational purposes.
    Always verify state-specific requirements at your state Department of Insurance before relying on exam day.
    RepFlow is a product of Koino Capital &mdash; <a href="https://koino.capital" style="color:#00a88a;">koino.capital</a>
  </div>
</body>
</html>`;

      const win = window.open("", "_blank", "width=900,height=700");
      if (!win) { alert("Pop-up blocked. Please allow pop-ups to download the PDF."); return; }
      win.document.write(html);
      win.document.close();
      setTimeout(() => { win.focus(); win.print(); }, 600);
    };

    const handlePrint = () => { window.print(); };

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

        {/* Section content — static, instant */}
        <div className="panel">
          <div className="panel-h">
            <h3>
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", marginRight: 8 }}>{activeSection?.section_number}</span>
              {guideDoc?.title || (activeSection?.domain || "").toUpperCase()}
            </h3>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {activeSection?.weight_pct != null && <span className="chip">{activeSection.weight_pct}% of exam</span>}
              <span className="chip chip-money">instant</span>
              <button className="btn btn-ghost" onClick={handleExport} title="Download this section as Markdown">
                <Icons.FileText size={11}/> Export .md
              </button>
              <button className="btn btn-primary" onClick={handleDownloadAllPDF}
                title="Download the full study guide for all sections as a PDF"
                style={{ background: "color-mix(in oklch, var(--accent-money) 15%, var(--bg-elevated))", color: "var(--accent-money)", border: "1px solid color-mix(in oklch, var(--accent-money) 35%, transparent)" }}>
                <Icons.FileText size={11}/> Download Full PDF
              </button>
            </div>
          </div>
          <div style={{ padding: 16 }}>
            {guideDoc?.subtitle && (
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", fontStyle: "italic", marginBottom: 12 }}>{guideDoc.subtitle}</div>
            )}
            {guideDoc?.blocks ? (
              <BlocksRenderer blocks={guideDoc.blocks}/>
            ) : (
              <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", padding: "12px 0" }}>
                No static content available for this domain yet. Use the Tutor tab to ask about it.
              </div>
            )}
            <div style={{ marginTop: 16, fontSize: 10.5, color: "var(--text-quaternary)", borderTop: "1px solid var(--border-subtle)", paddingTop: 12 }}>
              Curated study guide · {stateCode} {lineLabel} · Verify state-specific numbers (CE hours, DOI fines, suitability training hours) against the {stateCode} DOI or candidate handbook before exam day.
            </div>
          </div>
        </div>
      </div>
    );
  }

  function pad2(n) { return n < 10 ? "0" + n : String(n); }

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

  /* ───── Tutor tab (chat) — with starter prompts ───── */
  const TUTOR_STARTERS = {
    life: [
      "Explain the difference between whole life and universal life like I'm brand new.",
      "What's the difference between twisting and churning? Give me an example of each.",
      "Walk me through the 7-pay test and when a policy becomes a MEC.",
      "What are the nonforfeiture options and when would a client use each one?",
      "Explain the difference between a revocable and irrevocable beneficiary designation.",
      "How does the incontestability clause protect the insured?",
    ],
    health: [
      "What's the difference between an HMO, PPO, and POS plan?",
      "Explain COBRA — who qualifies and how long can they stay on it?",
      "Walk me through Medicare Parts A, B, C, and D in simple terms.",
      "What is a Medigap plan and how does it differ from Medicare Advantage?",
      "What is HIPAA and why does it matter for health insurance agents?",
      "Explain the difference between a deductible, copay, and coinsurance.",
    ],
    annuity: [
      "What's the difference between a fixed and indexed annuity?",
      "Why does an annuity require a securities license if it's variable?",
      "Walk me through how the 1035 exchange works for annuities.",
      "What is LIFO taxation and how does it affect annuity withdrawals?",
      "Explain surrender charges — what are they and why do they exist?",
      "What does 'best interest' mean under NAIC Model 275?",
    ],
    mortgage_protection: [
      "What license do I need to sell mortgage protection insurance?",
      "What are the key advertising rules I must follow when sending MP mailers?",
      "Explain the difference between twisting and replacement in the MP context.",
      "What is a Notice Regarding Replacement and when do I need to provide one?",
      "What makes a mortgage protection mailer illegal — give me examples.",
      "Walk me through decreasing term vs. level term for mortgage protection.",
    ],
  };

  function TutorTab({ stateCode, lineId, lineLabel, variety }) {
    const [turns, setTurns] = useState([]);
    const [draft, setDraft] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr]   = useState(null);
    const bottomRef = useRef(null);
    const inputRef = useRef(null);

    const starters = TUTOR_STARTERS[lineId] || TUTOR_STARTERS.life;

    useEffect(() => { setTurns([]); setErr(null); setDraft(""); }, [stateCode, variety.id]);
    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [turns]);

    // Pick up prefilled prompt from exam results "Get AI Study Tips" button
    useEffect(() => {
      try {
        const prefill = sessionStorage.getItem("repflow_tutor_prefill");
        if (prefill) {
          sessionStorage.removeItem("repflow_tutor_prefill");
          // Small delay to ensure component is mounted
          setTimeout(() => ask(prefill), 300);
        }
      } catch {}
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const ask = async (questionOverride) => {
      const q = (questionOverride || draft).trim();
      if (!q || busy) return;
      setDraft(""); setBusy(true); setErr(null);
      const history = turns.slice(-4).map(t => ({ q: t.q, a: t.a }));
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
      } finally {
        setBusy(false);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    };
    const onKey = (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); ask(); } };

    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 12, alignItems: "start" }}>
        {/* Chat panel */}
        <div className="panel">
          <div className="panel-h">
            <h3>AI Tutor · {stateCode} {lineLabel}</h3>
            <span className="meta">{variety.name} · ⌘↵ to send</span>
          </div>
          <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 520, minHeight: 260, overflowY: "auto" }}>
              {turns.length === 0 && (
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.7, padding: "4px 0 8px" }}>
                  <div style={{ fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Your {stateCode} {lineLabel} tutor is ready.</div>
                  Ask anything about {lineLabel} concepts — plain-language explanations, term definitions,
                  mechanics with examples. Or click a starter question →<br/>
                  <span style={{ fontSize: 11 }}>Concept Q&amp;A only; exam questions live in the Practice tab.</span>
                </div>
              )}
              {turns.map((t, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ alignSelf: "flex-end", maxWidth: "82%", background: "color-mix(in oklch, var(--accent-money) 10%, var(--bg-elevated))", border: "1px solid color-mix(in oklch, var(--accent-money) 25%, transparent)", borderRadius: "var(--radius-sm)", padding: "8px 12px", fontSize: 12.5 }}>{t.q}</div>
                  <div style={{ alignSelf: "flex-start", maxWidth: "94%", background: "var(--bg-raised)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", padding: "10px 14px", fontSize: 12.5, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
                    {t.a == null ? (
                      <span style={{ color: "var(--text-quaternary)", display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ display: "inline-block", width: 10, height: 10, border: "2px solid var(--border-subtle)", borderTopColor: "var(--accent-money)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
                        thinking…
                      </span>
                    ) : t.a}
                  </div>
                  {t.ms && <div style={{ fontSize: 10, color: "var(--text-quaternary)", alignSelf: "flex-start", paddingLeft: 4 }}>{t.model} · {t.ms}ms</div>}
                </div>
              ))}
              <div ref={bottomRef}/>
            </div>
            {err && <div style={{ fontSize: 11, color: "var(--state-danger)" }}>Error: {err}</div>}
            <div style={{ display: "flex", gap: 6 }}>
              <input ref={inputRef} className="text-input" style={{ flex: 1 }}
                placeholder={`Ask about ${stateCode} ${lineLabel}…`}
                value={draft} onChange={e => setDraft(e.target.value)}
                onKeyDown={onKey} disabled={busy}/>
              <button className="btn btn-primary" onClick={() => ask()} disabled={busy || !draft.trim()}>
                {busy ? "…" : "Send"}
              </button>
            </div>
          </div>
        </div>

        {/* Starter questions */}
        <div className="panel">
          <div className="panel-h"><h3>Quick questions</h3></div>
          <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 4 }}>
            {starters.map((s, i) => (
              <button key={i} className="btn btn-ghost"
                style={{ justifyContent: "flex-start", textAlign: "left", fontSize: 11.5, lineHeight: 1.5, padding: "8px 10px", opacity: busy ? 0.5 : 1 }}
                onClick={() => ask(s)} disabled={busy}>
                {s}
              </button>
            ))}
            {turns.length > 0 && (
              <button className="btn btn-ghost" style={{ marginTop: 8, fontSize: 11, color: "var(--text-tertiary)" }}
                onClick={() => { setTurns([]); setErr(null); }}>
                Clear conversation
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ───── Logistics tab (Requirements + Courses + step-by-step) ───── */
  function LogisticsTab({ stateCode, lineId, lineLabel, cell, stepByStep, stateRec }) {
    const isPending = !cell || cell.research_pending !== false;
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <RequirementsCard cell={cell} isPending={isPending} stateCode={stateCode} lineLabel={lineLabel}/>
        <CoursesCard cell={cell} isPending={isPending} stateRec={stateRec} lineId={lineId}/>
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

  function CoursesCard({ cell, isPending, stateRec, lineId }) {
    // Prefer the state-level approved_courses (from the DOI courses batch) over the
    // older per-cell approved_course_vendors. Filter by line of authority when the
    // course rows carry lines_covered.
    const stateCourses = Array.isArray(stateRec?.approved_courses) ? stateRec.approved_courses : [];
    const filtered = stateCourses.filter(c => !Array.isArray(c?.lines_covered) || c.lines_covered.includes(lineId));
    const vendors  = filtered.length > 0 ? filtered : (Array.isArray(cell?.approved_course_vendors) ? cell.approved_course_vendors : []);
    const courseMeta = stateRec?.course_meta || {};
    const educationRequired = courseMeta.education_required;

    return (
      <div className="panel">
        <div className="panel-h">
          <h3>Approved pre-licensing courses</h3>
          {educationRequired === false && <span className="chip chip-money">not required in this state</span>}
          {educationRequired === true && vendors.length === 0 && isPending && <span className="chip chip-status">research pending</span>}
        </div>
        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {educationRequired === false && (
            <div style={{ fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.55 }}>
              {courseMeta.pre_licensing_notes || `This state has eliminated mandatory pre-licensing education for ${lineId} producers. You can sit the exam directly — providers below are optional but commonly used by candidates who want structured prep.`}
            </div>
          )}
          {vendors.length === 0 ? (
            educationRequired === false ? null : (
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
                State-approved provider list will appear here once research lands.
                Generic national providers (Kaplan, ExamFX, A.D. Banker, WebCE, Xcel
                Solutions) cover most states but are NOT a substitute for the
                state-DOI-approved list.
              </div>
            )
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {vendors.map((v, i) => (
                <a key={i} className="btn btn-ghost" href={v.url} target="_blank" rel="noopener noreferrer" style={{ justifyContent: "flex-start", textAlign: "left" }}>
                  <Icons.FileText size={11}/>
                  <span style={{ flex: 1, marginLeft: 6 }}>{v.name}</span>
                  {Array.isArray(v.formats) && v.formats.length > 0 && (
                    <span style={{ fontSize: 10, color: "var(--text-quaternary)" }}>{v.formats.join(" · ")}</span>
                  )}
                </a>
              ))}
            </div>
          )}
          {courseMeta.lookup_tool_url && (
            <a className="btn btn-ghost" href={courseMeta.lookup_tool_url} target="_blank" rel="noopener noreferrer" style={{ justifyContent: "flex-start", marginTop: 4 }}>
              <Icons.FileText size={11}/> Official DOI provider lookup
            </a>
          )}
          {courseMeta.doi_approved_providers_url && courseMeta.doi_approved_providers_url !== courseMeta.lookup_tool_url && (
            <a className="btn btn-ghost" href={courseMeta.doi_approved_providers_url} target="_blank" rel="noopener noreferrer" style={{ justifyContent: "flex-start" }}>
              <Icons.FileText size={11}/> State DOI providers page
            </a>
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
