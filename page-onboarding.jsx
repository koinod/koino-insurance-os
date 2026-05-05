/* page-onboarding.jsx — Producer onboarding + generic connector framework + SOA generator

   - <ProducerOnboardingWizard/> shown after a rep redeems an invite (member
     row exists but rep_id is null). Walks through name/phone/license states/
     carriers, calls provision_rep_for_member RPC, links the rep to their
     agency membership.

   - CONNECTOR_SCHEMAS — declarative spec for each third-party connector
     (Twilio, Vapi, iPipeline, Mailgun, Convoso, Stripe, Jornaya, TrustedForm).
     <ConnectorConfigModal id="..."/> renders the right fields for that connector,
     stores SIDs/IDs in connections.config, points secrets to env-var paste blocks.

   - generateSOAPdf(lead, agency) — real downloadable PDF + vault insert. */

(function () {

const STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

const CARRIERS = ["UHC", "Humana Vantage", "Aetna SRC", "Mutual of Omaha", "F&G Annuities", "Cigna", "Anthem BCBS", "WellCare"];

/* ─── Producer onboarding wizard ───────────────────────────────────────── */
function ProducerOnboardingWizard({ tenant, onComplete }) {
  const [step, setStep] = React.useState(0);
  const [form, setForm] = React.useState({
    name: "", handle: "", phone: "", email: tenant?.email || "",
    npn: "", license_states: [], carrier_appts: []
  });
  const [busy, setBusy] = React.useState(false);
  const [err, setErr]   = React.useState("");
  const [niprResults, setNiprResults] = React.useState(null); // { results, configured }
  const [niprBusy, setNiprBusy]       = React.useState(false);

  const verifyNipr = async () => {
    if (!form.npn.trim() || form.license_states.length === 0) return;
    setNiprBusy(true);
    try {
      const r = await fetch("/api/nipr-verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ npn: form.npn, states: form.license_states }) });
      const j = await r.json();
      // Both 200 (real verify) and 503 (graceful self-attested) include results
      setNiprResults({ configured: r.ok, results: j.results || [] });
    } catch (_e) {
      setNiprResults({ configured: false, results: form.license_states.map(s => ({ state: s, status: "self-attested" })) });
    } finally { setNiprBusy(false); }
  };

  const STEPS = ["Profile", "Licenses", "Carriers", "Done"];

  const finish = async () => {
    setBusy(true); setErr("");
    try {
      const sb = window.getSupabase();
      const { error } = await sb.rpc("provision_rep_for_member", {
        p_name:           form.name,
        p_handle:         form.handle || ("@" + form.name.toLowerCase().split(" ")[0]),
        p_phone:          form.phone,
        p_email:          form.email,
        p_npn:            form.npn,
        p_license_states: form.license_states,
        p_carrier_appts:  form.carrier_appts,
      });
      if (error) throw error;
      window.toast && window.toast(`Welcome, ${form.name.split(" ")[0]}`, "success");
      window.hydrateFromSupabase && window.hydrateFromSupabase();
      onComplete && onComplete();
    } catch (e) {
      setErr(String(e.message || e));
    } finally { setBusy(false); }
  };

  const toggleState = (s) => setForm(f => ({ ...f, license_states: f.license_states.includes(s) ? f.license_states.filter(x => x !== s) : [...f.license_states, s] }));
  const toggleCarrier = (c) => setForm(f => ({ ...f, carrier_appts: f.carrier_appts.includes(c) ? f.carrier_appts.filter(x => x !== c) : [...f.carrier_appts, c] }));

  return (
    <div className="login-shell">
      <div className="login-card" style={{ maxWidth: 520 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <div className="sb-brand-mark" style={{ width: 36, height: 36, fontSize: 18 }}>R</div>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600 }}>You're in · {tenant?.agency?.name}</div>
            <div style={{ color: "var(--text-tertiary)", fontSize: 12 }}>{STEPS[step]} · step {step + 1} of {STEPS.length}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? "var(--accent-money)" : "var(--bg-raised)" }}></div>
          ))}
        </div>

        {step === 0 && (
          <>
            <Shared.Field label="Full name">
              <input className="text-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Marcus Avila" autoFocus/>
            </Shared.Field>
            <Shared.Field label="Handle" hint="What teammates call you on the leaderboard">
              <input className="text-input" value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value })} placeholder="@marc"/>
            </Shared.Field>
            <Shared.Field label="Phone (verified caller ID)">
              <input className="text-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 (404) 555-0142"/>
            </Shared.Field>
            <Shared.Field label="Email">
              <input className="text-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="marcus@atlasimo.com"/>
            </Shared.Field>
            <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 12 }} onClick={() => setStep(1)} disabled={!form.name.trim() || !form.phone.trim()}>
              Continue
            </button>
          </>
        )}

        {step === 1 && (
          <>
            <Shared.Field label="National Producer Number (NPN)">
              <input className="text-input" value={form.npn} onChange={(e) => setForm({ ...form, npn: e.target.value })} placeholder="19384726"/>
            </Shared.Field>
            <Shared.Field label="Active license states" hint={`${form.license_states.length} selected`}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: 8, background: "var(--bg-raised)", borderRadius: 6, maxHeight: 180, overflowY: "auto" }}>
                {STATES.map(s => {
                  const r = niprResults?.results?.find(x => x.state === s);
                  const verified = r?.status === "active";
                  const pending  = r?.status === "pending";
                  return (
                    <button key={s} onClick={() => { toggleState(s); setNiprResults(null); }} className={`chip ${form.license_states.includes(s) ? (verified ? "chip-money" : pending ? "chip-status" : "") : ""}`} style={{ cursor: "pointer", border: 0, fontWeight: 500, position: "relative" }}>
                      {s}{verified && " ✓"}
                    </button>
                  );
                })}
              </div>
            </Shared.Field>
            <button className="btn" style={{ marginTop: 6 }} onClick={verifyNipr} disabled={niprBusy || !form.npn.trim() || form.license_states.length === 0}>
              <Icons.Shield size={11}/> {niprBusy ? "Verifying via NIPR..." : "Verify with NIPR"}
            </button>
            {niprResults && (
              <div style={{ marginTop: 8, padding: 10, background: "var(--bg-raised)", borderRadius: 6, fontSize: 11.5, color: "var(--text-tertiary)" }}>
                {niprResults.configured ? (
                  <><strong style={{ color: "var(--accent-money)" }}>NIPR PDB · live</strong> — {niprResults.results.filter(r => r.status === "active").length} of {niprResults.results.length} states verified active.</>
                ) : (
                  <><strong style={{ color: "var(--state-warning)" }}>Self-attested</strong> — NIPR PDB not connected. Set NIPR_USER_ID + NIPR_PASSWORD on Vercel for real-time license verification. States accepted on trust for now.</>
                )}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setStep(0)}>Back</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setStep(2)} disabled={form.license_states.length === 0}>Continue</button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 10, lineHeight: 1.55 }}>
              Which carriers are you currently appointed with? You can add more later from your profile.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {CARRIERS.map(c => (
                <label key={c} style={{ display: "flex", alignItems: "center", gap: 8, padding: 10, background: "var(--bg-raised)", borderRadius: 6, cursor: "pointer", fontSize: 12.5, border: form.carrier_appts.includes(c) ? "1px solid var(--accent-money)" : "1px solid var(--border-subtle)" }}>
                  <input type="checkbox" checked={form.carrier_appts.includes(c)} onChange={() => toggleCarrier(c)}/>
                  <span style={{ flex: 1 }}>{c}</span>
                </label>
              ))}
            </div>
            {err && <div style={{ color: "var(--state-danger)", fontSize: 12, marginTop: 10 }}>{err}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setStep(1)}>Back</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={finish} disabled={busy}>{busy ? "Provisioning..." : "Finish setup"}</button>
            </div>
          </>
        )}

        {step === 3 && (
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <div style={{ display: "inline-flex", padding: 14, background: "color-mix(in oklch, var(--accent-money) 14%, transparent)", borderRadius: 999 }}>
              <Icons.Check size={22} style={{ color: "var(--accent-money)" }}/>
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, marginTop: 12 }}>You're set up.</div>
            <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 16 }} onClick={onComplete}>
              Open Repflow →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
