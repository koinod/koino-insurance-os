/* page-platform.jsx — Real platform infrastructure
   - Hardware page Enroll modal (mints token, shows install command, polls)
   - Agents page Deploy modal (pick template + host, writes deployment row)
   - Calling settings: Repflow Desktop helper installers, click-to-call wiring
*/

(function () {

/* ─── Hardware enrollment modal ──────────────────────────────────────── */
function EnrollHostModal({ onClose }) {
  const [stage, setStage] = React.useState("idle"); // idle | minting | ready | done | error
  const [token, setToken] = React.useState(null);
  const [cmd, setCmd]     = React.useState("");
  const [err, setErr]     = React.useState("");
  const [copied, setCopied] = React.useState(false);

  const mint = async () => {
    setStage("minting");
    try {
      const r = await fetch("/api/agents/issue-token", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ hint: "host" }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "mint failed");
      setToken(j.token); setCmd(j.install_command); setStage("ready");
    } catch (e) {
      setErr(String(e.message || e)); setStage("error");
    }
  };
  React.useEffect(() => { mint(); }, []);

  // Poll for the host appearing
  React.useEffect(() => {
    if (stage !== "ready") return;
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return;
    const id = setInterval(async () => {
      const { data } = await sb.from("agent_install_tokens").select("used_for_id").eq("token", token).maybeSingle();
      if (data?.used_for_id) { setStage("done"); clearInterval(id); window.toast && window.toast(`Host enrolled · ${data.used_for_id}`, "success"); window.hydrateFromSupabase && window.hydrateFromSupabase(); }
    }, 4000);
    return () => clearInterval(id);
  }, [stage, token]);

  const copy = () => { navigator.clipboard.writeText(cmd).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); };

  return (
    <Shared.Modal title="Enroll new host" width={620} onClose={onClose} actions={
      <>
        <button className="btn btn-ghost" onClick={onClose}>{stage === "done" ? "Close" : "Cancel"}</button>
        {stage === "ready" && <button className="btn" onClick={mint}>Re-mint token</button>}
      </>
    }>
      {stage === "minting" && <div style={{ padding: 20, color: "var(--text-tertiary)" }}>Minting one-time enrollment token...</div>}
      {stage === "error" && <div style={{ padding: 14, color: "var(--state-danger)", fontSize: 12.5 }}>Couldn't mint token: {err}</div>}
      {stage === "ready" && (
        <>
          <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginBottom: 10, lineHeight: 1.55 }}>
            Paste this into a terminal on the Mac mini, VPS, or any Linux/macOS host.
            The script registers the box, sets up a 1-minute heartbeat cron, and the host
            will appear in the table within ~10 seconds.
          </div>
          <div style={{ position: "relative", padding: 12, background: "var(--bg-base)", border: "1px solid var(--border-subtle)", borderRadius: 6, fontFamily: "var(--font-mono)", fontSize: 11.5, lineHeight: 1.5, wordBreak: "break-all", color: "var(--accent-money)" }}>
            {cmd}
            <button className="btn btn-ghost" onClick={copy} style={{ position: "absolute", top: 8, right: 8, fontSize: 11 }}>
              <Icons.Copy size={11}/> {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div style={{ marginTop: 12, padding: 10, background: "var(--bg-raised)", borderRadius: 6, fontSize: 11.5, color: "var(--text-tertiary)" }}>
            Token expires in <strong>24h</strong> · single-use · waiting for callback...
            <span style={{ display: "inline-flex", gap: 3, marginLeft: 8 }}>
              <span className="ai-dot"></span><span className="ai-dot"></span><span className="ai-dot"></span>
            </span>
          </div>
          <div className="divider"></div>
          <div className="field-l">What this script does</div>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.7 }}>
            <li>POSTs the token to the <span className="mono">enroll_host</span> RPC (security-definer)</li>
            <li>Receives a <span className="mono">host_id</span>, writes <span className="mono">~/.repflow/config</span></li>
            <li>Installs a <span className="mono">heartbeat.sh</span> + cron entry (every 60s)</li>
            <li>First heartbeat fires; host shows up in your Hardware page</li>
          </ul>
        </>
      )}
      {stage === "done" && (
        <div style={{ padding: 24, textAlign: "center" }}>
          <div style={{ display: "inline-flex", padding: 12, background: "color-mix(in oklch, var(--accent-money) 14%, transparent)", borderRadius: 999 }}>
            <Icons.Check size={20} style={{ color: "var(--accent-money)" }}/>
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, marginTop: 12 }}>Host enrolled.</div>
          <div style={{ color: "var(--text-tertiary)", fontSize: 12.5, marginTop: 6 }}>Hardware page will refresh. Now deploy an agent to it from <strong>Agents → Deploy</strong>.</div>
        </div>
      )}
    </Shared.Modal>
  );
}
window.EnrollHostModal = EnrollHostModal;

