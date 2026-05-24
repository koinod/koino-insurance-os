/* page-power-dialer.jsx — Parallel/power dialer takeover UI.

   The floor's new dialer-of-record. Up to 10 simultaneous outbound legs,
   AI handler on losing legs, AI voicemail drop, recording, SMS+email
   touchpoints, live transcript pane per bridged call.

   Components:

   - <PowerDialerLauncher leads={Array} repId agencyId/>
       Button + lead-picker modal. On click → POST /api/dial/start with
       the lead queue + toggles, then mounts <PowerDialerSession/> over
       the page.

   - <PowerDialerSession sessionId livekit repId agencyId onEnd/>
       Full takeover. Left sidebar: toggles + stats + dial/pause/end.
       Right pane: N "line cards" (one per concurrent dial slot) with
       status + lead name + state + per-leg disposition shortcut.
       Bottom dock when one line is bridged: 1-5 hotkeys for outcome.

   Realtime model:
     - subscribes to `dial_sessions:id=eq.<sessionId>` for stats + status
     - subscribes to `call_attempts:session_id=eq.<sessionId>` for line state
     - joins LiveKit room (rep's session room) for audio

   API contract (proxied through /api/dial/* to the worker so the worker's
   shared secret never reaches the browser):
     POST /api/dial/start         { agencyId, repId, maxLines, leadQueue, toggles }
       → { session, livekit: { url, room, token } }
     POST /api/dial/dial-next/:id
       → { dialed, attempts? } | { dialed:0, reason }
     POST /api/dial/end/:id
       → { ok: true }
*/

