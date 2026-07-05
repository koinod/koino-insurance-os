-- Drop the old signature
drop function if exists public.connector_upsert_token(text, text, text, text, text, jsonb, text[], timestamptz);

-- Create the function with optional p_user_id parameter for service_role invocation
create or replace function public.connector_upsert_token(
  p_provider text,
  p_account_label text default null,
  p_access_token_enc text default null,
  p_refresh_token_enc text default null,
  p_api_key_enc text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_scopes text[] default '{}'::text[],
  p_expires_at timestamptz default null,
  p_user_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := coalesce(p_user_id, auth.uid());
  v_agency uuid;
  vid uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select agency_id into v_agency from public.agency_members
   where user_id = v_user and active = true
   order by case role when 'super_admin' then 0 when 'admin' then 1 when 'owner' then 2 when 'manager' then 3 when 'rep' then 4 else 9 end
   limit 1;
  if v_agency is null then raise exception 'no agency'; end if;

  insert into public.connector_vault as cv
    (user_id, agency_id, provider, account_label, access_token_enc,
     refresh_token_enc, api_key_enc, account_metadata, scopes, expires_at)
  values
    (v_user, v_agency, p_provider, p_account_label, p_access_token_enc,
     p_refresh_token_enc, p_api_key_enc, coalesce(p_metadata,'{}'::jsonb), coalesce(p_scopes,'{}'::text[]), p_expires_at)
  on conflict (user_id, provider, account_label) do update
    set access_token_enc  = excluded.access_token_enc,
        refresh_token_enc = excluded.refresh_token_enc,
        api_key_enc       = excluded.api_key_enc,
        account_metadata  = excluded.account_metadata,
        scopes            = excluded.scopes,
        expires_at        = excluded.expires_at,
        status            = 'active'
  returning cv.id into vid;
  return vid;
end;
$$;

-- Revoke execute from public/anon/authenticated and grant exclusively to service_role
revoke all on function public.connector_upsert_token(text, text, text, text, text, jsonb, text[], timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.connector_upsert_token(text, text, text, text, text, jsonb, text[], timestamptz, uuid) to service_role;