/* ─── Agent deploy modal ──────────────────────────────────────────────── */
function DeployAgentModal({ onClose, presetAgent }) {
  const { AGENTS, HARDWARE } = AppData;
  const [agentId, setAgentId] = React.useState(presetAgent || (AGENTS[0] && AGENTS[0].id));
  const [hostId, setHostId]   = React.useState(HARDWARE[0] && HARDWARE[0].id);
  const [stage, setStage]      = React.useState("config"); // config | deploying | live | error
  const [err, setErr]           = React.useState("");

  const deploy = async () => {
    setStage("deploying");
    try {
      const sb = window.getSupabase && window.getSupabase();
      if (sb) {
        const { error } = await sb.from("agent_deployments").insert({
          agent_id: agentId,
          host_id: hostId,
          status: "live",
          manifest: { version: "1.0", template: agentId, started_at: new Date().toISOString() },
          last_heartbeat: new Date().toISOString(),
        });
        if (error) throw error;
      }
      // Optimistic local update
      const a = AGENTS.find(x => x.id === agentId);
      if (a) a.host = HARDWARE.find(h => h.id === hostId)?.name || hostId;
      window.toast && window.toast(`Deployed ${a?.name || agentId} to ${HARDWARE.find(h => h.id === hostId)?.name}`, "success");
      setStage("live");
      setTimeout(onClose, 800);
    } catch (e) {
      setErr(String(e.message || e)); setStage("error");
    }
  };

  const a = AGENTS.find(x => x.id === agentId);
  const h = HARDWARE.find(x => x.id === hostId);

  return (
    <Shared.Modal title="Deploy agent" width={560} onClose={onClose} actions={
      <>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={deploy} disabled={stage === "deploying" || !agentId || !hostId}><Icons.Play size={11}/> {stage === "deploying" ? "Deploying..." : "Deploy"}</button>
      </>
    }>
      <Shared.Field label="Agent template">
        <Shared.Select value={agentId} onChange={setAgentId} options={AGENTS.map(a => ({ v: a.id, l: a.name }))}/>
      </Shared.Field>
      {a && <div style={{ padding: 10, background: "var(--bg-raised)", borderRadius: 6, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.55 }}>{a.desc}</div>}
      <Shared.Field label="Target host">
        <Shared.Select value={hostId} onChange={setHostId} options={HARDWARE.map(h => ({ v: h.id, l: `${h.name} · ${h.kind} · ${h.status}` }))}/>
      </Shared.Field>
      {h && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 11.5 }}>
          <div><span style={{ color: "var(--text-tertiary)" }}>Uptime:</span> {h.uptime || h.uptime_text || "—"}</div>
          <div><span style={{ color: "var(--text-tertiary)" }}>Load:</span> {h.load ?? h.load_pct}%</div>
          <div><span style={{ color: "var(--text-tertiary)" }}>Agents running:</span> {h.agents ?? h.agent_count ?? 0}</div>
          <div><span style={{ color: "var(--text-tertiary)" }}>Status:</span> <span className={`chip ${h.status === "ok" ? "chip-money" : "chip-status"}`}>{h.status}</span></div>
        </div>
      )}
      <div style={{ padding: 10, background: "color-mix(in oklch, var(--accent-money) 5%, transparent)", border: "1px solid color-mix(in oklch, var(--accent-money) 25%, transparent)", borderRadius: 6, fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
        On Deploy, an <span className="mono">agent_deployments</span> row is written. The host's
        runtime polls this table and pulls the manifest within ~30s. You'll see <span className="chip chip-money" style={{ fontSize: 9 }}>live</span> in the Agents table.
      </div>
      {stage === "error" && <div style={{ color: "var(--state-danger)", fontSize: 12, padding: 8 }}>Deploy failed: {err}</div>}
    </Shared.Modal>
  );
}
window.DeployAgentModal = DeployAgentModal;

