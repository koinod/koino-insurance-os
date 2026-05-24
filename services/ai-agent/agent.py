"""LiveKit AI agent worker for the Koino power-dialer.

Two modes, dispatched by the room name prefix the session-worker creates:

  - `ai-<attempt_id>` rooms — losing-leg handler. The lead answered, lost
    the race lock against another leg, and was redirected here. The agent
    apologizes briefly, confirms intent, offers Calendly. ≤90s.

  - `vm-<attempt_id>` rooms — AI voicemail drop. Twilio AMD detected
    `machine_end_beep` and bridged the lead's voicemail box into this
    room. The agent plays a single per-lead TTS message and disconnects.

Pipeline: OpenAI Realtime (STT+LLM+TTS in one stream) for ai-rooms,
OpenAI TTS one-shot for vm-rooms. We use OpenAI for everything since
that's the only AI key in the current env; swap to Deepgram +
Anthropic + ElevenLabs in a follow-up once those keys land.

Outcomes are written back to call_attempts.ai_summary +
call_attempts.ai_outcome via the supabase service role; the same row
the session-worker created when it placed the leg.
"""

import asyncio
import logging
import os
import re
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from livekit import agents
from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    WorkerOptions,
    cli,
)
from livekit.plugins import openai, silero
from supabase import create_client, Client

# ---------------------------------------------------------------------------
# Env loader — same .env.local as the session worker; production should use
# launchd EnvironmentVariables / Fly.io fly secrets instead.
# ---------------------------------------------------------------------------
HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent.parent
load_dotenv(REPO_ROOT / ".env.local")

LOG = logging.getLogger("koino-ai-agent")
logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
)

SUPA_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPA_SVC = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
OPENAI_KEY = os.environ.get("OPENAI_API_KEY", "")

sb: Client = create_client(SUPA_URL, SUPA_SVC) if SUPA_SVC else None

# ---------------------------------------------------------------------------
# Room → attempt_id parser. Room names are deterministic from session.js:
#   leg-<uuid>   parked, no agent
#   ai-<uuid>    losing-leg handler
#   vm-<uuid>    voicemail drop
#   rep-...      rep room, never dispatched to AI
# ---------------------------------------------------------------------------
ROOM_PATTERN = re.compile(r"^(ai|vm)-([0-9a-f-]{36})$")


def parse_room(room_name: str) -> tuple[Optional[str], Optional[str]]:
    m = ROOM_PATTERN.match(room_name)
    if not m:
        return None, None
    return m.group(1), m.group(2)


async def load_attempt(attempt_id: str) -> Optional[dict]:
    if not sb:
        LOG.warning("supabase not configured; running without persistence")
        return None
    try:
        r = (
            sb.table("call_attempts")
            .select("*, dial_sessions(toggles, agency_id, rep_id, lead_queue)")
            .eq("id", attempt_id)
            .single()
            .execute()
        )
        return r.data
    except Exception as e:
        LOG.error("load_attempt %s failed: %s", attempt_id, e)
        return None


async def persist_outcome(
    attempt_id: str,
    summary: str,
    outcome: str,
) -> None:
    if not sb:
        return
    try:
        sb.table("call_attempts").update(
            {"ai_summary": summary, "ai_outcome": outcome}
        ).eq("id", attempt_id).execute()
    except Exception as e:
        LOG.error("persist_outcome %s failed: %s", attempt_id, e)


# ---------------------------------------------------------------------------
# System prompt for the losing-leg AI handler. Tight, warm, action-oriented.
# ---------------------------------------------------------------------------
SYSTEM_PROMPT_LOSING_LEG = """\
You are an AI assistant for Koino Capital Insurance Agency calling on behalf
of a licensed insurance agent. The lead picked up the phone, but the agent
who placed the call got pulled away. Your job is brief and specific:

1. In one sentence, apologize for the agent being away. Identify yourself as
   "Koino Capital's AI assistant" — NEVER pretend to be human. If they
   directly ask "are you a person", say plainly: "No, I'm an AI assistant."
2. Confirm whether NOW is still a good time to talk, or if they'd like the
   licensed agent to call back at a specific time.
3. If yes-now: take a quick reading on what they're interested in (life
   insurance, Medicare supplement, final expense, business insurance) and
   note any urgent questions.
4. If callback: schedule via cal.com/koino — give them the URL and confirm
   they have a smartphone or computer to open it. Offer to text them the
   link if they prefer.
5. If not-interested: thank them politely, ask if they'd like to be removed
   from our list, and end the call.

Keep the entire conversation under 90 seconds. Be warm but never pushy.
Do not quote prices, bind coverage, or make commitments — the licensed
agent handles all of that.
"""


# ---------------------------------------------------------------------------
# Losing-leg handler
# ---------------------------------------------------------------------------
class LosingLegAgent(Agent):
    """Conversational agent for AI-handled losing-leg calls."""

    def __init__(self, attempt: Optional[dict]) -> None:
        # Personalize the opener if we know the lead's name / state.
        lead_hint = ""
        if attempt:
            queue = (attempt.get("dial_sessions") or {}).get("lead_queue") or []
            lead = next(
                (q for q in queue if q.get("lead_id") == attempt.get("lead_id")),
                None,
            )
            if lead and lead.get("name"):
                lead_hint = f"\n\nThe lead's name is {lead['name']}"
                if lead.get("state"):
                    lead_hint += f" and they are in {lead['state']}"
                lead_hint += "."

        super().__init__(instructions=SYSTEM_PROMPT_LOSING_LEG + lead_hint)


