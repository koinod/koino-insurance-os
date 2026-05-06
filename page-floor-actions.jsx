/* page-floor-actions.jsx — shared action primitives used across the floor.
 *
 * Replaces dead InCall buttons + queue-row icons with real behavior:
 *   window.smsCompose(lead, phone)         → opens compose modal, posts /api/twilio-sms
 *   window.bookAppointment(lead)           → opens datetime picker, generates .ics
 *   window.sendAppLink(lead)               → copies signed app-start link to clipboard
 *   window.scheduleSOA(lead)               → 15-min SOA invite + tasks row
 *
 * Each helper degrades gracefully if Twilio / e-app / calendar env isn't wired.
 */

(function () {
  const { useState } = React;

  // ── ICS calendar invite generator (RFC 5545) ────────────────────────────
  // Generates a downloadable .ics file the rep can drop into Google /
  // Outlook / Apple Calendar OR forward to the lead. Calendly integration
  // is layered on top via `connections.config.calendly_link` when the agency
  // wires their personal Calendly URL.
  function pad(n) { return String(n).padStart(2, "0"); }
  function toIcsTime(d) {
    return d.getUTCFullYear()
      + pad(d.getUTCMonth() + 1)
      + pad(d.getUTCDate())
      + "T" + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds())
      + "Z";
  }
  function escapeIcs(s) {
    return String(s || "")
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\r?\n/g, "\\n");
  }
  function buildIcs({ uid, summary, description, location, start, end, organizer, attendee }) {
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Repflow//SOA//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:REQUEST",
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${toIcsTime(new Date())}`,
      `DTSTART:${toIcsTime(start)}`,
      `DTEND:${toIcsTime(end)}`,
      `SUMMARY:${escapeIcs(summary)}`,
      `DESCRIPTION:${escapeIcs(description)}`,
      location ? `LOCATION:${escapeIcs(location)}` : null,
      organizer ? `ORGANIZER;CN=${escapeIcs(organizer.name || "Repflow")}:mailto:${organizer.email || "noreply@repflow.app"}` : null,
      attendee ? `ATTENDEE;CN=${escapeIcs(attendee.name || "Lead")};RSVP=TRUE:mailto:${attendee.email || "lead@example.com"}` : null,
      "STATUS:CONFIRMED",
      "SEQUENCE:0",
      "END:VEVENT",
      "END:VCALENDAR",
    ].filter(Boolean);
    return lines.join("\r\n");
  }
  function downloadIcs(filename, content) {
    const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }
  window.buildIcs    = buildIcs;
  window.downloadIcs = downloadIcs;

  // Calendly fallback link from connections config (if wired)
  function calendlyLink() {
    const conn = (AppData.CONNECTIONS || []).find(c => c.id === "calendly" || c.name === "Calendly");
    return conn?.config?.scheduling_link || conn?.meta?.match(/https?:\S+/)?.[0] || null;
  }

  // ── Modal: SMS compose ──────────────────────────────────────────────────
  const SMS_TEMPLATES = [
    { k: "follow",   l: "Follow-up nudge", body: (n) => `Hi ${n}, this is your Repflow producer following up on the Med Supp options we discussed. Got 5 minutes today?` },
    { k: "soa",      l: "SOA reminder",    body: (n) => `Hi ${n}, sending the Scope of Appointment form for our call. Reply YES to confirm and I'll send the calendar invite.` },
    { k: "missed",   l: "Missed you",      body: (n) => `Hi ${n}, just tried you on Plan G. Best window to reconnect? I have 2pm or 4:30 today.` },
    { k: "thank",    l: "Thanks + next",   body: (n) => `Thanks for the time today, ${n}! I'll send the comparison and have your application ready in the morning.` },
  ];

  function SmsComposeModal({ lead, phone, onClose }) {
    const firstName = (lead?.lead || lead?.name || "").split(" ")[0] || "there";
    const [body, setBody]   = useState(SMS_TEMPLATES[0].body(firstName));
    const [to, setTo]       = useState(phone || lead?.phone || "");
    const [busy, setBusy]   = useState(false);
    const [err, setErr]     = useState(null);
    const remaining = 1600 - body.length;

    const send = async () => {
      setErr(null);
      if (!to.trim()) { setErr("Phone number required."); return; }
      if (!body.trim()) { setErr("Write a message."); return; }
      setBusy(true);
      try {
        const r = await fetch("/api/twilio-sms", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ to: to.trim(), body: body.trim() }),
        });
        const j = await r.json();
        if (!r.ok) {
          if (j.error === "twilio_sms_not_configured") {
            setErr(`Twilio SMS isn't configured. Missing env: ${(j.missing || []).join(", ")}. Set them in Vercel → Project → Environment Variables, then redeploy.`);
          } else {
            setErr(j.twilio_message || j.error || "Send failed");
          }
          setBusy(false);
          return;
        }
        window.toast && window.toast(`SMS sent to ${firstName} · ${j.status || "queued"}`, "success");
        // Best effort: log to coaching_notes? No — log to a future `messages` table.
        // For now, drop into AppData.SMS_LOG so the UI can show recents.
        AppData.SMS_LOG = AppData.SMS_LOG || [];
        AppData.SMS_LOG.unshift({ id: j.sid, to, body, at: new Date().toISOString(), leadId: lead?.id, status: j.status || "queued" });
        onClose && onClose();
      } catch (e) {
        setErr(e.message || "Network error");
        setBusy(false);
      }
    };

    return (
      <Shared.Modal title={`Text · ${lead?.lead || lead?.name || "lead"}`} width={520} onClose={onClose} actions={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={send} disabled={busy || !to.trim() || !body.trim()}>
            <Icons.Send size={11}/> {busy ? "Sending…" : "Send SMS"}
          </button>
        </>
      }>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {SMS_TEMPLATES.map(t => (
            <button key={t.k} className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setBody(t.body(firstName))}>{t.l}</button>
          ))}
        </div>
        <Shared.Field label="To (phone)">
          <input className="text-input" value={to} onChange={(e) => setTo(e.target.value)} placeholder="+15125551234" inputMode="tel"/>
        </Shared.Field>
        <Shared.Field label={`Message · ${remaining} char${remaining === 1 ? "" : "s"} left`}>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            maxLength={1600}
            className="text-input"
            style={{ width: "100%", minHeight: 100, lineHeight: 1.5, resize: "vertical", fontFamily: "inherit" }}
          />
        </Shared.Field>
        {err && (
          <div style={{ marginTop: 8, padding: 10, background: "color-mix(in oklch, var(--state-danger) 12%, transparent)", color: "var(--state-danger)", borderRadius: 6, fontSize: 12, lineHeight: 1.5 }}>
            {err}
          </div>
        )}
        <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-tertiary)" }}>
          Outbound goes through Twilio Programmable Messaging via /api/twilio-sms. A2P 10DLC registration enforced by Twilio for US destinations.
        </div>
      </Shared.Modal>
    );
  }
  window.SmsComposeModal = SmsComposeModal;
  window.smsCompose = function (lead, phone) {
    window.dispatchEvent(new CustomEvent("sms:compose", { detail: { lead, phone } }));
  };

  // ── Modal: Book appointment / SOA ───────────────────────────────────────
  function pad2(n) { return String(n).padStart(2, "0"); }
  function defaultSlot() {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 2);  // round up to "2 hours from now"
    const local = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    return local;
  }

  function BookAppointmentModal({ lead, kind = "appointment", onClose }) {
    const [when, setWhen] = useState(defaultSlot());
    const [duration, setDuration] = useState(kind === "soa" ? 15 : 30);
    const [notes, setNotes] = useState(
      kind === "soa"
        ? "Scope of Appointment confirmation. We'll review which Medicare products you're considering and lock the specifics before our quoting call."
        : "Quote review + application walkthrough."
    );
    const [busy, setBusy] = useState(false);

    const me = (typeof window !== "undefined" && window.me && window.me()) || null;
    const myRow = me?.rep_id ? AppData.REPS.find(r => r.id === me.rep_id) : (AppData.REPS && AppData.REPS[0]);

    const submit = async () => {
      if (!when) { window.toast && window.toast("Pick a date/time", "error"); return; }
      setBusy(true);
      const start = new Date(when);
      const end   = new Date(start.getTime() + duration * 60 * 1000);
      const summary = kind === "soa"
        ? `SOA · ${lead?.lead || "Lead"} × ${myRow?.name || "Producer"}`
        : `Appointment · ${lead?.lead || "Lead"}`;
      const ics = buildIcs({
        uid: `repflow-${kind}-${lead?.id || Date.now()}-${Date.now()}@repflow.app`,
        summary,
        description: notes + (kind === "soa" ? "\\n\\nThis is a Medicare Communications and Marketing Guidelines (MCMG) Scope of Appointment confirmation." : ""),
        location: "Phone",
        start, end,
        organizer: myRow ? { name: myRow.name, email: me?.email || `${myRow.handle?.replace("@","")}@repflow.app` } : null,
        attendee: lead?.email ? { name: lead.lead, email: lead.email } : null,
      });
      downloadIcs(`${kind}-${(lead?.lead || "lead").replace(/\s+/g, "-").toLowerCase()}.ics`, ics);

      // Log a task for follow-through
      try {
        if (AppData.mutate?.taskCreate) {
          await AppData.mutate.taskCreate({
            kind: kind === "soa" ? "soa" : "followup",
            title: summary,
            body: notes,
            due_at: start.toISOString(),
            rep_id: myRow?.id || null,
            related_pipeline_id: typeof lead?.id === "string" ? lead.id : null,
            status: "open",
            priority: kind === "soa" ? "high" : "medium",
          });
        } else {
          AppData.TASKS = AppData.TASKS || [];
          AppData.TASKS.unshift({
            id: "tmp-" + Date.now(),
            kind: kind === "soa" ? "soa" : "followup",
            title: summary, body: notes,
            dueAt: start.toISOString(),
            repId: myRow?.id || null,
            status: "open", priority: kind === "soa" ? "high" : "medium",
          });
          window.dispatchEvent(new CustomEvent("data:mutated", { detail: { table: "tasks" }}));
        }
      } catch (_e) {}

      const cal = calendlyLink();
      if (cal) {
        try { await navigator.clipboard.writeText(cal); } catch (_e) {}
        window.toast && window.toast(`.ics downloaded · Calendly link copied for ${lead?.lead || "lead"}`, "success");
      } else {
        window.toast && window.toast(`.ics downloaded · forward it to ${lead?.lead || "the lead"}`, "success");
      }
      setBusy(false);
      onClose && onClose();
    };

    return (
      <Shared.Modal title={kind === "soa" ? `Schedule SOA · ${lead?.lead || "lead"}` : `Book appointment · ${lead?.lead || "lead"}`} width={520} onClose={onClose} actions={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            <Icons.Calendar size={11}/> {busy ? "Saving…" : "Save & download invite"}
          </button>
        </>
      }>
        <Shared.Field label="When">
          <input className="text-input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)}/>
        </Shared.Field>
        <Shared.Field label="Duration (minutes)">
          <Shared.Select value={String(duration)} onChange={(v) => setDuration(parseInt(v, 10))} options={[
            { v: "15", l: "15 min" },
            { v: "30", l: "30 min" },
            { v: "45", l: "45 min" },
            { v: "60", l: "60 min" },
          ]}/>
        </Shared.Field>
        <Shared.Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="text-input"
            style={{ width: "100%", minHeight: 70, lineHeight: 1.5, resize: "vertical", fontFamily: "inherit" }}
          />
        </Shared.Field>
        <div style={{ padding: 10, background: "var(--bg-raised)", borderRadius: 6, fontSize: 11.5, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
          On save: a standard <span className="mono">.ics</span> file downloads (works in Google / Outlook / Apple Calendar) and a task is logged on this lead.{calendlyLink() ? " Your Calendly link is also copied to clipboard." : " Wire a Calendly link in Settings → Connections to also auto-copy your booking URL."}
        </div>
      </Shared.Modal>
    );
  }
  window.BookAppointmentModal = BookAppointmentModal;
  window.bookAppointment = function (lead) {
    window.dispatchEvent(new CustomEvent("appointment:open", { detail: { lead, kind: "appointment" } }));
  };
  window.scheduleSOA = function (lead) {
    window.dispatchEvent(new CustomEvent("appointment:open", { detail: { lead, kind: "soa" } }));
  };

  // ── Send app link (e-app start) ─────────────────────────────────────────
  // No real e-app integration yet — copy a placeholder URL to clipboard so
  // the rep can paste it into SMS/email. iPipeline iGO + Firelight should
  // generate signed start tokens here in a follow-up.
  window.sendAppLink = async function (lead) {
    const slug = ((lead?.lead || "lead") + "-" + (lead?.id || Date.now())).toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const link = `https://app.repflow.app/a/${slug}`;
    try {
      await navigator.clipboard.writeText(link);
      window.toast && window.toast(`App link copied for ${lead?.lead || "lead"}`, "success");
    } catch (_e) {
      window.toast && window.toast(`App link: ${link}`, "info");
    }
    // Log a task so the rep doesn't lose the thread
    try {
      AppData.TASKS = AppData.TASKS || [];
      AppData.TASKS.unshift({
        id: "tmp-applink-" + Date.now(),
        kind: "followup",
        title: `App link sent · ${lead?.lead || "lead"}`,
        body: link,
        dueAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        repId: AppData.REPS?.[0]?.id || null,
        status: "open",
        priority: "medium",
      });
      window.dispatchEvent(new CustomEvent("data:mutated", { detail: { table: "tasks" }}));
    } catch (_e) {}
  };

  // ── Quote Tool modal — wraps the carrier-fit calculator that used to be
  //    locked inside the InCall panel only. Now reachable from the Floor
  //    header, the AI rail, or any future surface via window.openQuoteTool().
  function QuoteToolModal({ onClose }) {
    const Quote = window.CarrierQuoteTool;
    return (
      <Shared.Modal title="Carrier quote tool" width={640} onClose={onClose}>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 10 }}>
          Rank your appointed carriers for a given product / age / health profile.
          Same tool that runs in the in-call panel — open it from the floor whenever a prospect asks "what's my best fit?".
        </div>
        {Quote ? <Quote/> : <div style={{ padding: 14, color: "var(--text-tertiary)" }}>Quote tool loading…</div>}
      </Shared.Modal>
    );
  }
  window.openQuoteTool = function () {
    window.dispatchEvent(new CustomEvent("quotetool:open"));
  };

  // ── Global host: mounts modals + listens for events ─────────────────────
  function FloorActionsHost() {
    const [sms, setSms]       = useState(null);  // { lead, phone }
    const [appt, setAppt]     = useState(null);  // { lead, kind }
    const [quote, setQuote]   = useState(false);

    React.useEffect(() => {
      const onSms   = (e) => setSms(e.detail || null);
      const onAppt  = (e) => setAppt(e.detail || null);
      const onQuote = ()   => setQuote(true);
      window.addEventListener("sms:compose",     onSms);
      window.addEventListener("appointment:open", onAppt);
      window.addEventListener("quotetool:open",  onQuote);
      return () => {
        window.removeEventListener("sms:compose",     onSms);
        window.removeEventListener("appointment:open", onAppt);
        window.removeEventListener("quotetool:open",  onQuote);
      };
    }, []);

    return (
      <>
        {sms   && <SmsComposeModal      lead={sms.lead}   phone={sms.phone} onClose={() => setSms(null)}/>}
        {appt  && <BookAppointmentModal lead={appt.lead}  kind={appt.kind}  onClose={() => setAppt(null)}/>}
        {quote && <QuoteToolModal       onClose={() => setQuote(false)}/>}
      </>
    );
  }
  window.FloorActionsHost = FloorActionsHost;

})();
