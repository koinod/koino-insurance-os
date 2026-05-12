-- 0019 Settings backend — four tables the role-audit pass exposed as
-- in-memory placeholders. Closes the SETTINGS_AUDIT_REPORT gaps.
--
--   routing_rules   — agency-scoped lead routing config (Settings → Routing).
--   api_keys        — agency-scoped API keys with prefix lookup + sha256
--                     hash storage so the plain key is never readable after
--                     the create response (Settings → API keys).
--   feature_flags   — global / per-agency / per-user flag overrides
--                     (Settings → Feature flags, super-admin only).
--   audit_log       — append-only event log used by Settings → Audit log.
--                     Inserts come from RLS-trusted triggers + app code; the
--                     table itself is read-only for non-super_admins via RLS.
--
-- All tables get viewer_agency_ids()-scoped RLS so the existing
-- SettingsRouting / SettingsApi / SettingsAuditLog components Just Work
-- against them. feature_flags additionally restricts writes to super_admins
-- (membership.role = 'super_admin') so a regular owner can't flip a global.

------------------------------------------------------------------------------
-- 0. shared helper — viewer_super_admin() (idempotent)
------------------------------------------------------------------------------
create or replace function public.viewer_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.agency_members
     where user_id = auth.uid()
       and role = 'super_admin'
       and active = true
  )
$$;

grant execute on function public.viewer_super_admin() to authenticated;

