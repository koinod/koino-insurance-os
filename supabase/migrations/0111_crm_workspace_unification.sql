-- 0111_crm_workspace_unification.sql
-- CRM workspace foundation. Additive and idempotent because production has
-- timestamped migration history from earlier manual applications.

begin;

-- Clients currently inherit tenancy through pipeline. Keeping explicit
-- ownership makes the unified workspace queryable and enforceable without
-- repeating the same join in every screen.
alter table public.clients add column if not exists agency_id uuid;
alter table public.clients add column if not exists owner_rep_id text references public.reps(id) on delete set null;
alter table public.clients add column if not exists updated_at timestamptz not null default now();

update public.clients c
   set agency_id = p.agency_id,
       owner_rep_id = coalesce(c.owner_rep_id, p.owner_rep_id),
       updated_at = now()
  from public.pipeline p
 where p.id = c.lead_pipeline_id
   and (c.agency_id is null or c.owner_rep_id is null);

create index if not exists clients_agency_owner_idx
  on public.clients (agency_id, owner_rep_id);
create unique index if not exists clients_agency_lead_unique
  on public.clients (agency_id, lead_pipeline_id)
 where agency_id is not null and lead_pipeline_id is not null;

alter table public.clients enable row level security;
drop policy if exists "crm clients read role-aware" on public.clients;
drop policy if exists "crm clients write role-aware" on public.clients;
create policy "crm clients read role-aware" on public.clients
  for select to authenticated
  using (
    public.is_super_admin()
    or agency_id in (select public.viewer_agency_ids())
  );
create policy "crm clients write role-aware" on public.clients
  for all to authenticated
  using (
    public.is_super_admin()
    or agency_id in (select public.viewer_agency_ids())
  )
  with check (
    public.is_super_admin()
    or agency_id in (select public.viewer_agency_ids())
  );

-- Durable per-account workspace preferences. Browser storage remains only a
-- responsive cache; this table is the cross-device source of truth.
create table if not exists public.user_workspace_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace text not null,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, workspace)
);
alter table public.user_workspace_preferences enable row level security;
drop policy if exists "workspace preferences own" on public.user_workspace_preferences;
create policy "workspace preferences own" on public.user_workspace_preferences
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- One joined read surface for the new CRM table and record drawer.
create or replace view public.v_crm_workspace_ledger
with (security_invoker = true)
as
select
  p.id as policy_id,
  p.agency_id,
  p.lead_pipeline_id,
  p.owner_rep_id,
  p.carrier_id,
  p.product_text,
  p.policy_number,
  p.status as policy_status,
  p.ap_cents,
  p.expected_commission_cents,
  l.lead_name,
  l.stage as lead_stage,
  l.phone as lead_phone,
  l.email as lead_email,
  c.id as client_id,
  c.full_name as client_name,
  coalesce(pa.paid_comp_cents, 0)::bigint as paid_comp_cents
from public.policies p
left join public.pipeline l on l.id = p.lead_pipeline_id
left join public.clients c on c.lead_pipeline_id = p.lead_pipeline_id
left join (
  select da.policy_id, sum(da.amount_cents)::bigint as paid_comp_cents
  from public.deposit_allocations da
  group by da.policy_id
) pa on pa.policy_id = p.id;