/* ─── Click-to-call: Twilio softphone first → repflow:// scheme → tel: ───
   FIX: removed circular `repflowCall → repflowDial → repflowCall` recursion.
   - `__repflowSystemDial` is the OS-level cascade (desktop helper → tel:),
     never loops back into Twilio.
   - `repflowCall` is the public entrypoint and does the cascade itself:
     Twilio softphone (if `repflowDialTwilio` ready) → system dial.
   - `repflowDial` is preserved as an alias for backwards-compat with old
     callsites; it just forwards to `repflowCall`. */
const _origRepflowCall = function (phone, leadName) {
  if (!phone) {
    window.toast && window.toast("No phone on file", "error");
    return false;
  }
  const cleaned = String(phone).replace(/[^\d+]/g, "");
  const ts = Date.now();
  const repflowUrl = `repflow://call?to=${encodeURIComponent(cleaned)}&lead=${encodeURIComponent(leadName || "")}&ts=${ts}`;
  const telUrl = `tel:${cleaned}`;

  // Try the custom scheme. If no handler is installed, the browser does nothing
  // (no error), so we set a fallback timer that fires tel: after 600ms.
  const start = Date.now();
  const fallback = setTimeout(() => {
    if (Date.now() - start < 1500) {
      window.location.href = telUrl;
      window.toast && window.toast("Repflow Desktop not installed — opened system dialer instead. Install from Settings → Calling.", "info");
    }
  }, 600);

  window.location.href = repflowUrl;
  // Cancel the fallback if the page becomes hidden (handler took over)
  const onHide = () => { clearTimeout(fallback); document.removeEventListener("visibilitychange", onHide); };
  document.addEventListener("visibilitychange", onHide);
  window.toast && window.toast(`Calling ${leadName || cleaned}`, "info");
  return true;
};
window.__repflowSystemDial = _origRepflowCall;

// Public dial entrypoint — cascade in priority order:
//   1. REST bridge via /api/dial/outbound (connector_vault Twilio, bridge to rep phone)
//      Gate: "twilio_not_connected" → explicit toast + hard stop (never silent no-op)
//   2. In-browser Twilio Voice SDK softphone (env-var Twilio, page-tenant.jsx)
//   3. repflow:// custom URL scheme (Repflow Desktop helper)
//   4. tel: system dialer (last resort)
//
// Accepts opts.lead_id for REST bridge → call_events linkage.
// Accepts opts.autodial to carry autodial context through incall:open.
window.repflowCall = async function (phone, leadName, opts) {
  if (phone) {
    try {
      const resp = await fetch("/api/dial/outbound", {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          phone,
          lead_name: leadName || "",
          lead_id:   (opts && opts.lead_id)   || null,
          rep_phone: (opts && opts.rep_phone)  || null,
        }),
      });
      const j = await resp.json().catch(() => ({}));

      if (j.gate) {
        // Explicit prerequisite gate — name the gap, hard stop, never fall through.
        window.toast && window.toast(j.message || "Twilio not connected", "error");
        return false;
      }
      if (j.ok && j.call_sid) {
        window.dispatchEvent(new CustomEvent("incall:open", { detail: {
          lead:     { id: (opts && opts.lead_id) || null, lead: leadName || phone, phone },
          callSid:  j.call_sid,
          status:   "Ringing",
          autodial: !!(opts && opts.autodial),
        }}));
        return true;
      }
      if (!resp.ok) {
        window.toast && window.toast(j.message || `Dial error (${resp.status})`, "error");
        return false;
      }
    } catch (_e) { /* REST bridge unreachable — fall through to softphone */ }
  }

  // Fallback 2: in-browser Twilio Voice SDK (requires TWILIO_TWIML_APP_SID env var)
  if (typeof window.repflowDialTwilio === "function") {
    try {
      const took = await window.repflowDialTwilio(phone, leadName);
      if (took) return true;
    } catch (_e) { /* fall through to system dial */ }
  }
  // Fallback 3: repflow:// scheme + tel:
  return _origRepflowCall(phone, leadName);
};
// Backwards-compat alias — old callsites that expected window.repflowDial keep working.
window.repflowDial = function (phone, leadName, opts) { return window.repflowCall(phone, leadName, opts); };

