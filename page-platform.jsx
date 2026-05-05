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
      const { data } = await sb.from("agent_install_tokens").select("used_for_id").eq("token", token).single();
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

// Public dial entrypoint: Twilio in-browser softphone if connector configured,
// otherwise fall through to repflow:// (desktop helper) → tel: (system dialer).
// page-tenant.jsx exposes `window.repflowDialTwilio(phone, leadName)` returning
// a boolean — true means Twilio took the call and we shouldn't fall through.
window.repflowCall = async function (phone, leadName) {
  if (typeof window.repflowDialTwilio === "function") {
    try {
      const took = await window.repflowDialTwilio(phone, leadName);
      if (took) return true;
    } catch (_e) { /* fall through to system dial */ }
  }
  return _origRepflowCall(phone, leadName);
};
// Backwards-compat alias — old callsites that expected window.repflowDial keep working.
window.repflowDial = function (phone, leadName) { return window.repflowCall(phone, leadName); };

/* ─── Settings: Calling tab — Repflow Desktop helper install ─────────── */
function CallingSetup() {
  const [os, setOs] = React.useState(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("mac"))      return "mac";
    if (ua.includes("win"))      return "win";
    return "linux";
  });

  const macScript = `# Repflow Desktop click-to-call helper · macOS
# Saves a tiny .app that registers the repflow:// URL scheme and dials via
# the system default phone app (FaceTime / Twilio CLI / Convoso CLI).
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
open "tel://$PHONE"  # fallback to system dialer; replace with twilio CLI or your softphone
EOF
chmod +x ~/Applications/Repflow.app/Contents/MacOS/repflow
# Register with Launch Services
/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister -f ~/Applications/Repflow.app
echo "Repflow helper installed. Click-to-call buttons now route here."`;

  const winScript = `# Repflow Desktop click-to-call helper · Windows (PowerShell, run as admin)
$dir = "$env:LOCALAPPDATA\\Repflow"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
@'
@echo off
rem Receives repflow://call?to=...&lead=...
set ARG=%~1
for /f "tokens=2 delims==&" %%a in ("%ARG%") do set PHONE=%%a
start tel:%PHONE%
'@ | Out-File -Encoding ASCII "$dir\\repflow.cmd"
# Register URL scheme
New-Item -Path "HKCU:\\Software\\Classes\\repflow" -Force | Out-Null
Set-ItemProperty -Path "HKCU:\\Software\\Classes\\repflow" -Name "(Default)" -Value "URL:Repflow Protocol"
Set-ItemProperty -Path "HKCU:\\Software\\Classes\\repflow" -Name "URL Protocol" -Value ""
New-Item -Path "HKCU:\\Software\\Classes\\repflow\\shell\\open\\command" -Force | Out-Null
Set-ItemProperty -Path "HKCU:\\Software\\Classes\\repflow\\shell\\open\\command" -Name "(Default)" -Value "$dir\\repflow.cmd \`"%1\`""
Write-Host "Repflow helper installed."`;

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
      <div className="panel" style={{ padding: 16 }}>
        <h3 style={{ margin: 0 }}>How click-to-call works</h3>
        <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          Every <Icons.Phone size={11} style={{ display: "inline-block", verticalAlign: "middle" }}/> button in Repflow fires a
          <span className="mono" style={{ background: "var(--bg-raised)", padding: "1px 5px", borderRadius: 3 }}>repflow://call?to=...</span> URL.
          Install the helper below and that URL launches your softphone instantly — like a Teams click-to-dial, but yours.
          If the helper isn't installed, Repflow falls back to <span className="mono">tel:</span> (your OS default dialer).
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
