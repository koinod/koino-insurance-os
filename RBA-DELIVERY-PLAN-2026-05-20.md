# RBA Live-Carrier-Rates · Delivery Plan (MOO + UHC AARP + Humana)

_Scoped 2026-05-20. ~3 working days to first real binding-quality number._

## TL;DR

The Playwright daemon **already exists and works** — `agent/quote_agent.py` is a real 778-line polling agent, not a stub. The blockers to shipping "Get live carrier rates" are:

1. **`vercel.json` doesn't route `install.ps1` / `install.sh`** — Ian literally can't install the local agent today. **10-minute fix.**
2. **MOO scraper is a 29-line stub** that won't produce real premiums.
3. **Humana scraper needs a capture+inspect pass** to map the post-2025 wizard.
4. **UHC AARP scraper is the closest to working** — happy path exists, may need regex hardening after UHC's recent layout rotation.

## 1. What exists today

| File | Purpose |
|---|---|
| `agent/quote_agent.py` (lines 1–778) | Full Python Playwright daemon. Polls Supabase. Handles `request_type` in (`quote`, `capture_session`, `inspect_form`). Persistent Chromium profile, anti-detection flags. |
| `agent/install.sh` (1–205) | macOS/Linux installer — Python venv, scrapling, Playwright + Chromium, launchd/systemd, `koino-quote` CLI. |
| `agent/install.ps1` (1–40+) | Windows installer — `%LOCALAPPDATA%\Koino\auto-quoter`, Scheduled Task. **This is the one Ian needs on the Dell.** |
| `agent/scrapers/*.py` | 14 carrier modules. Shared contract: `REQUIRES_LOGIN`, `LOGIN_URL`, `LOGGED_IN_INDICATOR`, `QUOTE_URL`, `quote(profile, page, creds)`. |
| `supabase/migrations/0012_auto_quoter.sql` | `auto_quote_requests`, `auto_quote_results`, `auto_quoter_settings` tables + RLS. |
| `supabase/migrations/0013_auto_quoter_sessions.sql` | Adds `request_type`, `carrier_sessions`, `carrier_session_status` view. |
| `page-quote.jsx:242-279` | "Get live carrier rates" handler — inserts the request row. |
| `page-quote.jsx:449-469` | Realtime subscription that streams agent results back into the UI. |
| `page-auto-quoter.jsx` (full file) | Setup tab — per-carrier credential form, OS-specific install command, dispatch buttons for `capture_session` and `inspect_form`. |

Audit per `RBA-GAP-AUDIT-2026-05-18.md:97-105`: **4 of 14 scrapers are real or semi** (UHC public, Humana producer-portal mostly mapped, Aetna + Ethos semi). The other 10 are templates.

## 2. Per-carrier reality (MOO / UHC AARP / Humana)

### UHC AARP
- **Entry**: `https://www.uhc.com/medicare/shop/estimate/ms-costs.html` (public consumer quoter). Producer portal at `securev2.uhc.com/agent` is only needed for commission/NPN, not premium.
- **Auth**: **None.** Public ZIP → plan summary.
- **Quote shape**: Single-page ZIP form → results table with Plan A–N premiums.
- **Gap**: `scrapers/uhc.py:34-117` exists. UHC rotates layouts roughly twice a year; needs `inspect_form` + regex hardening.
- **Effort**: 1–2 hours. **Ship first.**

### Humana
- **Entry**: `humana.com/agent` → SSO → dashboard → "New quote" wizard.
- **Auth**: Producer email + password + MFA (SMS or auth app). 30-day cookie.
- **Quote shape**: Multi-step wizard: state/ZIP → age/gender/tobacco → plan selection.
- **Gap**: `scrapers/humana.py:27-98` assumes a single-page form (wrong). `LOGGED_IN_INDICATOR` selector is a best-guess. Needs a headed `capture_session` + `inspect_form` to map real selectors.
- **Effort**: 4–6 hours of headed work with Zay's Humana producer creds.

### Mutual of Omaha
- **Entry**: `mutualofomaha.com/agent` → "Sales Professional Access" SSO → `sales.mutualofomaha.com` (Med Supp quoter).
- **Auth**: Producer ID + password + MFA. SSO covers Med Supp + Living Promise + GIWL.
- **Quote shape**: Multi-step wizard, separate Med-Supp subdomain.
- **Gap**: `scrapers/moo.py:1-29` is a 29-line stub that regex-greps the first `$N/mo` on the page. Won't return real premiums. Needs full selector mapping.
- **Effort**: 6–8 hours with Zay's MOO producer creds.

## 3. Ian's install path (Windows Dell)

