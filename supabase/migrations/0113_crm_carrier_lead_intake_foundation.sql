-- 0113 — CRM carrier workspace + lead intake foundation
--
-- Keeps agency carrier availability separate from a producer's own
-- appointment overlay, records appointment requirements, and preserves the
-- actual cost of purchased lead packs for CRM attribution.

begin;

-- Existing rows with a null rep_id remain agency-level defaults. A populated
-- rep_id is the producer-specific appointment overlay.
alter table public.agency_carrier_appointments
  add column if not exists rep_id text references public.reps(id) on delete cascade;

drop index if exists public.agency_carrier_appts_agency_carrier_uq;
drop index if exists public.agency_carrier_appts_agency_name_uq;
create unique index if not exists agency_carrier_appts_scope_carrier_uq
  on public.agency_carrier_appointments (agency_id, carrier_id, coalesce(rep_id, '__agency__'))
  where carrier_id is not null;
create unique index if not exists agency_carrier_appts_scope_name_uq
  on public.agency_carrier_appointments (agency_id, lower(carrier_name), coalesce(rep_id, '__agency__'));
create index if not exists agency_carrier_appts_rep_idx
  on public.agency_carrier_appointments (agency_id, rep_id, updated_at desc);

drop policy if exists "auth write agency_carrier_appts" on public.agency_carrier_appointments;
create policy "auth write agency_carrier_appts" on public.agency_carrier_appointments
  for all to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.agency_members m
       where m.agency_id = agency_carrier_appointments.agency_id
         and m.user_id = auth.uid()
         and m.active = true
         and (
           m.role in ('owner','admin','imo_owner','super_admin','manager')
           or (m.role = 'rep' and agency_carrier_appointments.rep_id = m.rep_id)
         )
    )
  )
  with check (
    public.is_super_admin()
    or exists (
      select 1 from public.agency_members m
       where m.agency_id = agency_carrier_appointments.agency_id
         and m.user_id = auth.uid()
         and m.active = true
         and (
           m.role in ('owner','admin','imo_owner','super_admin','manager')
           or (m.role = 'rep' and agency_carrier_appointments.rep_id = m.rep_id)
         )
    )
  );

create table if not exists public.carrier_appointment_requirements (
  id              uuid primary key default gen_random_uuid(),
  agency_id       uuid not null references public.agencies(id) on delete cascade,
  appointment_id  uuid not null references public.agency_carrier_appointments(id) on delete cascade,
  rep_id          text references public.reps(id) on delete cascade,
  kind            text not null default 'other',
  label           text not null,
  status          text not null default 'open' check (status in ('open','in_progress','complete','waived')),
  due_at          date,
  completed_at    date,
  notes           text,
  source_url      text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists carrier_requirements_appointment_idx
  on public.carrier_appointment_requirements (appointment_id, status, due_at);
alter table public.carrier_appointment_requirements enable row level security;
drop policy if exists "carrier requirements read agency" on public.carrier_appointment_requirements;
create policy "carrier requirements read agency" on public.carrier_appointment_requirements
  for select to authenticated
  using (public.is_super_admin() or agency_id = any(public.viewer_agency_ids()));
drop policy if exists "carrier requirements write role aware" on public.carrier_appointment_requirements;
create policy "carrier requirements write role aware" on public.carrier_appointment_requirements
  for all to authenticated
  using (
    public.is_super_admin()
    or agency_id in (select public.viewer_agency_ids())
    and (
      public.viewer_role_in(agency_id) in ('owner','admin','imo_owner','super_admin','manager')
      or rep_id = public.my_rep_id_in_agency(agency_id)
    )
  )
  with check (
    public.is_super_admin()
    or agency_id in (select public.viewer_agency_ids())
    and (
      public.viewer_role_in(agency_id) in ('owner','admin','imo_owner','super_admin','manager')
      or rep_id = public.my_rep_id_in_agency(agency_id)
    )
  );

create table if not exists public.lead_import_batches (
  id                uuid primary key default gen_random_uuid(),
  agency_id         uuid not null references public.agencies(id) on delete cascade,
  lead_source_id    uuid references public.agency_lead_sources(id) on delete set null,
  vendor            text,
  file_name         text,
  purchased_at      date not null default current_date,
  purchased_count   integer not null default 0 check (purchased_count >= 0),
  imported_count    integer not null default 0 check (imported_count >= 0),
  skipped_count     integer not null default 0 check (skipped_count >= 0),
  total_cost_cents  bigint not null default 0 check (total_cost_cents >= 0),
  assigned_rep_id   text references public.reps(id) on delete set null,
  status            text not null default 'complete' check (status in ('draft','importing','complete','failed')),
  notes             text,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now()
);
create index if not exists lead_import_batches_agency_date_idx
  on public.lead_import_batches (agency_id, purchased_at desc);
alter table public.lead_import_batches enable row level security;
drop policy if exists "lead import batches read role aware" on public.lead_import_batches;
create policy "lead import batches read role aware" on public.lead_import_batches
  for select to authenticated
  using (public.is_super_admin() or agency_id = any(public.viewer_agency_ids()));
drop policy if exists "lead import batches write role aware" on public.lead_import_batches;
create policy "lead import batches write role aware" on public.lead_import_batches
  for all to authenticated
  using (
    public.is_super_admin()
    or agency_id in (select public.viewer_agency_ids())
    and (
      public.viewer_role_in(agency_id) in ('owner','admin','imo_owner','super_admin','manager')
      or assigned_rep_id = public.my_rep_id_in_agency(agency_id)
    )
  )
  with check (
    public.is_super_admin()
    or agency_id in (select public.viewer_agency_ids())
    and (
      public.viewer_role_in(agency_id) in ('owner','admin','imo_owner','super_admin','manager')
      or assigned_rep_id = public.my_rep_id_in_agency(agency_id)
    )
  );

alter table public.pipeline
  add column if not exists import_batch_id uuid references public.lead_import_batches(id) on delete set null;
create index if not exists pipeline_import_batch_idx
  on public.pipeline (import_batch_id) where import_batch_id is not null;

alter table public.agency_expenses
  add column if not exists lead_import_batch_id uuid references public.lead_import_batches(id) on delete set null;
create index if not exists expenses_lead_import_batch_idx
  on public.agency_expenses (lead_import_batch_id) where lead_import_batch_id is not null;

commit;
