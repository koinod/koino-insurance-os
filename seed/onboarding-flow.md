# Rep onboarding flow — KOINO Insurance OS

The onboarding flow turns a "I want to join the team" applicant into an activated rep with leads flowing in. Designed to take 24–72 hours instead of the 2–3 weeks the typical IMO drags it out to.

## Stages

### Stage 0 — Apply (front-door, lives in `koino-recruit`)
- Form on the public site captures: name, email, phone, state, license status, years of experience, current IMO, why interested.
- Submission stored in `data/applications.jsonl` AND triggers a Telegram alert to Ian.

### Stage 1 — Intake call (manual, 15 min)
- Ian or a manager reviews the application, runs the 15-min call.
- After the call, the manager opens the platform, navigates to **Recruiting** → marks candidate as "Approved" → enters intake-call notes.
- System-generated event: `recruiting.candidate.approved` → triggers Stage 2.

### Stage 2 — Contract & docs (system-driven, async)
The platform sends the candidate a single link with a tabbed interface:
1. **Personal info** — DOB, SSN (encrypted), home address, banking info for direct deposit (encrypted; never logged)
2. **License capture** — upload license image + enter license # + state(s) + NPN. The system auto-verifies via NIPR (or stub for v0).
3. **W9** — DocuSign / Dropbox Sign embedded form
4. **Independent contractor agreement** — DocuSign / Dropbox Sign embedded form
5. **E&O proof** — upload current E&O certificate or purchase via SAFE/NAPA partnership link
6. **Carrier appointments** — checklist of carriers they want appointments with (Transamerica, ETHOS, F&G, etc). System triggers JIT appointments based on first deal submitted.

Each completion fires `onboarding.{step}.completed` events.

### Stage 3 — Activation
When all of Stage 2 is green:
- Create user account (email magic link)
- Assign default lead-vendor allocation (manager-controlled)
- Set commission grid (default = streetlevel; can override per rep)
- Place in upline hierarchy (`reps.upline_id`)
- Send activation email with platform login + first-week training calendar
- Telegram-alert the manager

### Stage 4 — First-week onboarding (manager-driven)
Inside the platform on the rep's dashboard:
- Day 1 video: how to use the dialer + log activities
- Day 2 video: how to log a deal
- Day 3: 1:1 review of first 50 dials
- Day 5: 1:1 review of first appointments
- Day 7: 1:1 review of first deals submitted

Each day's checklist must be completed for the rep to "graduate" out of probation. Probation = lower lead allocation + shadow-call recordings.

## State machine

```
applied → intake_scheduled → intake_completed → approved
   → docs_in_progress → docs_complete → activated
   → in_training_week_1 → graduated
```

Reverse paths:
- `intake_completed → rejected` (terminal)
- `docs_in_progress → withdrawn` (terminal)
- `activated → terminated` (terminal)

## Schema additions

```sql
create table recruiting_candidates (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references applications(id),
  status text not null check (status in ('applied','intake_scheduled','intake_completed','approved','docs_in_progress','docs_complete','activated','in_training_week_1','graduated','rejected','withdrawn','terminated')),
  intake_notes text,
  approved_at timestamptz,
  approved_by uuid references users(id),
  activated_at timestamptz,
  graduated_at timestamptz,
  upline_id uuid references reps(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table onboarding_steps (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references recruiting_candidates(id),
  step text not null check (step in ('personal_info','license','w9','contract','eo','carrier_appointments')),
  status text not null check (status in ('pending','in_progress','completed','blocked')),
  data jsonb,
  completed_at timestamptz,
  created_at timestamptz default now()
);
```

## What automation handles vs human handles

| Step | Automated by worker? | Human-required? |
|------|---------------------|-----------------|
| Application intake | ✅ Telegram alert | Manager schedules intake call |
| Intake call | — | Manager runs call |
| Approve candidate | — | Manager clicks "Approve" |
| Send onboarding link | ✅ | — |
| Personal info collection | ✅ Form | — |
| License verification | ✅ NIPR API (post-MVP) | Manager fallback if API fails |
| W9 / Contract sign | ✅ DocuSign embed | — |
| E&O upload | ✅ Form | Manager review |
| Carrier appointments | ✅ Trigger on first deal | Manager nudges |
| Activation | ✅ All-greens trigger | — |
| First-week training | — | Manager 1:1s |
| Graduation | — | Manager clicks |