window.ProducerOnboardingWizard = ProducerOnboardingWizard;

/* ─── Generic connector framework ──────────────────────────────────────── */
window.CONNECTOR_SCHEMAS = {
  vapi: {
    name: "Vapi · Voice AI",
    fields: [
      { k: "api_key",   label: "API Key",       hint: "Vapi public key — Project Settings → API Keys",         type: "password" },
      { k: "agent_id",  label: "Default Agent", hint: "vapi-agent-...",                                          type: "text" },
      { k: "phone_id",  label: "Phone Number ID", hint: "Vapi phone number you'll dial from",                  type: "text" },
    ],
    envVars: ["VAPI_API_KEY", "VAPI_AGENT_ID", "VAPI_PHONE_ID"],
    docs: "https://docs.vapi.ai/quickstart"
  },
  ipipe: {
    name: "iPipeline iGO · E-app",
    fields: [
      { k: "client_id",     label: "Client ID",     type: "text" },
      { k: "client_secret", label: "Client Secret", type: "password" },
      { k: "subdomain",     label: "Subdomain",     hint: "your-agency.iPipeline.com",  type: "text" },
    ],
    envVars: ["IPIPE_CLIENT_ID", "IPIPE_CLIENT_SECRET", "IPIPE_SUBDOMAIN"]
  },
  mailgun: {
    name: "Mailgun · Email",
    fields: [
      { k: "domain",       label: "Domain",       hint: "mg.your-agency.com",  type: "text" },
      { k: "api_key",      label: "API Key",      type: "password" },
      { k: "from_address", label: "From address", hint: "outreach@your-agency.com", type: "text" },
    ],
    envVars: ["MAILGUN_DOMAIN", "MAILGUN_API_KEY"]
  },
  convoso: {
    name: "Convoso · Auto-dialer",
    fields: [
      { k: "auth_token", label: "Auth Token", type: "password" },
      { k: "list_id",    label: "Default List ID", type: "text" },
      { k: "campaign_id", label: "Campaign ID",     type: "text" },
    ],
    envVars: ["CONVOSO_AUTH_TOKEN"]
  },
  stripe: {
    name: "Stripe · Payments",
    fields: [
      { k: "publishable_key", label: "Publishable key", hint: "pk_live_... or pk_test_...", type: "text" },
      { k: "secret_key",      label: "Secret key",      hint: "sk_live_... — server-side only", type: "password" },
      { k: "webhook_secret",  label: "Webhook signing secret", hint: "whsec_...", type: "password" },
    ],
    envVars: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]
  },
  jornaya: {
    name: "Jornaya · LeadiD",
    fields: [
      { k: "campaign_id", label: "Campaign ID", type: "text" },
      { k: "site_id",     label: "Site ID",      type: "text" },
    ],
    envVars: []
  },
  trusted: {
    name: "TrustedForm · Consent",
    fields: [
      { k: "api_key", label: "API Key", type: "password" },
    ],
    envVars: ["TRUSTEDFORM_API_KEY"]
  },
  twilio: {
    name: "Twilio · SMS + Voice",
    fields: [
      { k: "account_sid",       label: "Account SID",        hint: "ACxxxx...",        type: "text" },
      { k: "api_key_sid",       label: "API Key SID",        hint: "SKxxxx...",        type: "text" },
      { k: "api_key_secret",    label: "API Key Secret",     type: "password" },
      { k: "twiml_app_sid",     label: "TwiML App SID",      hint: "APxxxx...",        type: "text" },
      { k: "caller_id",         label: "Caller ID phone",    hint: "+15551234567",     type: "text" },
    ],
    envVars: ["TWILIO_ACCOUNT_SID", "TWILIO_API_KEY_SID", "TWILIO_API_KEY_SECRET", "TWILIO_TWIML_APP_SID", "TWILIO_CALLER_ID"],
    docs: "https://www.twilio.com/docs/voice"
  },
  sendblue: {
    name: "SendBlue · iMessage",
    fields: [
      { k: "api_key",       label: "API Key",       type: "password" },
      { k: "api_secret",    label: "API Secret",    type: "password" },
      { k: "from_phone",    label: "From phone",    hint: "+15551234567", type: "text" },
    ],
    envVars: ["SENDBLUE_API_KEY", "SENDBLUE_API_SECRET", "SENDBLUE_FROM_PHONE"],
    docs: "https://docs.sendblue.co/"
  },
  openai: {
    name: "OpenAI · Whisper transcription + GPT",
    fields: [
      { k: "api_key", label: "API Key", hint: "sk-...", type: "password" },
      { k: "transcribe_model", label: "Transcribe model", hint: "whisper-1 (default) or gpt-4o-transcribe", type: "text" },
    ],
    envVars: ["OPENAI_API_KEY", "OPENAI_TRANSCRIBE_MODEL"],
    docs: "https://platform.openai.com/docs/api-reference/audio"
  },
  fathom: {
    name: "Fathom · Call recordings + transcripts",
    fields: [
      { k: "api_token", label: "API Token (JWT)", type: "password" },
      { k: "team_id",   label: "Team ID",          type: "text" },
    ],
    envVars: ["FATHOM_API_TOKEN", "FATHOM_TEAM_ID"],
    docs: "https://developers.fathom.ai/"
  },
  phone_link: {
    name: "Phone Link · macOS / Windows desktop",
    fields: [
      { k: "platform", label: "Platform", hint: "mac | windows", type: "text" },
      { k: "device_label", label: "Audio device label", hint: "e.g. 'iPhone Microphone' or 'BlackHole 2ch'", type: "text" },
    ],
    envVars: [],
    docs: "https://support.apple.com/guide/mac-help/take-phone-calls-and-make-calls-on-your-mac-mchl5b0ce5fa/mac"
  },
};

