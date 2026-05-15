// GET /api/agent/install.ps1 — one-line installer for Windows.
//
// Usage (PowerShell):
//   iwr -useb "https://repflow.koino.capital/api/agent/install.ps1?token=XXXX" | iex
//
// What it does (Windows-native):
//   1. Verifies Python 3.10+ (suggests winget install if missing)
//   2. Creates venv at $env:USERPROFILE\.repflow\agent\venv
//   3. pip-installs runtime deps + playwright chromium
//   4. Installs Ollama for Windows if missing
//   5. Pulls qwen2.5:1.5b (always) + qwen2.5:3b on 8GB+ / qwen2.5:7b on 16GB+
//   6. Downloads runtime + scrapers from this deploy
//   7. Redeems install token → writes config.yaml (NTFS perms locked to current user)
//   8. Registers a Scheduled Task to run python -m runtime.agent at logon
//   9. Sends first heartbeat
export const config = { runtime: "edge" };

const RUNTIME_FILES = [
  "agent/quote_agent.py",
  "agent/runtime/__init__.py",
  "agent/runtime/agent.py",
  "agent/runtime/tools/__init__.py",
  "agent/runtime/tools/_stubs.py",
  "agent/runtime/tools/auto_quote.py",
  "agent/runtime/tools/twilio_dial.py",
  "agent/runtime/tools/draft_sms.py",
  "agent/runtime/tools/draft_email.py",
  "agent/runtime/tools/sendblue_send.py",
  "agent/runtime/tools/fathom_pull_notes.py",
  "agent/runtime/tools/linkedin_send.py",
  "agent/runtime/tools/linkedin_inbox_scan.py",
  "agent/runtime/tools/fb_pull_lead_forms.py",
  "agent/runtime/tools/ig_dm_reply.py",
  "agent/runtime/tools/meta_dm_send.py",
  "agent/runtime/tools/script_review.py",
  "agent/runtime/tools/file_review.py",
  "agent/runtime/tools/browser_run.py",
];
const SCRAPER_FILES = [
  "agent/scrapers/__init__.py",
  "agent/scrapers/_template.py",
  "agent/scrapers/aetna.py", "agent/scrapers/aig.py", "agent/scrapers/americanamicable.py",
  "agent/scrapers/cigna.py", "agent/scrapers/ethos.py", "agent/scrapers/fg.py",
  "agent/scrapers/foresters.py", "agent/scrapers/humana.py", "agent/scrapers/instabrain.py",
  "agent/scrapers/lumico.py", "agent/scrapers/moo.py", "agent/scrapers/sbli.py",
  "agent/scrapers/transamerica.py", "agent/scrapers/uhc.py",
];