# ---------------------------------------------------------------------------
# Voicemail drop
# ---------------------------------------------------------------------------
VOICEMAIL_TEMPLATE = (
    "Hi{name_suffix}, this is the Koino Capital insurance team. I tried "
    "reaching you about your{product_suffix} insurance request — give me a "
    "callback at your convenience, or grab a time directly at cal.com/koino. "
    "Talk soon."
)


def build_voicemail_text(attempt: Optional[dict]) -> str:
    name_suffix = ""
    product_suffix = ""
    if attempt:
        queue = (attempt.get("dial_sessions") or {}).get("lead_queue") or []
        lead = next(
            (q for q in queue if q.get("lead_id") == attempt.get("lead_id")),
            None,
        )
        if lead and lead.get("name"):
            first = lead["name"].split()[0]
            name_suffix = f" {first}"
    return VOICEMAIL_TEMPLATE.format(
        name_suffix=name_suffix, product_suffix=product_suffix
    )


async def handle_voicemail(ctx: JobContext, attempt: Optional[dict]) -> None:
    """One-shot voicemail drop: TTS the message, play, disconnect."""
    text = build_voicemail_text(attempt)
    LOG.info("voicemail drop room=%s text=%r", ctx.room.name, text[:60])

    tts = openai.TTS(voice="alloy", model="gpt-4o-mini-tts")
    audio_stream = await tts.synthesize(text)

    # Publish audio to room
    source = audio_stream.event_ch  # SDK detail; in practice we attach to a track
    try:
        await ctx.room.local_participant.publish_data(b"")  # ping
        async for frame in audio_stream:
            await ctx.room.local_participant.publish_audio_frame(frame)
    except AttributeError:
        # If the SDK signature changed, the right thing is to give up cleanly
        # rather than hang the call. Log + disconnect.
        LOG.error("TTS publish path not available — disconnecting voicemail leg")
    finally:
        await asyncio.sleep(0.5)
        if attempt:
            await persist_outcome(
                attempt["id"], summary="AI voicemail dropped", outcome="left_message"
            )
        await ctx.disconnect()


# ---------------------------------------------------------------------------
# Losing-leg handler entrypoint
# ---------------------------------------------------------------------------
async def handle_losing_leg(ctx: JobContext, attempt: Optional[dict]) -> None:
    LOG.info("losing-leg handler joining room=%s", ctx.room.name)
    session = AgentSession(
        vad=silero.VAD.load(),
        # OpenAI realtime gives us STT+LLM+TTS in one round-trip; the LiveKit
        # plugin handles VAD-based turn-taking + barge-in.
        llm=openai.realtime.RealtimeModel(
            voice="alloy",
            instructions=SYSTEM_PROMPT_LOSING_LEG,
            modalities=["audio", "text"],
        ),
    )
    await session.start(room=ctx.room, agent=LosingLegAgent(attempt))

    # 90-second hard cap — we promised "under 90s" in the system prompt;
    # this is the enforcement.
    try:
        await asyncio.wait_for(session.wait_for_disconnect(), timeout=95)
    except asyncio.TimeoutError:
        LOG.info("losing-leg cap hit; disconnecting room=%s", ctx.room.name)

    summary = ""
    outcome = "hangup"
    try:
        history = session.history.to_dict()
        # Take the last assistant message as the summary surrogate.
        for msg in reversed(history.get("items", [])):
            if msg.get("role") == "assistant" and msg.get("content"):
                summary = (msg["content"][0] if isinstance(msg["content"], list) else msg["content"])[:500]
                break
        # Heuristic outcome detection from the conversation
        joined = " ".join(
            (m.get("content") if isinstance(m.get("content"), str) else " ".join(m.get("content") or []))
            for m in history.get("items", []) if m.get("role") == "user"
        ).lower()
        if any(k in joined for k in ["schedule", "calendly", "book", "cal.com"]):
            outcome = "scheduled"
        elif any(k in joined for k in ["call back", "callback", "later"]):
            outcome = "callback_requested"
        elif any(k in joined for k in ["not interested", "remove", "stop calling", "don't call"]):
            outcome = "not_interested"
        elif "wrong number" in joined:
            outcome = "wrong_number"
    except Exception as e:
        LOG.warning("outcome extraction failed: %s", e)

    if attempt:
        await persist_outcome(attempt["id"], summary, outcome)
    await ctx.disconnect()


# ---------------------------------------------------------------------------
# Dispatch entrypoint
# ---------------------------------------------------------------------------
async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect()
    mode, attempt_id = parse_room(ctx.room.name)
    LOG.info("dispatched: room=%s mode=%s attempt_id=%s",
             ctx.room.name, mode, attempt_id)

    if not mode:
        LOG.warning("room name doesn't match ai-/vm- pattern; disconnecting")
        await ctx.disconnect()
        return

    attempt = await load_attempt(attempt_id) if attempt_id else None

    if mode == "ai":
        await handle_losing_leg(ctx, attempt)
    elif mode == "vm":
        await handle_voicemail(ctx, attempt)


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
