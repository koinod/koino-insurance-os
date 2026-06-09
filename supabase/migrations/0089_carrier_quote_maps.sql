-- Saved rate-path mapping: a per-agency, per-carrier replayable "quote map"
-- so a carrier portal's quote form can be mapped once (via the inspect flow)
-- and replayed by the agent, instead of relying solely on hand-coded scrapers.
-- SHAPE-NOT-DATA: table + RLS only. Maps are authored at runtime via the UI/API.

create table if not exists public.carrier_quote_maps (
  id                  uuid primary key default gen_random_uuid(),
  agency_id           uuid not null references public.agencies(id) on delete cascade,
  carrier_id          text not null,
  -- navigation + auth
  quote_url           text,
  login_url           text,
  logged_in_indicator text,                              -- "selector:<css>" or a URL substring
  -- replay program
  steps               jsonb not null default '[]'::jsonb, -- [{action:'goto'|'click'|'wait', selector?, value?}]
  fields              jsonb not null default '[]'::jsonb, -- [{key:'age'|'state'|..., selector, type:'fill'|'select'|'radio'}]
  submit_selector     text,
  rate_selector       text,                               -- optional element to read the premium from
  rate_regex          text,                               -- regex to extract the premium from page text
  -- meta
  notes               text,
  active              boolean not null default true,
  version             int not null default 1,
  updated_by          uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (agency_id, carrier_id)
);

create index if not exists carrier_quote_maps_agency_idx on public.carrier_quote_maps (agency_id, carrier_id);

alter table public.carrier_quote_maps enable row level security;

-- Auto-stamp agency_id from the caller's active membership on insert.
drop trigger if exists set_agency_id_trg on public.carrier_quote_maps;
create trigger set_agency_id_trg before insert on public.carrier_quote_maps
  for each row execute function public._t_set_agency_id();

drop trigger if exists trg_cqm_updated on public.carrier_quote_maps;
create trigger trg_cqm_updated before update on public.carrier_quote_maps
  for each row execute function public.tg_set_updated_at();

-- Read: any active member of the agency (or super admin). The agent reads
-- maps through an authenticated API (agent_token → agency) — never anon —
-- so no anon policy here.
drop policy if exists "tenant read carrier_quote_maps" on public.carrier_quote_maps;
create policy "tenant read carrier_quote_maps" on public.carrier_quote_maps
  for select to authenticated
  using (public.is_super_admin() or agency_id in (select public.viewer_agency_ids()));

-- Write: mapping is an admin task — owner/manager (and super admin) only.
drop policy if exists "manager write carrier_quote_maps" on public.carrier_quote_maps;
create policy "manager write carrier_quote_maps" on public.carrier_quote_maps
  for all to authenticated
  using (
    public.is_super_admin()
    or exists (select 1 from public.agency_members m
                where m.agency_id = carrier_quote_maps.agency_id
                  and m.user_id = auth.uid() and m.active
                  and m.role in ('owner','manager','admin','imo_owner'))
  )
  with check (
    public.is_super_admin()
    or exists (select 1 from public.agency_members m
                where m.agency_id = carrier_quote_maps.agency_id
                  and m.user_id = auth.uid() and m.active
                  and m.role in ('owner','manager','admin','imo_owner'))
  );

-- Verify: table exists, RLS on, both policies present.
do $$
declare npol int;
begin
  if not exists (select 1 from pg_class where relname='carrier_quote_maps' and relrowsecurity) then
    raise exception 'carrier_quote_maps missing or RLS off';
  end if;
  select count(*) into npol from pg_policy where polrelid = 'public.carrier_quote_maps'::regclass;
  if npol <> 2 then raise exception 'expected 2 policies, got %', npol; end if;
end $$;
