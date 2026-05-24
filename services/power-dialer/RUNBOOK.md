# Power Dialer — Bring-up Runbook

Step-by-step to take the parallel-dialer from "code is shipped" to
"calling real prospects." Aim: **under 30 minutes** after Twilio
funding clears.

## Pre-flight (already done)
- [x] Migration `0068_power_dialer` applied to prod
- [x] `services/power-dialer/` worker + tests committed
- [x] `services/ai-agent/` LiveKit Agent + tests committed
- [x] `page-power-dialer.jsx` + `/api/dial/*` proxies committed
- [x] `<PowerDialerLauncher/>` rendered next to Pipeline header
- [x] LiveKit 1.12.0 installed on mac mini
- [x] Twilio + SendBlue creds in `.env.local`
- [x] `/privacy` + `/terms` pages pushed to koino-storefront

## Step 1 — Twilio upgrade (Ian, 2 min, $20)

1. https://console.twilio.com
2. Top-right account menu → **Upgrade**
3. Add card, fund minimum $20 (one-time deposit, drawn down by usage)
4. After upgrade, copy **Account SID** + **Auth Token** from dashboard
   (.env.local already has them, no action needed unless they rotated)

After this, `twilio.calls.create(...)` to *any* US number works (not
just verified numbers), the trial preamble disappears, and SIP /
number-purchase / Trust Hub APIs unlock.

## Step 2 — Service role key for the worker

The worker writes via Supabase service role. Vercel has it as
"Sensitive" so `vercel env pull` returns an empty string. Two options:

- **Easiest**: Supabase dashboard → Project Settings → API → copy the
  `service_role` key → paste into `.env.local`:
  ```
  SUPABASE_SERVICE_ROLE_KEY=eyJh...
  ```
- **Or**: in Vercel dashboard, edit `SUPABASE_SERVICE_ROLE_KEY`,
  un-tick "Sensitive", save, then `vercel env pull .env.local
  --environment=production`.

## Step 3 — Public URL for the worker (mac mini)

Twilio webhooks need to reach your mac mini. Cloudflare Tunnel is the
fastest path:

```
brew install cloudflared
cloudflared tunnel --url http://localhost:9787
# Copy the printed https://*.trycloudflare.com URL
```

Append to `.env.local`:
```
POWER_DIALER_PUBLIC_URL=https://<your-tunnel>.trycloudflare.com
POWER_DIALER_SECRET=<generate-with-openssl-rand-base64-32>
```

For a more stable URL (recommended for the test group of 4–5 reps):

```
cloudflared tunnel login
cloudflared tunnel create koino-power-dialer
cloudflared tunnel route dns koino-power-dialer dialer.koino.capital
cloudflared tunnel run koino-power-dialer
```

## Step 4 — Provision Twilio SIP Trunk

```
cd services/power-dialer
node scripts/provision-sip-trunk.js
# Append the printed LIVEKIT_SIP_TRUNK_SID + LIVEKIT_SIP_DOMAIN to .env.local
```

This wires Twilio Elastic SIP Trunk → LiveKit. Calls now route through
SIP (lower per-min cost than Programmable Voice; cleaner LiveKit
integration).

## Step 5 — Buy starting numbers (10 local DIDs, ~$11.50/mo)

For Ian's agency (look up agency_id from `agencies` table):

```
# Miami area for test-group leads in FL
node scripts/warm-number-pool.js --area=305 --count=5 --agency=a073f1cc-f4b4-44e9-8471-173455391e2f

# Add a second area for diversification
node scripts/warm-number-pool.js --area=212 --count=5 --agency=a073f1cc-f4b4-44e9-8471-173455391e2f
```

Numbers start as `warming` in the `phone_numbers` table. The
spam-rotation cron promotes to `active` after 24h with ≥5 clean calls.

## Step 6 — File Business Profile / Shaken (async, ~3 days)

Fill the business env block in `.env.local`:

