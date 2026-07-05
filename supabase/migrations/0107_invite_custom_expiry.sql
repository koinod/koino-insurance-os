-- 0107_invite_custom_expiry.sql
-- Overloads mint_invite function to accept p_expires_at.

-- Drop the old 7-argument signature
drop function if exists public.mint_invite(uuid, text, text, text, text, integer, boolean);

-- Recreate mint_invite with 8 arguments (p_expires_at)
create or replace function public.mint_invite(
  p_agency_id   uuid,
  p_role        text,
  p_email_hint  text,
  p_upline_rep_id text default null,
  p_label       text default null,
  p_max_uses    integer default 1,
  p_perma       boolean default false,
  p_expires_at  timestamptz default null
)
returns text
language plpgsql
security definer
set search_path to 'public','auth'
as $$
declare
  v_token     text;
  v_my_rep    text;
  v_my_role   text;
  v_is_super  boolean := public.is_super_admin();
  v_expires   timestamptz;
begin
  -- Expiry: null = permanent, p_expires_at if provided, otherwise 14 days default
  v_expires := case
    when p_perma then null
    when p_expires_at is not null then p_expires_at
    else now() + interval '14 days'
  end;

  -- Auth checks
  if not v_is_super then
    select rep_id, role into v_my_rep, v_my_role
      from public.agency_members
     where user_id = auth.uid() and agency_id = p_agency_id and active
     order by joined_at asc limit 1;

    if v_my_role is null then
      raise exception 'you are not an active member of this agency';
    end if;

    if v_my_role not in ('owner','admin','imo_owner','manager') then
      raise exception 'role % cannot mint invites', v_my_role;
    end if;

    if v_my_role = 'manager' then
      if p_upline_rep_id is null then p_upline_rep_id := v_my_rep; end if;
      if p_upline_rep_id <> v_my_rep and not exists (
        select 1 from public.downline_of(v_my_rep) d where d.rep_id = p_upline_rep_id
      ) then
        raise exception 'manager can only mint invites within own downline';
      end if;
    end if;
  end if;

  v_token := 'rfi_' || replace(gen_random_uuid()::text, '-', '');

  insert into public.agency_invites
    (token, agency_id, role, email_hint, invited_by, upline_rep_id,
     expires_at, label, max_uses, use_count)
  values
    (v_token, p_agency_id, coalesce(p_role, 'rep'), p_email_hint,
     auth.uid(), p_upline_rep_id,
     v_expires, p_label, coalesce(p_max_uses, 1), 0);

  insert into public.invite_events (token, event, agency_id, actor_uid, payload)
  values (v_token, 'mint', p_agency_id, auth.uid(),
          jsonb_build_object(
            'role', p_role, 'upline', p_upline_rep_id,
            'email_hint', p_email_hint, 'label', p_label,
            'max_uses', p_max_uses, 'perma', p_perma,
            'expires_at', p_expires_at
          ));

  return v_token;
end;
$$;

revoke all on function public.mint_invite(uuid, text, text, text, text, integer, boolean, timestamptz) from public, anon;
grant execute on function public.mint_invite(uuid, text, text, text, text, integer, boolean, timestamptz) to authenticated;
