-- 0032 call_events — append-only log of Twilio status events.
--
-- Twilio /api/twilio-app webhook writes one row per terminal status
-- transition (completed / no-answer / busy / failed / canceled). Used by:
--   • automation_rules trigger 'call_completed' / 'call_missed' fan-out
--   • Devices admin "live activity" join
--   • Future cross-rep activity feed

set local search_path = public;

create table if not exists public.call_events (
  id              bigserial primary key,
  call_sid        text not null,
  status          text not null,
  duration_sec    int default 0,
  direction       text,
  to_number       text,
  from_number     text,
  lead_id         uuid references public.pipeline(id) on delete set null,
  agency_id       uuid references public.agencies(id) on delete cascade,
  created_at      timestamptz not null default now()
);
create index if not exists call_events_sid_idx    on public.call_events (call_sid);
create index if not exists call_events_lead_idx   on public.call_events (lead_id, created_at desc);
create index if not exists call_events_agency_idx on public.call_events (agency_id, created_at desc);

alter table public.call_events enable row level security;
drop policy if exists "call_events_visible" on public.call_events;
create policy "call_events_visible" on public.call_events for select to authenticated using (
  public.is_super_admin() OR agency_id = ANY (public.viewer_agency_ids())
);

do $$ begin
  perform 1 from pg_publication where pubname = 'supabase_realtime';
  if found then
    begin alter publication supabase_realtime add table public.call_events; exception when duplicate_object then null; end;
  end if;
end $$;