-- Atomic deal write: lead, client, policy, and stage advance commit together.
create or replace function public.crm_write_deal(p_payload jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_catalog
as $$
declare
  v_agency uuid := nullif(p_payload->>'agency_id', '')::uuid;
  v_lead_id uuid := nullif(p_payload->>'lead_pipeline_id', '')::uuid;
  v_policy_id uuid := nullif(p_payload->>'policy_id', '')::uuid;
  v_owner text;
  v_rep text;
  v_role text;
  v_stage text := coalesce(nullif(p_payload->>'stage', ''), 'New');
  v_status text := coalesce(nullif(p_payload->>'status', ''), 'pending');
begin
  if v_agency is null or not (v_agency = any(public.viewer_agency_ids())) then
    raise exception 'CRM agency is not available to this account' using errcode = '42501';
  end if;

  select m.role, m.rep_id into v_role, v_rep
    from public.agency_members m
   where m.agency_id = v_agency and m.user_id = auth.uid() and m.active = true
   limit 1;
  if public.is_super_admin() then v_role := 'super_admin'; end if;
  if v_role is null then raise exception 'CRM account is not an active agency member' using errcode = '42501'; end if;

  v_owner := coalesce(nullif(p_payload->>'owner_rep_id', ''), v_rep);
  if v_role = 'rep' and v_owner <> v_rep then
    raise exception 'Reps can only write their own deals' using errcode = '42501';
  end if;
  if v_role = 'manager' and v_owner <> v_rep and not exists (
    select 1 from public.downline_of(v_rep) d where d.rep_id = v_owner
  ) then
    raise exception 'Managers can only write deals for their downline' using errcode = '42501';
  end if;

  v_stage := case lower(v_stage)
    when 'app_in' then 'App In' when 'app in' then 'App In'
    when 'contacted' then 'Contacted' when 'quoted' then 'Quoted'
    when 'issued' then 'Issued' when 'lost' then 'Lost' else 'New' end;
  v_status := case lower(v_status)
    when 'app in' then 'app_in' when 'submitted' then 'pending'
    when 'issued' then 'issued' when 'active' then 'active'
    when 'lapsed' then 'lapsed' when 'cancelled' then 'cancelled'
    when 'rescinded' then 'rescinded' else 'pending' end;

  if v_lead_id is null then
    insert into public.pipeline (
      agency_id, lead_name, age, state, stage, product, ap_cents,
      days_in_stage, last_activity_text, next_action, source, owner_rep_id,
      consent, heat, phone, email
    ) values (
      v_agency, coalesce(nullif(trim(p_payload->>'lead_name'), ''), 'New lead'),
      nullif(p_payload->>'age', '')::integer,
      nullif(p_payload->>'state', ''), v_stage,
      nullif(p_payload->>'product', ''), coalesce((p_payload->>'ap_cents')::bigint, 0),
      0, 'Deal written', nullif(p_payload->>'next_action', ''),
      coalesce(nullif(p_payload->>'source', ''), 'Manual'), v_owner,
      coalesce(nullif(p_payload->>'consent', ''), 'unknown'),
      coalesce(nullif(p_payload->>'heat', ''), 'warm'),
      nullif(p_payload->>'phone', ''), nullif(p_payload->>'email', '')
    ) returning id into v_lead_id;
  else
    update public.pipeline
       set lead_name = coalesce(nullif(trim(p_payload->>'lead_name'), ''), lead_name),
           state = coalesce(nullif(p_payload->>'state', ''), state),
           product = coalesce(nullif(p_payload->>'product', ''), product),
           owner_rep_id = v_owner,
           phone = coalesce(nullif(p_payload->>'phone', ''), phone),
           email = coalesce(nullif(p_payload->>'email', ''), email),
           updated_at = now()
     where id = v_lead_id and agency_id = v_agency;
    if not found then raise exception 'Lead not found in this agency' using errcode = 'P0002'; end if;
  end if;

  insert into public.clients (agency_id, owner_rep_id, full_name, contact_phone, contact_email, lead_pipeline_id, relationship)
  values (v_agency, v_owner, coalesce(nullif(trim(p_payload->>'lead_name'), ''), 'Client'), nullif(p_payload->>'phone', ''), nullif(p_payload->>'email', ''), v_lead_id, 'primary')
  on conflict (agency_id, lead_pipeline_id) where agency_id is not null and lead_pipeline_id is not null
  do update set owner_rep_id = excluded.owner_rep_id, contact_phone = coalesce(excluded.contact_phone, clients.contact_phone), contact_email = coalesce(excluded.contact_email, clients.contact_email), updated_at = now();

  if v_policy_id is null and (p_payload ? 'carrier_id') then
    insert into public.policies (
      agency_id, lead_pipeline_id, carrier_id, product_id, policy_number,
      product_text, ap_cents, expected_commission_cents, comp_rate_pct,
      status, owner_rep_id, state, submission_date
    ) values (
      v_agency, v_lead_id, nullif(p_payload->>'carrier_id', ''), nullif(p_payload->>'product_id', '')::uuid,
      nullif(p_payload->>'policy_number', ''), nullif(p_payload->>'product', ''),
      coalesce((p_payload->>'ap_cents')::bigint, 0), nullif(p_payload->>'expected_commission_cents', '')::bigint,
      nullif(p_payload->>'comp_rate_pct', '')::numeric, v_status, v_owner, nullif(p_payload->>'state', ''), current_date
    ) returning id into v_policy_id;
  elsif v_policy_id is not null then
    update public.policies set status = v_status, owner_rep_id = v_owner, updated_at = now()
     where id = v_policy_id and agency_id = v_agency;
  end if;

  update public.pipeline set stage = case when v_status in ('issued','active') then 'Issued' else v_stage end, updated_at = now()
   where id = v_lead_id and agency_id = v_agency;

  return jsonb_build_object('lead_pipeline_id', v_lead_id, 'client_id', (select id from public.clients where agency_id = v_agency and lead_pipeline_id = v_lead_id limit 1), 'policy_id', v_policy_id);
end;
$$;
revoke all on function public.crm_write_deal(jsonb) from public, anon;
grant execute on function public.crm_write_deal(jsonb) to authenticated;

-- Atomic deposit + allocation replacement. A deposit may remain explicitly
-- unallocated; it cannot be over-allocated or attached to another carrier.
create or replace function public.crm_save_deposit(p_payload jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_catalog
as $$
declare
  v_agency uuid := nullif(p_payload->>'agency_id', '')::uuid;
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_role text;
  v_gross bigint := greatest(coalesce((p_payload->>'gross_cents')::bigint, 0), 0);
  v_alloc bigint := 0;
  v_item jsonb;
  v_policy public.policies%rowtype;
begin
  select role into v_role from public.agency_members where agency_id = v_agency and user_id = auth.uid() and active = true limit 1;
  if public.is_super_admin() then v_role := 'super_admin'; end if;
  if v_agency is null or v_role not in ('manager','owner','admin','imo_owner','super_admin') then raise exception 'Only managers can reconcile deposits' using errcode = '42501'; end if;
  if v_id is null then
    insert into public.carrier_deposits (agency_id, carrier_id, rep_id, deposit_date, gross_cents, statement_ref, notes, created_by)
    values (v_agency, nullif(p_payload->>'carrier_id', ''), nullif(p_payload->>'rep_id', ''), coalesce(nullif(p_payload->>'deposit_date', '')::date, current_date), v_gross, nullif(p_payload->>'statement_ref', ''), nullif(p_payload->>'notes', ''), auth.uid()) returning id into v_id;
  else
    update public.carrier_deposits set carrier_id = nullif(p_payload->>'carrier_id', ''), rep_id = nullif(p_payload->>'rep_id', ''), deposit_date = coalesce(nullif(p_payload->>'deposit_date', '')::date, deposit_date), gross_cents = v_gross, statement_ref = nullif(p_payload->>'statement_ref', ''), notes = nullif(p_payload->>'notes', ''), updated_at = now() where id = v_id and agency_id = v_agency;
    if not found then raise exception 'Deposit not found in this agency' using errcode = 'P0002'; end if;
    delete from public.deposit_allocations where deposit_id = v_id;
  end if;
  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'allocations', '[]'::jsonb)) loop
    if nullif(v_item->>'policy_id', '') is not null then
      select * into v_policy from public.policies where id = (v_item->>'policy_id')::uuid and agency_id = v_agency;
      if not found then raise exception 'Allocation policy is outside this agency' using errcode = '42501'; end if;
      if v_policy.carrier_id <> nullif(p_payload->>'carrier_id', '') then raise exception 'Allocation carrier does not match deposit carrier' using errcode = '22023'; end if;
    end if;
    v_alloc := v_alloc + greatest(coalesce((v_item->>'amount_cents')::bigint, 0), 0);
    insert into public.deposit_allocations (deposit_id, agency_id, policy_id, rep_id, kind, amount_cents, notes)
    values (v_id, v_agency, nullif(v_item->>'policy_id', '')::uuid, nullif(v_item->>'rep_id', ''), coalesce(nullif(v_item->>'kind', ''), 'other'), greatest(coalesce((v_item->>'amount_cents')::bigint, 0), 0), nullif(v_item->>'notes', ''));
  end loop;
  if v_alloc > v_gross then raise exception 'Deposit allocations exceed gross deposit' using errcode = '22023'; end if;
  return jsonb_build_object('id', v_id, 'gross_cents', v_gross, 'allocated_cents', v_alloc, 'unallocated_cents', v_gross - v_alloc);