The Setup tab today shows:
```powershell
$env:KOINO_REP_ID="<rep_id>"; iwr -useb "https://koino-insurance-os.vercel.app/agent/install.ps1" | iex
```

**Day-1 checklist:**
1. **Verify install.ps1 actually serves.** `curl -I https://koino-insurance-os.vercel.app/agent/install.ps1`. **Fixed in this commit** — `vercel.json` now globs `agent/install.*` alongside `agent/*.py`.
2. PowerShell as normal user → run one-liner → installer creates `%LOCALAPPDATA%\Koino\auto-quoter\{venv,agent,credentials.json,settings.json}` + Scheduled Task.
3. **Known reliability bug** (`RBA-GAP-AUDIT-2026-05-18.md:111-113`): the Scheduled Task is "At logon only" with no restart-on-failure. 2.5-day silent outage observed. Fix already applied to the broader RBA agent at `~/.repflow/agent/`; **Auto Quoter task in `install.ps1` needs the same hardening** (TimeTrigger every 5 min + RestartOnFailure).
4. Confirm: `koino-quote status` prints "captured sessions: …" and `auto_quoter_settings.agent_last_seen` updates every 30 s (`quote_agent.py:650-659`).

## 4. Credential storage

Today's flow has a manual file-move step that's fragile. **Better path**: skip credentials entirely and use **session capture**.

- Rep clicks "Capture login session" in Setup tab → agent opens headed Chromium → rep logs in (incl. MFA) → agent saves `storage_state.json` per carrier (`quote_agent.py:281-342`).
- Subsequent quotes run headless against that cookie jar for ~30 days.
- Bypasses the localStorage → JSON-download → manual-move dance.

Default session TTL is 30 days in `quote_agent.py:73` but real MOO sessions historically last ~7 days. Watch `carrier_sessions.last_failure` for "session expired" patterns and tune `DEFAULT_SESSION_TTL_DAYS`.

## 5. Minimum shippable v1

**Demo target**: click "Get live carrier rates" in Quote tool → real Plan G monthly premium from UHC AARP appears in carrier-row badge within 30 seconds.

**Dependency chain (1–2 days):**
1. ✅ Fix `vercel.json` so `install.ps1` serves (done in this commit).
2. Run `install.ps1` on Ian's Dell. Confirm heartbeat in `auto_quoter_settings` (~15 min).
3. Set `rep_id` + `enabled_carriers: ["uhc"]` in `auto_quoter_settings` (~5 min).
4. Headed test: `koino-quote inspect uhc` → confirm UHC ZIP form selectors still match `scrapers/uhc.py:61-92`. Patch regex if needed (~1–2 hrs).
5. End-to-end: Quote tool → "Get live carrier rates" → `auto_quote_requests` row → agent picks up in 3 s → premium row in `auto_quote_results` → realtime sub renders it.

**Day 2–3 (Zay sits at keyboard with creds):** capture sessions for Humana + MOO, run `inspect_form` on each, map real selectors into `scrapers/humana.py` and `scrapers/moo.py`.

## 6. Risks

| Risk | Mitigation |
|---|---|
| Producer-portal TOS prohibits automation | Persistent Chromium profile + anti-detection flags already in `quote_agent.py:215-225`. **Don't multi-tenant a single producer login across reps** — guaranteed lockout. Each rep needs their own NPN-bound creds. |
| MFA cookie expiry varies by carrier | Watch `carrier_sessions.last_failure`; tune `DEFAULT_SESSION_TTL_DAYS`. MOO ~7 days, Humana ~30 days. |
| HTML rotation breaks selectors | `inspect_form` is the repair tool. Plan ~1–2 hrs/month/carrier of selector maintenance. |
| UHC public quoter misses producer-portal discounts (household, EFT) | v1 ships consumer numbers with "verify before binding" caveat — already present in Quote tool footnote. Producer-portal scraper is the eventual answer. |
| CAPTCHA on UHC public quoter | Switch `Fetcher` → `StealthyFetcher` in `quote_agent.py:128, 165, 184` if observed. |

## Open question for Ian/Zay

The Zay-bridge arrangement means **Zay's producer creds drive the RBA**, not Ian's. The local agent will need Zay's UHC/MOO/Humana SSO sessions captured. Two options:

1. **Run the agent on Zay's machine.** Single source of truth. Ian's quote requests bubble up via Supabase to Zay's local daemon. Simplest, but requires Zay to keep his laptop running.
2. **Run the agent on Ian's Dell with Zay's captured sessions.** Faster, less dependency on Zay's machine uptime, but Zay must physically log in at Ian's machine during the capture flow.

Option 2 is the cleaner production answer once Ian has his own appointments. **Recommend option 1 for the first 2 weeks** while we validate the flow.
