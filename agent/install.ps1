# Koino Auto Quoter — Windows installer (PowerShell).
#
# Usage (PowerShell, normal user):
#   $env:KOINO_REP_ID = "marc"
#   iwr -useb https://koino-insurance-os.vercel.app/agent/install.ps1 | iex
#
# Or one-liner (sets the rep id inline):
#   $env:KOINO_REP_ID="marc"; iwr -useb https://koino-insurance-os.vercel.app/agent/install.ps1 | iex
#
# What this does:
#   1. Verifies Python 3.10+ (uses py launcher or python on PATH)
#   2. Creates a venv at %LOCALAPPDATA%\Koino\auto-quoter\venv
#   3. pip installs scrapling[fetchers] + playwright + supabase + requests
#   4. playwright install chromium
#   5. Drops quote_agent.py + scrapers\ into %LOCALAPPDATA%\Koino\auto-quoter\agent\
#   6. Creates a koino-quote.cmd CLI shim and adds it to %PATH%
#   7. Registers a Windows Scheduled Task that auto-starts the agent on login

$ErrorActionPreference = "Stop"

$InstallDir = Join-Path $env:LOCALAPPDATA "Koino\auto-quoter"
$AgentDir   = Join-Path $InstallDir "agent"
$ScrapersDir = Join-Path $AgentDir "scrapers"
$VenvDir    = Join-Path $InstallDir "venv"
$BaseUrl    = if ($env:KOINO_AGENT_BASE) { $env:KOINO_AGENT_BASE } else { "https://koino-insurance-os.vercel.app/agent" }

Write-Host "Koino Auto Quoter installer (Windows)"
Write-Host "  installing to: $InstallDir"

# ── 1. Find Python 3.10+ ────────────────────────────────────────────────────
$Py = $null
foreach ($cand in @("py -3.12", "py -3.11", "py -3.10", "python3", "python")) {
  $parts = $cand -split " "
  $exe = $parts[0]
  $args = if ($parts.Length -gt 1) { $parts[1..($parts.Length - 1)] } else { @() }
  try {
    $verRaw = & $exe @args -c "import sys; print(sys.version_info.major*100+sys.version_info.minor)" 2>$null
    if ($verRaw -as [int] -ge 310) { $Py = $cand; break }
  } catch {}
}
if (-not $Py) {
  Write-Host "[X] Python 3.10+ not found. Install from https://python.org (check 'Add to PATH') and re-run." -ForegroundColor Red
  exit 1
}
Write-Host "  python: $Py"

# ── 2. Create venv (isolated; never touches system Python) ──────────────────
New-Item -ItemType Directory -Force -Path $AgentDir, $ScrapersDir, $VenvDir | Out-Null

if (-not (Test-Path (Join-Path $VenvDir "Scripts\python.exe"))) {
  $pyParts = $Py -split " "
  $pyExe = $pyParts[0]
  $pyArgs = if ($pyParts.Length -gt 1) { $pyParts[1..($pyParts.Length - 1)] } else { @() }
  & $pyExe @pyArgs -m venv $VenvDir
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[X] venv creation failed. Try: python -m pip install --user virtualenv" -ForegroundColor Red
    exit 1
  }
}
$VenvPy = Join-Path $VenvDir "Scripts\python.exe"
Write-Host "  venv:   $VenvDir"