/* ─── Settings: Calling tab — Repflow Desktop helper install ─────────── */
/* ─── Capability probes — each hits its API endpoint; 503 means env vars
       are missing, 200 means configured, anything else surfaces as error. */
function useCapabilityStatus() {
  const [status, setStatus] = React.useState({
    voice:        { state: "checking", missing: [] },
    sms:          { state: "checking", missing: [] },
    transcription:{ state: "checking", missing: [] },
  });
  const probe = React.useCallback(async () => {
    const out = { ...status };
    // Voice: /api/twilio-token mints a JWT — 503 if Twilio creds missing.
    try {
      const r = await fetch("/api/twilio-token", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      if (r.status === 503) {
        const j = await r.json().catch(() => ({}));
        out.voice = { state: "unconfigured", missing: j.missing || ["TWILIO_ACCOUNT_SID","TWILIO_API_KEY_SID","TWILIO_API_KEY_SECRET","TWILIO_TWIML_APP_SID","TWILIO_CALLER_ID"] };
      } else if (r.ok) out.voice = { state: "ready", missing: [] };
      else out.voice = { state: "error", missing: [], code: r.status };
    } catch (e) { out.voice = { state: "error", missing: [], code: String(e) }; }

    // SMS: /api/twilio-sms with empty payload — 503 if missing creds, 400 if creds OK but body invalid.
    try {
      const r = await fetch("/api/twilio-sms", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const j = await r.json().catch(() => ({}));
      if (r.status === 503) out.sms = { state: "unconfigured", missing: j.missing || ["TWILIO_ACCOUNT_SID","TWILIO_AUTH_TOKEN","TWILIO_CALLER_ID"] };
      else if (j.error === "missing_to_or_body") out.sms = { state: "ready", missing: [] };
      else if (r.ok) out.sms = { state: "ready", missing: [] };
      else out.sms = { state: "error", missing: [], code: r.status };
    } catch (e) { out.sms = { state: "error", missing: [], code: String(e) }; }

    // Transcription: /api/transcribe with empty payload.
    try {
      const r = await fetch("/api/transcribe", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const j = await r.json().catch(() => ({}));
      if (r.status === 503) out.transcription = { state: "unconfigured", missing: j.missing || ["OPENAI_API_KEY"] };
      else if (j.error === "missing_audio_url") out.transcription = { state: "ready", missing: [] };
      else if (r.ok) out.transcription = { state: "ready", missing: [] };
      else out.transcription = { state: "error", missing: [], code: r.status };
    } catch (e) { out.transcription = { state: "error", missing: [], code: String(e) }; }

    setStatus(out);
    window.__twilioStatus = out.voice.state === "ready" ? "ready" : out.voice.state === "unconfigured" ? "unconfigured" : "error";
  }, []);
  React.useEffect(() => { probe(); }, [probe]);
  return [status, probe];
}

function CapabilityRow({ icon, label, sub, status, onTest, testLabel = "Test" }) {
  const Ic = icon;
  const tone = status.state === "ready" ? "var(--accent-money)" : status.state === "unconfigured" ? "var(--state-warning)" : status.state === "checking" ? "var(--text-tertiary)" : "var(--state-danger)";
  const stateLabel = status.state === "ready" ? "Configured" : status.state === "unconfigured" ? "Not configured" : status.state === "checking" ? "Checking…" : "Error";
  return (
    <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "flex-start", gap: 12 }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: tone, marginTop: 6 }}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 500 }}>
          {Ic && <Ic size={13} style={{ color: "var(--text-tertiary)" }}/>}
          {label}
          <span className="chip" style={{ marginLeft: 6, fontSize: 10, color: tone, borderColor: `color-mix(in oklch, ${tone} 35%, transparent)`, background: `color-mix(in oklch, ${tone} 10%, transparent)` }}>{stateLabel}</span>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4, lineHeight: 1.5 }}>{sub}</div>
        {status.state === "unconfigured" && status.missing && status.missing.length > 0 && (
          <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-secondary)" }}>
            Missing env: {status.missing.map(m => <span key={m} className="mono" style={{ background: "var(--bg-raised)", padding: "1px 5px", borderRadius: 3, marginRight: 4 }}>{m}</span>)}
          </div>
        )}
      </div>
      {onTest && status.state === "ready" && (
        <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={onTest}>{testLabel}</button>
      )}
    </div>
  );
}