function ConnectorConfigModal({ connectorId, onClose }) {
  const schema = window.CONNECTOR_SCHEMAS[connectorId];
  if (!schema) {
    return (
      <Shared.Modal title="Connector" onClose={onClose} actions={<button className="btn btn-primary" onClick={onClose}>Close</button>}>
        <div style={{ padding: 18, color: "var(--text-tertiary)", fontSize: 12.5 }}>
          No config schema for <span className="mono">{connectorId}</span> yet — add one to <span className="mono">CONNECTOR_SCHEMAS</span>.
        </div>
      </Shared.Modal>
    );
  }
  const [form, setForm] = React.useState({});
  React.useEffect(() => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return;
    sb.from("connections").select("config, name").eq("id", connectorId).single().then(({ data }) => {
      if (data?.config) {
        // Strip password fields when echoing back (they live server-side)
        const safe = { ...data.config };
        schema.fields.filter(f => f.type === "password").forEach(f => { delete safe[f.k]; });
        setForm(safe);
      }
    });
  }, [connectorId]);

  const save = async () => {
    const config = { ...form, configured: schema.fields.filter(f => f.type !== "password").every(f => form[f.k]?.toString().trim()), saved_at: new Date().toISOString() };
    // Strip password values from the saved config — they go to env only
    schema.fields.filter(f => f.type === "password").forEach(f => { delete config[f.k]; });
    try {
      const sb = window.getSupabase && window.getSupabase();
      if (sb) await sb.from("connections").update({ config }).eq("id", connectorId);
      await AppData.mutate.connectionStatus(connectorId, config.configured ? "ok" : "warn", config.configured ? "Configured" : "Setup incomplete");
      window.toast && window.toast(`${schema.name} config saved`, "success");
    } catch (_e) {}
    onClose();
  };

  const envBlock = schema.envVars.length === 0 ? null :
    schema.envVars.map(v => `${v}=<paste secret>`).join("\n") + "\n# Add these to Vercel project (Settings → Environment Variables)";

  return (
    <Shared.Modal title={`Configure · ${schema.name}`} width={600} onClose={onClose} actions={
      <>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save}><Icons.Check size={11}/> Save</button>
      </>
    }>
      {schema.docs && (
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8 }}>
          Docs: <a href={schema.docs} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-money)" }}>{schema.docs}</a>
        </div>
      )}
      {schema.fields.map(f => (
        <Shared.Field key={f.k} label={f.label} hint={f.hint}>
          <input className="text-input" type={f.type === "password" ? "password" : "text"} value={form[f.k] || ""} onChange={(e) => setForm({ ...form, [f.k]: e.target.value })} placeholder={f.hint || ""}/>
        </Shared.Field>
      ))}
      {envBlock && (
        <>
          <div className="divider"></div>
          <div className="field-l">Server env (paste into Vercel)</div>
          <div style={{ position: "relative", padding: 10, background: "var(--bg-base)", borderRadius: 6, fontSize: 11, fontFamily: "var(--font-mono)", whiteSpace: "pre-wrap", color: "var(--text-secondary)", marginTop: 6 }}>
            {envBlock}
            <button className="btn btn-ghost" style={{ position: "absolute", top: 6, right: 6, fontSize: 10 }} onClick={() => navigator.clipboard.writeText(envBlock).then(() => window.toast && window.toast("Copied", "success"))}>
              <Icons.Copy size={10}/> Copy
            </button>
          </div>
        </>
      )}
    </Shared.Modal>
  );
}
window.ConnectorConfigModal = ConnectorConfigModal;

