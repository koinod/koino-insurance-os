/* page-licensing.jsx — Licensing teaching surface.

   Top-level route /?page=licensing (or repflow.koino.capital/licensing
   once we add a clean URL handler). Sits between recruiting (where reps
   land in Applied/Discovery) and the "Licensed" stage in page-recruits.jsx
   — collapsing the multi-week "what do I even do to get licensed" gap that
   eats recruit activation.

   Surface: state picker + line picker + step-by-step roadmap + per-state
   requirements + approved course vendors + (stubs) study guide + practice
   exam. Honest "research pending" rendering when data is null — every
   value will trace to a cited source (see lib/licensing-data.json
   _research_batch_instructions). NO invented codes or fees.

   Data source today: GET /lib/licensing-data.json. When the 50-state
   research batch lands, migrate to public.licensing_requirements +
   hydrateFromSupabase() following the rate-engine pattern. */

(function () {
  const { useState, useEffect, useMemo } = React;

  const DATA_URL = "/lib/licensing-data.json?v=4";

  function PageLicensing({ role = "manager" }) {
    const [data, setData] = useState(null);
    const [err, setErr]   = useState(null);
    const [stateCode, setStateCode] = useState("");
    const [lineId, setLineId]       = useState("life");

    useEffect(() => {
      let alive = true;
      fetch(DATA_URL, { cache: "no-store" })
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then(j => { if (alive) setData(j); })
        .catch(e => { if (alive) setErr(e.message || String(e)); });
      return () => { alive = false; };
    }, []);

    const states = useMemo(() => {
      if (!data) return [];
      return Object.entries(data.states).map(([code, s]) => ({ code, name: s.name }));
    }, [data]);

    const lines = data?._lines || [];
    const cell = useMemo(() => {
      if (!data || !stateCode) return null;
      const s = data.states[stateCode];
      if (!s) return null;
      return s.lines && s.lines[lineId] ? s.lines[lineId] : null;
    }, [data, stateCode, lineId]);

    const isPending = !cell || cell.research_pending !== false;

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
              State-by-state roadmap to a producer license · Life · Health · Annuity · Mortgage Protection
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

        {/* Picker row */}
        <div className="panel" style={{ padding: 12, marginBottom: 12, display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, alignItems: "end" }}>
          <Shared.Field label="State">
            <select className="text-input" value={stateCode} onChange={(e) => setStateCode(e.target.value)}>
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
                  onClick={() => setLineId(l.id)}>
                  {l.label}
                </button>
              ))}
            </div>
          </Shared.Field>
        </div>

        {/* Step-by-step roadmap (state-agnostic — always shows) */}
        <div className="panel" style={{ marginBottom: 12 }}>
          <div className="panel-h"><h3>How to get licensed — step by step</h3><span className="meta">Applies in every state · specifics below</span></div>
          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {data._step_by_step_template.map(s => (
              <div key={s.step} style={{ display: "grid", gridTemplateColumns: "28px 1fr", gap: 10, alignItems: "start" }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--bg-raised)", border: "1px solid var(--border-subtle)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 600, fontFamily: "var(--font-mono)" }}>{s.step}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{s.title}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2, lineHeight: 1.5 }}>{s.what}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Per-state-per-line specifics */}
        {!stateCode ? (
          <div className="panel" style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
            Pick a state above to see exam vendor, fingerprinting code, fees, CE hours, and the direct NIPR apply link.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <RequirementsCard cell={cell} isPending={isPending} stateCode={stateCode} lineLabel={(lines.find(l => l.id === lineId) || {}).label || lineId}/>
            <CoursesCard cell={cell} isPending={isPending}/>
            <StudyGuide stateCode={stateCode} lineId={lineId} lineLabel={(lines.find(l => l.id === lineId) || {}).label || lineId}/>
            <PracticeExam stateCode={stateCode} lineId={lineId} lineLabel={(lines.find(l => l.id === lineId) || {}).label || lineId}/>
          </div>
        )}

        {/* Honesty footer */}
        <div className="panel" style={{ padding: 12, marginTop: 12, fontSize: 11, color: "var(--text-quaternary)", lineHeight: 1.5 }}>
          Data integrity: every state cell will carry <code>source_url</code> + <code>source_quote</code> citing the state DOI, NIPR, or statute before it leaves "research pending." See <code>lib/licensing-data.json</code> for the schema and the research-batch instructions.
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

  /* ───── Study guide — chat-style Q&A via /api/licensing-tutor mode=tutor ───── */
  function StudyGuide({ stateCode, lineId, lineLabel }) {
    const [turns, setTurns] = useState([]); // [{q, a, model, ms}]
    const [draft, setDraft] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr]   = useState(null);

    // Reset history when state or line changes — different scope = different tutor.
    useEffect(() => { setTurns([]); setErr(null); }, [stateCode, lineId]);

    const ask = async () => {
      const q = draft.trim();
      if (!q || busy) return;
      setDraft("");
      setBusy(true);
      setErr(null);
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
        setTurns(prev => prev.map((t, i) => i === prev.length - 1 ? { q, a: j.text || "(empty response)", model: j.model, ms: j.ms } : t));
      } catch (e) {
        setErr(e.message || String(e));
        setTurns(prev => prev.slice(0, -1));
      } finally {
        setBusy(false);
      }
    };

    const onKey = (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); ask(); }
    };

    return (
      <div className="panel">
        <div className="panel-h"><h3>Tutor · {stateCode} {lineLabel}</h3><span className="meta">⌘↵ to send</span></div>
        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 260, overflowY: "auto" }}>
            {turns.length === 0 && (
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", lineHeight: 1.5, padding: "4px 0" }}>
                Ask anything about {stateCode} {lineLabel} exam content. Plain-language explanations,
                concept definitions, sample mechanics. Not exam-question content (that's the Practice panel).
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ alignSelf: "flex-end", maxWidth: "80%", background: "var(--bg-elevated)", borderRadius: "var(--radius-sm)", padding: "6px 10px", fontSize: 12 }}>{t.q}</div>
                <div style={{ alignSelf: "flex-start", maxWidth: "92%", background: "var(--bg-raised)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", padding: "8px 12px", fontSize: 12, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                  {t.a == null ? <span style={{ color: "var(--text-quaternary)" }}>thinking…</span> : t.a}
                </div>
              </div>
            ))}
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

  /* ───── Practice exam — one question at a time, per-domain accuracy in localStorage ───── */
  const PRACTICE_LS_KEY = (state, line) => `repflow.licensing.practice.${state}.${line}`;

  function PracticeExam({ stateCode, lineId, lineLabel }) {
    const [q, setQ]       = useState(null);    // current question
    const [picked, setPicked] = useState(null); // user's chosen option index
    const [busy, setBusy] = useState(false);
    const [err, setErr]   = useState(null);
    const [stats, setStats] = useState(() => loadStats(stateCode, lineId));

    useEffect(() => {
      setQ(null); setPicked(null); setErr(null);
      setStats(loadStats(stateCode, lineId));
    }, [stateCode, lineId]);

    const fetchOne = async () => {
      setBusy(true); setErr(null); setPicked(null); setQ(null);
      try {
        const resp = await fetch("/api/licensing-tutor", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode: "practice", state: stateCode, line: lineId })
        });
        const j = await resp.json();
        if (!resp.ok) throw new Error(j.error || `HTTP ${resp.status}`);
        setQ(j);
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
      saveStats(stateCode, lineId, next);
    };

    const totalAnswered = Object.values(stats).reduce((s, d) => s + d.total, 0);
    const totalCorrect  = Object.values(stats).reduce((s, d) => s + d.correct, 0);
    const overallPct = totalAnswered ? Math.round(100 * totalCorrect / totalAnswered) : null;

    return (
      <div className="panel">
        <div className="panel-h"><h3>Practice · {stateCode} {lineLabel}</h3>
          {overallPct != null && <span className="chip chip-money">{overallPct}% · {totalAnswered} q</span>}
        </div>
        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {!q && !busy && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
                One question at a time, scoped to {stateCode} {lineLabel}. Per-domain accuracy
                tracked locally so you can see which areas to re-study.
              </div>
              <button className="btn btn-primary" onClick={fetchOne}>Start a question</button>
              {totalAnswered > 0 && <DomainBreakdown stats={stats}/>}
            </div>
          )}
          {busy && <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Writing a fresh question…</div>}
          {err && <div style={{ fontSize: 11, color: "var(--state-danger)" }}>{err}</div>}
          {q && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {q.domain && <span className="chip">{q.domain}</span>}
                {q.difficulty && <span className="chip chip-status">{q.difficulty}</span>}
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.5 }}>{q.stem}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {q.options.map((opt, i) => {
                  const isPicked = picked === i;
                  const isCorrect = picked != null && i === q.correct_index;
                  const isWrongPick = picked != null && isPicked && i !== q.correct_index;
                  const bg = isCorrect ? "color-mix(in oklch, var(--accent-money) 18%, transparent)"
                           : isWrongPick ? "color-mix(in oklch, var(--state-danger) 18%, transparent)"
                           : isPicked ? "var(--bg-elevated)" : "var(--bg-raised)";
                  return (
                    <button key={i}
                      className="btn"
                      onClick={() => onPick(i)}
                      disabled={picked != null}
                      style={{
                        justifyContent: "flex-start", textAlign: "left",
                        background: bg,
                        border: "1px solid var(--border-subtle)",
                        padding: "8px 10px", fontSize: 12, fontWeight: 400,
                        cursor: picked != null ? "default" : "pointer"
                      }}>
                      <span style={{ fontFamily: "var(--font-mono)", marginRight: 8, color: "var(--text-tertiary)" }}>
                        {String.fromCharCode(65 + i)}.
                      </span>
                      {opt}
                    </button>
                  );
                })}
              </div>
              {picked != null && (
                <div style={{ padding: 10, background: "var(--bg-raised)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", fontSize: 11.5, lineHeight: 1.55 }}>
                  <strong style={{ color: picked === q.correct_index ? "var(--accent-money)" : "var(--state-danger)" }}>
                    {picked === q.correct_index ? "Correct." : `Incorrect — answer was ${String.fromCharCode(65 + q.correct_index)}.`}
                  </strong>
                  {q.explanation && <span style={{ color: "var(--text-secondary)" }}> {q.explanation}</span>}
                </div>
              )}
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn btn-primary" onClick={fetchOne} disabled={busy}>Next question</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  function DomainBreakdown({ stats }) {
    const rows = Object.entries(stats).sort((a, b) => b[1].total - a[1].total);
    if (rows.length === 0) return null;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
        <div style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 500 }}>By domain</div>
        {rows.map(([dom, d]) => {
          const pct = d.total ? Math.round(100 * d.correct / d.total) : 0;
          return (
            <div key={dom} style={{ display: "grid", gridTemplateColumns: "1fr 60px 40px", gap: 8, alignItems: "center", fontSize: 11 }}>
              <div style={{ color: "var(--text-secondary)" }}>{dom}</div>
              <div style={{ height: 4, background: "var(--bg-raised)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: pct >= 70 ? "var(--accent-money)" : pct >= 50 ? "var(--accent-status)" : "var(--state-danger)" }}/>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", textAlign: "right" }}>{pct}%</div>
            </div>
          );
        })}
      </div>
    );
  }

  function loadStats(state, line) {
    try {
      const raw = localStorage.getItem(PRACTICE_LS_KEY(state, line));
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }
  function saveStats(state, line, stats) {
    try { localStorage.setItem(PRACTICE_LS_KEY(state, line), JSON.stringify(stats)); } catch {}
  }
  function recordResult(stats, domain, correct) {
    const next = { ...stats };
    const prev = next[domain] || { total: 0, correct: 0 };
    next[domain] = { total: prev.total + 1, correct: prev.correct + (correct ? 1 : 0) };
    return next;
  }

  window.PageLicensing = PageLicensing;
})();
