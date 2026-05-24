# power-dialer worker

Long-lived Node service that orchestrates the parallel power-dialer.
Owns the first-human-wins race lock, fans out outbound Twilio calls,
bridges legs into LiveKit rooms (rep room or AI-handler room or
voicemail room), and persists every state transition to Supabase.

## Why it's separate from `api/`

Vercel serverless functions die at ~55s, but call orchestration is
long-lived (a session may run an hour, individual legs 30–180s).
This service runs in a persistent process — locally via launchd on
the mac mini, eventually on Fly.io for scale.

## Architecture

```
                            ┌──────────────────────────┐
   browser (rep)            │     power-dialer worker  │
   ┌──────────────────┐     │   ───────────────────    │
   │ page-power-      │     │  /session/start          │
   │   dialer.jsx     │◀───▶│  /session/:id/dial-next  │
   │                  │     │  /session/:id/end        │
   │  livekit-client  │     │                          │
   │  (joins rep room)│     │  /twiml/* (Twilio fetches)
   └──────────────────┘     │  /webhook/twilio/*       │
            ▲               └──────────────────────────┘
            │ WebRTC                  │            │
            │                         ▼            ▼
            │                    ┌────────┐  ┌──────────┐
            │                    │ Twilio │  │ Supabase │
            │                    │ Voice  │  │ (DB+RT)  │
            │                    └────────┘  └──────────┘
            ▼                         │
       ┌──────────┐                   ▼
       │ LiveKit  │◀── SIP trunk ─── lead phone (PSTN)
       │ rooms    │
       │ rep-X    │
       │ leg-A    │
       │ ai-A     │
       │ vm-A     │
       └──────────┘
            ▲
            │ (LiveKit Agents framework)
            ▼
      ┌────────────────┐
      │ ai-handler.py  │  Deepgram STT → Claude → ElevenLabs TTS
      │ (services/     │  voicemail-drop / loser-leg handler
      │  ai-agent/)    │
      └────────────────┘
```

## Endpoints

| method | path | called by | purpose |
| --- | --- | --- | --- |
| GET  | `/healthz` | uptime check | liveness |
| POST | `/session/start` | UI | mints LiveKit token, creates dial_sessions row |
| POST | `/session/:id/dial-next` | UI | fans out next batch of dials up to max_lines |
| POST | `/session/:id/end` | UI | hangs up live legs + closes session |
| POST | `/twiml/leg/:id` | Twilio (AnswerUrl) | parks lead in leg room while waiting for AMD |
| POST | `/twiml/bridge-rep/:id` | Twilio (redirect) | bridges lead into rep's session room |
| POST | `/twiml/divert-ai/:id` | Twilio (redirect) | bridges lead into AI handler room |
| POST | `/twiml/voicemail/:id` | Twilio (redirect) | bridges lead into voicemail room |
| POST | `/twiml/abandon/:id` | Twilio (redirect) | FTC safe-harbor apology |
| POST | `/webhook/twilio/status` | Twilio | call lifecycle: initiated/ringing/answered/completed |
| POST | `/webhook/twilio/amd` | Twilio | AnsweredBy=human/machine_*/fax/unknown |
| POST | `/webhook/twilio/recording` | Twilio | recording URL on completion |

## Local dev (mac mini)

```bash
cd services/power-dialer
npm install
node src/index.js     # reads ../../.env.local
```

Worker listens on `:9787` by default. For Twilio to reach the
mac mini from the public internet, expose `POWER_DIALER_PUBLIC_URL`
via Cloudflare Tunnel or ngrok:

```bash
brew install cloudflared
cloudflared tunnel --url http://localhost:9787
# copy the trycloudflare URL into .env.local as POWER_DIALER_PUBLIC_URL
```

## Production (mac mini, launchd)

```bash
cp launchd/com.koino.powerdialer.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.koino.powerdialer.plist
launchctl print gui/$UID/com.koino.powerdialer | grep state
tail -F ~/.koino/power-dialer.out.log
```

## Production (Fly.io, post-revenue)

```bash
fly launch --no-deploy            # one-time, creates app
fly secrets set NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
                TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... \
                LIVEKIT_URL=wss://... LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=...
fly deploy
```

## Compliance roadmap

The worker enforces:
- Calling-window check (8am–9pm lead-local) before every dial
- SMS opt-out as DNC proxy (`sms_optouts`)
- Two-party recording-consent disclosure (TwiML voice prompt) for
  CA/CT/FL/IL/MD/MA/MT/NV/NH/PA/WA
- Rolling 30-day abandonment hard-stop at 2.5% (via
  `dialer_abandonment_30d` view → session.status = 'aborted_compliance')
- FTC safe-harbor apology TwiML on race-loss when AI handler is disabled

**Not yet implemented** (Phase 2):
- National DNC SAN cross-reference
- State DNC lists
- Litigator-list scrubbing (Blacklist Alliance / DNC.com)
- Per-number 30-day call cap (TCPA "do not call more than X times")
