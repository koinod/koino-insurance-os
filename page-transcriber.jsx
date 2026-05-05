/* page-transcriber.jsx — live + post-call transcription.
 *
 * <LiveTranscriber active={bool} leadName onSegment/>
 *   - When active and a Twilio Voice connection is live, captures the local
 *     mic + remote caller audio via the Web Audio API, slices into 5-second
 *     chunks via MediaRecorder, posts each chunk to /api/transcribe, and
 *     emits text segments via onSegment + a transcript:segment window event.
 *   - Falls back to mic-only when no Twilio call is active (so the rep can
 *     still get a transcript of what *they* said).
 *   - Quietly degrades to "transcription unavailable" if /api/transcribe
 *     returns 503 (no OPENAI_API_KEY).
 *
 * <PostCallTranscript recordingId/>  — fetches a finished recording's
 *   transcript from vault_artifacts.metadata.transcript.
 */

(function () {
  const { useState, useEffect, useRef } = React;

  function getActiveTwilioConnection() {
    if (window.__twActive) return window.__twActive;
    if (window.Twilio && window.Twilio.Device) {
      try {
        const c = window.Twilio.Device.activeConnection && window.Twilio.Device.activeConnection();
        if (c) return c;
      } catch (_e) {}
    }
    return null;
  }

  function getRemoteAudioStream(conn) {
    if (!conn) return null;
    try {
      // Twilio Voice SDK: getRemoteStream returns the caller's MediaStream
      if (typeof conn.getRemoteStream === "function") return conn.getRemoteStream();
      // Older API: pcStream
      if (conn.mediaStream && conn.mediaStream.remoteStream) return conn.mediaStream.remoteStream;
    } catch (_e) {}
    return null;
  }

  /** Mix multiple MediaStreams into one via Web Audio API. Returns the
   *  combined MediaStream. */
  function mixStreams(streams) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const dest = ctx.createMediaStreamDestination();
    for (const s of streams) {
      if (!s) continue;
      try {
        const src = ctx.createMediaStreamSource(s);
        src.connect(dest);
      } catch (_e) {}
    }
    return { stream: dest.stream, ctx };
  }

  function pickMimeType() {
    const cands = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ];
    for (const m of cands) {
      try { if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m; } catch (_e) {}
    }
    return "";
  }

  function LiveTranscriber({ active, leadName, onSegment }) {
    const [status,   setStatus]   = useState("idle");      // idle | starting | live | unavailable | error
    const [transcript, setTranscript] = useState([]);      // [{who, text, t}]
    const recRef    = useRef(null);
    const ctxRef    = useRef(null);
    const streamsRef = useRef([]);
    const aliveRef  = useRef(true);

    useEffect(() => {
      aliveRef.current = true;
      return () => { aliveRef.current = false; stop(); };
    }, []);

    useEffect(() => {
      if (active) start();
      else stop();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active]);

    const stop = () => {
      try { recRef.current && recRef.current.state !== "inactive" && recRef.current.stop(); } catch (_e) {}
      recRef.current = null;
      try { ctxRef.current && ctxRef.current.close(); } catch (_e) {}
      ctxRef.current = null;
      for (const s of streamsRef.current) {
        try { s.getTracks().forEach(t => t.stop()); } catch (_e) {}
      }
      streamsRef.current = [];
    };

    const start = async () => {
      setStatus("starting");
      // Probe /api/transcribe to bail fast if not configured.
      try {
        const probe = await fetch("/api/transcribe", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
        if (probe.status === 503) { setStatus("unavailable"); return; }
      } catch (_e) { /* tolerant — proceed and let chunks fail individually */ }

      // 1) Local mic
      let mic = null;
      try {
        mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      } catch (e) {
        setStatus("error");
        window.toast && window.toast("Mic permission blocked — transcription unavailable", "warn");
        return;
      }
      streamsRef.current.push(mic);

      // 2) Remote (lead) audio if a Twilio call is active
      const conn = getActiveTwilioConnection();
      const remote = getRemoteAudioStream(conn);
      if (remote) streamsRef.current.push(remote);

      // 3) Mix into one stream for MediaRecorder
      const { stream, ctx } = mixStreams([mic, remote].filter(Boolean));
      ctxRef.current = ctx;

      const mime = pickMimeType();
      let rec;
      try {
        rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      } catch (e) {
        setStatus("error");
        window.toast && window.toast("MediaRecorder unsupported — transcription unavailable", "warn");
        return;
      }
      recRef.current = rec;

      // Slice into 5-second chunks; on each chunk, POST to Whisper.
      rec.ondataavailable = async (ev) => {
        if (!aliveRef.current) return;
        if (!ev.data || ev.data.size < 1024) return;  // ignore micro-chunks
        const fd = new FormData();
        const ext = mime.includes("webm") ? "webm" : mime.includes("ogg") ? "ogg" : "m4a";
        fd.append("file", ev.data, `chunk.${ext}`);
        fd.append("language", "en");
        if (leadName) fd.append("prompt", `Insurance sales call with ${leadName}. Plan G, Plan N, Final Expense, IUL, Annuity, TPMO, SOA.`);
        try {
          const r = await fetch("/api/transcribe", { method: "POST", body: fd });
          if (!aliveRef.current) return;
          if (r.status === 503) { setStatus("unavailable"); stop(); return; }
          if (!r.ok) return;
          const j = await r.json();
          const text = (j.text || "").trim();
          if (!text) return;
          // Diarization-lite: assume rep mic dominant when only mic stream;
          // otherwise tag "Call" and let downstream classifier split.
          const seg = { who: remote ? "Call" : "You", text, t: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }) };
          setTranscript(arr => [...arr, seg]);
          onSegment && onSegment(seg);
          window.dispatchEvent(new CustomEvent("transcript:segment", { detail: seg }));
        } catch (_e) {}
      };
      rec.onerror   = () => setStatus("error");
      rec.onstart   = () => setStatus("live");
      rec.start(5000);  // 5s chunks
    };

    if (status === "unavailable") {
      return (
        <div style={{ padding: 12, background: "var(--bg-raised)", borderRadius: 6, fontSize: 11.5, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
          <strong style={{ color: "var(--text-secondary)" }}>Transcription unavailable</strong> — set <span className="mono">OPENAI_API_KEY</span> in Vercel project env to enable live + post-call Whisper. Recording still captures fine.
        </div>
      );
    }
    if (status === "error") {
      return (
        <div style={{ padding: 12, background: "color-mix(in oklch, var(--state-warning) 12%, transparent)", borderRadius: 6, fontSize: 11.5, color: "var(--state-warning)", lineHeight: 1.5 }}>
          Live transcription couldn't start (mic blocked or unsupported). Post-call transcript still works via the recording.
        </div>
      );
    }
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span className={`dot ${status === "live" ? "dot-live" : ""}`} style={{ background: status === "live" ? "var(--accent-money)" : "var(--text-tertiary)" }}></span>
          <span style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", color: status === "live" ? "var(--accent-money)" : "var(--text-tertiary)" }}>
            {status === "live" ? "Live transcript · Whisper" : status === "starting" ? "Starting…" : "Idle"}
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {transcript.length === 0 && status === "live" && (
            <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>Listening… first segment lands in ~5s.</div>
          )}
          {transcript.map((m, i) => (
            <div key={i}>
              <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", display: "flex", gap: 8 }}>
                <span className="mono">{m.t}</span>
                <span style={{ fontWeight: 500, color: m.who === "You" ? "var(--accent-money)" : "var(--text-secondary)" }}>{m.who}</span>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text-primary)", marginTop: 2, lineHeight: 1.5 }}>{m.text}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  window.LiveTranscriber = LiveTranscriber;

  /** Polls vault_artifacts for a finished recording's transcript metadata. */
  function PostCallTranscript({ recordingId }) {
    const [data, setData] = useState(null);
    const [busy, setBusy] = useState(false);
    useEffect(() => {
      if (!recordingId) return;
      let cancelled = false;
      const poll = async () => {
        const sb = window.getSupabase && window.getSupabase();
        if (!sb) return;
        setBusy(true);
        const { data: rows } = await sb.from("vault_artifacts").select("metadata").eq("id", recordingId).limit(1);
        if (cancelled) return;
        const meta = rows?.[0]?.metadata || null;
        setData(meta);
        setBusy(false);
        if (meta?.transcribe_status === "pending") setTimeout(poll, 4000);
      };
      poll();
      return () => { cancelled = true; };
    }, [recordingId]);

    if (!recordingId) return null;
    if (busy && !data) return <div style={{ padding: 12, color: "var(--text-tertiary)", fontSize: 12 }}>Loading transcript…</div>;
    if (!data || data.transcribe_status === "pending") {
      return <div style={{ padding: 12, color: "var(--text-tertiary)", fontSize: 12 }}>Transcribing… check back in a few seconds.</div>;
    }
    if (!data.transcript) {
      return <div style={{ padding: 12, color: "var(--text-tertiary)", fontSize: 12 }}>No transcript on this recording (OPENAI_API_KEY may not be set).</div>;
    }
    return (
      <div style={{ padding: 12, background: "var(--bg-raised)", borderRadius: 6, fontSize: 12.5, lineHeight: 1.55, color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>
        {data.transcript}
      </div>
    );
  }
  window.PostCallTranscript = PostCallTranscript;

})();
