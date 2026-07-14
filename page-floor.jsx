/* page-floor.jsx — in-call assistant workspace.
 *
 * Three-panel live workspace for reps during a call:
 *   LEFT   — Script browser: pick and follow call scripts from agency library.
 *   CENTER — Live transcription: rolling real-time transcript with keyword highlights,
 *            recording button, call timer, and coaching nudges.
 *   RIGHT  — Client capture: collect name, DOB, phone, health data, and live quote.
 *
 * Data flow:
 *   - Scripts pulled from AppData.SCRIPTS_LIB (hydrated from agency_scripts table).
 *   - Realtime transcript via Supabase realtime subscription on live_transcript_segments
 *     filtered by the active call_sid (set via window.activeCallSid).
 *   - Recording uses page-recorder.jsx's same MediaRecorder pipeline via lib/call-recorder.js.
 *   - Client data saved to `clients` table linked to active pipeline row.
 *   - Live quotes computed via window.RateEngine.
 *
 * Registers window.PageFloor. Routed from app.jsx `case "floor"`.
 */
(function () {
  const { useState, useEffect, useRef, useCallback, useMemo } = React;

  // ──────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────
  function fmtDur(sec) {
    if (sec == null) return "0:00";
    const m = Math.floor(sec / 60), s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function pickMime() {
    for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]) {
      try { if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m; } catch (_e) {}
    }
    return "";
  }

  // Health question keywords to highlight in transcript
  const HEALTH_KEYWORDS = [
    "diabetes", "heart", "cancer", "stroke", "copd", "asthma", "surgery",
    "hospital", "medication", "prescription", "smoker", "tobacco", "weight",
    "height", "bmi", "hypertension", "blood pressure", "cholesterol",
    "kidney", "liver", "depression", "anxiety", "disability",
  ];

  // Application info keywords
  const APP_KEYWORDS = [
    "account number", "routing", "bank", "social security", "ssn",
    "date of birth", "birthday", "address", "zip code", "beneficiary",
  ];

  function highlightKeywords(text) {
    if (!text) return text;
    const all = [...HEALTH_KEYWORDS, ...APP_KEYWORDS];
    const re = new RegExp(`\\b(${all.map(k => k.replace(/\s+/g, "\\s+")).join("|")})\\b`, "gi");
    return text.replace(re, match => `<mark style="background:color-mix(in oklch,var(--accent-money) 28%,transparent);color:var(--accent-money);border-radius:2px;padding:0 2px">${match}</mark>`);
  }

  // ──────────────────────────────────────────────────────────────
  // Script browser (Left panel)
  // ──────────────────────────────────────────────────────────────
  const SCRIPT_CATS = ["All", "Cold", "Warm", "Objection", "Close", "Discovery", "Voicemail", "Cross-sell"];

  function ScriptPanel({ selectedScript, onSelect }) {
    const [cat, setCat] = useState("All");
    const [search, setSearch] = useState("");
    const [expanded, setExpanded] = useState(null);

    const scripts = useMemo(() => {
      return (window.AppData?.SCRIPTS_LIB || []);
    }, []);

    const filtered = useMemo(() => {
      return scripts.filter(s => {
        if (cat !== "All" && s.cat !== cat) return false;
        if (search && !`${s.title} ${s.body}`.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      });
    }, [scripts, cat, search]);

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
          Scripts
        </div>
        <input
          placeholder="Search scripts…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: "7px 10px", fontSize: 12.5, background: "var(--bg-base)", border: "1px solid var(--border-subtle)", borderRadius: 6, color: "var(--text-primary)", outline: "none" }}
        />
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {SCRIPT_CATS.map(c => (
            <button
              key={c}
              onClick={() => setCat(c)}
              style={{
                padding: "3px 8px", fontSize: 11, borderRadius: 20, border: "1px solid var(--border-subtle)",
                background: cat === c ? "var(--accent-money)" : "transparent",
                color: cat === c ? "#06110b" : "var(--text-secondary)",
                cursor: "pointer", fontWeight: cat === c ? 700 : 400,
              }}>
              {c}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
          {filtered.length === 0 && (
            <div style={{ padding: 16, textAlign: "center", fontSize: 12, color: "var(--text-tertiary)" }}>
              {scripts.length === 0 ? "No scripts loaded yet — add them in Vault → Scripts." : "No match."}
            </div>
          )}
          {filtered.map(s => {
            const isActive = selectedScript?.id === s.id;
            const isOpen = expanded === s.id;
            return (
              <div
                key={s.id}
                style={{
                  border: `1px solid ${isActive ? "var(--accent-money)" : "var(--border-subtle)"}`,
                  borderRadius: 8, overflow: "hidden",
                  background: isActive ? "color-mix(in oklch,var(--accent-money) 10%,var(--bg-raised))" : "var(--bg-raised)",
                  transition: "all .15s",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", cursor: "pointer" }}
                  onClick={() => { onSelect(s); setExpanded(isOpen ? null : s.id); }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</div>
                    <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginTop: 1 }}>{s.cat}</div>
                  </div>
                  {isActive && <Icons.Check size={12} style={{ color: "var(--accent-money)", flexShrink: 0 }} />}
                  <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>{isOpen ? "−" : "+"}</span>
                </div>
                {isOpen && (
                  <div style={{ padding: "0 10px 10px", fontSize: 12, lineHeight: 1.6, color: "var(--text-secondary)", borderTop: "1px solid var(--border-subtle)", whiteSpace: "pre-wrap", maxHeight: 200, overflowY: "auto" }}>
                    {s.body || <em style={{ color: "var(--text-tertiary)" }}>No script body.</em>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {selectedScript && (
          <div style={{ padding: "8px 10px", borderRadius: 8, background: "color-mix(in oklch,var(--accent-money) 12%,var(--bg-raised))", border: "1px solid color-mix(in oklch,var(--accent-money) 30%,transparent)", fontSize: 11, color: "var(--accent-money)", fontWeight: 600 }}>
            <Icons.Mic size={11} style={{ marginRight: 4 }} />
            Active: {selectedScript.title}
          </div>
        )}
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────
  // Live transcript + recording (Center panel)
  // ──────────────────────────────────────────────────────────────
  function TranscriptPanel({ selectedScript }) {
    const [recStatus, setRecStatus] = useState("idle"); // idle | recording | uploading
    const [seconds, setSeconds] = useState(0);
    const [source, setSource] = useState("mic");
    const [leadName, setLeadName] = useState("");
    const [note, setNote] = useState(null);
    const [liveSegs, setLiveSegs] = useState([]);
    const [scriptFontSize, setScriptFontSize] = useState(14);
    const [activeTab, setActiveTab] = useState("transcript"); // transcript | script
    const [micPermission, setMicPermission] = useState("checking"); // checking | granted | denied | prompt

    const transcriptEndRef = useRef(null);
    const recRef = useRef(null), ctxRef = useRef(null), streamsRef = useRef([]);
    const chunksRef = useRef([]), mimeRef = useRef(""), timerRef = useRef(null), startedRef = useRef(0);

    // Check microphone permission state on mount
    useEffect(() => {
      if (!navigator.permissions || !navigator.permissions.query) {
        setMicPermission("prompt");
        return;
      }
      navigator.permissions.query({ name: "microphone" })
        .then(status => {
          setMicPermission(status.state);
          status.onchange = () => setMicPermission(status.state);
        })
        .catch(() => setMicPermission("prompt"));
    }, []);

    const requestMicAccess = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
        setMicPermission("granted");
        setNote(null);
      } catch {
        setMicPermission("denied");
        setNote("Mic access was denied. Please check your system/browser settings and try again.");
      }
    };

    // Subscribe to live transcript segments for the active call
    useEffect(() => {
      const sb = window.getSupabase?.();
      if (!sb) return;
      const callSid = window.activeCallSid;
      if (!callSid) return;

      const channel = sb.channel(`floor-transcript-${callSid}`)
        .on("postgres_changes", {
          event: "INSERT",
          schema: "public",
          table: "live_transcript_segments",
          filter: `call_sid=eq.${callSid}`,
        }, payload => {
          setLiveSegs(prev => [...prev, payload.new]);
        })
        .subscribe();

      return () => { sb.removeChannel(channel); };
    }, []);

    // Also listen for incall:opened events to hydrate the lead name
    useEffect(() => {
      const onOpen = e => {
        const lead = e.detail?.lead;
        if (lead?.lead_name || lead?.lead) setLeadName(lead.lead_name || lead.lead || "");
        setLiveSegs([]);
      };
      window.addEventListener("incall:opened", onOpen);
      return () => window.removeEventListener("incall:opened", onOpen);
    }, []);

    // Auto-scroll transcript
    useEffect(() => {
      transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [liveSegs]);

    // Cleanup on unmount
    const stopTracks = useCallback(() => {
      try { recRef.current && recRef.current.state !== "inactive" && recRef.current.stop(); } catch {}
      try { ctxRef.current && ctxRef.current.close(); } catch {}
      for (const s of streamsRef.current) { try { s.getTracks().forEach(t => t.stop()); } catch {} }
      streamsRef.current = []; ctxRef.current = null;
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }, []);
    useEffect(() => () => stopTracks(), [stopTracks]);

    const startRecording = async () => {
      setNote(null);
      if (!window.MediaRecorder) {
        setRecStatus("error");
        setNote("This browser doesn't support audio recording (MediaRecorder missing). Please use Chrome or Firefox.");
        return;
      }
      let mic;
      try { mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
      catch {
        setRecStatus("error");
        setMicPermission("denied");
        setNote("Mic permission blocked or not found. Check system privacy settings.");
        return;
      }
      setMicPermission("granted");
      streamsRef.current = [mic];

      if (source === "mic+system") {
        try {
          if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("unsupported");
          const s = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: { echoCancellation: false, noiseSuppression: false } });
          s.getVideoTracks().forEach(t => t.stop());
          const aTracks = s.getAudioTracks();
          if (aTracks.length) {
            streamsRef.current.push(new MediaStream(aTracks));
            setNote("Recording mic + system audio. Keep the shared window open.");
          } else {
            s.getTracks().forEach(t => t.stop());
            setNote("Screen share had no audio track — recording mic only. Re-try and tick 'Share audio'.");
          }
        } catch { setNote("System-audio share declined — recording mic only."); }
      }

      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const dest = ctx.createMediaStreamDestination();
      for (const s of streamsRef.current) { try { ctx.createMediaStreamSource(s).connect(dest); } catch {} }
      ctxRef.current = ctx;

      const mime = pickMime(); mimeRef.current = mime;
      let rec;
      try { rec = new MediaRecorder(dest.stream, mime ? { mimeType: mime } : undefined); }
      catch { setRecStatus("error"); setNote("This browser can't record audio (MediaRecorder unsupported)."); stopTracks(); return; }
      chunksRef.current = [];
      rec.ondataavailable = e => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => uploadRecording();
      recRef.current = rec;
      rec.start(1000);
      startedRef.current = Date.now();
      setSeconds(0); setRecStatus("recording");
      timerRef.current = setInterval(() => setSeconds(Math.floor((Date.now() - startedRef.current) / 1000)), 500);
    };

    const stopRecording = () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      try { recRef.current && recRef.current.state !== "inactive" && recRef.current.stop(); } catch {}
    };

    const uploadRecording = async () => {
      setRecStatus("uploading");
      const durationSec = Math.max(1, Math.floor((Date.now() - startedRef.current) / 1000));
      const blob = new Blob(chunksRef.current, { type: mimeRef.current || "audio/webm" });
      for (const s of streamsRef.current) { try { s.getTracks().forEach(t => t.stop()); } catch {} }
      streamsRef.current = []; try { ctxRef.current?.close(); } catch {} ctxRef.current = null;
      if (!blob.size) { setRecStatus("idle"); setNote("Nothing captured (empty recording)."); return; }
      try {
        const sb = window.getSupabase?.();
        const { data } = await sb.auth.getSession();
        const jwt = data?.session?.access_token;
        const fd = new FormData();
        fd.append("file", blob, `call.${mimeRef.current.includes("ogg") ? "ogg" : mimeRef.current.includes("mp4") ? "m4a" : "webm"}`);
        fd.append("duration_sec", String(durationSec));
        fd.append("channels", source === "mic+system" ? "mic+system" : "mic");
        fd.append("mime", mimeRef.current || "audio/webm");
        if (leadName.trim()) fd.append("lead_name", leadName.trim());
        const r = await fetch("/api/call-recording-upload", { method: "POST", headers: jwt ? { "x-supabase-auth": `Bearer ${jwt}` } : {}, body: fd });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || `upload failed (${r.status})`);
        window.toast?.("Recording saved — transcript + coaching will appear in Recorder.", "success");
        setRecStatus("idle"); setSeconds(0); setNote("Saved! Transcript + coaching appear in the Recorder tab within a few minutes.");
      } catch (e) {
        setRecStatus("idle"); setNote("Upload failed: " + (e.message || "unknown"));
      }
    };

    const isRecording = recStatus === "recording";
    const isUploading = recStatus === "uploading";
    const fullTranscript = liveSegs.map(s => s.text || s.transcript || "").join(" ").trim();

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 8 }}>
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.07em", flex: 1 }}>
            Live Transcript
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {["transcript", "script"].map(t => (
              <button key={t} onClick={() => setActiveTab(t)} style={{ padding: "3px 10px", fontSize: 11, borderRadius: 20, border: "1px solid var(--border-subtle)", background: activeTab === t ? "var(--accent-money)" : "transparent", color: activeTab === t ? "#06110b" : "var(--text-secondary)", cursor: "pointer", fontWeight: activeTab === t ? 700 : 400, textTransform: "capitalize" }}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Microphone Access and Diagnostic alerts */}
        {micPermission === "denied" && (
          <div style={{ padding: "8px 10px", borderRadius: 8, fontSize: 11.5, background: "color-mix(in oklch,var(--state-danger) 12%,transparent)", border: "1px solid var(--state-danger)", color: "var(--state-danger)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexShrink: 0 }}>
            <span>🎤 Microphone access blocked. Please enable in browser settings.</span>
            <button className="btn btn-sm" style={{ padding: "2px 8px", background: "var(--state-danger)", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }} onClick={requestMicAccess}>Retry</button>
          </div>
        )}
        {micPermission === "prompt" && (
          <div style={{ padding: "8px 10px", borderRadius: 8, fontSize: 11.5, background: "color-mix(in oklch,var(--accent-money) 12%,transparent)", border: "1px solid var(--accent-money)", color: "var(--accent-money)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexShrink: 0 }}>
            <span>🎤 Microphone permission required. Click here to initialize request.</span>
            <button className="btn btn-sm" style={{ padding: "2px 8px", background: "var(--accent-money)", color: "#06110b", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: 700 }} onClick={requestMicAccess}>Allow</button>
          </div>
        )}

        {/* Record controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, background: "var(--bg-raised)", border: `1px solid ${isRecording ? "color-mix(in oklch,var(--state-danger) 40%,transparent)" : "var(--border-subtle)"}`, flexShrink: 0 }}>
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isUploading}
            style={{
              width: 44, height: 44, borderRadius: "50%", border: "none", cursor: isUploading ? "wait" : "pointer",
              background: isRecording ? "var(--state-danger, #ef4444)" : "var(--accent-money, #10b981)",
              color: isRecording ? "#fff" : "#06110b",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              boxShadow: isRecording ? "0 0 0 5px color-mix(in oklch,var(--state-danger) 22%,transparent)" : "none",
              transition: "box-shadow .2s",
              animation: isRecording ? "floor-pulse 1.4s ease-in-out infinite" : "none",
            }}
            title={isRecording ? "Stop & save recording" : "Start recording"}>
            {isUploading ? <Icons.Loader size={18} style={{ animation: "spin 1s linear infinite" }} /> : isRecording ? <span style={{ width: 14, height: 14, background: "#fff", borderRadius: 2 }} /> : <Icons.Mic size={20} />}
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "JetBrains Mono, monospace", color: isRecording ? "var(--state-danger)" : "var(--text-primary)" }}>
              {fmtDur(seconds)}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
              {isUploading ? "Saving…" : isRecording ? "Recording — tap to stop & save" : "Ready to record"}
            </div>
          </div>
          {!isRecording && !isUploading && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
              <input
                placeholder="Lead name" value={leadName} onChange={e => setLeadName(e.target.value)}
                style={{ padding: "5px 8px", fontSize: 11.5, background: "var(--bg-base)", border: "1px solid var(--border-subtle)", borderRadius: 5, color: "var(--text-primary)", width: 120 }} />
              <select value={source} onChange={e => setSource(e.target.value)}
                style={{ padding: "4px 6px", fontSize: 11, background: "var(--bg-base)", border: "1px solid var(--border-subtle)", borderRadius: 5, color: "var(--text-secondary)" }}>
                <option value="mic">Mic only</option>
                <option value="mic+system">Mic + System</option>
              </select>
            </div>
          )}
        </div>

        {note && (
          <div style={{ padding: "7px 10px", borderRadius: 6, fontSize: 11.5, background: recStatus === "error" ? "color-mix(in oklch,var(--state-danger) 12%,transparent)" : "var(--bg-raised)", color: recStatus === "error" ? "var(--state-danger)" : "var(--text-tertiary)", lineHeight: 1.5 }}>
            {note}
          </div>
        )}

        {/* Content area */}
        <div style={{ flex: 1, overflowY: "auto", borderRadius: 8, border: "1px solid var(--border-subtle)", background: "var(--bg-base)", padding: "10px 12px" }}>
          {activeTab === "transcript" ? (
            <>
              {liveSegs.length === 0 ? (
                <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8, color: "var(--text-tertiary)", fontSize: 12 }}>
                  <Icons.Mic size={24} style={{ opacity: 0.3 }} />
                  <div>Live transcript appears here when a call is active.</div>
                  <div style={{ fontSize: 11, opacity: 0.7 }}>Keywords like DOB, account numbers, and health info will be highlighted automatically.</div>
                </div>
              ) : (
                <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}
                  dangerouslySetInnerHTML={{ __html: highlightKeywords(fullTranscript) }} />
              )}
              <div ref={transcriptEndRef} />
            </>
          ) : (
            <div>
              {selectedScript ? (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--accent-money)", flex: 1 }}>{selectedScript.title}</div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => setScriptFontSize(s => Math.max(10, s - 1))} style={{ padding: "2px 6px", fontSize: 11, background: "var(--bg-raised)", border: "1px solid var(--border-subtle)", borderRadius: 4, cursor: "pointer", color: "var(--text-secondary)" }}>A−</button>
                      <button onClick={() => setScriptFontSize(s => Math.min(22, s + 1))} style={{ padding: "2px 6px", fontSize: 11, background: "var(--bg-raised)", border: "1px solid var(--border-subtle)", borderRadius: 4, cursor: "pointer", color: "var(--text-secondary)" }}>A+</button>
                    </div>
                  </div>
                  <div style={{ fontSize: scriptFontSize, lineHeight: 1.75, color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>
                    {selectedScript.body}
                  </div>
                </>
              ) : (
                <div style={{ textAlign: "center", padding: 24, color: "var(--text-tertiary)", fontSize: 12 }}>
                  Select a script from the left panel to read it here.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────
  // Client capture + live quote (Right panel)
  // ──────────────────────────────────────────────────────────────
  const HEALTH_QUESTIONS = [
    { id: "tobacco", label: "Tobacco / Nicotine use (last 12 mo)?" },
    { id: "diabetes", label: "Diabetes?" },
    { id: "heart_condition", label: "Heart condition / surgery?" },
    { id: "cancer", label: "Cancer (last 10 years)?" },
    { id: "stroke", label: "Stroke / TIA?" },
    { id: "copd", label: "COPD / emphysema?" },
    { id: "kidney", label: "Kidney disease?" },
    { id: "hiv", label: "HIV / AIDS?" },
    { id: "bedridden", label: "Confined to bed / wheelchair?" },
    { id: "oxygen", label: "Oxygen dependent?" },
  ];

  function ClientPanel() {
    const [form, setForm] = useState({
      full_name: "", dob: "", phone: "", email: "",
      state: "", gender: "M", height_in: "", weight_lbs: "",
      bank_name: "", account_number: "", routing_number: "",
      beneficiary: "", relationship: "",
      notes: "",
    });
    const [health, setHealth] = useState({});
    const [age, setAge] = useState("");
    const [quotes, setQuotes] = useState([]);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [section, setSection] = useState("vitals"); // vitals | health | banking | quotes

    // Syntactical validations
    const isPhoneValid = (p) => {
      if (!p) return true;
      const clean = p.replace(/\D/g, "");
      return clean.length === 10 || clean.length === 11;
    };
    const isEmailValid = (e) => {
      if (!e) return true;
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
    };
    const isRoutingValid = (r) => {
      if (!r) return true;
      const clean = r.replace(/\D/g, "");
      return clean.length === 9;
    };
    const isAccountValid = (a) => {
      if (!a) return true;
      const clean = a.replace(/\D/g, "");
      return clean.length >= 4 && clean.length <= 17;
    };

    const hasValidationErrors =
      !isPhoneValid(form.phone) ||
      !isEmailValid(form.email) ||
      !isRoutingValid(form.routing_number) ||
      !isAccountValid(form.account_number);

    // Auto-calc age from DOB
    useEffect(() => {
      if (!form.dob) { setAge(""); return; }
      try {
        const d = new Date(form.dob);
        if (isNaN(d)) { setAge(""); return; }
        const now = new Date();
        let a = now.getFullYear() - d.getFullYear();
        const m = now.getMonth() - d.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
        setAge(a > 0 && a < 120 ? String(a) : "");
      } catch { setAge(""); }
    }, [form.dob]);

    // Pre-fill from active lead
    useEffect(() => {
      const onOpen = e => {
        const lead = e.detail?.lead;
        if (!lead) return;
        setForm(prev => ({
          ...prev,
          full_name: lead.lead_name || lead.lead || prev.full_name,
          phone: lead.phone || prev.phone,
          email: lead.email || prev.email,
          state: lead.state || prev.state,
        }));
        if (lead.age) setAge(String(lead.age));
      };
      window.addEventListener("incall:opened", onOpen);
      return () => window.removeEventListener("incall:opened", onOpen);
    }, []);

    // Compute quotes whenever vitals change
    useEffect(() => {
      const engine = window.RateEngine;
      if (!engine || typeof engine.quote !== "function") return;
      const a = parseInt(age || form.dob, 10);
      if (!a || a < 18 || a > 99 || !form.state) { setQuotes([]); return; }
      try {
        const result = engine.quote({
          age: a,
          state: form.state,
          gender: form.gender || "M",
          tobacco: !!health.tobacco,
          health_conditions: Object.keys(health).filter(k => health[k]),
        });
        setQuotes(Array.isArray(result) ? result.slice(0, 8) : []);
      } catch { setQuotes([]); }
    }, [age, form.state, form.gender, health]);

    const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

    const saveClient = async () => {
      if (hasValidationErrors) { window.toast?.("Please correct the invalid fields first.", "error"); return; }
      if (!form.full_name.trim()) { window.toast?.("Enter a name before saving.", "error"); return; }
      setSaving(true);
      try {
        const sb = window.getSupabase?.();
        const me = window.me?.();
        if (!sb || !me) throw new Error("Not signed in");
        const notesPayload = JSON.stringify({
          bank_name: form.bank_name,
          account_number: form.account_number,
          routing_number: form.routing_number,
          beneficiary: form.beneficiary,
          relationship: form.relationship,
          health,
          height_in: form.height_in,
          weight_lbs: form.weight_lbs,
          manual_notes: form.notes,
          saved_from: "floor",
          saved_at: new Date().toISOString(),
        });

        // Find active pipeline row if any
        const pipelineId = window.activeLeadId || null;

        const { error } = await sb.from("clients").insert({
          full_name: form.full_name.trim(),
          dob: form.dob || null,
          contact_phone: form.phone || null,
          contact_email: form.email || null,
          relationship: form.relationship || "primary",
          notes: notesPayload,
          lead_pipeline_id: pipelineId,
        });
        if (error) throw error;
        setSaved(true);
        window.toast?.("Client record saved.", "success");
        setTimeout(() => setSaved(false), 3000);
      } catch (e) {
        window.toast?.("Save failed: " + (e.message || "unknown"), "error");
      } finally { setSaving(false); }
    };

    const SECTIONS = ["vitals", "health", "banking", "quotes"];

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
          Client Info
        </div>

        {/* Section tabs */}
        <div style={{ display: "flex", gap: 3 }}>
          {SECTIONS.map(s => (
            <button key={s} onClick={() => setSection(s)} style={{ flex: 1, padding: "4px 0", fontSize: 10.5, borderRadius: 5, border: "1px solid var(--border-subtle)", background: section === s ? "var(--accent-money)" : "transparent", color: section === s ? "#06110b" : "var(--text-secondary)", cursor: "pointer", fontWeight: section === s ? 700 : 400, textTransform: "capitalize" }}>
              {s === "quotes" ? "Quotes" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {section === "vitals" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { k: "full_name", l: "Full Name", type: "text", ph: "Jane Doe" },
                { k: "dob", l: "Date of Birth", type: "date" },
                { k: "phone", l: "Phone", type: "tel", ph: "+1 (555) 000-0000", validate: isPhoneValid, err: "Invalid phone (10-11 digits)" },
                { k: "email", l: "Email", type: "email", ph: "jane@email.com", validate: isEmailValid, err: "Invalid email" },
                { k: "state", l: "State", type: "text", ph: "FL" },
                { k: "height_in", l: "Height (inches)", type: "number", ph: "68" },
                { k: "weight_lbs", l: "Weight (lbs)", type: "number", ph: "160" },
              ].map(({ k, l, type, ph, validate, err }) => {
                const isValid = validate ? validate(form[k]) : true;
                return (
                  <div key={k}>
                    <div style={{ fontSize: 10.5, color: isValid ? "var(--text-tertiary)" : "var(--state-danger)", marginBottom: 3, fontWeight: 600, display: "flex", justifyContent: "space-between" }}>
                      <span>{l}{k === "dob" && age ? <span style={{ marginLeft: 6, color: "var(--accent-money)", fontWeight: 700 }}>Age {age}</span> : null}</span>
                      {!isValid && <span style={{ color: "var(--state-danger)", fontWeight: 700 }}>{err}</span>}
                    </div>
                    <input
                      type={type} value={form[k]} onChange={e => set(k, e.target.value)}
                      placeholder={ph}
                      style={{ width: "100%", padding: "7px 9px", fontSize: 12.5, background: "var(--bg-base)", border: `1px solid ${isValid ? "var(--border-subtle)" : "var(--state-danger)"}`, borderRadius: 6, color: "var(--text-primary)", boxSizing: "border-box", outline: "none" }}
                    />
                  </div>
                );
              })}
              <div>
                <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginBottom: 3, fontWeight: 600 }}>Gender</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {[["M", "Male"], ["F", "Female"]].map(([v, l]) => (
                    <button key={v} onClick={() => set("gender", v)} style={{ flex: 1, padding: "6px 0", fontSize: 12, borderRadius: 6, border: "1px solid var(--border-subtle)", background: form.gender === v ? "var(--accent-money)" : "transparent", color: form.gender === v ? "#06110b" : "var(--text-secondary)", cursor: "pointer", fontWeight: form.gender === v ? 700 : 400 }}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginBottom: 3, fontWeight: 600 }}>Notes</div>
                <textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={3}
                  style={{ width: "100%", padding: "7px 9px", fontSize: 12, background: "var(--bg-base)", border: "1px solid var(--border-subtle)", borderRadius: 6, color: "var(--text-secondary)", boxSizing: "border-box", resize: "vertical" }} />
              </div>
            </div>
          )}

          {section === "health" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.5, marginBottom: 4 }}>
                Answer yes/no for each condition. These feed directly into the live quote on the Quotes tab.
              </div>
              {HEALTH_QUESTIONS.map(q => {
                const val = health[q.id];
                return (
                  <div key={q.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 7, border: "1px solid var(--border-subtle)", background: val === true ? "color-mix(in oklch,var(--state-danger) 8%,var(--bg-raised))" : val === false ? "color-mix(in oklch,var(--accent-money) 8%,var(--bg-raised))" : "var(--bg-raised)" }}>
                    <div style={{ flex: 1, fontSize: 12, color: "var(--text-primary)", lineHeight: 1.4 }}>{q.label}</div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => setHealth(prev => ({ ...prev, [q.id]: true }))} style={{ padding: "3px 8px", fontSize: 11, borderRadius: 5, border: "none", background: val === true ? "var(--state-danger)" : "var(--bg-base)", color: val === true ? "#fff" : "var(--text-tertiary)", cursor: "pointer", fontWeight: 600 }}>Yes</button>
                      <button onClick={() => setHealth(prev => ({ ...prev, [q.id]: false }))} style={{ padding: "3px 8px", fontSize: 11, borderRadius: 5, border: "none", background: val === false ? "var(--accent-money)" : "var(--bg-base)", color: val === false ? "#06110b" : "var(--text-tertiary)", cursor: "pointer", fontWeight: 600 }}>No</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {section === "banking" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ padding: "8px 10px", borderRadius: 7, background: "color-mix(in oklch,var(--state-warning,#f59e0b) 10%,transparent)", border: "1px solid color-mix(in oklch,var(--state-warning,#f59e0b) 30%,transparent)", fontSize: 11, color: "var(--state-warning,#f59e0b)", lineHeight: 1.5 }}>
                <strong>Sensitive info.</strong> Only enter if the client provides it verbally. This is stored encrypted in your agency's database.
              </div>
              {[
                { k: "bank_name", l: "Bank Name", ph: "Chase, Wells Fargo…" },
                { k: "routing_number", l: "Routing Number", ph: "9 digits", validate: isRoutingValid, err: "Must be 9 digits" },
                { k: "account_number", l: "Account Number", ph: "Enter carefully", validate: isAccountValid, err: "Must be 4-17 digits" },
                { k: "beneficiary", l: "Beneficiary Name", ph: "Full legal name" },
                { k: "relationship", l: "Beneficiary Relationship", ph: "Spouse, Child, Parent…" },
              ].map(({ k, l, ph, validate, err }) => {
                const isValid = validate ? validate(form[k]) : true;
                return (
                  <div key={k}>
                    <div style={{ fontSize: 10.5, color: isValid ? "var(--text-tertiary)" : "var(--state-danger)", marginBottom: 3, fontWeight: 600, display: "flex", justifyContent: "space-between" }}>
                      <span>{l}</span>
                      {!isValid && <span style={{ color: "var(--state-danger)", fontWeight: 700 }}>{err}</span>}
                    </div>
                    <input
                      value={form[k]} onChange={e => set(k, e.target.value)} placeholder={ph}
                      type={k.includes("number") ? "text" : "text"}
                      autoComplete="off"
                      style={{ width: "100%", padding: "7px 9px", fontSize: 12.5, background: "var(--bg-base)", border: `1px solid ${isValid ? "var(--border-subtle)" : "var(--state-danger)"}`, borderRadius: 6, color: "var(--text-primary)", boxSizing: "border-box", outline: "none" }}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {section === "quotes" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {!age || !form.state ? (
                <div style={{ padding: 16, textAlign: "center", fontSize: 12, color: "var(--text-tertiary)", border: "1px dashed var(--border-subtle)", borderRadius: 8 }}>
                  Enter Age (via DOB) and State in Vitals to see live quotes.
                </div>
              ) : quotes.length === 0 ? (
                <div style={{ padding: 16, textAlign: "center", fontSize: 12, color: "var(--text-tertiary)", border: "1px dashed var(--border-subtle)", borderRadius: 8 }}>
                  No rates found for {form.state}, age {age}. Check carrier rate tables in Admin.
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>
                    Live quotes for Age {age} · {form.state} · {form.gender === "F" ? "Female" : "Male"} · {health.tobacco ? "Tobacco" : "Non-tobacco"}
                  </div>
                  {quotes.map((q, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border-subtle)", background: "var(--bg-raised)" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{q.carrier || q.carrierName}</div>
                        <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 1 }}>{q.product || q.planName}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--accent-money)", fontFamily: "JetBrains Mono, monospace" }}>
                          ${(q.monthly_premium || q.premium || 0).toFixed(2)}<span style={{ fontSize: 10, fontWeight: 400, color: "var(--text-tertiary)" }}>/mo</span>
                        </div>
                        {q.annual_premium && <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>${q.annual_premium.toFixed(0)}/yr</div>}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Save button */}
        <button
          onClick={saveClient}
          disabled={saving}
          style={{
            width: "100%", padding: "10px 0", borderRadius: 8, border: "none", cursor: saving ? "wait" : "pointer",
            background: saved ? "var(--accent-money)" : "var(--accent-money)",
            color: "#06110b", fontSize: 13, fontWeight: 700,
            opacity: saving ? 0.7 : 1, transition: "opacity .2s",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}>
          {saving ? <><Icons.Loader size={14} style={{ animation: "spin 1s linear infinite" }} /> Saving…</> : saved ? <><Icons.Check size={14} /> Saved!</> : <><Icons.Save size={14} /> Save Client Record</>}
        </button>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────
  // Main page
  // ──────────────────────────────────────────────────────────────
  function PageFloor({ role = "rep" }) {
    const [selectedScript, setSelectedScript] = useState(null);
    const [activeCallInfo, setActiveCallInfo] = useState(null);

    // Listen for incall events to show the active-call banner
    useEffect(() => {
      const onOpen = e => {
        const lead = e.detail?.lead;
        setActiveCallInfo(lead ? { name: lead.lead_name || lead.lead || "Lead", phone: lead.phone || "" } : null);
      };
      const onClose = () => setActiveCallInfo(null);
      window.addEventListener("incall:opened", onOpen);
      window.addEventListener("incall:closed", onClose);
      return () => {
        window.removeEventListener("incall:opened", onOpen);
        window.removeEventListener("incall:closed", onClose);
      };
    }, []);

    return (
      <div className="page-pad" style={{ display: "flex", flexDirection: "column", height: "100%", gap: 0 }}>
        {/* Header */}
        <div className="page-h" style={{ marginBottom: 12, flexShrink: 0 }}>
          <div>
            <div className="page-title">Floor</div>
            <div className="page-sub">In-call assistant — scripts, live transcription, client capture & live quotes.</div>
          </div>
          {activeCallInfo && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 20, background: "color-mix(in oklch,var(--accent-money) 15%,var(--bg-raised))", border: "1px solid color-mix(in oklch,var(--accent-money) 40%,transparent)" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--state-danger)", display: "inline-block", animation: "floor-pulse 1.2s ease-in-out infinite" }} />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--accent-money)" }}>Live call: {activeCallInfo.name}</span>
              {activeCallInfo.phone && <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{activeCallInfo.phone}</span>}
            </div>
          )}
        </div>

        {/* Three-column workspace */}
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "240px 1fr 280px", gap: 12, minHeight: 0 }}>
          {/* Left: Scripts */}
          <div style={{ background: "var(--bg-raised)", border: "1px solid var(--border-subtle)", borderRadius: 12, padding: "14px 12px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <ScriptPanel selectedScript={selectedScript} onSelect={setSelectedScript} />
          </div>

          {/* Center: Live transcript + recording */}
          <div style={{ background: "var(--bg-raised)", border: "1px solid var(--border-subtle)", borderRadius: 12, padding: "14px 12px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <TranscriptPanel selectedScript={selectedScript} />
          </div>

          {/* Right: Client info + quotes */}
          <div style={{ background: "var(--bg-raised)", border: "1px solid var(--border-subtle)", borderRadius: 12, padding: "14px 12px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <ClientPanel />
          </div>
        </div>

        {/* CSS animations injected inline */}
        <style>{`
          @keyframes floor-pulse {
            0%, 100% { box-shadow: 0 0 0 0 color-mix(in oklch, var(--state-danger) 40%, transparent); }
            50% { box-shadow: 0 0 0 5px color-mix(in oklch, var(--state-danger) 0%, transparent); }
          }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  window.PageFloor = PageFloor;
})();
