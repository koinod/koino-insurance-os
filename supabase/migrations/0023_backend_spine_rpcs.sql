-- 0023 Backend Spine RPCs
--
-- Re-materializes the core RPC logic required for onboarding, inviting,
-- and hardware enrollment. These functions were identified as missing from
-- the local migration history.

------------------------------------------------------------------------------
-- 1. create_agency(p_name, p_slug, p_state)
------------------------------------------------------------------------------
create or replace function public.create_agency(
  p_name text, p_slug text, p_state text
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_agency_id uuid;
begin
  insert into public.agencies (name, slug, primary_state)
  values (p_name, coalesce(p_slug, lower(replace(p_name, ' ', '-'))), p_state)
  returning id into v_agency_id;

  -- Create membership for caller as owner
  insert into public.agency_members (agency_id, user_id, role, active)
  values (v_agency_id, auth.uid(), 'owner', true);

  return v_agency_id;
end;
$$;

------------------------------------------------------------------------------
-- 2. create_agency_for_owner(payload jsonb)
------------------------------------------------------------------------------
create or replace function public.create_agency_for_owner(payload jsonb)
returns uuid
language plpgsql
security definer
as $$
declare
  v_agency_id uuid;
  v_rep_id text;
begin
  -- 1. Create agency
  insert into public.agencies (
    name, slug, website, phone,
    address_line1, address_line2, city, state, zip,
    primary_state, licensed_states,
    brand_primary, brand_dark, logo_url,
    timezone
  ) values (
    payload->>'name',
    payload->>'slug',
    payload->>'website',
    payload->>'phone',
    payload->>'address_line1',
    payload->>'address_line2',
    payload->>'city',
    payload->>'state',
    payload->>'zip',
    payload->>'primary_state',
    (select array_agg(x)::text[] from jsonb_array_elements_text(payload->'licensed_states') x),
    payload->>'brand_primary',
    payload->>'brand_dark',
    payload->>'logo_url',
    payload->>'timezone'
  ) returning id into v_agency_id;

  -- 2. Create membership
  v_rep_id := 'rep-' || substring(replace(auth.uid()::text, '-', '') from 1 for 12);
  insert into public.agency_members (agency_id, user_id, role, rep_id, active)
  values (v_agency_id, auth.uid(), 'owner', v_rep_id, true);

  -- 3. Create reps row
  insert into public.reps (
    id, name, handle, tier, agency_id, user_id, onboarded_at
  ) values (
    v_rep_id,
    coalesce(payload->>'owner_name', 'Agency Owner'),
    '@' || v_rep_id,
    'platinum',
    v_agency_id,
    auth.uid(),
    case when (payload->>'complete')::boolean then now() else null end
  );

  return v_agency_id;
end;
$$;

------------------------------------------------------------------------------
-- 3. update_agency_onboarding(p_agency_id, payload jsonb)
------------------------------------------------------------------------------
create or replace function public.update_agency_onboarding(p_agency_id uuid, payload jsonb)
returns void
language plpgsql
security definer
as $$
begin
  -- Security: check ownership
  if not exists (
    select 1 from public.agency_members
    where agency_id = p_agency_id and user_id = auth.uid() and role in ('owner','admin') and active
  ) then
    raise exception 'forbidden';
  end if;

  update public.agencies set
    name = coalesce(payload->>'name', name),
    slug = coalesce(payload->>'slug', slug),
    website = coalesce(payload->>'website', website),
    phone = coalesce(payload->>'phone', phone),
    address_line1 = coalesce(payload->>'address_line1', address_line1),
    address_line2 = coalesce(payload->>'address_line2', address_line2),
    city = coalesce(payload->>'city', city),
    state = coalesce(payload->>'state', state),
    zip = coalesce(payload->>'zip', zip),
    primary_state = coalesce(payload->>'primary_state', primary_state),
    licensed_states = coalesce((select array_agg(x)::text[] from jsonb_array_elements_text(payload->'licensed_states') x), licensed_states),
    brand_primary = coalesce(payload->>'brand_primary', brand_primary),
    brand_dark = coalesce(payload->>'brand_dark', brand_dark),
    logo_url = coalesce(payload->>'logo_url', logo_url),
    timezone = coalesce(payload->>'timezone', timezone)
  where id = p_agency_id;

  -- Update reps completion
  if (payload->>'complete')::boolean then
    update public.reps set onboarded_at = now()
    where agency_id = p_agency_id and user_id = auth.uid();
  end if;
end;
$$;

------------------------------------------------------------------------------
-- 4. enroll_host(p_token text, p_hostname text, p_kind text)
------------------------------------------------------------------------------
create or replace function public.enroll_host(p_token text, p_hostname text, p_kind text)
returns text
language plpgsql
security definer
as $$
declare
  v_token_row record;
  v_host_id text;
begin
  select * into v_token_row from public.agent_install_tokens where token = p_token;
  if not found then raise exception 'invalid token'; end if;
  if v_token_row.used_at is not null then raise exception 'token already used'; end if;
  if v_token_row.expires_at < now() then raise exception 'token expired'; end if;

  v_host_id := 'host-' || substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8);

  insert into public.hardware (id, name, kind, status, last_heartbeat)
  values (v_host_id, p_hostname, p_kind, 'ok', now());

  update public.agent_install_tokens set
    used_at = now(),
    used_for_id = v_host_id
  where token = p_token;

  return v_host_id;
end;
$$;

------------------------------------------------------------------------------
-- 5. heartbeat_host(p_host_id text, p_load integer)
------------------------------------------------------------------------------
create or replace function public.heartbeat_host(p_host_id text, p_load integer)
returns void
language plpgsql
security definer
as $$
begin
  update public.hardware set
    load_pct = p_load,
    last_heartbeat = now(),
    status = 'ok'
  where id = p_host_id;
end;
$$;

grant execute on function public.create_agency(text, text, text) to authenticated;
grant execute on function public.create_agency_for_owner(jsonb) to authenticated;
grant execute on function public.update_agency_onboarding(uuid, jsonb) to authenticated;
grant execute on function public.enroll_host(text, text, text) to anon, authenticated;
grant execute on function public.heartbeat_host(text, integer) to anon, authenticated;
