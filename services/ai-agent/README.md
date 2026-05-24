# ai-agent

LiveKit Agent worker that runs in two modes per room-name dispatch:

| room prefix | handler | behavior |
| --- | --- | --- |
| `ai-<attempt_id>` | losing-leg | Apologize, confirm intent, offer Calendly. ≤90s. |
| `vm-<attempt_id>` | voicemail drop | Single TTS message after the AMD-detected beep. |

Both rooms are created by the session-worker (`services/power-dialer/`)
and the Twilio call's TwiML redirects the lead's audio into the room.
This agent joins as a publisher and either runs a realtime conversation
(losing-leg) or publishes a single TTS clip (voicemail).

Outcomes write back to `call_attempts.ai_summary` and
`call_attempts.ai_outcome` via the Supabase service role.

## Local dev (mac mini)

```bash
cd services/ai-agent
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python agent.py dev      # connects to LiveKit and waits for room dispatch
```

The agent reads `../../.env.local` automatically. Required env:
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
- `OPENAI_API_KEY` (used for STT, LLM, and TTS — realtime API)
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

## Production (mac mini, launchd)

```bash
cp launchd/com.koino.aiagent.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.koino.aiagent.plist
launchctl print gui/$UID/com.koino.aiagent | grep state
tail -F ~/.koino/ai-agent.err.log
```

## Production (Fly.io, post-revenue)

```bash
fly launch --no-deploy
fly secrets set OPENAI_API_KEY=... \
                LIVEKIT_URL=wss://... LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=... \
                NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
fly deploy
```

## Upgrade path (better STT/TTS once keys exist)

The current pipeline is OpenAI-only (single key in env). Swaps when
keys land:

- **Deepgram nova-3-phonecall** for STT — measurably better on
  conversational telephony audio than Whisper, and streams natively.
  ~$0.0043/min.
- **Anthropic Claude Haiku 4.5** for LLM — faster turn-taking and
  cheaper than gpt-4o-mini in our usage profile (~$1.25/$5 per Mtok).
- **ElevenLabs Flash** for TTS — lower latency than gpt-4o-mini-tts
  (~75ms vs ~300ms TTFB), more natural voice. ~$0.18/min.

When swapping, the only file that changes is `agent.py` — replace the
`AgentSession(...)` plugins and add `livekit-plugins-deepgram`,
`livekit-plugins-anthropic`, `livekit-plugins-elevenlabs` to
`requirements.txt`.