------------------------------------------------------------------------------
-- 1. routing_rules
------------------------------------------------------------------------------
create table if not exists public.routing_rules (
  id           uuid primary key default gen_random_uuid(),
  agency_id    uuid not null,
  source       text not null,
  route_to     text not null,
  weight       int  not null default 50 check (weight between 0 and 100),
  active       boolean not null default true,
  notes        text,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_routing_rules_agency on public.routing_rules (agency_id, weight desc);

alter table public.routing_rules enable row level security;

drop policy if exists "tenant read routing_rules"   on public.routing_rules;
drop policy if exists "tenant write routing_rules"  on public.routing_rules;

create policy "tenant read routing_rules" on public.routing_rules
  for select to authenticated
  using (agency_id in (select public.viewer_agency_ids()));

create policy "tenant write routing_rules" on public.routing_rules
  for all to authenticated
  using       (agency_id in (select public.viewer_agency_ids()))
  with check  (agency_id in (select public.viewer_agency_ids()));

------------------------------------------------------------------------------
-- 2. api_keys
------------------------------------------------------------------------------
-- We store: a short prefix (first 12 chars of the issued key) so the UI can
-- show "rfk_live_AbCdEf…" without needing the plaintext, plus a sha256 hash
-- of the full key so authentication can verify a presented key without us
-- ever having the plaintext stored. The plaintext is returned exactly once
-- by the issue RPC and never persisted.
create table if not exists public.api_keys (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null,
  label         text not null,
  prefix        text not null,                       -- "rfk_live_AbCdEf"
  key_sha256    text not null,                       -- hex sha256 of plaintext
  scopes        text[] not null default '{leads:read,leads:write,pipeline:read}',
  created_by    uuid,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  expires_at    timestamptz,
  revoked_at    timestamptz,
  unique (prefix)
);

create index if not exists idx_api_keys_agency on public.api_keys (agency_id, created_at desc);
create index if not exists idx_api_keys_active on public.api_keys (agency_id) where revoked_at is null;

alter table public.api_keys enable row level security;

drop policy if exists "tenant read api_keys"  on public.api_keys;
drop policy if exists "tenant write api_keys" on public.api_keys;

create policy "tenant read api_keys" on public.api_keys
  for select to authenticated
  using (agency_id in (select public.viewer_agency_ids()));

create policy "tenant write api_keys" on public.api_keys
  for all to authenticated
  using       (agency_id in (select public.viewer_agency_ids()))
  with check  (agency_id in (select public.viewer_agency_ids()));

-- RPC that mints a new key. Returns the plaintext exactly once.
create or replace function public.api_key_issue(p_label text)
returns table (id uuid, plaintext text, prefix text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agency uuid;
  v_random text;
  v_prefix text;
  v_sha    text;
  v_id     uuid;
begin
  -- Use the same agency_id the rest of the OS uses; bail if the caller has
  -- no membership (RLS would have caught this anyway, but a clean message is
  -- nicer).
  select agency_id into v_agency from public.agency_members
    where user_id = auth.uid() and active = true
    order by case role
      when 'super_admin' then 6 when 'owner' then 5 when 'imo_owner' then 4
      when 'admin' then 3 when 'manager' then 2 else 1
    end desc
    limit 1;
  if v_agency is null then
    raise exception 'no agency membership for api_key_issue';
  end if;

  v_random  := encode(gen_random_bytes(24), 'base64');
  v_random  := replace(replace(replace(v_random, '+', ''), '/', ''), '=', '');
  v_random  := 'rfk_live_' || substring(v_random for 32);
  v_prefix  := substring(v_random for 16);
  v_sha     := encode(digest(v_random, 'sha256'), 'hex');

  insert into public.api_keys (agency_id, label, prefix, key_sha256, created_by)
       values (v_agency, p_label, v_prefix, v_sha, auth.uid())
       returning api_keys.id into v_id;

  return query select v_id, v_random, v_prefix;
end;
$$;

grant execute on function public.api_key_issue(text) to authenticated;

-- RPC that revokes a key. Idempotent.
create or replace function public.api_key_revoke(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.api_keys
     set revoked_at = coalesce(revoked_at, now())
   where id = p_id
     and agency_id in (select public.viewer_agency_ids());
$$;

grant execute on function public.api_key_revoke(uuid) to authenticated;

------------------------------------------------------------------------------
-- 3. feature_flags
------------------------------------------------------------------------------
create table if not exists public.feature_flags (
  key          text primary key,
  enabled      boolean not null default false,
  scope        text not null default 'global'
               check (scope in ('global','agency','user')),
  description  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.feature_flag_overrides (
  key          text not null references public.feature_flags(key) on delete cascade,
  agency_id    uuid,
  user_id      uuid,
  enabled      boolean not null,
  updated_at   timestamptz not null default now(),
  primary key (key, coalesce(agency_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid))
);

alter table public.feature_flags          enable row level security;
alter table public.feature_flag_overrides enable row level security;

-- Anyone authenticated can read flag definitions (so the app knows what's on).
drop policy if exists "auth read feature_flags" on public.feature_flags;
create policy "auth read feature_flags" on public.feature_flags
  for select to authenticated using (true);

-- Only super-admins write to feature_flags. Owners read; never write.
drop policy if exists "super write feature_flags" on public.feature_flags;
create policy "super write feature_flags" on public.feature_flags
  for all to authenticated
  using       (public.viewer_super_admin())
  with check  (public.viewer_super_admin());

-- Overrides: agency-scoped overrides readable by that agency; user
-- overrides readable by that user; super-admin sees everything and writes.
drop policy if exists "tenant read overrides"  on public.feature_flag_overrides;
drop policy if exists "super write overrides"  on public.feature_flag_overrides;

create policy "tenant read overrides" on public.feature_flag_overrides
  for select to authenticated
  using (
    public.viewer_super_admin()
    or (agency_id is not null and agency_id in (select public.viewer_agency_ids()))
    or (user_id   is not null and user_id   = auth.uid())
  );

create policy "super write overrides" on public.feature_flag_overrides
  for all to authenticated
  using       (public.viewer_super_admin())
  with check  (public.viewer_super_admin());

------------------------------------------------------------------------------
-- 4. audit_log
------------------------------------------------------------------------------
create table if not exists public.audit_log (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid,                                -- nullable for platform-level events
  actor_id      uuid,                                -- auth.uid() at insert time
  action        text not null,                       -- "lead.assigned", "policy.issued", ...
  target_table  text,
  target_id     text,                                -- text not uuid: some targets are ints
  payload       jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists idx_audit_log_agency on public.audit_log (agency_id, created_at desc);
create index if not exists idx_audit_log_actor  on public.audit_log (actor_id,  created_at desc);
create index if not exists idx_audit_log_action on public.audit_log (action,    created_at desc);

alter table public.audit_log enable row level security;

drop policy if exists "tenant read audit_log"  on public.audit_log;
drop policy if exists "auth insert audit_log"  on public.audit_log;
drop policy if exists "super delete audit_log" on public.audit_log;

-- Reads: super-admin sees all; tenants see their own agency rows; user sees
-- rows where they were the actor (so a rep can see their own activity).
create policy "tenant read audit_log" on public.audit_log
  for select to authenticated
  using (
    public.viewer_super_admin()
    or (agency_id is not null and agency_id in (select public.viewer_agency_ids()))
    or actor_id = auth.uid()
  );

-- Writes: any authenticated user can insert *as themselves into their own
-- agency*. Application code is responsible for setting action/payload
-- correctly; RLS only enforces the scope.
create policy "auth insert audit_log" on public.audit_log
  for insert to authenticated
  with check (
    (agency_id is null or agency_id in (select public.viewer_agency_ids()))
    and (actor_id is null or actor_id = auth.uid())
  );

-- Deletes: super-admin only. Audit log is append-only by design.
create policy "super delete audit_log" on public.audit_log
  for delete to authenticated
  using (public.viewer_super_admin());

------------------------------------------------------------------------------
-- 5. Convenience RPC: append an audit row from the client
------------------------------------------------------------------------------
create or replace function public.audit_log_append(
  p_action text,
  p_target_table text default null,
  p_target_id    text default null,
  p_payload      jsonb default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agency uuid;
  v_id     uuid;
begin
  select agency_id into v_agency from public.agency_members
    where user_id = auth.uid() and active = true
    order by case role
      when 'super_admin' then 6 when 'owner' then 5 when 'imo_owner' then 4
      when 'admin' then 3 when 'manager' then 2 else 1
    end desc
    limit 1;

  insert into public.audit_log (agency_id, actor_id, action, target_table, target_id, payload)
       values (v_agency, auth.uid(), p_action, p_target_table, p_target_id, p_payload)
       returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.audit_log_append(text, text, text, jsonb) to authenticated;