end;
$$;
revoke all on function public.crm_save_deposit(jsonb) from public, anon;
grant execute on function public.crm_save_deposit(jsonb) to authenticated;

-- One canonical expense write used by CRM and future manager tools.
create or replace function public.crm_save_expense(p_payload jsonb)
returns uuid
language plpgsql volatile security definer set search_path = public, pg_catalog
as $$
declare
  v_agency uuid := nullif(p_payload->>'agency_id', '')::uuid;
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_role text;
  v_rep text;
begin
  select role, rep_id into v_role, v_rep from public.agency_members where agency_id = v_agency and user_id = auth.uid() and active = true limit 1;
  if public.is_super_admin() then v_role := 'super_admin'; end if;
  if v_role is null or v_agency is null or not (v_agency = any(public.viewer_agency_ids())) then raise exception 'Expense agency is not available to this account' using errcode = '42501'; end if;
  if v_role = 'rep' and (coalesce(p_payload->>'paid_by', '') <> 'rep_oop' or nullif(p_payload->>'paid_by_rep_id', '') <> v_rep) then raise exception 'Reps can only log their own out-of-pocket expenses' using errcode = '42501'; end if;
  if v_role = 'manager' and coalesce(p_payload->>'kind', '') not in ('lead_spend','recruiting_ad','marketing','training','meals','travel') then raise exception 'Managers can only log operating expenses' using errcode = '22023'; end if;
  if v_id is null then
    insert into public.agency_expenses (agency_id, kind, amount_cents, description, vendor, paid_at, paid_by, paid_by_rep_id, reimbursable, notes, created_by)
    values (v_agency, coalesce(nullif(p_payload->>'kind', ''), 'other'), greatest(coalesce((p_payload->>'amount_cents')::bigint, 0), 0), nullif(p_payload->>'description', ''), nullif(p_payload->>'vendor', ''), coalesce(nullif(p_payload->>'paid_at', '')::date, current_date), coalesce(nullif(p_payload->>'paid_by', ''), 'agency'), nullif(p_payload->>'paid_by_rep_id', ''), coalesce((p_payload->>'reimbursable')::boolean, false), nullif(p_payload->>'notes', ''), auth.uid()) returning id into v_id;
  else
    update public.agency_expenses set kind = coalesce(nullif(p_payload->>'kind', ''), kind), amount_cents = greatest(coalesce((p_payload->>'amount_cents')::bigint, amount_cents), 0), description = nullif(p_payload->>'description', ''), vendor = nullif(p_payload->>'vendor', ''), paid_at = coalesce(nullif(p_payload->>'paid_at', '')::date, paid_at), notes = nullif(p_payload->>'notes', ''), updated_at = now() where id = v_id and agency_id = v_agency;
    if not found then raise exception 'Expense not found in this agency' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end;
$$;
revoke all on function public.crm_save_expense(jsonb) from public, anon;
grant execute on function public.crm_save_expense(jsonb) to authenticated;

commit;
