-- 0068 — Add bridge-tracking columns to agency_carrier_appointments
--
-- Context (2026-05-22): Ian's agency has an NPN issued (2026-05-20) but no
-- carrier appointments of his own yet. In the interim he writes policies
-- under Zay's NPN ("bridge" arrangement); policies bind on Zay's
-- appointments, commission splits to Ian, and once Ian gets his own
-- appointment per carrier, Zay transfers the in-force book to him.
--
-- The Carrier Appointment Tracker UI (page-carrier-appointments.jsx) needs:
--   - Per carrier: am I (self) contracted directly OR writing under bridge?
--   - If bridge: which NPN am I writing under?
--   - When did I get directly contracted?
--   - When did the bridge book get transferred over?
--   - Free-text notes (e.g. "Liberty Bankers pending E&O before submit")
--
-- We extend agency_carrier_appointments (already used by page-tenant ->
-- SettingsCarriers + page-platform-admin -> TabCarriers) rather than
-- create a third carrier-appointments table. The existing rep-keyed
-- public.carrier_appointments (from 0002) is unrelated — it tracks
-- per-rep per-state state-licensing appointments; we leave it alone.
--
-- Backwards compatibility: existing rows (status='active', 'paused',
-- 'terminated') stay valid by relaxing the CHECK constraint to a
-- combined enum that admits both legacy and new vocabulary.

-- 1) Add the bridge tracking columns.
alter table public.agency_carrier_appointments
  add column if not exists status            text,
  add column if not exists bridge_under_npn  text,
  add column if not exists bridge_under_name text,
  add column if not exists contracted_at     date,
  add column if not exists transferred_at    date,
  add column if not exists updated_at        timestamptz not null default now();

-- 2) Backfill status from legacy `active` boolean.
update public.agency_carrier_appointments
   set status = case when active then 'self' else 'not_pursuing' end
 where status is null;

-- 3) Now make status NOT NULL with a default of 'self'.
--
-- Default is 'self' (not 'bridge') because the legacy insert paths in
-- data.jsx::agencyAppointmentSave() and page-tenant.jsx::SettingsCarriers
-- don't set status — they only set `active`. Mapping active=true → 'self'
-- preserves the existing semantic for those callers. The new
-- page-carrier-appointments.jsx always sets status explicitly.
alter table public.agency_carrier_appointments
  alter column status set default 'self',
  alter column status set not null;

-- 4) Replace the CHECK constraint to admit the union of legacy + new values.
alter table public.agency_carrier_appointments
  drop constraint if exists agency_carrier_appointments_status_check;
alter table public.agency_carrier_appointments
  add constraint agency_carrier_appointments_status_check
  check (status in ('self','bridge','pending','not_pursuing','active','paused','terminated'));

-- 5) Index status for fast filtering.
create index if not exists agency_carrier_appts_status_idx
  on public.agency_carrier_appointments (agency_id, status);

-- 6) updated_at trigger.
create or replace function public._set_agency_carrier_appts_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists agency_carrier_appts_set_updated_at
  on public.agency_carrier_appointments;
create trigger agency_carrier_appts_set_updated_at
  before update on public.agency_carrier_appointments
  for each row execute function public._set_agency_carrier_appts_updated_at();

-- 7) Verify
DO $$
DECLARE missing int;
BEGIN
  SELECT count(*) INTO missing
  FROM (VALUES ('status'),('bridge_under_npn'),('bridge_under_name'),
               ('contracted_at'),('transferred_at'),('updated_at')) AS x(c)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public'
       AND table_name='agency_carrier_appointments'
       AND column_name=x.c
  );
  IF missing <> 0 THEN
    RAISE EXCEPTION 'agency_carrier_appointments missing % expected bridge column(s)', missing;
  END IF;
END $$;
