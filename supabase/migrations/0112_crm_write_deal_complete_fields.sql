-- Keep the universal deal form's full record in the atomic CRM write path.
-- The original RPC accepted the core policy fields but silently dropped dates,
-- target premium, and lead-source attribution collected by the UI.
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
      product_text, ap_cents, target_premium_cents, expected_commission_cents,
      comp_rate_pct, submission_date, initial_draft_date, lead_source_id,
      status, owner_rep_id, state
    ) values (
      v_agency, v_lead_id, nullif(p_payload->>'carrier_id', ''), nullif(p_payload->>'product_id', '')::uuid,
      nullif(p_payload->>'policy_number', ''), nullif(p_payload->>'product', ''),
      coalesce((p_payload->>'ap_cents')::bigint, 0), nullif(p_payload->>'target_premium_cents', '')::bigint,
      nullif(p_payload->>'expected_commission_cents', '')::bigint,
      nullif(p_payload->>'comp_rate_pct', '')::numeric,
      nullif(p_payload->>'submission_date', '')::date,
      nullif(p_payload->>'initial_draft_date', '')::date,
      nullif(p_payload->>'lead_source_id', '')::uuid,
      v_status, v_owner, nullif(p_payload->>'state', '')
    ) returning id into v_policy_id;
  elsif v_policy_id is not null then
    update public.policies set
      carrier_id = coalesce(nullif(p_payload->>'carrier_id', '')::uuid, carrier_id),
      product_id = coalesce(nullif(p_payload->>'product_id', '')::uuid, product_id),
      product_text = coalesce(nullif(p_payload->>'product', ''), product_text),
      policy_number = nullif(p_payload->>'policy_number', ''),
      ap_cents = coalesce(nullif(p_payload->>'ap_cents', '')::bigint, ap_cents),
      target_premium_cents = nullif(p_payload->>'target_premium_cents', '')::bigint,
      expected_commission_cents = nullif(p_payload->>'expected_commission_cents', '')::bigint,
      comp_rate_pct = nullif(p_payload->>'comp_rate_pct', '')::numeric,
      submission_date = nullif(p_payload->>'submission_date', '')::date,
      initial_draft_date = nullif(p_payload->>'initial_draft_date', '')::date,
      lead_source_id = nullif(p_payload->>'lead_source_id', '')::uuid,
      status = v_status, owner_rep_id = v_owner,
      state = coalesce(nullif(p_payload->>'state', ''), state), updated_at = now()
     where id = v_policy_id and agency_id = v_agency;
  end if;

  update public.pipeline set stage = case when v_status in ('issued','active') then 'Issued' else v_stage end, updated_at = now()
   where id = v_lead_id and agency_id = v_agency;

  return jsonb_build_object('lead_pipeline_id', v_lead_id, 'client_id', (select id from public.clients where agency_id = v_agency and lead_pipeline_id = v_lead_id limit 1), 'policy_id', v_policy_id);
end;
$$;

revoke all on function public.crm_write_deal(jsonb) from public, anon;
grant execute on function public.crm_write_deal(jsonb) to authenticated;
