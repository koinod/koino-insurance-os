-- 0077_pipeline_lead_source_id.sql
-- Tie lead-vendor attribution to the FRONT of the funnel: tag each pipeline
-- lead with the vendor that produced it, so per-vendor lead/contact counts
-- and lead->deal conversion roll up on the Attribution page (today only
-- written deals carry a vendor via policies.lead_source_id, 0071).
-- SHAPE only — no seed data. Applied to prod via MCP apply_migration.

alter table public.pipeline
  add column if not exists lead_source_id uuid
  references public.agency_lead_sources(id) on delete set null;

create index if not exists idx_pipeline_lead_source_id
  on public.pipeline(lead_source_id) where lead_source_id is not null;

comment on column public.pipeline.lead_source_id is
  'Lead vendor this lead was sourced from (FK -> agency_lead_sources). Set at intake (CSV import / manual add / inbound webhook). Inherited into policies.lead_source_id at deal-write time. NULL = unattributed.';

-- Verify the column landed (fail loudly on partial apply).
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='pipeline' and column_name='lead_source_id'
  ) then
    raise exception 'pipeline.lead_source_id was not created';
  end if;
end $$;