(function () {
  const { useState, useEffect, useRef, useCallback } = React;

  // ---- defaults ---------------------------------------------------------
  const DEFAULT_TOGGLES = {
    record:       true,
    sms_pre:      false,
    sms_post:     true,
    email:        false,
    ai_voicemail: true,
    ai_assistant: true,
    whisper:      true,
    sms_lane:     'sendblue_then_twilio',
  };

  const TOGGLE_DEFS = [
    { key: 'record',       label: 'Record calls',           hint: 'Two-party-state disclosure plays automatically' },
    { key: 'sms_pre',      label: 'SMS 30s before dial',    hint: 'Skipped if no consent / last_sms < 4h' },
    { key: 'sms_post',     label: 'SMS after disposition',  hint: 'Uses your outcome templates' },
    { key: 'email',        label: 'Email rep on connect',   hint: 'Quick recap to your inbox' },
    { key: 'ai_voicemail', label: 'AI voicemail drop',      hint: 'Per-lead TTS message on beep' },
    { key: 'ai_assistant', label: 'AI handles lost legs',   hint: 'Otherwise FTC safe-harbor apology + hangup' },
    { key: 'whisper',      label: 'Whisper before bridge',  hint: 'Lead name + state in your ear before connect' },
  ];

  const DISPO_LABEL = {
    connected:          'Bridged',
    voicemail_dropped:  'Voicemail',
    abandoned_to_ai:    'AI handling',
    no_answer:          'No answer',
    busy:               'Busy',
    dnc_blocked:        'DNC',
    window_blocked:     'Out of hours',
    spam_blocked:       'Number flagged',
    failed:             'Failed',
    cancelled:          'Cancelled',
  };

  const DISPO_COLOR = {
    connected:          '#00d4aa',
    voicemail_dropped:  '#7c3aed',
    abandoned_to_ai:    '#f59e0b',
    no_answer:          '#666',
    busy:               '#888',
    dnc_blocked:        '#dc2626',
    window_blocked:     '#dc2626',
    spam_blocked:       '#dc2626',
    failed:             '#dc2626',
    cancelled:          '#444',
  };

  // ---- supabase realtime helpers ---------------------------------------
  function useSession(sessionId, sb) {
    const [s, setS] = useState(null);
    useEffect(() => {
      if (!sessionId || !sb) return;
      let alive = true;
      sb.from('dial_sessions').select('*').eq('id', sessionId).single()
        .then(({ data }) => { if (alive && data) setS(data); });
      const ch = sb.channel(`ds:${sessionId}`)
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'dial_sessions', filter: `id=eq.${sessionId}` },
            (p) => alive && p.new && setS(p.new))
        .subscribe();
      return () => { alive = false; sb.removeChannel(ch); };
    }, [sessionId, sb]);
    return s;
  }

  function useAttempts(sessionId, sb) {
    const [list, setList] = useState([]);
    useEffect(() => {
      if (!sessionId || !sb) return;
      let alive = true;
      sb.from('call_attempts').select('*').eq('session_id', sessionId)
        .order('fired_at', { ascending: false }).limit(50)
        .then(({ data }) => { if (alive && data) setList(data); });
      const ch = sb.channel(`ca:${sessionId}`)
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'call_attempts', filter: `session_id=eq.${sessionId}` },
            (p) => {
              if (!alive) return;
              setList((prev) => {
                const next = [...prev];
                const i = next.findIndex(a => a.id === (p.new?.id ?? p.old?.id));
                if (p.eventType === 'DELETE') { if (i >= 0) next.splice(i, 1); }
                else if (i >= 0) next[i] = p.new;
                else if (p.new) next.unshift(p.new);
                return next;
              });
            })
        .subscribe();
      return () => { alive = false; sb.removeChannel(ch); };
    }, [sessionId, sb]);
    return list;
  }

  // ---- LiveKit join (browser SDK loaded from CDN — see index.html) ------
  function useLiveKitRep(livekit) {
    const roomRef = useRef(null);
    const [state, setState] = useState('idle'); // idle | connecting | connected | failed
    useEffect(() => {
      if (!livekit?.url || !livekit?.token) return;
      const LK = window.LivekitClient;
      if (!LK) { setState('failed'); console.error('LivekitClient SDK not loaded'); return; }
      const room = new LK.Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;
      setState('connecting');
      (async () => {
        try {
          await room.connect(livekit.url, livekit.token);
          await room.localParticipant.setMicrophoneEnabled(true);
          setState('connected');
        } catch (e) {
          console.error('LiveKit connect failed', e);
          setState('failed');
        }
      })();
      return () => { room.disconnect().catch(() => {}); roomRef.current = null; };
    }, [livekit?.url, livekit?.token]);
    return { state, room: roomRef.current };
  }

  // ---- launcher --------------------------------------------------------
  function PowerDialerLauncher({ leads = [], repId, agencyId }) {
    const [open, setOpen] = useState(false);
    const [running, setRunning] = useState(null);
    const [maxLines, setMaxLines] = useState(3);
    const [toggles, setToggles] = useState(() => {
      try { return { ...DEFAULT_TOGGLES, ...(JSON.parse(localStorage.getItem('repflow_power_toggles') || '{}')) }; }
      catch { return DEFAULT_TOGGLES; }
    });

    useEffect(() => {
      try { localStorage.setItem('repflow_power_toggles', JSON.stringify(toggles)); } catch {}
    }, [toggles]);

    async function start() {
      const queue = leads.slice(0, 200).map(l => ({
        lead_id: l.id,
        phone:   String(l.phone || '').replace(/[^\d+]/g, '').replace(/^(?!\+)/, '+1'),
        state:   l.state || null,
        name:    [l.first_name, l.last_name].filter(Boolean).join(' ') || l.full_name || 'Lead',
      })).filter(l => l.phone.length >= 11);

      if (!queue.length) { window.toast?.('No dial-able leads in selection', 'warn'); return; }

      const r = await fetch('/api/dial/start', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agencyId, repId, maxLines, leadQueue: queue, toggles }),
      });
      const j = await r.json();
      if (!r.ok) { window.toast?.(j.error || 'Failed to start session', 'error'); return; }
      setRunning(j);
      setOpen(false);
    }

    return (
      <div>
        <button
          onClick={() => setOpen(true)}
          style={{
            background: 'linear-gradient(135deg,#00d4aa,#7c3aed)',
            color: '#000', fontWeight: 700, padding: '10px 18px',
            border: 0, borderRadius: 8, cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(0,212,170,0.25)',
          }}
        >⚡ Power Dial · {leads.length}</button>

        {open && (
          <div style={modalBackdropStyle} onClick={() => setOpen(false)}>
            <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Start Power Dialer Session</div>
              <div style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
                {leads.length} leads selected · first {Math.min(leads.length, 200)} will be queued
              </div>

              <label style={lblStyle}>
                Parallel lines: <strong style={{ color: '#00d4aa' }}>{maxLines}</strong>
                <input type="range" min="1" max="10" value={maxLines}
                  onChange={(e) => setMaxLines(Number(e.target.value))}
                  style={{ width: '100%', marginTop: 6 }} />
                <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
                  Start at 3. Above 5, watch your abandonment rate.
                </div>
              </label>

              <div style={{ margin: '16px 0' }}>
                {TOGGLE_DEFS.map(({ key, label, hint }) => (
                  <label key={key} style={toggleRowStyle}>
                    <input type="checkbox"
                      checked={!!toggles[key]}
                      onChange={(e) => setToggles({ ...toggles, [key]: e.target.checked })} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: '#e8e8e8', fontWeight: 500 }}>{label}</div>
                      <div style={{ fontSize: 11, color: '#666' }}>{hint}</div>
                    </div>
                  </label>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setOpen(false)} style={btnSecondaryStyle}>Cancel</button>
                <button onClick={start} style={btnPrimaryStyle}>Start Session →</button>
              </div>
            </div>
          </div>
        )}

        {running && (
          <PowerDialerSession
            sessionId={running.session.id}
            livekit={running.livekit}
            repId={repId}
            agencyId={agencyId}
            onEnd={() => setRunning(null)}
          />
        )}
      </div>
    );
  }

  // ---- session takeover ------------------------------------------------
  function PowerDialerSession({ sessionId, livekit, repId, agencyId, onEnd }) {
    // supabase-config.js sets window.SUPABASE_URL + window.SUPABASE_ANON.
    // Create our own client (RLS via the user's session JWT picked up from
    // localStorage by the supabase-js auth-storage adapter).
    const sbRef = useRef(null);
    if (!sbRef.current && window.supabase?.createClient) {
      sbRef.current = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON);
    }
    const sb = sbRef.current;

    const sess = useSession(sessionId, sb);
    const attempts = useAttempts(sessionId, sb);
    const lk = useLiveKitRep(livekit);
    const [working, setWorking] = useState(false);

    const liveAttempts = attempts
      .filter(a => !a.ended_at)
      .slice(0, sess?.max_lines || 3);

    const bridged = attempts.find(a => a.id === sess?.current_bridged_attempt_id) || null;

    const dialNext = useCallback(async () => {
      if (working) return;
      setWorking(true);
      try {
        const r = await fetch('/api/dial/dial-next', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId }) });
        const j = await r.json();
        if (j.reason && j.dialed === 0) window.toast?.(`No dial: ${j.reason}`, 'warn');
      } finally { setWorking(false); }
    }, [sessionId, working]);

    const end = useCallback(async () => {
      if (!confirm('End session now?')) return;
      await fetch('/api/dial/end', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId }) });
      onEnd?.();
    }, [sessionId, onEnd]);

    // Disposition hotkeys 1-5 when a leg is bridged
    useEffect(() => {
      if (!bridged) return;
      const handler = (e) => {
        const map = { '1': 'no_answer', '2': 'voicemail_dropped', '3': 'connected',
                      '4': 'not_interested', '5': 'callback' };
        if (map[e.key]) {
          fetch('/api/dial/disposition', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ attemptId: bridged.id, disposition: map[e.key] }),
          }).catch(() => {});
        }
      };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }, [bridged]);

    if (!sess) return <div style={loadingStyle}>Loading session…</div>;

    return (
      <div style={takeoverStyle}>
        {/* Top bar */}
        <div style={topBarStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{
              display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
              background: sess.status === 'active' ? '#00d4aa' : '#dc2626',
              boxShadow: sess.status === 'active' ? '0 0 12px #00d4aa' : 'none',
            }}/>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: '#00d4aa' }}>
              POWER DIALER · {sess.status.toUpperCase()}
            </span>
            <span style={{ fontSize: 12, color: '#666' }}>
              LiveKit: {lk.state}
            </span>
          </div>
          <button onClick={end} style={btnDangerStyle}>End session</button>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Sidebar */}
          <div style={sidebarStyle}>
            <div style={statBoxStyle}>
              <div style={statRowStyle}><span>Queue</span><strong>{sess.queue_position}/{sess.lead_queue?.length || 0}</strong></div>
              <div style={statRowStyle}><span>Dials</span><strong>{sess.stats?.dials || 0}</strong></div>
              <div style={statRowStyle}><span>Connects</span><strong style={{ color: '#00d4aa' }}>{sess.stats?.connects || 0}</strong></div>
              <div style={statRowStyle}><span>AI handled</span><strong style={{ color: '#f59e0b' }}>{sess.stats?.abandons_to_ai || 0}</strong></div>
              <div style={statRowStyle}><span>Voicemails</span><strong style={{ color: '#7c3aed' }}>{sess.stats?.voicemails || 0}</strong></div>
              <div style={statRowStyle}><span>No answer</span><strong>{sess.stats?.no_answer || 0}</strong></div>
            </div>

            <div style={{ margin: '16px 0', padding: 12, background: '#0d0d0d', borderRadius: 8, fontSize: 11, color: '#666' }}>
              Lines max: <strong style={{ color: '#e8e8e8' }}>{sess.max_lines}</strong> ·
              active: <strong style={{ color: '#e8e8e8' }}>{liveAttempts.length}</strong><br/>
              Toggles: {Object.entries(sess.toggles || {}).filter(([k, v]) => v === true).map(([k]) => k).join(', ') || 'none'}
            </div>

            <button
              onClick={dialNext}
              disabled={working || !!bridged}
              style={{ ...btnPrimaryStyle, width: '100%', marginBottom: 8, opacity: (working || !!bridged) ? 0.4 : 1 }}
            >
              {bridged ? 'Rep bridged — finish call' : working ? 'Dialing…' : '⚡ Dial next batch'}
            </button>
          </div>

          {/* Line cards */}
          <div style={lineCardsAreaStyle}>
            {Array.from({ length: sess.max_lines }).map((_, i) => {
              const a = liveAttempts[i];
              return <LineCard key={i} idx={i + 1} attempt={a} bridged={a && bridged && a.id === bridged.id} />;
            })}

            {bridged && (
              <div style={dockStyle}>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
                  Bridged to lead · {bridged.to_number} — pick disposition:
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[
                    ['1', 'No answer'], ['2', 'Voicemail'], ['3', 'Appointment'],
                    ['4', 'Not interested'], ['5', 'Callback']
                  ].map(([k, lbl]) => (
                    <div key={k} style={dispoBtnStyle}>
                      <span style={{ color: '#00d4aa', fontFamily: 'monospace' }}>{k}</span> {lbl}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  function LineCard({ idx, attempt, bridged }) {
    if (!attempt) {
      return (
        <div style={{ ...lineCardStyle, opacity: 0.3 }}>
          <div style={lineNumStyle}>{idx}</div>
          <div style={{ color: '#444', fontSize: 13 }}>idle</div>
        </div>
      );
    }
    const status = attempt.disposition || (attempt.answered_at ? attempt.amd_result || 'answered' : 'ringing');
    const color = DISPO_COLOR[attempt.disposition] || '#888';
    return (
      <div style={{ ...lineCardStyle, borderColor: bridged ? '#00d4aa' : color, boxShadow: bridged ? '0 0 16px rgba(0,212,170,0.3)' : 'none' }}>
        <div style={{ ...lineNumStyle, color }}>{idx}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#e8e8e8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {attempt.to_number}
          </div>
          <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {DISPO_LABEL[attempt.disposition] || (status === 'ringing' ? 'ringing' : status)}
          </div>
        </div>
        {bridged && (
          <span style={{
            background: '#00d4aa', color: '#000', fontSize: 10, padding: '2px 8px',
            borderRadius: 4, fontWeight: 700, letterSpacing: '0.05em',
          }}>LIVE</span>
        )}
      </div>
    );
  }

  // ---- styles ----------------------------------------------------------
  const takeoverStyle = {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: '#050505', color: '#e8e8e8',
    display: 'flex', flexDirection: 'column',
    fontFamily: 'Inter, -apple-system, sans-serif',
  };

  const topBarStyle = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 24px', borderBottom: '1px solid #1a1a1a',
    background: 'rgba(5,5,5,0.95)',
  };

  const sidebarStyle = {
    width: 280, padding: '20px 16px', borderRight: '1px solid #1a1a1a',
    overflow: 'auto', background: '#080808',
  };

  const statBoxStyle = { background: '#0d0d0d', borderRadius: 8, padding: 14, marginBottom: 12 };
  const statRowStyle = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    fontSize: 12, color: '#888', padding: '6px 0', borderBottom: '1px solid #151515',
  };

  const lineCardsAreaStyle = {
    flex: 1, padding: 24, overflow: 'auto',
    display: 'flex', flexDirection: 'column', gap: 8,
  };

  const lineCardStyle = {
    display: 'flex', alignItems: 'center', gap: 16,
    padding: '16px 20px', background: '#0d0d0d',
    borderRadius: 10, border: '1px solid #1a1a1a',
    transition: 'all 0.2s',
  };

  const lineNumStyle = {
    fontFamily: 'JetBrains Mono, monospace', fontSize: 22, fontWeight: 700,
    width: 36, textAlign: 'center', color: '#666',
  };

  const dockStyle = {
    marginTop: 'auto', padding: 16, background: '#0d0d0d',
    border: '1px solid #00d4aa', borderRadius: 10,
    boxShadow: '0 0 24px rgba(0,212,170,0.2)',
  };

  const dispoBtnStyle = {
    padding: '10px 14px', background: '#151515', borderRadius: 6,
    fontSize: 12, color: '#888', border: '1px solid #1a1a1a',
  };

  const modalBackdropStyle = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 10000,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backdropFilter: 'blur(8px)',
  };

  const modalStyle = {
    background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 12,
    padding: 24, width: 480, maxHeight: '85vh', overflow: 'auto',
    color: '#e8e8e8', fontFamily: 'Inter, -apple-system, sans-serif',
  };

  const lblStyle = { display: 'block', fontSize: 13, color: '#888', margin: '8px 0' };

  const toggleRowStyle = {
    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0',
    borderBottom: '1px solid #151515',
  };

  const btnPrimaryStyle = {
    background: '#00d4aa', color: '#000', fontWeight: 700, padding: '10px 16px',
    border: 0, borderRadius: 6, cursor: 'pointer', flex: 1,
  };
  const btnSecondaryStyle = {
    background: '#151515', color: '#e8e8e8', padding: '10px 16px',
    border: '1px solid #1a1a1a', borderRadius: 6, cursor: 'pointer',
  };
  const btnDangerStyle = {
    background: '#dc2626', color: '#fff', padding: '8px 16px', fontWeight: 600,
    border: 0, borderRadius: 6, cursor: 'pointer', fontSize: 12,
  };

  const loadingStyle = {
    position: 'fixed', inset: 0, background: '#050505', color: '#888',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
  };

  // ---- exports ----------------------------------------------------------
  window.PowerDialerLauncher = PowerDialerLauncher;
  window.PowerDialerSession  = PowerDialerSession;

  // ---- global open-from-anywhere entry point ----------------------------
  // Use from console / button / nav: window.openPowerDialer()
  // Pulls leads from window.AppData.PIPELINE by default; pass an explicit
  // array to launch from a specific selection.
  window.openPowerDialer = function (opts = {}) {
    const leads    = opts.leads    || (window.AppData?.PIPELINE || []);
    const repId    = opts.repId    || window.me?.()?.rep_id || window.me?.()?.id;
    const agencyId = opts.agencyId || window.me?.()?.agency_id;
    if (!repId || !agencyId) {
      console.warn('openPowerDialer: missing repId/agencyId from window.me()');
      window.toast?.('Power Dialer: not signed in', 'error');
      return;
    }
    let host = document.getElementById('__power_dialer_root');
    if (!host) {
      host = document.createElement('div');
      host.id = '__power_dialer_root';
      document.body.appendChild(host);
    }
    const root = ReactDOM.createRoot(host);
    root.render(<PowerDialerLauncher leads={leads} repId={repId} agencyId={agencyId} />);
  };
})();