```
KOINO_LEGAL_NAME="Koino Capital LLC"
KOINO_EIN="XX-XXXXXXX"
KOINO_ADDRESS_LINE="..."
KOINO_CITY="Miami"
KOINO_STATE="FL"
KOINO_POSTAL="..."
KOINO_BIZ_WEBSITE="https://koino.capital"
KOINO_BIZ_EMAIL="legal@koino.capital"
KOINO_BIZ_PHONE="+1305..."
KOINO_BIZ_TYPE="Private for-profit"
KOINO_BIZ_INDUSTRY="Insurance"
```

Then:

```
node scripts/provision-business-profile.js     # files Trust Hub forms
# Twilio reviews 1–3 business days
# Once APPROVED: re-run to submit Shaken/STIR + A2P 10DLC
```

A-attestation appears on calls within 24h of approval. Until then,
calls show "Spam Likely" risk at higher volume.

## Step 7 — Launch the worker (mac mini, launchd)

```
cp services/power-dialer/launchd/com.koino.powerdialer.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.koino.powerdialer.plist
launchctl print gui/$UID/com.koino.powerdialer | grep state
tail -F ~/.koino/power-dialer.out.log
```

Smoke test:

```
curl -s https://dialer.koino.capital/healthz
# {"ok":true,"worker":"worker-xxxxx","ts":"..."}
```

## Step 8 — Launch the AI agent (mac mini, launchd)

```
cd services/ai-agent
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp launchd/com.koino.aiagent.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.koino.aiagent.plist
tail -F ~/.koino/ai-agent.err.log
```

## Step 9 — Wire Vercel env

In Vercel project `koino-insurance-os`:

```
POWER_DIALER_URL = https://dialer.koino.capital
POWER_DIALER_SECRET = <same as .env.local>
```

Redeploy (auto on next git push to main).

## Step 10 — Smoke an end-to-end call

1. Add your own cell as a "verified caller ID" temporarily (Twilio
   console → Phone Numbers → Verified Caller IDs).
2. Insert a single test lead into `pipeline` with your phone.
3. Open `https://repflow.koino.capital` → Pipeline → click ⚡ Power Dial.
4. Pick **1 line**, toggles default. Start session.
5. Watch the line card light up. Your phone rings.
6. Pick up — you should hear the rep's mic (yours, talking to itself).
7. Hit `1` (no_answer) to disposition + release.

If anything is off, the worker log (`~/.koino/power-dialer.out.log`)
plus `select * from call_attempts order by fired_at desc limit 5`
tells the full story.

## Step 11 — Scale to the test group

For each of the 4–5 paying reps:

1. Create an `agency_members` row binding their auth user to your
   agency.
2. Run `warm-number-pool.js --area=<their_city> --count=2 --agency=<agency_id>`
   so they have their own area-matched dialing numbers.
3. They open Pipeline → ⚡ Power Dial.

Hourly spam-rotation cron handles number health from there.

## Cost ceiling at 5 reps × 5 lines × 4h/day usage

- Twilio SIP minutes: ~$0.013/min outbound × ~600 min/day × 5 reps ≈ **$40/day**
- 10 local DIDs: **$11.50/mo**
- LiveKit Cloud (or self-host free): **$0**
- OpenAI Realtime (AI handler, ~5% of calls): ~$0.06/min × ~30 min/day × 5 ≈ **$9/day**
- SendBlue iMessage: per-message pricing
- Resend email: free tier covers
- **Daily total ≈ $50** at the test-group scale.

Per connect: ~$0.13 at 10:1 dial-to-connect (industry standard).

## When something breaks

| symptom | first place to look |
| --- | --- |
| Calls show "Spam Likely" | Business Profile not approved yet OR Shaken not filed (Step 6) |
| `EADDRINUSE :9787` | another koino service on that port; pmset list & adjust POWER_DIALER_PORT |
| Worker exits 2 | missing env in `.env.local`; check the boot error line |
| Twilio `21219` (number not verified) | account still trial OR your `to` is a non-US number |
| `call_attempts` rows never get AMD | `asyncAmdStatusCallback` URL not publicly reachable; check Cloudflare Tunnel is up |
| AI agent doesn't join `ai-` rooms | LiveKit dispatch rule missing — re-run provision-sip-trunk.js |
| Abandonment rate >2.5% → sessions abort | Lower `max_lines`, or set `toggles.ai_assistant=true` so losing legs go to AI not abandon |
