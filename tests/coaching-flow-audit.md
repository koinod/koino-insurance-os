# Coaching-from-transcripts wire audit

Audit target: the promise that "call recording → transcript → coaching moment surfaces in Today rep view." Below is the *intended* sequence vs. what actually exists in the branch.

## Intended sequence

```mermaid
sequenceDiagram
  participant Rep
  participant Floor as page-floor.jsx (CallRecorderPanel)
  participant Stor as Supabase Storage (call-recordings bucket)
  participant DB as call_recordings table
  participant Twilio as api/twilio-recording.js
  participant Tx as api/transcribe.js
  participant Cron as api/cron/transcribe-call-recordings.js
  participant Mom as moment_extractor (LLM scorer)
  participant Today as page-today.jsx (Replay moment)

  Rep->>Floor: Click Start recording
  Floor->>Stor: Upload .webm
  Floor->>DB: INSERT call_recordings (audio_path, rep_id, lead_id)
  Twilio-->>DB: parallel path — Twilio webhook writes vault_artifacts
  Cron->>DB: SELECT WHERE transcript_url IS NULL
  Cron->>Tx: POST audio_url
  Tx-->>Cron: { text, segments }
  Cron->>DB: PATCH transcript_url = data:text/plain;base64,...
  Mom->>DB: read transcript, score talk-ratio + tag moments
  Mom->>DB: INSERT coaching_moments (call_id, type, timestamp, evidence)
  Today->>DB: SELECT coaching_moments WHERE rep_id = me() ORDER BY recent
  Today->>Rep: render coaching card with "Replay moment" deep link
  Rep->>Today: click Replay
  Today->>Floor: navigate to /calls#<call_id>?t=<segment_start>
```

## Step-by-step status

| # | Step | Status | Notes |
|---|------|--------|------|
| 1 | Floor records audio, uploads to bucket | ✅ wired | `lib/call-recorder.js` start/stop/upload, page-floor.jsx CallRecorderPanel |
| 2 | INSERT into `call_recordings` with rep_id, lead_id, audio_path | ✅ wired | `lib/call-recorder.js:215` |
| 3 | Twilio webhook also writes a recording artifact (alt path) | ⚠ partial | `api/twilio-recording.js` writes to `vault_artifacts` (NOT `call_recordings`). Two parallel sinks; coaching only reads one. |
| 4 | Cron sweeps untranscribed rows and calls `/api/transcribe` | ✅ wired | `api/cron/transcribe-call-recordings.js`, batch=5, idempotent |
| 5 | Transcribe service (Whisper → Gemini fallback) | ✅ wired | `api/transcribe.js`, both backends present |
| 6 | Persist transcript text back to `call_recordings.transcript_url` (data: URI) | ✅ wired | line 87-97 of cron file. Stored as base64 data URI on transcript_url column. |
| 7 | Extract a "moment" (talk-ratio span, objection beat, missed open-ended Q) and persist it | ❌ MISSING | No moment-extraction code anywhere. No `coaching_moments` table. The transcript is dead text on the row. |
| 8 | `coaching_moments` table with FK to call_id, segment timestamps, evidence | ❌ MISSING | Schema search across `supabase/migrations/*` returns zero hits. `call_recordings` has no `talk_ratio`, `score`, `ai_summary`, or `moment_*` columns either. |
| 9 | Today rep view reads real moments from DB | ❌ MISSING | `page-today.jsx:644-661` is hard-coded copy: "Ask 3 more open-ended questions per hour" + a static narrative gated only by `window.isDemoAgency()`. The "Replay moment" button just calls `gotoPage("calls")` and pops a toast — no `?t=` deep link, no call_id. |
| 10 | "Mark practiced" persists to DB | ❌ MISSING | Writes to `localStorage.repflow.coaching_practiced` only (page-today.jsx:666). Does not survive log-out, does not roll up to manager view, does not affect any computed streak. |
| 11 | Today mgr view ("Today's coaching cards") reads scored calls | ❌ MISSING | page-today.jsx:872-885 is also hard-coded ("4 closed-ended Q on first call. Replay ready." / "Talk ratio 58% on a recent call. Pull moment."). page-manager.jsx:708 falls back to `s.notes \|\| "Replay your last call to find the moment."` — string literal. |

## Cheapest fix per missing step

- **7 — moment extractor**: `api/cron/transcribe-call-recordings.js:95`. After the transcript PATCH, POST the text to `/api/copilot` ("score talk_ratio, count open-Qs, return JSON {talk_ratio, open_q_count, top_moment:{ts,evidence,type}}") and PATCH the result onto `call_recordings.notes` as JSON. No migration needed today.
- **8 — schema**: new `supabase/migrations/0025_coaching_moments.sql`. `coaching_moments(id, call_id fk, rep_id, agency_id, type, ts_sec, evidence, score, created_at)` + RLS mirroring `call_recordings`. Defer if step 7 piggybacks on `notes`.
- **9 — Today rep reads real moments**: `page-today.jsx:644-676`. Replace hard-coded copy with `useEffect → sb.from("call_recordings").select("id,notes,started_at").not("notes","is",null).order(..desc).limit(1)`. Empty state when no scored call exists.
- **10 — Mark practiced persists**: `page-today.jsx:666`. Swap `localStorage.setItem` for `sb.from("coaching_practice_log").insert(...)`. Add 4-col table to migration 0025.
- **11 — Manager cards read real data**: `page-manager.jsx:708,740`. Drop `s.notes || "Replay your last call..."` literal; pull from `call_recordings where talk_ratio < 35 or open_q < 3 order by started_at desc limit 5`. Deep-link `/calls#<id>?t=<ts>`.

## Bottom line

**5 of 11 steps missing or stubbed.** Cheapest end-to-end: (a) moment extractor cron piggybacking on `call_recordings.notes`, (b) one DB read in `page-today.jsx` replacing the hard-coded card. That alone makes the surface live without a new table.
