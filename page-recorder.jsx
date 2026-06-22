/* page-recorder.jsx — standalone call recorder.
 *
 * Why standalone (2026-06-14): recording UI was trapped inside the deactivated
 * Floor page, and nothing in the app wrote the `call_recordings` table that the
 * coaching crons (transcribe-call-recordings → score-recent-calls →
 * call_coaching_scores) consume. This surface lets ANY rep/manager record a
 * dialing session's audio with one button. On stop it POSTs the blob to
 * /api/call-recording-upload, which lands it in the call-recordings bucket +
 * call_recordings row — and the existing crons transcribe + coach it.
 *
 * Registers window.PageRecorder. Routed from app.jsx `case "recorder"`.
 */
(function () {
  const { useState, useEffect, useRef, useCallback } = React;

  const SOURCES = {
    mic:          "Mic only",
    "mic+system": "Mic + system audio (Phone Link / Continuity / Bluetooth)",
  };

  function pickMime() {
    for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]) {
      try { if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m; } catch (_e) {}
    }
    return "";
  }

  async function captureSystemAudio() {
    if (!navigator.mediaDevices?.getDisplayMedia) return { stream: null, reason: "browser-unsupported" };
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      s.getVideoTracks().forEach(t => t.stop());
      const a = s.getAudioTracks();
      if (!a.length) { s.getTracks().forEach(t => t.stop()); return { stream: null, reason: "no-audio-track" }; }
      return { stream: new MediaStream(a), reason: null };
    } catch (e) { return { stream: null, reason: (e && e.name) || "denied" }; }
  }

  function fmtDur(sec) {
    if (sec == null) return "—";
    const m = Math.floor(sec / 60), s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function decodeTranscript(rec) {
    if (rec.transcript_text) return rec.transcript_text;
    const u = rec.transcript_url || "";
    if (u.startsWith("data:text/plain;base64,")) {
      try { return decodeURIComponent(escape(atob(u.slice("data:text/plain;base64,".length)))); } catch { return null; }
    }
    return null;
  }

  function PageRecorder({ role }) {
    const [status, setStatus]   = useState("idle"); // idle | recording | uploading | error
    const [source, setSource]   = useState("mic");
    const [seconds, setSeconds] = useState(0);
    const [leadName, setLeadName] = useState("");
    const [note, setNote]       = useState(null);
    const [recordings, setRecordings] = useState([]);
    const [expanded, setExpanded] = useState(null);

    const recRef = useRef(null), ctxRef = useRef(null), streamsRef = useRef([]), chunksRef = useRef([]), mimeRef = useRef(""), timerRef = useRef(null), startedRef = useRef(0);

    useEffect(() => {
      try {
        const raw = sessionStorage.getItem("repflow.recorder.prefill");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.leadName) setLeadName(parsed.leadName);
          sessionStorage.removeItem("repflow.recorder.prefill");
        }
      } catch {}
      try {
        if (sessionStorage.getItem("repflow.recorder.mode") === "roleplay") {
          setNote("Roleplay mode: record the practice call, then upload it for transcript + coaching.");
        }
      } catch {}
    }, []);

    // ── Load this rep's recent recordings + their coaching scores ──────────
    const loadRecordings = useCallback(async () => {
      const sb = window.getSupabase?.(); const me = window.me?.();
      if (!sb || !me?.rep_id) return;
      const { data: recs } = await sb.from("call_recordings")
        .select("*, pipeline(lead_name)")
        .eq("rep_id", me.rep_id).order("started_at", { ascending: false }).limit(25);
      if (!recs) return;
      const ids = recs.map(r => r.id);
      let scores = {};
      if (ids.length) {
        const { data: sc } = await sb.from("call_coaching_scores")
          .select("call_recording_id, score, summary, coaching_points, objections").in("call_recording_id", ids);
        for (const s of (sc || [])) scores[s.call_recording_id] = s;
      }
      setRecordings(recs.map(r => ({ ...r, _score: scores[r.id] || null })));
    }, []);

    useEffect(() => { loadRecordings(); const t = setInterval(loadRecordings, 20000); return () => clearInterval(t); }, [loadRecordings]);

    const stopTracks = () => {
      try { recRef.current && recRef.current.state !== "inactive" && recRef.current.stop(); } catch {}
      try { ctxRef.current && ctxRef.current.close(); } catch {}
      for (const s of streamsRef.current) { try { s.getTracks().forEach(t => t.stop()); } catch {} }
      streamsRef.current = []; ctxRef.current = null;
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };

    useEffect(() => () => stopTracks(), []);

    const start = async () => {
      setNote(null);
      let mic;
      try { mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
      catch { setStatus("error"); setNote("Mic permission was blocked. Allow microphone access and try again."); return; }
      streamsRef.current = [mic];

      if (source === "mic+system") {
        const { stream: sys, reason } = await captureSystemAudio();
        if (sys) { streamsRef.current.push(sys); setNote("Recording mic + system audio. Keep the shared tab/window open."); }
        else setNote(reason === "browser-unsupported" ? "This browser can't capture system audio — recording mic only (use Chrome/Edge for both)."
              : reason === "no-audio-track" ? "Screen-share didn't include audio — recording mic only. Re-try and tick 'Share audio'."
              : "System-audio share was declined — recording mic only.");
      }

      // Mix every stream into one destination.
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const dest = ctx.createMediaStreamDestination();
      for (const s of streamsRef.current) { try { ctx.createMediaStreamSource(s).connect(dest); } catch {} }
      ctxRef.current = ctx;

      const mime = pickMime(); mimeRef.current = mime;
      let rec;
      try { rec = new MediaRecorder(dest.stream, mime ? { mimeType: mime } : undefined); }
      catch { setStatus("error"); setNote("This browser can't record audio (MediaRecorder unsupported)."); stopTracks(); return; }
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => upload();
      recRef.current = rec;
      rec.start(1000); // 1s timeslices so a crash loses ≤1s
      startedRef.current = Date.now();
      setSeconds(0); setStatus("recording");
      timerRef.current = setInterval(() => setSeconds(Math.floor((Date.now() - startedRef.current) / 1000)), 500);
    };

    const stop = () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      try { recRef.current && recRef.current.state !== "inactive" && recRef.current.stop(); } catch {}
      // upload() fires from rec.onstop
    };

    const upload = async () => {
      setStatus("uploading");
      const durationSec = Math.max(1, Math.floor((Date.now() - startedRef.current) / 1000));
      const blob = new Blob(chunksRef.current, { type: mimeRef.current || "audio/webm" });
      // tear down audio graph now that we have the blob
      for (const s of streamsRef.current) { try { s.getTracks().forEach(t => t.stop()); } catch {} }
      streamsRef.current = []; try { ctxRef.current?.close(); } catch {} ctxRef.current = null;

      if (!blob.size) { setStatus("error"); setNote("Nothing was captured (empty recording)."); return; }

      try {
        const sb = window.getSupabase?.();
        const { data } = await sb.auth.getSession();
        const jwt = data?.session?.access_token;
        const fd = new FormData();
        fd.append("file", blob, `call.${(mimeRef.current.includes("ogg") ? "ogg" : mimeRef.current.includes("mp4") ? "m4a" : "webm")}`);
        fd.append("duration_sec", String(durationSec));
        fd.append("channels", source === "mic+system" ? "mic+system" : "mic");
        fd.append("mime", mimeRef.current || "audio/webm");
        if (leadName.trim()) fd.append("lead_name", leadName.trim());
        const r = await fetch("/api/call-recording-upload", { method: "POST", headers: jwt ? { "x-supabase-auth": `Bearer ${jwt}` } : {}, body: fd });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || `upload failed (${r.status})`);
        window.toast?.("Recording saved — transcribing + coaching now runs automatically.", "success");
        setStatus("idle"); setSeconds(0); setLeadName(""); setNote("Saved. Transcript + coaching appear below within a few minutes.");
        setTimeout(loadRecordings, 1500);
      } catch (e) {
        setStatus("error"); setNote("Upload failed: " + (e.message || "unknown") + ". The audio wasn't saved.");
      }
    };

    const recording = status === "recording", uploading = status === "uploading";

    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "8px 4px" }}>
        <div style={{ marginBottom: 4, fontSize: 20, fontWeight: 700, color: "var(--text-primary)" }}>Call Recorder</div>
        <div style={{ marginBottom: 18, fontSize: 13, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
          Record a dialing session. Every recording is transcribed and coached automatically — review it below.
        </div>

        {/* Recorder card */}
        <div style={{ padding: 18, borderRadius: 12, background: "var(--bg-raised)", border: "1px solid var(--border-subtle)", marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <button
              onClick={recording ? stop : start}
              disabled={uploading}
              style={{
                width: 64, height: 64, borderRadius: "50%", border: "none", cursor: uploading ? "wait" : "pointer",
                background: recording ? "var(--state-danger, #ef4444)" : "var(--accent-money, #10b981)",
                color: "#06110b", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                boxShadow: recording ? "0 0 0 6px color-mix(in oklch, var(--state-danger) 22%, transparent)" : "0 0 0 0 transparent",
                transition: "box-shadow .2s",
              }}
              title={recording ? "Stop & save" : "Start recording"}>
              {recording ? <span style={{ width: 18, height: 18, background: "#fff", borderRadius: 3 }}/> : <Icons.Mic size={26}/>}
            </button>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "JetBrains Mono, monospace", color: recording ? "var(--state-danger)" : "var(--text-primary)" }}>
                {fmtDur(seconds)}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
                {uploading ? "Saving…" : recording ? "Recording — click to stop & save" : "Ready"}
              </div>
            </div>
          </div>

          {!recording && !uploading && (
            <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
              <input
                placeholder="Lead name (optional)" value={leadName} onChange={e => setLeadName(e.target.value)}
                style={{ flex: 1, minWidth: 160, padding: "8px 10px", fontSize: 13, background: "var(--bg-base)", border: "1px solid var(--border-subtle)", borderRadius: 6, color: "var(--text-primary)" }}/>
              <select value={source} onChange={e => setSource(e.target.value)}
                style={{ padding: "8px 10px", fontSize: 12.5, background: "var(--bg-base)", border: "1px solid var(--border-subtle)", borderRadius: 6, color: "var(--text-secondary)" }}>
                {Object.entries(SOURCES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
          )}
          {note && <div style={{ marginTop: 14, padding: "8px 12px", borderRadius: 6, fontSize: 12, lineHeight: 1.5, background: status === "error" ? "color-mix(in oklch, var(--state-danger) 12%, transparent)" : "var(--bg-base)", color: status === "error" ? "var(--state-danger)" : "var(--text-tertiary)" }}>{note}</div>}
        </div>

        {/* Recordings list */}
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Recent recordings
        </div>
        {recordings.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: "var(--text-tertiary)", border: "1px dashed var(--border-subtle)", borderRadius: 10 }}>
            No recordings yet. Hit the mic above to record your first call.
          </div>
        )}
        {recordings.map(r => {
          const transcript = decodeTranscript(r), sc = r._score, open = expanded === r.id;
          return (
            <div key={r.id} style={{ border: "1px solid var(--border-subtle)", borderRadius: 10, marginBottom: 8, overflow: "hidden", background: "var(--bg-raised)" }}>
              <button onClick={() => setExpanded(open ? null : r.id)}
                style={{ width: "100%", textAlign: "left", padding: "12px 14px", background: "transparent", border: "none", cursor: "pointer", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{r.lead_name || r.pipeline?.lead_name || "Untitled call"}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>
                    {new Date(r.started_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {fmtDur(r.duration_sec)}
                    {transcript ? " · transcribed" : " · transcribing…"}
                  </div>
                </div>
                {sc?.score != null && (
                  <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 18, fontWeight: 700, color: sc.score >= 70 ? "var(--accent-money)" : sc.score >= 45 ? "var(--state-warning, #f59e0b)" : "var(--state-danger)" }}>
                    {sc.score}
                  </div>
                )}
                <span style={{ color: "var(--text-tertiary)", fontSize: 13 }}>{open ? "−" : "+"}</span>
              </button>
              {open && (
                <div style={{ padding: "0 14px 14px", borderTop: "1px solid var(--border-subtle)" }}>
                  {sc?.summary && <div style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: "12px 0", lineHeight: 1.55 }}>{sc.summary}</div>}
                  {Array.isArray(sc?.coaching_points) && sc.coaching_points.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary)", marginBottom: 6 }}>Coaching</div>
                      {sc.coaching_points.map((c, i) => (
                        <div key={i} style={{ fontSize: 12, color: "var(--text-primary)", marginBottom: 8, paddingLeft: 10, borderLeft: "2px solid var(--accent-money)", lineHeight: 1.5 }}>
                          <strong>{c.point}</strong>{c.improvement ? ` — ${c.improvement}` : ""}
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary)", marginBottom: 6 }}>Transcript</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", whiteSpace: "pre-wrap", lineHeight: 1.55, maxHeight: 260, overflow: "auto" }}>
                    {transcript || "Transcript not ready yet — it appears automatically once processed (needs OPENAI_API_KEY set in Vercel)."}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  window.PageRecorder = PageRecorder;
})();
