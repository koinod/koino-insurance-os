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
  const IDB_NAME = "repflow";
  const IDB_STORE = "recordings";

  function loadLocalCalls() {
    try { return JSON.parse(localStorage.getItem(LS_LOCAL_CALLS) || "[]"); } catch { return []; }
  }
  function saveLocalCalls(list) {
    try { localStorage.setItem(LS_LOCAL_CALLS, JSON.stringify(list.slice(0, 100))); } catch {}
  }

  // ── IndexedDB persistence for recording blobs ──────────────────────────
  // localStorage holds the meta (id, started_at, duration, etc.) but blobs
  // live in IDB so they survive page reload — objectURLs created at save
  // time die when the document unloads, leaving History with dead links.
  function idbOpen() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error("no indexedDB"));
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(IDB_STORE)) {
          req.result.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbPut(id, blob) {
    try {
      const db = await idbOpen();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put(blob, id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) { console.warn("[CallRecorder] IDB put failed:", e); }
  }
  async function idbGet(id) {
    try {
      const db = await idbOpen();
      return await new Promise((resolve) => {
        const tx = db.transaction(IDB_STORE, "readonly");
        const r = tx.objectStore(IDB_STORE).get(id);
        r.onsuccess = () => resolve(r.result || null);
        r.onerror = () => resolve(null);
      });
    } catch (e) { console.warn("[CallRecorder] IDB get failed:", e); return null; }
  }
  async function idbDel(id) {
    try {
      const db = await idbOpen();
      return await new Promise((resolve) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {}
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
      // HTTPS / secure-context guard. getUserMedia rejects with NotAllowedError
      // on plain http:// (except localhost) BEFORE any prompt — so a toast
      // saying "permission denied" was the user's only signal something was
      // wrong. Tell them the real reason.
      if (!window.isSecureContext) {
        window.toast && window.toast("Mic recording needs HTTPS — this page is on plain HTTP", "warn");
        this.setState("error"); return;
      }
      // Pre-check the Permissions API where supported. If the user clicked
      // "Block" on a previous prompt, the browser remembers it forever and
      // getUserMedia rejects immediately with no UI — looks like "denied
      // without prompting." We can't force a re-prompt (browser security),
      // but we can tell the user exactly how to re-enable it.
      try {
        if (navigator.permissions?.query) {
          const status = await navigator.permissions.query({ name: "microphone" });
          if (status.state === "denied") {
            window.toast && window.toast(
              "Mic is blocked for this site. Click the lock/🔒 in your address bar → Microphone → Allow, then reload.",
              "warn"
            );
            this.setState("error");
            return;
          }
        }
      } catch (_pq) { /* Permissions API not supported (Safari < 16, etc.) — fall through to getUserMedia */ }
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
        // Map DOMException.name to actionable copy. NotAllowedError covers
        // "user dismissed the prompt" AND "permission is set to Block";
        // we can't distinguish those at this point so we point at the
        // address-bar control which fixes both.
        let msg;
        switch (e?.name) {
          case "NotAllowedError":
          case "SecurityError":
            msg = "Mic access blocked. Click the lock/🔒 in your address bar → Microphone → Allow, then click Start again.";
            break;
          case "NotFoundError":
          case "OverconstrainedError":
            msg = "No microphone detected. Plug one in or pick one in your OS sound settings.";
            break;
          case "NotReadableError":
            msg = "Mic is busy in another app (Zoom / Meet / Teams). Close it and try again.";
            break;
          case "AbortError":
            msg = "Mic request was interrupted. Try Start again.";
            break;
          default:
            msg = `Couldn't start the mic: ${e?.message || e?.name || e}`;
        }
        window.toast && window.toast(msg, "warn");
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

      // Local-first: blob → IDB, meta → localStorage. Cloud upload is gated
      // behind window.__callRecorderCloudSync for now (off until Ian's ready
      // to flip it on); local-only is the default per current product call.
      await this._saveLocal(meta, blob);
      window.toast && window.toast(`Call saved locally · ${fmt(finalElapsed)}`, "success");

      const sb = window.getSupabase && window.getSupabase();
      if (window.__callRecorderCloudSync && window.AppData?.LIVE && sb) {
        try {
          const { error: uploadErr } = await sb.storage.from("call-recordings").upload(fileName, blob, {
            contentType: this.mime || "audio/webm",
            upsert: false,
          });
          if (uploadErr) throw uploadErr;
          await sb.from("call_recordings").insert(meta);
          window.dispatchEvent(new CustomEvent("data:mutated", { detail: { table: "call_recordings", op: "insert", id: callId, scope: "cloud" } }));
        } catch (e) {
          console.warn("[CallRecorder] cloud sync failed (kept local):", e);
        }
      }
      this.setState("idle");
    }

    async _saveLocal(meta, blob) {
      // Persist blob to IndexedDB so it survives reload, plus an objectURL
      // for in-session playback. Meta goes to localStorage (small, indexed).
      await idbPut(meta.id, blob);
      const url = URL.createObjectURL(blob);
      const calls = loadLocalCalls();
      calls.unshift({ ...meta, _localBlobUrl: url });
      saveLocalCalls(calls);
      window.dispatchEvent(new CustomEvent("data:mutated", { detail: { table: "call_recordings", op: "insert", id: meta.id, scope: "local" } }));
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
  // Local-first per current product call. Cloud sync gated behind
  // window.__callRecorderCloudSync; when on, results from both sources are
  // merged with local taking precedence on id collision.
  async function listRecentCalls({ scope = "self", limit = 25 } = {}) {
    const local = loadLocalCalls();
    if (!window.__callRecorderCloudSync) return local.slice(0, limit);

    const sb = window.getSupabase && window.getSupabase();
    if (!(window.AppData?.LIVE && sb)) return local.slice(0, limit);
    try {
      const me = window.me && window.me();
      let q = sb.from("call_recordings").select("*").order("started_at", { ascending: false }).limit(limit);
      if (scope === "self" && me?.rep_id) q = q.eq("rep_id", me.rep_id);
      const { data } = await q;
      const cloud = data || [];
      const seen = new Set(local.map(c => c.id));
      return [...local, ...cloud.filter(c => !seen.has(c.id))].slice(0, limit);
    } catch (e) {
      console.warn("[listRecentCalls] cloud read failed (returning local):", e);
      return local.slice(0, limit);
    }
  }

  async function getPlaybackUrl(call) {
    if (!call) return null;
    // Always prefer a fresh objectURL from IDB — the cached _localBlobUrl on
    // the row dies on reload, so re-hydrate from the persistent blob.
    if (call.id) {
      const blob = await idbGet(call.id);
      if (blob) return URL.createObjectURL(blob);
    }
    if (call._localBlobUrl) return call._localBlobUrl;
    // Cloud fallback only if explicitly enabled.
    if (!window.__callRecorderCloudSync) return null;
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
    const calls = loadLocalCalls();
    const i = calls.findIndex(c => c.id === callId);
    if (i >= 0) { calls[i].outcome = outcome; calls[i].notes = notes; saveLocalCalls(calls); }
    if (window.__callRecorderCloudSync) {
      const sb = window.getSupabase && window.getSupabase();
      if (window.AppData?.LIVE && sb) {
        try { await sb.from("call_recordings").update({ outcome, notes }).eq("id", callId); } catch {}
      }
    }
    window.dispatchEvent(new CustomEvent("data:mutated", { detail: { table: "call_recordings", op: "update", id: callId } }));
    return true;
  }

  async function deleteRecording(callId) {
    await idbDel(callId);
    const calls = loadLocalCalls().filter(c => c.id !== callId);
    saveLocalCalls(calls);
    window.dispatchEvent(new CustomEvent("data:mutated", { detail: { table: "call_recordings", op: "delete", id: callId } }));
    return true;
  }

  window.CallRecorder = CallRecorder;
  window.CallRecorderUtils = { listRecentCalls, getPlaybackUrl, setOutcome, deleteRecording, fmtTime: fmt };
})();
