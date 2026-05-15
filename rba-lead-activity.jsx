/* rba-lead-activity.jsx — drop-in pane for any lead-detail surface.
 *
 * Pulls call_events + meeting_notes + appointments for a leadId, merges
 * into a unified time-sorted feed, renders compactly. Subscribes to
 * realtime so the rep sees new touches without refresh.
 *
 * Mounted by page-pipeline.jsx LeadDetail when window.RBALeadActivityPane
 * is defined (this file's IIFE registers it).
 */

(function () {

function RBALeadActivityPane({ leadId }) {
  const [calls, setCalls]       = React.useState([]);
  const [meetings, setMeetings] = React.useState([]);
  const [appts, setAppts]       = React.useState([]);
  const [loading, setLoading]   = React.useState(true);
  const subRef = React.useRef([]);

  React.useEffect(() => {
    if (!leadId) return;
    let cancelled = false;
    (async () => {
      const sb = window.getSupabase && window.getSupabase();
      if (!sb) { setLoading(false); return; }
      try {
        const [c, m, a] = await Promise.all([
          sb.from("call_events").select("id,call_sid,status,duration_sec,direction,from_number,to_number,created_at")
            .eq("lead_id", leadId).order("created_at", { ascending: false }).limit(20),
          sb.from("meeting_notes").select("id,provider,title,summary,recording_url,started_at,created_at")
            .eq("lead_id", leadId).order("created_at", { ascending: false }).limit(10),
          sb.from("appointments").select("id,source,title,starts_at,ends_at,status,meeting_url,attendee_name,created_at")
            .eq("lead_id", leadId).order("starts_at", { ascending: false }).limit(10),
        ]);
        if (cancelled) return;
        setCalls(c.data || []);
        setMeetings(m.data || []);
        setAppts(a.data || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    // Realtime subscriptions for each table
    const sb = window.getSupabase && window.getSupabase();
    if (sb) {
      const ch1 = sb.channel(`rba-lead-calls-${leadId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "call_events", filter: `lead_id=eq.${leadId}` },
          (msg) => setCalls(prev => [msg.new, ...prev].slice(0, 30)))
        .subscribe();
      const ch2 = sb.channel(`rba-lead-meetings-${leadId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "meeting_notes", filter: `lead_id=eq.${leadId}` },
          (msg) => setMeetings(prev => [msg.new, ...prev].slice(0, 20)))
        .subscribe();
      const ch3 = sb.channel(`rba-lead-appts-${leadId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `lead_id=eq.${leadId}` },
          (msg) => {
            setAppts(prev => {
              const next = [msg.new, ...prev.filter(a => a.id !== msg.new.id)].slice(0, 20);
              next.sort((x, y) => new Date(y.starts_at).getTime() - new Date(x.starts_at).getTime());
              return next;
            });
          })
        .subscribe();
      subRef.current = [ch1, ch2, ch3];
    }

    return () => {
      cancelled = true;
      subRef.current.forEach(c => c.unsubscribe && c.unsubscribe());
      subRef.current = [];
    };
  }, [leadId]);

  const fmtAgo = (ts) => {
    if (!ts) return "—";
    const s = (Date.now() - new Date(ts).getTime()) / 1000;
    if (s < 0) return `in ${Math.abs(Math.floor(s/60))}m`;
    if (s < 60)    return `${Math.floor(s)}s ago`;
    if (s < 3600)  return `${Math.floor(s/60)}m ago`;
    if (s < 86400) return `${Math.floor(s/3600)}h ago`;
    return `${Math.floor(s/86400)}d ago`;
  };

  // Merge into a single feed sorted by time
  const feed = [];
  for (const c of calls) feed.push({ kind: "call", at: c.created_at, row: c });
  for (const m of meetings) feed.push({ kind: "meeting", at: m.created_at, row: m });
  for (const a of appts) feed.push({ kind: "appt", at: a.starts_at, row: a });
  feed.sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());

  if (loading) {
    return (
      <>
        <div className="divider"></div>
        <div className="field-l">Live agent activity</div>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 6 }}>Loading…</div>
      </>
    );
  }
  if (feed.length === 0) {
    return (
      <>
        <div className="divider"></div>
        <div className="field-l">Live agent activity</div>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 6 }}>
          No calls, meetings, or appointments logged yet. The agent will append touches here in real time as they happen.
        </div>
      </>
    );
  }

  return (
    <>
      <div className="divider"></div>
      <div className="field-l">Live agent activity</div>
      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
        {feed.slice(0, 12).map((e, i) => {
          if (e.kind === "call") {
            const c = e.row;
            const dirChip = c.direction?.startsWith("outbound") ? "→" : "←";
            return (
              <div key={`c-${c.id}`} style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 8, fontSize: 12 }}>
                <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>{fmtAgo(e.at)}</span>
                <div>
                  <strong>Call {dirChip}</strong>
                  <span className={`chip ${c.status === "completed" && c.duration_sec > 0 ? "chip-money" : "chip-status"}`} style={{ marginLeft: 6, fontSize: 9.5 }}>
                    {c.status}{c.duration_sec > 0 ? ` · ${c.duration_sec}s` : ""}
                  </span>
                </div>
              </div>
            );
          }
          if (e.kind === "meeting") {
            const m = e.row;
            return (
              <div key={`m-${m.id}`} style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 8, fontSize: 12 }}>
                <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>{fmtAgo(e.at)}</span>
                <div>
                  <strong>Meeting · {m.provider}</strong>
                  <div style={{ color: "var(--text-tertiary)", fontSize: 11.5, marginTop: 2 }}>
                    {m.summary || m.title || "(no summary)"}
                  </div>
                  {m.recording_url && (
                    <a href={m.recording_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "var(--accent)" }}>
                      Recording ↗
                    </a>
                  )}
                </div>
              </div>
            );
          }
          if (e.kind === "appt") {
            const a = e.row;
            const future = new Date(a.starts_at).getTime() > Date.now();
            return (
              <div key={`a-${a.id}`} style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 8, fontSize: 12 }}>
                <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>{fmtAgo(e.at)}</span>
                <div>
                  <strong>Appointment {future ? "scheduled" : "past"}</strong>
                  <span className={`chip ${a.status === "scheduled" ? "chip-money" : a.status === "canceled" ? "chip-danger" : ""}`} style={{ marginLeft: 6, fontSize: 9.5 }}>
                    {a.status}
                  </span>
                  <div style={{ color: "var(--text-tertiary)", fontSize: 11.5, marginTop: 2 }}>
                    {new Date(a.starts_at).toLocaleString()}
                    {a.attendee_name ? ` · ${a.attendee_name}` : ""}
                  </div>
                  {a.meeting_url && (
                    <a href={a.meeting_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "var(--accent)" }}>
                      Join ↗
                    </a>
                  )}
                </div>
              </div>
            );
          }
          return null;
        })}
      </div>
    </>
  );
}

window.RBALeadActivityPane = RBALeadActivityPane;

})();
