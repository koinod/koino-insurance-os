/* page-quote-card.jsx — in-call quote panel.
 *
 * <QuoteCard active leadName/>
 *   - Listens for `transcript:segment` window events from <LiveTranscriber/>
 *   - Builds a rolling text buffer, extracts {age, state, tobacco, conditions}
 *     via small regex heuristics, debounces to /api/quote, renders ranked
 *     carrier products with monthly premium and expected first-year comp.
 *   - Inputs panel is editable — the rep can override what the parser
 *     pulled (or fill it before any transcript exists).
 *
 * The /api/quote endpoint is pure-compute and works in demo mode (anon).
 */
(function () {
  const { useState, useEffect, useRef } = React;

  const STATE_RE   = /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/i;
  const STATE_NAMES = {
    georgia: "GA", florida: "FL", texas: "TX", "north carolina": "NC", "south carolina": "SC",
    california: "CA", virginia: "VA", "new york": "NY", washington: "WA", colorado: "CO",
    arizona: "AZ", ohio: "OH", pennsylvania: "PA", illinois: "IL", michigan: "MI",
  };
  const TOBACCO_RE = /\b(smoke|tobacco|cigarett|chew|vape|nicotine)\b/i;
  const NON_TOB_RE = /\b(non[- ]?smok|don'?t smoke|never smok|no tobacco|quit \d+ year)\b/i;
  const CONDITION_MAP = [
    { rx: /\bdiabet/i,        key: "diabetes" },
    { rx: /\bcopd|emphysem/i, key: "copd" },
    { rx: /\bcancer\b/i,      key: "cancer" },
    { rx: /\bheart attack|stroke\b/i, key: "cardiac_event" },
    { rx: /\besrd|kidney failure|dialysis\b/i, key: "esrd" },
    { rx: /\bterminal\b/i,    key: "terminal" },
  ];

  function extractFromTranscript(text) {
    const out = { age: null, state: null, tobacco: null, conditions: [] };
    // Age: "I'm 67", "67 years old", "turned 65"
    const ageM = text.match(/\b(?:i'?m|im|age|turned|i am)\s*(\d{2})\b/i)
              || text.match(/\b(\d{2})\s*(?:years? old|yo)\b/i);
    if (ageM) {
      const n = parseInt(ageM[1], 10);
      if (n >= 18 && n <= 110) out.age = n;
    }
    // State: try abbreviations first, then full names
    const abbr = text.match(STATE_RE);
    if (abbr) out.state = abbr[1].toUpperCase();
    else {
      const lower = text.toLowerCase();
      for (const [name, code] of Object.entries(STATE_NAMES)) {
        if (lower.includes(name)) { out.state = code; break; }
      }
    }
    // Tobacco: explicit non-smoker phrases override smoker keywords
    if (NON_TOB_RE.test(text)) out.tobacco = false;
    else if (TOBACCO_RE.test(text)) out.tobacco = true;
    // Conditions
    const conds = new Set();
    for (const { rx, key } of CONDITION_MAP) if (rx.test(text)) conds.add(key);
    out.conditions = [...conds];
    return out;
  }

  function fmtMoney(cents) {
    if (!cents) return "—";
    const d = cents / 100;
    return d >= 100 ? `$${d.toFixed(0)}` : `$${d.toFixed(2)}`;
  }

  function QuoteCard({ active, leadName, leadId, callId }) {
    const [bufferText, setBufferText] = useState("");
    const [inputs, setInputs] = useState({ age: null, state: null, tobacco: null, conditions: [] });
    const [overrides, setOverrides] = useState({}); // user-edited values
    const [results, setResults]   = useState([]);
    const [blocked, setBlocked]   = useState([]);
    const [status, setStatus]     = useState("idle"); // idle | quoting | ready | error
    const [errMsg, setErrMsg]     = useState(null);
    const debounceRef = useRef(null);
    const aliveRef    = useRef(true);

    useEffect(() => () => { aliveRef.current = false; }, []);

    // Subscribe to transcript:segment events the LiveTranscriber emits
    useEffect(() => {
      const onSeg = (ev) => {
        const seg = ev.detail || {};
        if (!seg.text) return;
        setBufferText(prev => (prev + " " + seg.text).slice(-4000));
      };
      window.addEventListener("transcript:segment", onSeg);
      return () => window.removeEventListener("transcript:segment", onSeg);
    }, []);

    // Re-extract on buffer change
    useEffect(() => {
      if (!bufferText) return;
      const parsed = extractFromTranscript(bufferText);
      setInputs(parsed);
    }, [bufferText]);

    // Merge parsed inputs + user overrides → final inputs for the quote
    const merged = { ...inputs, ...overrides };

    // Debounce: re-quote 800ms after the last input change, when we have
    // enough to ask (need age + state).
    useEffect(() => {
      if (!active) return;
      if (!merged.age || !merged.state) return;
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setStatus("quoting");
        setErrMsg(null);
        try {
          const r = await fetch("/api/quote", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              age: merged.age,
              state: merged.state,
              tobacco: !!merged.tobacco,
              conditions: merged.conditions || [],
              lead_id: leadId || null,
              call_id: callId || null,
            }),
          });
          if (!aliveRef.current) return;
          const j = await r.json().catch(() => ({}));
          if (!r.ok) {
            setErrMsg(j.error || `quote ${r.status}`);
            setStatus("error");
            return;
          }
          setResults(j.results || []);
          setBlocked(j.blocked || []);
          setStatus("ready");
        } catch (e) {
          if (!aliveRef.current) return;
          setErrMsg(String(e));
          setStatus("error");
        }
      }, 800);
      return () => clearTimeout(debounceRef.current);
    }, [merged.age, merged.state, merged.tobacco, JSON.stringify(merged.conditions), active, leadId, callId]);

    const setOverride = (k, v) => setOverrides(o => ({ ...o, [k]: v }));
    const reset = () => { setOverrides({}); setBufferText(""); setResults([]); setBlocked([]); };

    return (
      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-h">
          <Icons.Wallet size={13} style={{ color: "var(--accent-money)" }}/>
          <h3>Live quote</h3>
          {status === "quoting" && <span className="meta">computing…</span>}
          {status === "ready"   && <span className="meta">{results.length} eligible</span>}
          {status === "error"   && <span className="meta" style={{ color: "var(--state-warning)" }}>{errMsg}</span>}
          <button className="btn btn-ghost" style={{ marginLeft: "auto", fontSize: 10.5 }} onClick={reset}>Reset</button>
        </div>

        {/* Inputs (editable) */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, padding: "10px 14px", borderBottom: "1px solid var(--border-subtle)" }}>
          <InputCell label="Age" value={merged.age || ""} type="number"
            onChange={v => setOverride("age", v ? parseInt(v, 10) : null)} placeholder="65"/>
          <InputCell label="State" value={merged.state || ""} type="text" maxLength={2}
            onChange={v => setOverride("state", (v || "").toUpperCase().slice(0, 2))} placeholder="GA"/>
          <ToggleCell label="Tobacco" value={!!merged.tobacco}
            onChange={v => setOverride("tobacco", v)}/>
          <div>
            <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 2 }}>CONDITIONS</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
              {merged.conditions && merged.conditions.length
                ? merged.conditions.join(", ")
                : <span style={{ color: "var(--text-quaternary)" }}>none detected</span>}
            </div>
          </div>
        </div>

        {/* Results */}
        {results.length === 0 && status !== "quoting" && (
          <div style={{ padding: 14, fontSize: 11.5, color: "var(--text-tertiary)" }}>
            {(!merged.age || !merged.state)
              ? "Once age + state are detected (or filled in), eligible products + premiums will appear here."
              : "No eligible products at these inputs. Try different state or age."}
            {blocked.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 10.5 }}>
                <strong>Blocked:</strong>
                <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
                  {blocked.map((b, i) => (
                    <li key={i}>{b.name} — {b.reasons.join(", ")}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {results.length > 0 && (
          <div style={{ padding: "8px 0" }}>
            {results.slice(0, 5).map((p, i) => (
              <div key={p.product_id} style={{
                display: "grid", gridTemplateColumns: "auto 1fr auto auto auto",
                gap: 10, alignItems: "center", padding: "8px 14px",
                borderBottom: i === 4 ? "none" : "1px solid var(--border-subtle)",
              }}>
                <span style={{
                  fontSize: 11, fontFamily: "var(--font-tabular)", fontWeight: 600,
                  width: 28, height: 22, borderRadius: 4,
                  display: "grid", placeItems: "center",
                  background: "color-mix(in oklch, var(--accent-money) 15%, transparent)",
                  color: "var(--accent-money)",
                }}>{p.fit_score}</span>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 500 }}>{p.name}</div>
                  <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>
                    {p.carrier} · {p.category}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12.5, fontFamily: "var(--font-tabular)", fontWeight: 600 }}>{fmtMoney(p.monthly_premium_cents)}/mo</div>
                  <div style={{ fontSize: 10, color: "var(--text-quaternary)" }}>{fmtMoney(p.annual_premium_cents)}/yr</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: "var(--accent-money)", fontFamily: "var(--font-tabular)", fontWeight: 500 }}>+{fmtMoney(p.expected_first_year_comp_cents)}</div>
                  <div style={{ fontSize: 10, color: "var(--text-quaternary)" }}>1y comp</div>
                </div>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 10.5, padding: "3px 8px" }}
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent("quote:select", { detail: { product: p, inputs: merged, leadId, callId } }));
                    window.toast && window.toast(`${p.name} sent to deal write`, "success");
                  }}
                  title="Send to deal-write form">
                  Use →
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function InputCell({ label, value, onChange, type = "text", placeholder, maxLength }) {
    return (
      <div>
        <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
        <input
          className="text-input"
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          style={{ width: "100%", fontSize: 12, padding: "4px 8px" }}
        />
      </div>
    );
  }

  function ToggleCell({ label, value, onChange }) {
    return (
      <div>
        <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", cursor: "pointer" }}>
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)}/>
          {value ? "Yes" : "No"}
        </label>
      </div>
    );
  }

  window.QuoteCard = QuoteCard;
})();