function TwilioStatusPanel({ onConfigure }) {
  const [status, reprobe] = useCapabilityStatus();
  const allReady = status.voice.state === "ready" && status.sms.state === "ready";
  const allMissing = status.voice.state === "unconfigured" && status.sms.state === "unconfigured" && status.transcription.state === "unconfigured";

  const testCall = async () => {
    if (!window.repflowDialTwilio) { window.toast && window.toast("Twilio SDK not loaded yet — refresh the page", "warn"); return; }
    const took = await window.repflowDialTwilio("+15125550100", "Test call");
    window.toast && window.toast(took ? "Test dial fired via Twilio" : "Test failed — check creds", took ? "success" : "error");
  };
  const testSms = async () => {
    const to = prompt("Test SMS — your phone number (E.164 format, e.g. +15125551234):");
    if (!to) return;
    const r = await fetch("/api/twilio-sms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ to, body: "Repflow test SMS · ignore" }) });
    const j = await r.json();
    window.toast && window.toast(r.ok ? `Sent · ${j.status}` : `Failed · ${j.twilio_message || j.error}`, r.ok ? "success" : "error");
  };

  return (
    <div className="panel" style={{ marginBottom: 14 }}>
      <div className="panel-h">
        <Icons.Phone size={13} style={{ color: allReady ? "var(--accent-money)" : "var(--text-tertiary)" }}/>
        <h3>Twilio · in-browser softphone</h3>
        <span className="meta">{allReady ? "all systems go" : allMissing ? "needs setup" : "partial"}</span>
        <button className="btn btn-ghost" style={{ marginLeft: "auto", fontSize: 11 }} onClick={reprobe} title="Re-check capability status"><Icons.Sparkles size={11}/> Re-probe</button>
      </div>

      {allMissing && (
        <div style={{ padding: "12px 14px", background: "color-mix(in oklch, var(--state-warning) 10%, transparent)", borderBottom: "1px solid var(--border-subtle)", fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.55 }}>
          <strong style={{ color: "var(--state-warning)" }}>Twilio isn't configured.</strong> Reps' dial buttons fall through to the system phone app, and live call transcription only captures the rep's mic (not the lead). Click <strong>Configure Twilio</strong> below to add creds.
        </div>
      )}

      <CapabilityRow
        icon={Icons.Phone} label="Voice (outbound dial + softphone)"
        sub="Lets reps dial inside the browser tab via WebRTC. Required for live transcription to capture the lead's audio."
        status={status.voice} onTest={testCall} testLabel="Test dial"
      />
      <CapabilityRow
        icon={Icons.MessageSquare} label="SMS (outbound text)"
        sub="Programmable Messaging. Required for follow-up nudges, SOA reminders, and missed-you texts from the floor."
        status={status.sms} onTest={testSms} testLabel="Send test"
      />
      <CapabilityRow
        icon={Icons.FileText} label="Transcription (Whisper)"
        sub="Whisper transcribes recordings + live mic chunks. Independent of Twilio — uses OpenAI directly."
        status={status.transcription}
      />

      <div style={{ padding: "12px 14px", display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
        <button className="btn" onClick={() => window.open("https://vercel.com/dashboard", "_blank")}>
          <Icons.ArrowUpRight size={11}/> Vercel env vars
        </button>
        <button className="btn btn-primary" onClick={onConfigure}>
          <Icons.Settings size={11}/> Configure Twilio
        </button>
      </div>
    </div>
  );
}

function CallingSetup() {
  const [twilioOpen, setTwilioOpen] = React.useState(false);
  const [os, setOs] = React.useState(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("mac"))      return "mac";
    if (ua.includes("win"))      return "win";
    return "linux";
  });

  const macScript = `# Repflow Desktop click-to-call helper · macOS
# Registers the repflow:// URL scheme and AUTO-DIALS via FaceTime over Continuity.
# Requires: FaceTime app open + iPhone signed into the same Apple ID + "Calls
# from iPhone" enabled in iPhone Settings → Phone → Calls on Other Devices.
mkdir -p ~/Applications/Repflow.app/Contents/{MacOS,Resources}
cat > ~/Applications/Repflow.app/Contents/Info.plist <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>com.repflow.helper</string>
  <key>CFBundleName</key><string>Repflow</string>
  <key>CFBundleExecutable</key><string>repflow</string>
  <key>CFBundleURLTypes</key><array><dict>
    <key>CFBundleURLSchemes</key><array><string>repflow</string></array>
  </dict></array>
</dict></plist>
EOF
cat > ~/Applications/Repflow.app/Contents/MacOS/repflow <<'EOF'
#!/usr/bin/env bash
# Receives repflow://call?to=...&lead=...
PHONE=$(echo "$1" | sed -n 's/.*to=\\([^&]*\\).*/\\1/p' | sed 's/%2B/+/g')
LEAD=$(echo "$1" | sed -n 's/.*lead=\\([^&]*\\).*/\\1/p' | sed 's/%20/ /g')
osascript -e "display notification \\"Calling $LEAD ($PHONE)\\" with title \\"Repflow\\""
# AUTO-DIAL via FaceTime — Continuity hands the call to your paired iPhone.
# tel: URL alone DOES auto-dial here (FaceTime intercepts), no Press-Call required.
open -a FaceTime "tel://$PHONE"
EOF
chmod +x ~/Applications/Repflow.app/Contents/MacOS/repflow
# Register with Launch Services
/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister -f ~/Applications/Repflow.app
echo "Repflow helper installed. Click-to-call buttons auto-dial via FaceTime + Continuity."`;

  const winScript = `# Repflow Desktop click-to-call helper · Windows (PowerShell, run as admin)
# Registers repflow:// URL scheme + auto-clicks the Call button in Phone Link.
# Phone Link doesn't expose an API — this uses Windows UI Automation to find
# and click the call button after the number is entered. Requires:
#   1. Phone Link installed + paired with your Android/iPhone
#   2. PowerShell ExecutionPolicy: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
$dir = "$env:LOCALAPPDATA\\Repflow"
New-Item -ItemType Directory -Force -Path $dir | Out-Null

# Helper: dial.ps1 — opens tel: then drives Phone Link's Call button via UI Automation
@'
param([string]\$Phone)
Start-Process "tel:\$Phone"
Start-Sleep -Milliseconds 1500   # give Phone Link a moment to focus the dialer
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
\$root = [System.Windows.Automation.AutomationElement]::RootElement
\$cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, "Phone Link")
\$pl = \$root.FindFirst([System.Windows.Automation.TreeScope]::Children, \$cond)
if (\$pl) {
  \$btnCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, "Call")
  \$btn = \$pl.FindFirst([System.Windows.Automation.TreeScope]::Descendants, \$btnCond)
  if (\$btn) {
    \$inv = \$btn.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
    \$inv.Invoke()
  } else {
    Write-Host "Call button not found in Phone Link — dial number then press Call manually."
  }
} else {
  Write-Host "Phone Link window not found — open Phone Link first."
}
'@ | Out-File -Encoding UTF8 "$dir\\dial.ps1"

# Wrapper: repflow.cmd — extracts the phone from the URL and invokes dial.ps1
@'
@echo off
rem Receives repflow://call?to=...&lead=...
set ARG=%~1
for /f "tokens=2 delims==&" %%a in ("%ARG%") do set PHONE=%%a
powershell -ExecutionPolicy Bypass -File "%~dp0dial.ps1" -Phone "%PHONE%"
'@ | Out-File -Encoding ASCII "$dir\\repflow.cmd"

# Register URL scheme
New-Item -Path "HKCU:\\Software\\Classes\\repflow" -Force | Out-Null
Set-ItemProperty -Path "HKCU:\\Software\\Classes\\repflow" -Name "(Default)" -Value "URL:Repflow Protocol"
Set-ItemProperty -Path "HKCU:\\Software\\Classes\\repflow" -Name "URL Protocol" -Value ""
New-Item -Path "HKCU:\\Software\\Classes\\repflow\\shell\\open\\command" -Force | Out-Null
Set-ItemProperty -Path "HKCU:\\Software\\Classes\\repflow\\shell\\open\\command" -Name "(Default)" -Value "$dir\\repflow.cmd \`"%1\`""
Write-Host "Repflow helper installed. Auto-clicks Phone Link's Call button after dial."`;

  const linuxScript = `# Repflow Desktop click-to-call helper · Linux
mkdir -p ~/.local/bin ~/.local/share/applications
cat > ~/.local/bin/repflow <<'EOF'
#!/usr/bin/env bash
PHONE=$(echo "$1" | sed -n 's/.*to=\\([^&]*\\).*/\\1/p' | sed 's/%2B/+/g')
notify-send "Repflow" "Calling $PHONE" 2>/dev/null || true
xdg-open "tel:$PHONE"  # replace with twilio CLI or softphone of choice
EOF
chmod +x ~/.local/bin/repflow
cat > ~/.local/share/applications/repflow.desktop <<EOF
[Desktop Entry]
Name=Repflow
Exec=~/.local/bin/repflow %u
Type=Application
NoDisplay=true
MimeType=x-scheme-handler/repflow;
EOF
xdg-mime default repflow.desktop x-scheme-handler/repflow
echo "Repflow helper installed."`;

  const script = os === "mac" ? macScript : os === "win" ? winScript : linuxScript;
  const copy = () => navigator.clipboard.writeText(script).then(() => window.toast && window.toast("Copied — paste into your terminal", "success"));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Twilio first — this is the recommended path. Live transcription
          captures both sides only when calls are routed via WebRTC. */}
      <TwilioStatusPanel onConfigure={() => setTwilioOpen(true)}/>
      {twilioOpen && window.TwilioConfigModal && (() => {
        const M = window.TwilioConfigModal;
        return <M onClose={() => setTwilioOpen(false)}/>;
      })()}

      <div className="panel" style={{ padding: 16 }}>
        <h3 style={{ margin: 0 }}>Fallback · click-to-call via desktop helper</h3>
        <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          When Twilio isn't configured, Repflow's <Icons.Phone size={11} style={{ display: "inline-block", verticalAlign: "middle" }}/> buttons fall through to a
          <span className="mono" style={{ background: "var(--bg-raised)", padding: "1px 5px", borderRadius: 3 }}>repflow://call?to=...</span> URL.
          Installing the helper below makes that URL launch your existing softphone (Teams, Convoso, FaceTime). Without the helper,
          dials open the OS default dialer via <span className="mono">tel:</span>. <strong>Live transcription only captures the rep's mic in this mode</strong>{" "}— the lead's audio stays on the phone hardware.
        </div>
      </div>

      <div className="panel">
        <div className="panel-h">
          <h3>Install Repflow Desktop helper</h3>
          <div style={{ marginLeft: "auto", display: "flex", background: "var(--bg-raised)", padding: 2, borderRadius: 6 }}>
            {[["mac", "macOS"], ["win", "Windows"], ["linux", "Linux"]].map(([k, l]) => (
              <button key={k} onClick={() => setOs(k)} className="btn btn-ghost" style={{ padding: "3px 10px", background: os === k ? "var(--bg-overlay)" : "transparent", color: os === k ? "var(--text-primary)" : "var(--text-tertiary)" }}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{ padding: 14 }}>
          <div style={{ position: "relative", padding: 12, background: "var(--bg-base)", border: "1px solid var(--border-subtle)", borderRadius: 6, fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.55, color: "var(--text-secondary)", whiteSpace: "pre-wrap", maxHeight: 360, overflowY: "auto" }}>
            {script}
            <button className="btn btn-ghost" onClick={copy} style={{ position: "absolute", top: 8, right: 8, fontSize: 11 }}>
              <Icons.Copy size={11}/> Copy
            </button>
          </div>
          <div style={{ marginTop: 10, fontSize: 11.5, color: "var(--text-tertiary)", lineHeight: 1.55 }}>
            Replace the <span className="mono">tel:</span> line with your softphone — Twilio CLI, Convoso autodial, Vapi outbound,
            etc. The helper just needs to dial when it receives the URL; the rest of Repflow is unchanged.
          </div>
        </div>
      </div>

      <div className="panel" style={{ padding: 16 }}>
        <h3 style={{ margin: 0 }}>Test the wire</h3>
        <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--text-secondary)" }}>
          Click below to fire a test <span className="mono">repflow://call</span> at +15125550123. If your helper is installed
          you'll see the dialer; otherwise your OS opens its default phone app.
        </div>
        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => window.repflowCall("+15125550123", "Test Lead")}>
          <Icons.Phone size={12}/> Fire test call
        </button>
      </div>
    </div>
  );
}
window.CallingSetup = CallingSetup;

})();
