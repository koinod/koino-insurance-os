-- 0098 — Extend recruiting_applicants so a public-form submission has
-- somewhere to land contact details + the raw payload + scoring.
--
-- The legacy schema only had {name, handle, state, status, agency_id,
-- recruiter_id, campaign_id}. With agency-hosted careers pages now writing
-- through /api/site-forms/submit, we need email + phone + the raw payload
-- so the operator can actually reach the applicant, plus a lead_score for
-- routing decisions and a source for attribution. All nullable so no
-- existing inserts break.

alter table public.recruiting_applicants
  add column if not exists email       text,
  add column if not exists phone       text,
  add column if not exists source      text,
  add column if not exists lead_score  int,
  add column if not exists payload     jsonb;

create index if not exists recruiting_applicants_agency_email_idx
  on public.recruiting_applicants (agency_id, lower(email))
  where email is not null;

create index if not exists recruiting_applicants_agency_phone_idx
  on public.recruiting_applicants (agency_id, phone)
  where phone is not null;
