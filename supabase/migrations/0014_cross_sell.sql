-- 0014 Cross-sell automation.
--
-- When a pipeline row transitions to stage='Issued', look up matching cross-sell
-- rules and enqueue follow-up "next product" leads with a due_at delay.
-- A daily cron (/api/cron/cross-sell-sweep) materializes due queue rows into
-- new pipeline entries owned by the original closer.
--
-- Pure incremental revenue: customer's CAC is already paid; cross-sell yield
-- is near-100% margin.

------------------------------------------------------------------------------
-- 1. Rules table
------------------------------------------------------------------------------
create table if not exists public.cross_sell_rules (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  name text not null,
  source_product_match text not null,                         -- ILIKE pattern, e.g. 'Med Supp%'
  target_product text not null,                                -- created on the new lead
  delay_days integer not null default 30 check (delay_days >= 0 and delay_days <= 365),
  default_heat text not null default 'warm' check (default_heat in ('fresh','hot','warm','cold')),
  enabled boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cross_sell_rules_agency_idx on public.cross_sell_rules (agency_id);

alter table public.cross_sell_rules enable row level security;
create policy "anon atlas read" on public.cross_sell_rules for select to anon
  using (agency_id::text = 'e0a68c9f-cf48-47b0-bef7-dba3f27db0b9');
create policy "auth read agency" on public.cross_sell_rules for select to authenticated using (true);
create policy "owner write" on public.cross_sell_rules for all to authenticated
  using ((select role from public.me() limit 1) = 'owner')
  with check ((select role from public.me() limit 1) = 'owner');

------------------------------------------------------------------------------
-- 2. Queue table — one row per (issued lead × matching rule)
------------------------------------------------------------------------------
create table if not exists public.cross_sell_queue (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  parent_lead_id uuid not null,                                -- the issued lead that triggered this
  parent_rep_id text references public.reps(id) on delete set null,
  rule_id uuid references public.cross_sell_rules(id) on delete set null,
  target_product text not null,
  due_at timestamptz not null,
  processed_at timestamptz,
  generated_lead_id uuid,                                      -- pipeline.id once materialized
  status text not null default 'pending' check (status in ('pending','processed','skipped','failed')),
  skip_reason text,
  created_at timestamptz not null default now()
);
create index if not exists cross_sell_queue_due_idx on public.cross_sell_queue (status, due_at);
create index if not exists cross_sell_queue_agency_idx on public.cross_sell_queue (agency_id);
create index if not exists cross_sell_queue_parent_idx on public.cross_sell_queue (parent_lead_id);

alter table public.cross_sell_queue enable row level security;
create policy "anon atlas read" on public.cross_sell_queue for select to anon
  using (agency_id::text = 'e0a68c9f-cf48-47b0-bef7-dba3f27db0b9');
create policy "auth read agency" on public.cross_sell_queue for select to authenticated using (true);

------------------------------------------------------------------------------
-- 3. Trigger: when pipeline.stage flips to 'Issued', enqueue cross-sell rows
------------------------------------------------------------------------------
create or replace function public.cross_sell_enqueue_on_issue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if new.stage = 'Issued'
     and (old.stage is null or old.stage <> 'Issued')
     and new.product is not null then
    for r in
      select id, target_product, delay_days, default_heat
        from public.cross_sell_rules
       where agency_id = new.agency_id
         and enabled = true
         and new.product ilike source_product_match
    loop
      -- de-dup: don't enqueue the same (parent, target) twice
      if not exists (
        select 1 from public.cross_sell_queue
         where parent_lead_id = new.id
           and target_product = r.target_product
           and status in ('pending','processed')
      ) then
        insert into public.cross_sell_queue
          (agency_id, parent_lead_id, parent_rep_id, rule_id, target_product, due_at)
        values
          (new.agency_id, new.id, new.owner_rep_id, r.id, r.target_product,
           now() + (r.delay_days || ' days')::interval);
      end if;
    end loop;
  end if;
  return new;
end
$$;

drop trigger if exists pipeline_cross_sell_on_issue on public.pipeline;
create trigger pipeline_cross_sell_on_issue
  after update of stage on public.pipeline
  for each row
  execute function public.cross_sell_enqueue_on_issue();

------------------------------------------------------------------------------
-- 4. Default seed rules (demo agency only — real agencies set their own)
------------------------------------------------------------------------------
insert into public.cross_sell_rules
  (agency_id, name, source_product_match, target_product, delay_days, default_heat, notes)
values
  ('e0a68c9f-cf48-47b0-bef7-dba3f27db0b9'::uuid, 'Med Supp → Final Expense',
   'Med Supp%', 'Final Expense $15K', 30, 'warm',
   'Plan G/N clients are prime FE prospects 30 days post-issue.'),
  ('e0a68c9f-cf48-47b0-bef7-dba3f27db0b9'::uuid, 'Med Supp → Cancer/Hospital',
   'Med Supp%', 'Cancer / Hospital Indemnity', 60, 'warm',
   'Sticky carrier add-on, 60d after Med Supp issued.'),
  ('e0a68c9f-cf48-47b0-bef7-dba3f27db0b9'::uuid, 'Final Expense → Annuity',
   'Final Expense%', 'Annuity Suitability Review', 90, 'warm',
   'Senior FE buyers often have idle CDs/cash for SPDA reviews.'),
  ('e0a68c9f-cf48-47b0-bef7-dba3f27db0b9'::uuid, 'Term Life → IUL Conversion',
   'Term%', 'IUL Conversion Review', 90, 'warm',
   'Term clients with recent issue date are best IUL conversion candidates.'),
  ('e0a68c9f-cf48-47b0-bef7-dba3f27db0b9'::uuid, 'MAPD → Med Supp Switch (AEP)',
   'MAPD%', 'Med Supp Switch (AEP)', 270, 'warm',
   'Re-engage MAPD clients ahead of next AEP for Med Supp switch evaluation.')
on conflict do nothing;

------------------------------------------------------------------------------
-- 5. View for owner/manager dashboard
------------------------------------------------------------------------------
create or replace view public.cross_sell_pending as
select
  q.id,
  q.agency_id,
  q.parent_lead_id,
  q.parent_rep_id,
  p.lead_name as parent_lead_name,
  p.product as parent_product,
  q.target_product,
  q.due_at,
  q.status,
  q.created_at,
  case
    when q.due_at <= now() then 'due'
    when q.due_at <= now() + interval '7 days' then 'soon'
    else 'scheduled'
  end as urgency
from public.cross_sell_queue q
join public.pipeline p on p.id = q.parent_lead_id
where q.status = 'pending';

grant select on public.cross_sell_pending to anon, authenticated;
