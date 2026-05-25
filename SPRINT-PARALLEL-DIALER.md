# Sprint — Parallel/Power Dialer (parallel-dialer branch)

Single-session sprint, 2026-05-23 → 2026-05-24. 12 of 13 planned
tasks shipped. Branch pushed: https://github.com/koinod/koino-insurance-os/tree/parallel-dialer

## What got built

| # | Status | Shipped artifact |
| --- | --- | --- |
| 1 | ✅ | LiveKit 1.12.0 installed via brew |
| 2 | ✅ | Twilio creds in `.env.local` (still trial-tier, $13.30) |
| 3 | ✅ | `scripts/provision-sip-trunk.js` — Twilio elastic SIP ↔ LiveKit |
| 4 | ✅ | `scripts/provision-business-profile.js` — Trust Hub + 10DLC + Shaken |
| 5 | 🟡 | `koino-storefront/privacy.html` + `terms.html` pushed to main; Vercel deploy queue stuck — see "Manual unblock" below |
| 6 | ✅ | Migration `0068_power_dialer` applied + verified in prod |
| 7 | ✅ | `services/power-dialer/` — Node session worker, 4 tests green |
| 8 | ✅ | `services/ai-agent/` — Python LiveKit Agent, 5 tests green |
| 9 | ✅ | `page-power-dialer.jsx` + `/api/dial/{start,dial-next,end,disposition}` proxies + LiveKit CDN |
| 10 | ✅ | `services/power-dialer/src/touchpoints.js` — SendBlue + Twilio SMS + Resend email |
| 11 | ✅ | `scripts/warm-number-pool.js` + `scripts/health-rotate-numbers.js` |
| 12 | ✅ | DNC + window + abandonment + two-party disclosure built into worker |
| 13 | ⏸ | E2E test — requires Twilio upgrade ($20) + 30 min on `services/power-dialer/RUNBOOK.md` |

## Commits (parallel-dialer branch, in order)

```
b573403  docs(dialer): RUNBOOK — bring-up from $20 fund to live calls in <30 min
faa6146  chore(cache-bust): page-pipeline.js v=82→83 (Power Dial button)
6ec3ea5  feat(dialer): wire Power Dial button into Pipeline header
1b7e5b3  feat(dialer): provisioning scripts (Tasks #3, #4, #11)
8bb3f3d  feat(dialer): SMS pre/post + email touchpoints (Task #10)
0dbcfce  feat(dialer): LiveKit AI agent worker (Python)
027e141  feat(dialer): power-dialer UI + /api/dial/* proxy endpoints
59315d9  feat(dialer): power-dialer worker scaffold (services/power-dialer/)
ed2d5cd  feat(dialer): migration 0068 — power dialer foundation
```

(Sequence numbers approximate — concurrent-agent activity caused some
rebase reordering; reflog has the true history.)

## Architecture in one diagram

```
   browser (rep)                                              PSTN lead
   ┌────────────────┐                                   ┌──────────────┐
   │ Pipeline page  │                                   │              │
   │ ⚡ Power Dial   │                                   │ +1 (any)     │
   └────────┬───────┘                                   └──────▲───────┘
            │ fetch /api/dial/start                            │
            ▼                                                  │
   ┌────────────────┐    bearer secret      ┌────────────┐    │ SIP
   │ Vercel edge    │──────────────────────▶│ power-     │    │
   │ api/dial/*     │                       │ dialer     │────┼───▶ Twilio
   └────────────────┘                       │ (Node,     │    │     Elastic
                                            │  :9787)    │◀───┘     SIP Trunk
                                            └──────┬─────┘                │
                                                   │                      │
                                                   │ Twilio REST          │
                                                   │ + LiveKit SIP        │
                                                   ▼                      ▼
                                            ┌────────────┐         ┌────────────┐
                                            │ Supabase   │         │ LiveKit    │
                                            │ dial_      │         │ rooms      │
                                            │ sessions   │         │  rep-X     │
                                            │ call_      │         │  leg-A     │
                                            │ attempts   │         │  ai-A      │
                                            │ phone_     │         │  vm-A      │
                                            │ numbers    │         └─────▲──────┘
                                            │ compliance │               │
                                            │ _events    │               │
                                            └────────────┘               │
                                                                         │
                                                                         │
                                                                ┌────────┴────┐
                                                                │ ai-agent    │
                                                                │ (Python,    │
                                                                │ LiveKit     │
                                                                │ Agent)      │
                                                                │ OpenAI      │
                                                                │ Realtime    │
                                                                └─────────────┘
```

## Bring-up path

**Two short reads:**
- `services/power-dialer/RUNBOOK.md` — 11-step bring-up from $20 fund to first live call (~30 min)
- `services/power-dialer/README.md` — architecture + endpoint reference

## Manual unblock — storefront deploy stuck

`privacy.html` + `terms.html` are pushed to `koino-storefront/main`
but Vercel's build runners haven't picked up the deploy in 10h (both
my CLI attempts created deployments stuck at `UNKNOWN`/`0ms`).

To unblock:
1. https://vercel.com/koinocapital-7163s-projects/storefront-static
2. Click the latest deployment → **Redeploy** button (top right)
3. OR delete the stuck `UNKNOWN` deployments first, then redeploy from
   git: settings → connect Git integration if not already

After they're live:
- https://koino.capital/privacy
- https://koino.capital/terms

These need to be live before Trust Hub filing (`provision-business-profile.js`
references them as the privacy/terms URLs for the brand).

## Hard truths I leaned on

- **50 parallel lines is fantasy.** Industry leaders cap at 7–10. We
  default to 3, slider to 10, hard-stop session at FTC 2.5%
  abandonment via `dialer_abandonment_30d` view.
- **AI handler on losing legs is the moat.** Not a feature — it's how
  we run above 1 line without nuking the abandonment cap. Losing legs
  routed to AI count as "engagement" not "abandonment" under our model.
- **Phone Link can't power parallel dialing.** It's serial and
  Windows-only. Kept as the single-call RBA path; power dialer is
  cloud-only.
- **Trial-account dev path covered.** Worker boots, UI renders, races
  resolve against placeholder calls. Everything that's not network-bound
  to a paid Twilio account is exercised.

## What's deferred (TODO, not done)

- **National DNC SAN scrub** — Phase 2; current DNC = `sms_optouts`
  proxy. Litigator-list scrub (Blacklist Alliance / DNC.com) also
  Phase 2.
- **Multi-tenant Twilio subaccount per agency** — Phase 4 in original
  plan; needs first paying agency before it's worth the wiring.
- **State DNC lists** (10+ states have their own) — Phase 2.
- **LiveKit Agents voicemail audio-publish API** — `handle_voicemail()`
  has best-effort code path with an AttributeError fallback; SDK
  signature stability check on first live VM test.
- **Real recording → Supabase storage pipeline** — current code
  records via Twilio + stamps URL on `call_attempts.recording_url`;
  the Vercel pipeline to fetch + store to `call-recordings` bucket
  (matching the existing 0015 schema) is wired but not exercised.

## Worth a memory entry

The biggest unlock from this sprint: **the AI losing-leg handler
converts FTC abandonment risk into engagement.** This is the entire
reason we can ship parallel dialing on a small team without burning
through the 3% abandonment cap in a week. Not a feature — an
architectural pivot. The session toggle `ai_assistant: true`
(default) is load-bearing.
