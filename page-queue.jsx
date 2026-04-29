/* Page: Dial Queue + In-Call overlay */
function PageQueue({ onCall }) {
  const { QUEUE } = AppData;
  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Dial Queue</div>
          <div className="page-sub">47 leads · scored & sequenced · TPMO disclaimer auto-fires on connect</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn"><Icons.Filter size={13}/> Filters</button>
          <button className="btn btn-primary" onClick={onCall}><Icons.Phone size={13}/> Start dialing</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 14 }}>
        <div className="panel">
          <div className="panel-h">
            <h3>Queue · Med Supp + FE</h3>
            <span className="meta">sort: speed-to-lead</span>
          </div>
          <div className="list">
            <div className="list-h" style={{ gridTemplateColumns: "16px minmax(170px,2.2fr) 64px minmax(110px,1.2fr) minmax(90px,1fr) 56px 64px 72px" }}>
              <div></div><div>Lead</div><div>Age/St</div><div>Source</div><div>Product</div><div style={{textAlign:"right"}}>Score</div><div style={{textAlign:"right"}}>SLA</div><div></div>
            </div>
            {QUEUE.map((l, i) => {
              const c = l.elapsed < 30 ? "var(--accent-money)" : l.elapsed < 90 ? "var(--state-warning)" : "var(--state-danger)";
              return (
                <div key={l.id} className="row" style={{ gridTemplateColumns: "16px minmax(170px,2.2fr) 64px minmax(110px,1.2fr) minmax(90px,1fr) 56px 64px 72px" }}>
                  <span className="dot" style={{ background: c }}></span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <strong style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.lead}</strong>
                    <span title="LeadiD verified" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 14, height: 14, borderRadius: 999, background: "color-mix(in oklch, var(--accent-money) 18%, transparent)", color: "var(--accent-money)", fontSize: 9, fontWeight: 700, flex: "0 0 auto" }}>✓</span>
                  </div>
                  <div className="tabular" style={{ color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>{l.age} · {l.state}</div>
                  <div style={{ color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.source}</div>
                  <div style={{ minWidth: 0 }}><span className="chip" style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-block" }}>{l.product}</span></div>
                  <div className="tabular" style={{ textAlign: "right", color: l.score >= 90 ? "var(--accent-money)" : l.score >= 80 ? "var(--accent-status)" : "var(--text-secondary)" }}>{l.score}</div>
                  <div className="tabular" style={{ textAlign: "right", color: c, fontWeight: 500 }}>{l.elapsed}s</div>
                  <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                    <button className="btn btn-ghost" style={{ padding: "3px 6px" }} onClick={i === 0 ? onCall : undefined}><Icons.Phone size={12}/></button>
                    <button className="btn btn-ghost" style={{ padding: "3px 6px" }}><Icons.MessageSquare size={12}/></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="panel">
            <div className="panel-h"><h3>Queue health</h3></div>
            <div style={{ padding: "12px 14px" }}>
              {[
                { l: "< 30s SLA", v: "23", c: "var(--accent-money)" },
                { l: "30 – 60s", v: "12", c: "var(--accent-status)" },
                { l: "60 – 120s", v: "8", c: "var(--state-warning)" },
                { l: "> 120s breach", v: "4", c: "var(--state-danger)" },
              ].map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: i < 3 ? "1px solid var(--border-subtle)" : 0 }}>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}><span className="dot" style={{ background: r.c, marginRight: 8 }}></span>{r.l}</span>
                  <span className="tabular" style={{ fontWeight: 500 }}>{r.v}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="panel">
            <div className="panel-h"><Icons.Shield size={13}/><h3>Compliance</h3></div>
            <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--text-secondary)" }}>TPMO disclaimer</span><span className="chip chip-money">Auto · 60s</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--text-secondary)" }}>SOA on Med Supp</span><span className="chip chip-status">Pre-call gate</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--text-secondary)" }}>Recording</span><span className="chip chip-money">All calls · 10y</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--text-secondary)" }}>State licenses</span><span className="chip">12 active</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InCall({ onClose }) {
  const [tab, setTab] = React.useState("script");
  const [tpmoFired, setTpmoFired] = React.useState(false);
  const [sec, setSec] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => setSec(s => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  React.useEffect(() => { if (sec >= 8) setTpmoFired(true); }, [sec]);

  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");

  return (
    <div className="incall" onClick={onClose}>
      <div className="incall-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: 20, borderRight: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="dot dot-live" style={{ width: 8, height: 8 }}></span>
            <span style={{ color: "var(--accent-money)", fontWeight: 500, fontSize: 12 }}>LIVE</span>
            <span className="tabular mono" style={{ marginLeft: "auto", fontSize: 13, color: "var(--text-secondary)" }}>{mm}:{ss}</span>
          </div>
          <div style={{ marginTop: 14, fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}>Cheryl Hampton</div>
          <div style={{ color: "var(--text-tertiary)", fontSize: 12.5, marginTop: 2 }}>67 · Travis County, TX · zip 78704 · T65 list</div>

          <div style={{ marginTop: 14, display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span className="chip chip-info">Plan G eligible</span>
            <span className="chip">No prior Med Supp</span>
            <span className="chip">Spouse 64</span>
            <span className="chip chip-money">LeadiD ✓ verified</span>
          </div>

          <div style={{ marginTop: 14, padding: 12, background: tpmoFired ? "color-mix(in oklch, var(--accent-money) 10%, transparent)" : "color-mix(in oklch, var(--accent-heat) 12%, transparent)", border: `1px solid ${tpmoFired ? "color-mix(in oklch, var(--accent-money) 30%, transparent)" : "color-mix(in oklch, var(--accent-heat) 30%, transparent)"}`, borderRadius: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: tpmoFired ? "var(--accent-money)" : "var(--accent-heat)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              <Icons.Shield size={12}/> TPMO Disclaimer {tpmoFired ? "captured" : `auto-firing in ${Math.max(0, 8 - sec)}s`}
            </div>
            <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
              "We do not offer every plan available in your area. Any information we provide is limited to those plans we do offer..."
            </div>
          </div>

          <div className="divider"></div>
          <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
            {["script","rebuttals","detail"].map(t => (
              <button key={t} onClick={() => setTab(t)} className={tab === t ? "btn" : "btn btn-ghost"} style={{ textTransform: "capitalize", padding: "3px 10px" }}>{t}</button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: "auto", fontSize: 12.5, lineHeight: 1.55, color: "var(--text-secondary)" }}>
            {tab === "script" && (
              <>
                <p style={{ margin: 0 }}><b style={{ color: "var(--text-primary)" }}>Open:</b> "Cheryl, thanks for filling out the form. Walk me through your day — when you wake up, what does the morning look like with your medications?"</p>
                <p style={{ marginTop: 10 }}><b style={{ color: "var(--text-primary)" }}>Discovery:</b> Pain points · cost surprises · doctor relationships · spouse's coverage</p>
                <p style={{ marginTop: 10 }}><b style={{ color: "var(--text-primary)" }}>Anchor:</b> "If a hospital stay last year cost you $1,200 out-of-pocket on Advantage, and Plan G's max is $240..."</p>
              </>
            )}
            {tab === "rebuttals" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {["I already have coverage", "It's too expensive", "Let me think about it", "Send me something in the mail"].map(r => (
                  <button key={r} className="btn" style={{ justifyContent: "flex-start" }}><Icons.Sparkles size={11} style={{ color: "var(--accent-money)" }}/>{r}</button>
                ))}
              </div>
            )}
            {tab === "detail" && (
              <div className="mono" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                <div>LeadiD: 9f8c-2a11-...</div>
                <div>TrustedForm: cert_qz482...</div>
                <div>Form filled: 14s ago</div>
                <div>IP: 67.184.x.x · TX</div>
                <div>UTM: fb_ad_t65_v3</div>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, padding: 20, overflowY: "auto" }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary)", fontWeight: 500, marginBottom: 10 }}>Live transcript</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { who: "You", t: "00:04", body: "Hi Cheryl, this is Marcus from Atlas. You filled out a form about Medicare Supplement?" },
                { who: "Cheryl", t: "00:09", body: "Yes — I'm 67 and I think I have Plan F? Or Advantage? I'm honestly not sure." },
                { who: "You", t: "00:18", body: "That's super common, no problem at all. Walk me through your day — what's the morning look like with medications?" },
                { who: "Cheryl", t: "00:34", body: "Well I take metformin, and a blood pressure pill, and now they want to add another one for cholesterol..." },
              ].map((m, i) => (
                <div key={i}>
                  <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", display: "flex", gap: 8 }}>
                    <span className="mono">{m.t}</span><span style={{ fontWeight: 500, color: m.who === "You" ? "var(--accent-money)" : "var(--text-secondary)" }}>{m.who}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 2 }}>{m.body}</div>
                </div>
              ))}
              <div style={{ display: "flex", gap: 6, alignItems: "center", color: "var(--text-tertiary)", fontSize: 11 }}>
                <span className="dot dot-live"></span> transcribing...
              </div>
            </div>

            <div style={{ marginTop: 18, padding: 12, background: "var(--bg-raised)", borderRadius: 8, border: "1px solid var(--border-subtle)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--accent-money)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                <Icons.Sparkles size={11}/> AI suggests
              </div>
              <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--text-primary)" }}>"Cheryl mentioned 3 medications. Pivot to <b>Plan G's drug-free coverage gap solve</b> — pair with Part D suggestion."</div>
            </div>
          </div>

          <div style={{ borderTop: "1px solid var(--border-subtle)", padding: "12px 14px", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn"><Icons.Mic size={12}/> Mute</button>
            <button className="btn"><Icons.MessageSquare size={12}/> Hold</button>
            <button className="btn"><Icons.Calendar size={12}/> Schedule SOA</button>
            <button className="btn"><Icons.ListChecks size={12}/> Send app link</button>
            <div style={{ flex: 1 }}></div>
            <button className="btn" style={{ background: "var(--state-danger)", color: "white" }} onClick={onClose}><Icons.Stop size={12}/> End call</button>
          </div>
        </div>
      </div>
    </div>
  );
}

window.PageQueue = PageQueue;
window.InCall = InCall;