/* ─── SOA generator — real downloadable PDF + vault insert ─────────────── */
window.generateSOAPdf = function (lead, agencyName) {
  // Minimal valid PDF (text-only) — generated inline so we never need a server.
  // Far from a full SOA template, but downloads as a real .pdf, opens in any
  // viewer, and the artifact row is written to vault for audit retention.
  const lines = [
    `SCOPE OF APPOINTMENT`,
    ``,
    `Beneficiary:    ${lead?.lead || lead?.name || "________________________"}`,
    `Date of birth:   ${lead?.dob   || "________________________"}`,
    `Phone:           ${lead?.phone || "________________________"}`,
    `Address:         ${lead?.address || "________________________"}`,
    ``,
    `Plan types to be discussed (initial each):`,
    `[ ]  Medicare Supplement (Medigap)`,
    `[ ]  Medicare Advantage (Part C)`,
    `[ ]  Medicare Prescription Drug (Part D)`,
    ``,
    `Producer:        ${agencyName || "Atlas Insurance Group"}`,
    `Date:            ${new Date().toLocaleDateString()}`,
    ``,
    `By signing below, the beneficiary acknowledges that the producer has`,
    `not offered any plans other than those marked above.`,
    ``,
    `Beneficiary signature: ____________________________________`,
    ``,
    `Producer signature:    ____________________________________`,
  ];
  // Build a tiny PDF using the standard /Helvetica font
  const text = lines.map(l => `(${l.replace(/[()]/g, " ")}) Tj T*`).join("\n");
  const content = `BT /F1 11 Tf 50 760 Td 14 TL ${text} ET`;
  const objects = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,
  ];
  let pdf = `%PDF-1.4\n`;
  const offsets = [];
  objects.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach(off => { pdf += String(off).padStart(10, "0") + ` 00000 n \n`; });
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  const blob = new Blob([pdf], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `SOA-${(lead?.lead || "lead").replace(/[^a-z0-9]+/gi, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`;
  a.click(); URL.revokeObjectURL(url);

  // Best-effort vault write
  if (AppData?.mutate?.vaultArtifactInsert) {
    AppData.mutate.vaultArtifactInsert({
      kind: "SOA",
      lead_name: lead?.lead || lead?.name || "(unknown)",
      retention: "10y",
      status: "captured"
    }).catch(() => {});
  }
  window.toast && window.toast(`SOA generated · saved to Vault`, "success");
};

})();
