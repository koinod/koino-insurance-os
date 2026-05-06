-- 0007_lead_phone_email.sql
-- Adds the missing contact fields on lead rows so the autodialer / SMS /
-- per-row Phone buttons can call real customers instead of synthetic test
-- numbers. Email is added on the same migration since calendar invites
-- need it and we'd hit the same DDL otherwise.
--
-- Both columns are nullable — a lead can land in the queue with no contact
-- info, the UI will then prompt to capture it before dialing.
--
-- Format: phone stored E.164 by convention (+15125551234). The check
-- accepts that plus common typed formats so reps aren't blocked by a
-- regex during data entry; backend normalization happens at /api/twilio-sms
-- and the dialer.

alter table public.pipeline
  add column if not exists phone text,
  add column if not exists email text;

alter table public.queue
  add column if not exists phone text,
  add column if not exists email text;

-- Light-touch format check — must contain at least 7 digits when present,
-- empty / null are fine. Loose so the UI can normalize on submit.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pipeline_phone_format_chk') then
    alter table public.pipeline
      add constraint pipeline_phone_format_chk
      check (phone is null or phone = '' or length(regexp_replace(phone, '\D', '', 'g')) >= 7);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'queue_phone_format_chk') then
    alter table public.queue
      add constraint queue_phone_format_chk
      check (phone is null or phone = '' or length(regexp_replace(phone, '\D', '', 'g')) >= 7);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pipeline_email_format_chk') then
    alter table public.pipeline
      add constraint pipeline_email_format_chk
      check (email is null or email = '' or email like '%@%.%');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'queue_email_format_chk') then
    alter table public.queue
      add constraint queue_email_format_chk
      check (email is null or email = '' or email like '%@%.%');
  end if;
end $$;

-- Index by phone so dedup-by-phone + reverse-phone lookup are fast.
create index if not exists pipeline_phone_idx on public.pipeline (phone) where phone is not null;
create index if not exists queue_phone_idx    on public.queue    (phone) where phone is not null;

comment on column public.pipeline.phone is 'E.164 preferred; loose-format accepted at insert. Empty string and NULL both treated as "no phone on file".';
comment on column public.queue.phone    is 'E.164 preferred; carries forward to pipeline.phone when queue lead is dispatched.';
