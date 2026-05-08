/* lib/call-recorder.js — browser MediaRecorder wrapper for the Floor panel.
 *
 * Captures audio from one or both of:
 *   • the rep's microphone (always)
 *   • a tab/window the rep shares (optional — gets the lead's voice when the
 *     call is over Zoom/Teams/Google Meet/Phone-Link/etc. on the same laptop)
 *
 * The two streams are mixed in a Web Audio AudioContext and fed to a single
 * MediaRecorder. On stop, the resulting blob is uploaded to the
 * Supabase storage bucket `call-recordings` at path <rep_id>/<id>.webm and a
 * row is inserted into `call_recordings`.
 *
 * Two modes:
 *   • mode='mic'         — microphone only (default; works with no extra perms)
 *   • mode='mic+system'  — microphone + tab/window audio (one-time prompt;
 *                          rep picks the call's tab and checks "Share tab audio")
 *
 * Used by page-floor.jsx CallRecorderPanel. State is exposed via three
 * subscribable callbacks: onTick (every 1s), onState (start/pause/stop), and
 * onLevel (mic peak meter, 0..1). Demo-mode (no Supabase): saves to
 * localStorage `repflow:calls` so the UI still functions offline.
 */

(function () {
  const LS_LOCAL_CALLS = "repflow:calls";

  function loadLocalCalls() {
    try { return JSON.parse(localStorage.getItem(LS_LOCAL_CALLS) || "[]"); } catch { return []; }
  }
  function saveLocalCalls(list) {
    try { localStorage.setItem(LS_LOCAL_CALLS, JSON.stringify(list.slice(0, 100))); } catch {}
  }

  function pickMime() {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ];
    for (const m of candidates) {
      try { if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m; } catch (_e) {}
    }
    return "";
  }

  function fmt(s) {
    s = Math.max(0, Math.floor(s));
    const m = Math.floor(s / 60), r = s % 60;
    return `${m}:${r.toString().padStart(2, "0")}`;
  }

  class CallRecorder {
    constructor({ mode = "mic", repId, leadId = null, onTick, onState, onLevel } = {}) {
      this.mode = mode;
      this.repId = repId;
      this.leadId = leadId;
      this.onTick = onTick || (() => {});
      this.onState = onState || (() => {});
      this.onLevel = onLevel || (() => {});

      this.state = "idle";          // idle | recording | paused | uploading | error
      this.startedAt = null;
      this.elapsedSecBeforePause = 0;  // accumulated time across pause cycles
      this.lastResumeAt = null;
      this.tickHandle = null;

      this.streams = [];                // every MediaStream we open, so we can stop them
      this.audioCtx = null;
      this.dest = null;
      this.analyser = null;
      this.rafLevelHandle = null;

      this.recorder = null;
      this.chunks = [];
      this.mime = pickMime();
    }

    setState(s) { this.state = s; this.onState(s); }

    elapsedSec() {
      let total = this.elapsedSecBeforePause;
      if (this.state === "recording" && this.lastResumeAt) {
        total += (Date.now() - this.lastResumeAt) / 1000;
      }
      return total;
    }

    async start() {
      if (this.state !== "idle") return;
      if (!window.MediaRecorder) {
        window.toast && window.toast("Browser does not support MediaRecorder", "warn");
        this.setState("error"); return;
      }
      try {
        const tracks = [];
        // Mic — always
        const mic = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        this.streams.push(mic);
        tracks.push(...mic.getAudioTracks());

        // Optional: tab/window audio for the lead's voice
        if (this.mode === "mic+system") {
          try {
            const sys = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            // We don't actually want the video track; keep the audio.
            sys.getVideoTracks().forEach(t => t.stop());
            this.streams.push(sys);
            const sysAudio = sys.getAudioTracks();
            if (sysAudio.length === 0) {
              window.toast && window.toast("Tip: re-share the tab and check ‘Share tab audio’ to capture both sides", "warn");
            } else {
              tracks.push(...sysAudio);
            }
          } catch (_e) {
            window.toast && window.toast("System audio capture cancelled — recording mic only", "info");
          }
        }

        // Mix all tracks into one stream via AudioContext
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        this.dest = this.audioCtx.createMediaStreamDestination();
        for (const s of this.streams) {
          if (s.getAudioTracks().length === 0) continue;
          const src = this.audioCtx.createMediaStreamSource(new MediaStream(s.getAudioTracks()));
          src.connect(this.dest);
          // Tap one source for the level meter
          if (!this.analyser) {
            this.analyser = this.audioCtx.createAnalyser();
            this.analyser.fftSize = 512;
            src.connect(this.analyser);
            this._levelLoop();
          }
        }

        this.recorder = new MediaRecorder(this.dest.stream, this.mime ? { mimeType: this.mime } : undefined);
        this.chunks = [];
        this.recorder.ondataavailable = (e) => { if (e.data?.size) this.chunks.push(e.data); };
        this.recorder.onstop = () => this._onStop();
        this.recorder.start(2000);   // 2s timeslice — chunks arrive every 2s

        this.startedAt = new Date().toISOString();
        this.elapsedSecBeforePause = 0;
        this.lastResumeAt = Date.now();
        this.setState("recording");
        this._tickLoop();
      } catch (e) {
        console.error("[CallRecorder] start failed:", e);
        window.toast && window.toast(`Mic permission denied: ${e.message || e}`, "warn");
        this.setState("error");
      }
    }

    pause() {
      if (this.state !== "recording") return;
      try { this.recorder.pause(); } catch {}
      this.elapsedSecBeforePause += (Date.now() - this.lastResumeAt) / 1000;
      this.lastResumeAt = null;
      this.setState("paused");
    }

    resume() {
      if (this.state !== "paused") return;
      try { this.recorder.resume(); } catch {}
      this.lastResumeAt = Date.now();
      this.setState("recording");
    }

    async stop() {
      if (this.state === "idle" || this.state === "uploading") return;
      this.setState("uploading");
      try { this.recorder.stop(); } catch {}
      // _onStop will run after the recorder flushes
    }

    cancel() {
      this.chunks = [];
      this._cleanup();
      this.setState("idle");
    }

    async _onStop() {
      const blob = new Blob(this.chunks, { type: this.mime || "audio/webm" });
      const finalElapsed = this.elapsedSec();
      this._cleanup();

      const callId = (crypto.randomUUID && crypto.randomUUID()) || `call-${Date.now()}`;
      const fileName = `${this.repId || "demo-rep"}/${callId}.webm`;
      const ended_at = new Date().toISOString();
      const meta = {
        id: callId,
        rep_id: this.repId || "demo-rep",
        lead_id: this.leadId,
        started_at: this.startedAt,
        ended_at,
        duration_sec: Math.round(finalElapsed),
        audio_path: fileName,
        audio_bytes: blob.size,
        audio_mime: this.mime || "audio/webm",
        channels: this.mode,
        source: "floor-panel",
      };

      // LIVE upload path
      const sb = window.getSupabase && window.getSupabase();
      if (window.AppData?.LIVE && sb) {
        try {
          const { error: uploadErr } = await sb.storage.from("call-recordings").upload(fileName, blob, {
            contentType: this.mime || "audio/webm",
            upsert: false,
          });
          if (uploadErr) throw uploadErr;
          await sb.from("call_recordings").insert(meta);
          window.dispatchEvent(new CustomEvent("data:mutated", { detail: { table: "call_recordings", op: "insert", id: callId } }));
          window.toast && window.toast(`Call saved · ${fmt(finalElapsed)}`, "success");
        } catch (e) {
          console.error("[CallRecorder] upload failed:", e);
          // Fall back to localStorage so we don't lose the recording
          this._saveLocal(meta, blob);
          window.toast && window.toast(`Upload failed (${e.message || "network"}) — saved locally`, "warn");
        }
      } else {
        this._saveLocal(meta, blob);
        window.toast && window.toast(`Demo: call saved locally · ${fmt(finalElapsed)}`, "success");
      }
      this.setState("idle");
    }

    _saveLocal(meta, blob) {
      // Save the blob as an objectURL so we can play it back in this session
      const url = URL.createObjectURL(blob);
      const calls = loadLocalCalls();
      calls.unshift({ ...meta, _localBlobUrl: url });
      saveLocalCalls(calls);
      window.dispatchEvent(new CustomEvent("data:mutated", { detail: { table: "call_recordings", op: "insert", id: meta.id } }));
    }

    _cleanup() {
      if (this.tickHandle) { clearInterval(this.tickHandle); this.tickHandle = null; }
      if (this.rafLevelHandle) { cancelAnimationFrame(this.rafLevelHandle); this.rafLevelHandle = null; }
      try { this.streams.forEach(s => s.getTracks().forEach(t => t.stop())); } catch {}
      this.streams = [];
      try { this.audioCtx?.close(); } catch {}
      this.audioCtx = null; this.dest = null; this.analyser = null;
      this.recorder = null;
    }

    _tickLoop() {
      this.tickHandle = setInterval(() => {
        if (this.state === "recording") this.onTick(this.elapsedSec());
      }, 1000);
    }

    _levelLoop() {
      const buf = new Uint8Array(this.analyser.frequencyBinCount);
      const tick = () => {
        if (!this.analyser) return;
        this.analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = Math.abs(buf[i] - 128) / 128;
          if (v > peak) peak = v;
        }
        this.onLevel(peak);
        this.rafLevelHandle = requestAnimationFrame(tick);
      };
      tick();
    }
  }

  // ── Recording fetch helpers ─────────────────────────────────────────────
  async function listRecentCalls({ scope = "self", limit = 25 } = {}) {
    const sb = window.getSupabase && window.getSupabase();
    if (window.AppData?.LIVE && sb) {
      try {
        const me = window.me && window.me();
        let q = sb.from("call_recordings").select("*").order("started_at", { ascending: false }).limit(limit);
        if (scope === "self" && me?.rep_id) q = q.eq("rep_id", me.rep_id);
        // RLS handles downline / agency scoping for manager / owner roles
        const { data } = await q;
        return data || [];
      } catch (e) {
        console.error("[listRecentCalls]", e);
        return loadLocalCalls();
      }
    }
    return loadLocalCalls();
  }

  async function getPlaybackUrl(call) {
    if (call._localBlobUrl) return call._localBlobUrl;
    const sb = window.getSupabase && window.getSupabase();
    if (!call.audio_path || !sb) return null;
    try {
      const { data } = await sb.storage.from("call-recordings").createSignedUrl(call.audio_path, 60 * 30);
      return data?.signedUrl || null;
    } catch (e) {
      console.error("[getPlaybackUrl]", e);
      return null;
    }
  }

  async function setOutcome(callId, outcome, notes) {
    const sb = window.getSupabase && window.getSupabase();
    if (window.AppData?.LIVE && sb) {
      try {
        await sb.from("call_recordings").update({ outcome, notes }).eq("id", callId);
        window.dispatchEvent(new CustomEvent("data:mutated", { detail: { table: "call_recordings", op: "update", id: callId } }));
        return true;
      } catch (e) { console.error("[setOutcome]", e); return false; }
    }
    const calls = loadLocalCalls();
    const i = calls.findIndex(c => c.id === callId);
    if (i >= 0) { calls[i].outcome = outcome; calls[i].notes = notes; saveLocalCalls(calls); }
    return true;
  }

  window.CallRecorder = CallRecorder;
  window.CallRecorderUtils = { listRecentCalls, getPlaybackUrl, setOutcome, fmtTime: fmt };
})();
