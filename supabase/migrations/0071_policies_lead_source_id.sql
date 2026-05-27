-- 0071_policies_lead_source_id.sql
-- Attribute written deals to a lead vendor so AP / ROAS can be broken
-- out per source on the Attribution page. SHAPE only — no seed data.
-- Applied to prod via MCP apply_migration (name: policies_lead_source_id).

alter table public.policies
  add column if not exists lead_source_id uuid
  references public.agency_lead_sources(id) on delete set null;

create index if not exists idx_policies_lead_source_id
  on public.policies(lead_source_id) where lead_source_id is not null;

comment on column public.policies.lead_source_id is
  'Lead vendor this deal is attributed to (FK -> agency_lead_sources). Powers per-vendor AP / ROAS on the Attribution page. Stamped at deal-write time. NULL = unattributed.';

-- Verify the column landed (fail loudly on partial apply).
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='policies' and column_name='lead_source_id'
  ) then
    raise exception 'policies.lead_source_id was not created';
  end if;
end $$;
