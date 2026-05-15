-- 0033 appointments — first-class scheduled meetings.
--
-- Sales appointments (not carrier appointments — that's already
-- public.carrier_appointments). Sources: Calendly webhook, manual entry,
-- future Cal.com / Acuity integrations.
--
-- The pre-appt-reminder cron scans this for appointments starting within
-- 24h / 1h and fires automation_rules: appointment_reminder_24h /
-- appointment_reminder_1h.

set local search_path = public;

create table if not exists public.appointments (
  id              uuid primary key default gen_random_uuid(),
  agency_id       uuid not null references public.agencies(id) on delete cascade,
  lead_id         uuid references public.pipeline(id) on delete set null,
  owner_rep_id    text,
  source          text not null check (source in ('calendly','cal_com','acuity','manual','other')),
  external_id     text,                                          -- vendor's event id; null for manual
  title           text,
  starts_at       timestamptz not null,
  ends_at         timestamptz,
  attendee_email  text,
  attendee_name   text,
  attendee_phone  text,
  meeting_url     text,
  status          text not null default 'scheduled'
                  check (status in ('scheduled','rescheduled','canceled','completed','no_show')),
  reminder_24h_fired_at timestamptz,
  reminder_1h_fired_at  timestamptz,
  payload         jsonb default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  unique (source, external_id)
);
create index if not exists appointments_starts_idx
  on public.appointments (starts_at) where status = 'scheduled';
create index if not exists appointments_lead_idx
  on public.appointments (lead_id, starts_at desc);
create index if not exists appointments_agency_idx
  on public.appointments (agency_id, starts_at desc);

alter table public.appointments enable row level security;
drop policy if exists "appointments_visible" on public.appointments;
create policy "appointments_visible" on public.appointments for select to authenticated using (
  public.is_super_admin() OR agency_id = ANY (public.viewer_agency_ids())
);
drop policy if exists "appointments_manage" on public.appointments;
create policy "appointments_manage" on public.appointments for all to authenticated
  using (
    public.is_super_admin()
    OR exists (
      select 1 from public.agency_members
       where user_id = auth.uid() and agency_id = appointments.agency_id and active = true
    )
  )
  with check (
    public.is_super_admin()
    OR exists (
      select 1 from public.agency_members
       where user_id = auth.uid() and agency_id = appointments.agency_id and active = true
    )
  );

do $$ begin
  perform 1 from pg_publication where pubname = 'supabase_realtime';
  if found then
    begin alter publication supabase_realtime add table public.appointments; exception when duplicate_object then null; end;
  end if;
end $$;