export default async function handler(req) {
  const url = new URL(req.url);
  const token = (url.searchParams.get("token") || "").trim();
  const apiBase = `${url.protocol}//${url.host}`;

  const fileArr = RUNTIME_FILES.concat(SCRAPER_FILES).map(f => `'${f}'`).join(",\n  ");

  const script = `# Repflow Agent — Windows installer
# Generated for token ${token ? token.slice(0, 8) + "…" : "(no token)"}
# NOTE: Continue is intentional. Native pip writes to stderr even on
# success which Stop would treat as a terminating error. We check
# explicit failure conditions (token redeem, file download) directly.
$ErrorActionPreference = 'Continue'

$ApiBase = '${apiBase}'
$Token   = '${token}'
if (-not $Token) { $Token = $env:RBA_TOKEN }
if (-not $Token) {
  Write-Host "[rba] no token. open Settings -> Agents in the Repflow web app and click 'Install on a machine'."
  exit 1
}

$RbaHome = Join-Path $env:USERPROFILE '.repflow\\agent'
$VenvDir = Join-Path $RbaHome 'venv'
$Workspace = Join-Path $RbaHome 'workspace'
$Log = Join-Path $RbaHome 'install.log'

New-Item -ItemType Directory -Force -Path $RbaHome, $Workspace, (Join-Path $RbaHome 'runtime'), (Join-Path $RbaHome 'runtime\\tools'), (Join-Path $RbaHome 'scrapers') | Out-Null
Start-Transcript -Path $Log -Append | Out-Null
Write-Host "[rba] $(Get-Date -Format 'u') install begins"

# ── 1. RAM ────────────────────────────────────────────────────────────
$RamGB = [int]([math]::Floor((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB))
$Cpu   = (Get-CimInstance Win32_Processor | Select-Object -First 1).Name
Write-Host "[rba] os=windows cpu='$Cpu' ram_gb=$RamGB"

# ── 2. Python 3.10+ ───────────────────────────────────────────────────
$Py = $null
foreach ($cand in @('python3.13','python3.12','python3.11','python3.10','python3','python','py')) {
  try {
    $v = & $cand -c 'import sys; print(sys.version_info.major*100+sys.version_info.minor)' 2>$null
    if ([int]$v -ge 310) { $Py = (Get-Command $cand).Path; break }
  } catch {}
}
if (-not $Py) {
  Write-Host "[rba] python 3.10+ not found. install via 'winget install Python.Python.3.12' then re-run."
  exit 1
}
Write-Host "[rba] python: $Py"

if (-not (Test-Path $VenvDir)) {
  & $Py -m venv $VenvDir
}
$VPy = Join-Path $VenvDir 'Scripts\\python.exe'
# Use python -m pip — pip.exe in a Windows venv refuses self-upgrade.
& $VPy -m pip install --quiet --upgrade pip wheel 2>&1 | Out-Null
Write-Host "[rba] installing python deps"
& $VPy -m pip install --quiet 'requests>=2.31' 'scrapling[fetchers]>=0.4.7' playwright 2>&1 | Out-Null
& $VPy -m playwright install chromium 2>&1 | Out-Null

# ── 3. Ollama ─────────────────────────────────────────────────────────
$ollama = Get-Command ollama -ErrorAction SilentlyContinue
if (-not $ollama) {
  Write-Host "[rba] downloading Ollama for Windows"
  $ollamaInstaller = Join-Path $env:TEMP 'OllamaSetup.exe'
  Invoke-WebRequest -Uri 'https://ollama.com/download/OllamaSetup.exe' -OutFile $ollamaInstaller
  Start-Process -Wait -FilePath $ollamaInstaller -ArgumentList '/SILENT'
  $env:Path += ';' + (Join-Path $env:LOCALAPPDATA 'Programs\\Ollama')
}
if (-not (Get-Process -Name ollama -ErrorAction SilentlyContinue)) {
  Start-Process -FilePath 'ollama' -ArgumentList 'serve' -WindowStyle Hidden
  Start-Sleep -Seconds 2
}
& ollama pull qwen2.5:1.5b
$Models = @('qwen2.5:1.5b')
$Smart  = 'qwen2.5:3b'
if ($RamGB -ge 16) { $Smart = 'qwen2.5:7b' }
if ($RamGB -ge 8)  { & ollama pull $Smart; $Models += $Smart }
$ModelsJson = ($Models | ConvertTo-Json -Compress)

# ── 4. Pull runtime files ─────────────────────────────────────────────
$Files = @(
  ${fileArr}
)
Write-Host "[rba] downloading $($Files.Count) runtime files"
foreach ($rel in $Files) {
  $destRel = $rel -replace '^agent/',''
  $dest = Join-Path $RbaHome ($destRel -replace '/','\\')
  $destDir = Split-Path $dest -Parent
  if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Force -Path $destDir | Out-Null }
  try {
    Invoke-WebRequest -UseBasicParsing -Uri ("$ApiBase/api/agent/runtime-file?path=" + [uri]::EscapeDataString($destRel)) -OutFile $dest
  } catch {
    Write-Host "[rba] WARN failed to fetch $destRel"
  }
}

# ── 5. Redeem install token ───────────────────────────────────────────
Write-Host "[rba] redeeming install token"
$redeemBody = @{
  token = $Token; hostname = $env:COMPUTERNAME; os = 'windows'; cpu = $Cpu;
  ram_gb = $RamGB; version = '0.2.0'; models = $Models
} | ConvertTo-Json -Compress
$redeem = Invoke-RestMethod -Uri "$ApiBase/api/agent/redeem" -Method POST -Body $redeemBody -ContentType 'application/json'
if (-not $redeem.agent_token) {
  Write-Host "[rba] redeem failed: $($redeem | ConvertTo-Json -Compress)"
  exit 1
}

$cfg = @"
api_base: $ApiBase
device_id: $($redeem.device_id)
agency_id: $($redeem.agency_id)
role: $($redeem.role)
agent_token: $($redeem.agent_token)
default_model: qwen2.5:1.5b
smart_model: $Smart
ollama_url: http://127.0.0.1:11434
heartbeat_interval_seconds: 60
version: 0.2.0
"@
$cfgPath = Join-Path $RbaHome 'config.yaml'
[System.IO.File]::WriteAllText($cfgPath, $cfg)
# Restrict ACL to current user only — equivalent of chmod 600.
$acl = Get-Acl $cfgPath
$acl.SetAccessRuleProtection($true, $false)
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule($env:USERNAME, 'FullControl', 'Allow')
$acl.AddAccessRule($rule)
Set-Acl $cfgPath $acl

# ── 6. Scheduled Task — run agent at logon, restart on crash ──────────
$taskName = 'RepflowAgent'
$action   = New-ScheduledTaskAction -Execute $VPy -Argument '-m runtime.agent' -WorkingDirectory $RbaHome
$trigger  = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal | Out-Null
Start-ScheduledTask -TaskName $taskName

# ── 7. First heartbeat ────────────────────────────────────────────────
try {
  $hbBody = (@{ version = '0.2.0'; status = 'active' } | ConvertTo-Json -Compress)
  Invoke-RestMethod -Uri "$ApiBase/api/agent/heartbeat" -Method POST -Headers @{ 'x-agent-token' = $redeem.agent_token } -Body $hbBody -ContentType 'application/json' | Out-Null
} catch {}

Write-Host ""
Write-Host "[rba] OK install complete"
Write-Host "[rba]    device:    $($redeem.device_id)"
Write-Host "[rba]    role:      $($redeem.role)"
Write-Host "[rba]    workspace: $RbaHome"
Write-Host "[rba]    models:    $ModelsJson"
Write-Host "[rba]    task:      Scheduled Task '$taskName' (runs at logon, restarts on crash)"
Write-Host "[rba] revoke any time from Settings -> Agents in the Repflow web app."
Stop-Transcript | Out-Null
`;

  return new Response(script, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}