# ── 3. Install Python deps ──────────────────────────────────────────────────
& $VenvPy -m pip install --quiet --upgrade pip | Out-Null
& $VenvPy -m pip install --quiet --upgrade `
  "scrapling[fetchers]>=0.4.7" "playwright>=1.40" "supabase>=2.0" "requests>=2.31" | Out-Null
Write-Host "  deps:   scrapling, playwright, supabase, requests"

# ── 4. Install Chromium for Playwright ──────────────────────────────────────
& $VenvPy -m playwright install chromium | Out-Null
Write-Host "  chromium installed"

# ── 5. Download agent files ─────────────────────────────────────────────────
$Scrapers = @(
  "__init__.py", "_template.py",
  "uhc.py", "humana.py", "aetna.py", "cigna.py", "moo.py", "lumico.py",
  "aig.py", "fg.py", "transamerica.py", "ethos.py", "americanamicable.py",
  "instabrain.py", "foresters.py", "sbli.py"
)
Invoke-WebRequest -Uri "$BaseUrl/quote_agent.py" -OutFile (Join-Path $AgentDir "quote_agent.py") -UseBasicParsing
foreach ($f in $Scrapers) {
  try {
    Invoke-WebRequest -Uri "$BaseUrl/scrapers/$f" -OutFile (Join-Path $ScrapersDir $f) -UseBasicParsing
  } catch {
    Write-Host "  WARN: could not fetch scrapers/$f" -ForegroundColor Yellow
  }
}
Write-Host "  agent files + scrapers installed (14 carriers)"

# ── 6. Initial settings + creds files ───────────────────────────────────────
# Optional: redeem a one-shot install token (Settings → Agents) so the agent
# can fetch saved carrier credentials from the server vault. Without it the
# agent still runs on captured sessions + local credentials.json.
$ApiBase = if ($env:KOINO_API_BASE) { $env:KOINO_API_BASE } else { "https://os.koino.capital" }
$AgentToken = $null
if ($env:KOINO_RBA_TOKEN) {
  Write-Host "  redeeming install token against $ApiBase ..."
  try {
    $body = @{ token = $env:KOINO_RBA_TOKEN; hostname = $env:COMPUTERNAME; os = "windows"; cpu = $env:PROCESSOR_ARCHITECTURE; ram_gb = 0; version = "0.2.0"; models = @() } | ConvertTo-Json
    $redeem = Invoke-RestMethod -Uri "$ApiBase/api/agent/redeem" -Method Post -ContentType "application/json" -Body $body
    if ($redeem.agent_token) {
      $AgentToken = $redeem.agent_token
      Write-Host "  OK install token redeemed - saved-credential fetch enabled" -ForegroundColor Green
    } else {
      Write-Host "  WARN install token redeem returned no agent_token" -ForegroundColor Yellow
    }
  } catch {
    Write-Host "  WARN install token redeem failed: $_" -ForegroundColor Yellow
  }
}
$SettingsPath = Join-Path $InstallDir "settings.json"
if (-not (Test-Path $SettingsPath)) {
  $repId = if ($env:KOINO_REP_ID) { $env:KOINO_REP_ID } else { "" }
  $settings = @{ rep_id = $repId; headless = $true; agent_token = $AgentToken } | ConvertTo-Json
  $settings | Out-File -Encoding utf8 $SettingsPath
} elseif ($AgentToken) {
  # Patch the freshly redeemed token into existing settings without clobbering.
  try {
    $existing = Get-Content $SettingsPath -Raw | ConvertFrom-Json
    $existing | Add-Member -NotePropertyName agent_token -NotePropertyValue $AgentToken -Force
    $existing | ConvertTo-Json | Out-File -Encoding utf8 $SettingsPath
  } catch { }
}
$CredsPath = Join-Path $InstallDir "credentials.json"
if (-not (Test-Path $CredsPath)) { "{}" | Out-File -Encoding utf8 $CredsPath }

# ── 7. CLI shim: koino-quote.cmd ────────────────────────────────────────────
$ShimDir  = Join-Path $InstallDir "bin"
New-Item -ItemType Directory -Force -Path $ShimDir | Out-Null
$ShimPath = Join-Path $ShimDir "koino-quote.cmd"
@"
@echo off
"$VenvPy" "$AgentDir\quote_agent.py" %*
"@ | Out-File -Encoding ASCII $ShimPath

# Add the bin dir to user PATH if not present
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$ShimDir*") {
  [Environment]::SetEnvironmentVariable("Path", "$userPath;$ShimDir", "User")
  $env:Path = "$env:Path;$ShimDir"
  Write-Host "  PATH:   added $ShimDir (open a new PowerShell to pick it up)"
}

# ── 8. Scheduled Task to auto-start on login ────────────────────────────────
$TaskName = "KoinoAutoQuoter"
$action   = New-ScheduledTaskAction -Execute $VenvPy -Argument """$AgentDir\quote_agent.py"""
$trigger  = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive
try {
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
  Start-ScheduledTask -TaskName $TaskName
  Write-Host "  service: Scheduled Task '$TaskName' registered + started"
} catch {
  Write-Host "  WARN: Scheduled Task register failed ($($_.Exception.Message)). You can start the agent manually:" -ForegroundColor Yellow
  Write-Host "    & ""$VenvPy"" ""$AgentDir\quote_agent.py"""
}

Write-Host ""
Write-Host "[OK] Auto Quoter installed."
Write-Host ""
Write-Host "  agent dir:    $InstallDir"
Write-Host "  credentials:  $CredsPath  (never leaves this machine)"
Write-Host "  settings:     $SettingsPath"
Write-Host "  CLI:          koino-quote capture <carrier>   (headed login + save session)"
Write-Host "                koino-quote inspect <carrier>   (dump quote-form selectors)"
Write-Host "                koino-quote status              (list captured sessions)"
Write-Host "  logs:         $InstallDir\agent.log"
Write-Host ""
Write-Host "Next: open the Auto Quoter tab in the app, click Capture login on a carrier."
