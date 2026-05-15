-- ─────────────────────────────────────────────────────────────────────────
-- 0030 Role-Based Agents (RBA) — install spine, command channel, vault
-- ─────────────────────────────────────────────────────────────────────────
--
-- Backs PRD_ROLE_BASED_AGENTS.md. Reconciles the two parallel rba_installs
-- shapes that were drifting in api/agent/_lib.js (device_id/agent_token)
-- and page-extras.jsx (agency_id, agent_key) — picks the _lib.js shape
-- because the API + install.sh already implement against it.
--
-- Tables created:
--   rba_installs           — one row per (user, device); holds agent_token
--   rba_install_tokens     — short-lived (5min) one-shot install tokens
--   rba_audit              — every tool call agent makes
--   rba_commands           — server→agent inbound channel (probe, refresh, command)
--   rba_diagnostics        — uploaded diagnostic bundles (super_admin pull)
--   connector_vault        — per-user 3rd-party tokens (Twilio, SendBlue, Fathom, …)
--   connector_health       — per-user-per-provider live status
--   rba_action_confirmations — pending high-risk actions awaiting human OK
--
-- RPCs:
--   rba_issue_install_token, rba_redeem_install_token, rba_revoke_install,
--   rba_post_command, rba_claim_command, rba_complete_command,
--   rba_request_confirmation, rba_resolve_confirmation,
--   connector_upsert_token, connector_health_set
--
-- RLS: rep sees own; manager sees downline; owner sees agency;
-- super_admin sees all. Service role bypasses all (used by /api/agent/*).
--
-- SHAPE NOT DATA: no INSERTs of business state.

set local search_path = public;

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 1 · INSTALL SPINE                                                    ║
-- ╚══════════════════════════════════════════════════════════════════════╝

create table if not exists public.rba_installs (
  device_id        uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  agency_id        uuid not null references public.agencies(id) on delete cascade,
  role             text not null check (role in ('rep','manager','owner','admin','super_admin')),
  hostname         text,
  os               text,                  -- macos | linux | windows | docker
  cpu              text,
  ram_gb           int,
  version          text,                  -- agent semver (e.g. 0.1.0)
  models_local     text[] default '{}'::text[],
  agent_token      text not null unique,  -- 32 bytes hex; opaque bearer
  status           text not null default 'active'
                   check (status in ('active','degraded','revoked','quarantined')),
  capability_version int not null default 1,  -- bump → forces caps refresh on next call
  installed_at     timestamptz not null default now(),
  last_seen_at     timestamptz,
  revoked_at       timestamptz,
  revoked_by       uuid references auth.users(id),
  notes            text
);

create index if not exists rba_installs_user_idx     on public.rba_installs (user_id);
create index if not exists rba_installs_agency_idx   on public.rba_installs (agency_id, status);
create index if not exists rba_installs_lastseen_idx on public.rba_installs (last_seen_at desc);

create table if not exists public.rba_install_tokens (
  token              text primary key,
  user_id            uuid not null references auth.users(id) on delete cascade,
  agency_id          uuid not null references public.agencies(id) on delete cascade,
  role               text not null,
  expires_at         timestamptz not null,
  redeemed_at        timestamptz,
  redeemed_device_id uuid references public.rba_installs(device_id) on delete set null,
  created_at         timestamptz not null default now()
);
create index if not exists rba_install_tokens_user_idx on public.rba_install_tokens (user_id, redeemed_at);

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 2 · AUDIT (every tool call the agent makes)                          ║
-- ╚══════════════════════════════════════════════════════════════════════╝

create table if not exists public.rba_audit (
  id          bigserial primary key,
  device_id   uuid not null references public.rba_installs(device_id) on delete cascade,
  user_id     uuid not null,
  agency_id   uuid not null,
  tool        text not null,                                  -- 'twilio_dial', 'auto_quote', etc.
  args_hash   text,                                           -- sha256 of canonicalized args; no PII
  result      text not null check (result in ('ok','denied','error')),
  detail      text,                                           -- ≤ 1000 chars; sanitized
  duration_ms int,
  created_at  timestamptz not null default now()
);
create index if not exists rba_audit_device_time_idx  on public.rba_audit (device_id, created_at desc);
create index if not exists rba_audit_agency_time_idx on public.rba_audit (agency_id, created_at desc);
create index if not exists rba_audit_tool_idx        on public.rba_audit (tool, created_at desc);

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 3 · COMMANDS (server → agent inbound channel)                        ║
-- ╚══════════════════════════════════════════════════════════════════════╝
--
-- Web UI / cron / admin posts a command targeted at one device.
-- Agent polls (or realtime-subscribes) rba_commands for status='queued'
-- bound to its device_id, claims it atomically, executes, posts result.
-- Allowed kinds are an enum so we never accept arbitrary shell.

create table if not exists public.rba_commands (
  id            uuid primary key default gen_random_uuid(),
  device_id     uuid not null references public.rba_installs(device_id) on delete cascade,
  agency_id     uuid not null,
  posted_by     uuid references auth.users(id) on delete set null,
  kind          text not null check (kind in (
    -- platform commands
    'ping','caps_refresh','models_list','clear_workspace','quarantine',
    -- tool invocations
    'auto_quote','twilio_dial','sendblue_send','draft_email','draft_sms',
    'fathom_pull_notes','linkedin_send','linkedin_inbox_scan',
    'fb_pull_lead_forms','ig_dm_reply','meta_dm_send',
    'browser_run','script_review','file_review',
    -- automations (recurring/scheduled)
    'post_call_followup','pre_appt_reminder','session_refresh','health_probe'
  )),
  payload       jsonb not null default '{}'::jsonb,
  status        text not null default 'queued'
                check (status in ('queued','claimed','running','succeeded','failed','expired')),
  claimed_at    timestamptz,
  started_at    timestamptz,
  completed_at  timestamptz,
  result        jsonb,
  error         text,
  expires_at    timestamptz not null default (now() + interval '15 minutes'),
  created_at    timestamptz not null default now()
);
create index if not exists rba_commands_queue_idx
  on public.rba_commands (device_id, status, created_at)
  where status = 'queued';
create index if not exists rba_commands_agency_idx
  on public.rba_commands (agency_id, created_at desc);

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 4 · DIAGNOSTICS (super_admin-pulled bundles)                         ║
-- ╚══════════════════════════════════════════════════════════════════════╝

create table if not exists public.rba_diagnostics (
  id              uuid primary key default gen_random_uuid(),
  device_id       uuid not null references public.rba_installs(device_id) on delete cascade,
  agency_id       uuid not null,
  requested_by    uuid not null references auth.users(id),
  user_consented  boolean,
  bundle          jsonb,                                       -- install.log tail, caps cache, rate counters, recent audit
  size_bytes      int,
  requested_at    timestamptz not null default now(),
  uploaded_at     timestamptz,
  expires_at      timestamptz not null default (now() + interval '14 days')
);
create index if not exists rba_diag_device_idx on public.rba_diagnostics (device_id, requested_at desc);

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 5 · CONNECTOR VAULT (per-user 3rd-party tokens)                      ║
-- ╚══════════════════════════════════════════════════════════════════════╝
--
-- One row per (user_id, provider). Token columns are encrypted at rest by
-- Supabase (column encryption via pgsodium). For now we store base64'd
-- ciphertext and let the application layer decrypt — wiring pgsodium in a
-- follow-on migration; service role owns the key.

create table if not exists public.connector_vault (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  agency_id           uuid not null references public.agencies(id) on delete cascade,
  provider            text not null check (provider in (
    'twilio','sendblue','fathom','gmail','outlook','linkedin','sales_nav',
    'fb_ads','ig_business','meta_dm','calendly','stripe','bluetooth_phone',
    'phantombuster','apollo','zoominfo','clay','custom'
  )),
  account_label       text,                                    -- e.g. "main twilio", "personal LI"
  access_token_enc    text,
  refresh_token_enc   text,
  api_key_enc         text,
  account_metadata    jsonb default '{}'::jsonb,               -- { sid, phone_numbers[], ad_accounts[] }
  scopes              text[],
  expires_at          timestamptz,
  status              text not null default 'active'
                      check (status in ('active','expired','revoked','needs_reauth')),
  connected_at        timestamptz not null default now(),
  last_used_at        timestamptz,
  unique (user_id, provider, account_label)
);
create index if not exists connector_vault_user_idx     on public.connector_vault (user_id, status);
create index if not exists connector_vault_provider_idx on public.connector_vault (provider, status);

create table if not exists public.connector_health (
  id              uuid primary key default gen_random_uuid(),
  vault_id        uuid not null references public.connector_vault(id) on delete cascade,
  user_id         uuid not null,
  provider        text not null,
  probe_kind      text not null check (probe_kind in ('nightly','lazy','manual')),
  status          text not null check (status in ('green','yellow','red')),
  detail          text,
  latency_ms      int,
  checked_at      timestamptz not null default now()
);
create index if not exists connector_health_vault_idx on public.connector_health (vault_id, checked_at desc);
create index if not exists connector_health_user_idx  on public.connector_health (user_id, checked_at desc);

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 6 · ACTION CONFIRMATIONS (high-risk / "are you sure?")               ║
-- ╚══════════════════════════════════════════════════════════════════════╝
--
-- For send_real_sms / charge_card / delete_policy / bulk≥10 the agent
-- posts here instead of executing; one of three channels (web modal,
-- OS push, SMS) prompts the user; user resolves; agent proceeds.

create table if not exists public.rba_action_confirmations (
  id              uuid primary key default gen_random_uuid(),
  device_id       uuid not null references public.rba_installs(device_id) on delete cascade,
  user_id         uuid not null,
  agency_id       uuid not null,
  command_id      uuid references public.rba_commands(id) on delete cascade,
  action          text not null,                              -- 'send_real_sms', 'charge_card', etc.
  description     text not null,                              -- human-readable summary
  args_redacted   jsonb not null default '{}'::jsonb,
  channel         text not null check (channel in ('web_modal','os_push','sms','any')),
  channel_status  jsonb default '{}'::jsonb,                  -- { web_seen_at, push_delivered_at, sms_replied }
  resolution      text check (resolution in ('approved','denied','expired')),
  resolved_by     uuid references auth.users(id),
  resolved_at     timestamptz,
  expires_at      timestamptz not null default (now() + interval '5 minutes'),
  created_at      timestamptz not null default now()
);
create index if not exists rba_conf_pending_idx
  on public.rba_action_confirmations (user_id, created_at desc)
  where resolution is null;

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 7 · RPCs                                                             ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- 32-byte hex random helper (used for both install_token and agent_token)
create or replace function public._rba_gen_token() returns text
language sql volatile as $$
  select encode(gen_random_bytes(32), 'hex')
$$;

-- Issue a one-shot install token bound to caller's highest membership.
create or replace function public.rba_issue_install_token(p_role text default null)
returns table (token text, expires_at timestamptz, role text, agency_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_agency uuid;
  v_role text;
  v_token text;
  v_exp timestamptz := now() + interval '5 minutes';
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  -- Pick caller's highest-priority active membership; admins/owners win
  -- over rep/manager when they have multiple.
  select agency_id, m.role
    into v_agency, v_role
    from public.agency_members m
   where m.user_id = v_user and m.active = true
   order by case m.role
              when 'super_admin' then 0
              when 'admin' then 1
              when 'owner' then 2
              when 'manager' then 3
              when 'rep' then 4
              else 9
            end
   limit 1;

  if v_agency is null then raise exception 'no active membership'; end if;

  -- Caller may downgrade (request rep token even if they're owner).
  if p_role is not null and p_role <> v_role then
    if (case v_role
          when 'super_admin' then 0 when 'admin' then 1 when 'owner' then 2
          when 'manager' then 3 when 'rep' then 4 end)
       > (case p_role
          when 'super_admin' then 0 when 'admin' then 1 when 'owner' then 2
          when 'manager' then 3 when 'rep' then 4 end)
    then raise exception 'cannot upgrade role beyond own (you are %, requested %)', v_role, p_role;
    end if;
    v_role := p_role;
  end if;

  v_token := public._rba_gen_token();
  insert into public.rba_install_tokens (token, user_id, agency_id, role, expires_at)
  values (v_token, v_user, v_agency, v_role, v_exp);

  return query select v_token, v_exp, v_role, v_agency;
end;
$$;
grant execute on function public.rba_issue_install_token(text) to authenticated;

-- Anon-callable: redeem install token, create install row + agent_token.
create or replace function public.rba_redeem_install_token(
  p_token    text,
  p_hostname text default null,
  p_os       text default null,
  p_cpu      text default null,
  p_ram_gb   int  default null,
  p_version  text default null,
  p_models   text[] default '{}'::text[]
) returns table (device_id uuid, agent_token text, agency_id uuid, role text)
language plpgsql security definer set search_path = public as $$
declare
  t public.rba_install_tokens%rowtype;
  v_device uuid;
  v_token text;
begin
  select * into t from public.rba_install_tokens where token = p_token;
  if not found then raise exception 'token not found'; end if;
  if t.redeemed_at is not null then raise exception 'token already redeemed'; end if;
  if t.expires_at < now() then raise exception 'token expired'; end if;

  v_token := public._rba_gen_token();
  insert into public.rba_installs
    (user_id, agency_id, role, hostname, os, cpu, ram_gb, version, models_local, agent_token)
  values
    (t.user_id, t.agency_id, t.role, p_hostname, p_os, p_cpu, p_ram_gb, p_version, p_models, v_token)
  returning rba_installs.device_id into v_device;

  update public.rba_install_tokens
     set redeemed_at = now(), redeemed_device_id = v_device
   where token = p_token;

  return query select v_device, v_token, t.agency_id, t.role;
end;
$$;
grant execute on function public.rba_redeem_install_token(text, text, text, text, int, text, text[]) to anon, authenticated;

-- Owner+ revokes a device. Self-revoke also allowed.
create or replace function public.rba_revoke_install(p_device_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  d public.rba_installs%rowtype;
begin
  select * into d from public.rba_installs where device_id = p_device_id;
  if not found then return false; end if;

  if not (
    d.user_id = auth.uid()
    OR public.is_super_admin()
    OR exists (
      select 1 from public.agency_members
       where user_id = auth.uid() and agency_id = d.agency_id
         and role in ('owner','admin') and active = true
    )
  ) then
    raise exception 'not authorized to revoke this device';
  end if;

  update public.rba_installs
     set status = 'revoked', revoked_at = now(), revoked_by = auth.uid()
   where device_id = p_device_id;

  -- Cancel any queued commands targeted at this device
  update public.rba_commands
     set status = 'expired', error = 'device revoked'
   where device_id = p_device_id and status in ('queued','claimed','running');

  return true;
end;
$$;
grant execute on function public.rba_revoke_install(uuid) to authenticated;

-- Post a command targeted at one device. Only callable by the device's
-- own user, manager-of-rep, owner/admin, super_admin.
create or replace function public.rba_post_command(
  p_device_id uuid,
  p_kind      text,
  p_payload   jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  d public.rba_installs%rowtype;
  cid uuid;
begin
  select * into d from public.rba_installs where device_id = p_device_id;
  if not found then raise exception 'device not found'; end if;
  if d.status <> 'active' and not (d.status = 'quarantined' and p_kind in ('ping','caps_refresh')) then
    raise exception 'device not active (status=%)', d.status;
  end if;

  if not (
    d.user_id = auth.uid()
    OR public.is_super_admin()
    OR exists (
      select 1 from public.agency_members
       where user_id = auth.uid() and agency_id = d.agency_id
         and role in ('owner','admin','manager') and active = true
    )
  ) then
    raise exception 'not authorized to command this device';
  end if;

  insert into public.rba_commands (device_id, agency_id, posted_by, kind, payload)
  values (p_device_id, d.agency_id, auth.uid(), p_kind, coalesce(p_payload, '{}'::jsonb))
  returning id into cid;
  return cid;
end;
$$;
grant execute on function public.rba_post_command(uuid, text, jsonb) to authenticated;

-- Atomically claim the next queued command for a device. Called by agent
-- with x-agent-token (resolved to device_id by api/agent layer, then
-- service role calls this RPC).
create or replace function public.rba_claim_command(p_device_id uuid)
returns table (id uuid, kind text, payload jsonb)
language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
begin
  with picked as (
    select c.id from public.rba_commands c
     where c.device_id = p_device_id
       and c.status = 'queued'
       and c.expires_at > now()
     order by c.created_at
     limit 1
     for update skip locked
  )
  update public.rba_commands c
     set status = 'claimed', claimed_at = now()
    from picked
   where c.id = picked.id
   returning c.id into cid;

  if cid is null then
    -- Mark expired any past-due queued commands so they don't pile up.
    update public.rba_commands
       set status = 'expired', error = 'expires_at passed before claim'
     where device_id = p_device_id and status = 'queued' and expires_at <= now();
    return;
  end if;

  return query
    select c.id, c.kind, c.payload from public.rba_commands c where c.id = cid;
end;
$$;
grant execute on function public.rba_claim_command(uuid) to service_role;

-- Mark a command done. Agent posts result via /api/agent/command-complete.
create or replace function public.rba_complete_command(
  p_command_id uuid,
  p_status     text,
  p_result     jsonb default null,
  p_error      text  default null
) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('succeeded','failed') then
    raise exception 'status must be succeeded or failed';
  end if;
  update public.rba_commands
     set status = p_status, completed_at = now(), result = p_result, error = p_error
   where id = p_command_id and status in ('claimed','running');
  return found;
end;
$$;
grant execute on function public.rba_complete_command(uuid, text, jsonb, text) to service_role;

-- High-risk action confirmation request.
create or replace function public.rba_request_confirmation(
  p_device_id  uuid,
  p_command_id uuid,
  p_action     text,
  p_description text,
  p_args_redacted jsonb default '{}'::jsonb,
  p_channel    text default 'any'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  d public.rba_installs%rowtype;
  cid uuid;
begin
  select * into d from public.rba_installs where device_id = p_device_id;
  if not found then raise exception 'device not found'; end if;
  insert into public.rba_action_confirmations
    (device_id, user_id, agency_id, command_id, action, description, args_redacted, channel)
  values
    (p_device_id, d.user_id, d.agency_id, p_command_id, p_action, p_description, coalesce(p_args_redacted,'{}'::jsonb), p_channel)
  returning id into cid;
  return cid;
end;
$$;
grant execute on function public.rba_request_confirmation(uuid, uuid, text, text, jsonb, text) to service_role;

-- User responds to a pending confirmation.
create or replace function public.rba_resolve_confirmation(
  p_confirmation_id uuid,
  p_resolution      text
) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if p_resolution not in ('approved','denied') then raise exception 'bad resolution'; end if;
  update public.rba_action_confirmations
     set resolution = p_resolution, resolved_by = auth.uid(), resolved_at = now()
   where id = p_confirmation_id
     and resolution is null
     and (user_id = auth.uid() or public.is_super_admin());
  return found;
end;
$$;
grant execute on function public.rba_resolve_confirmation(uuid, text) to authenticated;

-- Connector vault upsert (encrypted token write). Called from web OAuth callback.
create or replace function public.connector_upsert_token(
  p_provider text,
  p_account_label text default null,
  p_access_token_enc text default null,
  p_refresh_token_enc text default null,
  p_api_key_enc text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_scopes text[] default '{}'::text[],
  p_expires_at timestamptz default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
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
grant execute on function public.connector_upsert_token(text, text, text, text, text, jsonb, text[], timestamptz) to authenticated;

-- Connector health probe writer (called by service role from cron + lazy probe).
create or replace function public.connector_health_set(
  p_vault_id uuid,
  p_probe    text,
  p_status   text,
  p_detail   text default null,
  p_latency  int default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v public.connector_vault%rowtype;
begin
  select * into v from public.connector_vault where id = p_vault_id;
  if not found then raise exception 'vault row not found'; end if;
  insert into public.connector_health (vault_id, user_id, provider, probe_kind, status, detail, latency_ms)
  values (p_vault_id, v.user_id, v.provider, p_probe, p_status, p_detail, p_latency);
  -- Reflect a red status into vault.status so UI flags it
  if p_status = 'red' then
    update public.connector_vault set status = 'needs_reauth' where id = p_vault_id;
  end if;
end;
$$;
grant execute on function public.connector_health_set(uuid, text, text, text, int) to service_role;

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 8 · RLS                                                              ║
-- ╚══════════════════════════════════════════════════════════════════════╝
--
-- General rule: rep sees own; manager sees downline-of-own-agency;
-- owner/admin sees agency; super_admin sees all. Service role bypasses.

alter table public.rba_installs              enable row level security;
alter table public.rba_install_tokens        enable row level security;
alter table public.rba_audit                 enable row level security;
alter table public.rba_commands              enable row level security;
alter table public.rba_diagnostics           enable row level security;
alter table public.connector_vault           enable row level security;
alter table public.connector_health          enable row level security;
alter table public.rba_action_confirmations  enable row level security;

-- Helper predicate (table-local, inlined): "viewer can see this row's
-- (user_id, agency_id) pair". Encoded inline to dodge another helper fn.

-- rba_installs
drop policy if exists "rba_installs_visible" on public.rba_installs;
create policy "rba_installs_visible" on public.rba_installs for select to authenticated using (
  user_id = auth.uid()
  OR public.is_super_admin()
  OR (agency_id = ANY (public.viewer_agency_ids()) AND exists (
        select 1 from public.agency_members am
         where am.user_id = auth.uid() and am.active = true
           and am.agency_id = rba_installs.agency_id
           and am.role in ('owner','admin','manager')
      ))
);
drop policy if exists "rba_installs_self_update" on public.rba_installs;
create policy "rba_installs_self_update" on public.rba_installs for update to authenticated
  using (user_id = auth.uid() OR public.is_super_admin())
  with check (user_id = auth.uid() OR public.is_super_admin());

-- rba_install_tokens — never directly readable; only via SECURITY DEFINER fn
drop policy if exists "rba_install_tokens_none" on public.rba_install_tokens;
create policy "rba_install_tokens_none" on public.rba_install_tokens for all to authenticated using (false);

-- rba_audit — read scoped same as installs
drop policy if exists "rba_audit_visible" on public.rba_audit;
create policy "rba_audit_visible" on public.rba_audit for select to authenticated using (
  user_id = auth.uid()
  OR public.is_super_admin()
  OR (agency_id = ANY (public.viewer_agency_ids()) AND exists (
        select 1 from public.agency_members am
         where am.user_id = auth.uid() and am.active = true
           and am.agency_id = rba_audit.agency_id
           and am.role in ('owner','admin','manager')
      ))
);

-- rba_commands — visible to everyone who can see the install; writable via RPC only
drop policy if exists "rba_commands_visible" on public.rba_commands;
create policy "rba_commands_visible" on public.rba_commands for select to authenticated using (
  exists (select 1 from public.rba_installs i where i.device_id = rba_commands.device_id
                and (i.user_id = auth.uid() OR public.is_super_admin()
                     OR i.agency_id = ANY (public.viewer_agency_ids())))
);

-- rba_diagnostics — super_admin only
drop policy if exists "rba_diag_super_admin" on public.rba_diagnostics;
create policy "rba_diag_super_admin" on public.rba_diagnostics for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- connector_vault — user sees own only; super_admin sees all (for support)
drop policy if exists "vault_self" on public.connector_vault;
create policy "vault_self" on public.connector_vault for select to authenticated
  using (user_id = auth.uid() OR public.is_super_admin());
drop policy if exists "vault_self_delete" on public.connector_vault;
create policy "vault_self_delete" on public.connector_vault for delete to authenticated
  using (user_id = auth.uid() OR public.is_super_admin());

-- connector_health — same as vault
drop policy if exists "health_self" on public.connector_health;
create policy "health_self" on public.connector_health for select to authenticated
  using (user_id = auth.uid() OR public.is_super_admin());

-- rba_action_confirmations — user resolves own
drop policy if exists "conf_self" on public.rba_action_confirmations;
create policy "conf_self" on public.rba_action_confirmations for select to authenticated
  using (user_id = auth.uid() OR public.is_super_admin());

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 9 · REALTIME                                                         ║
-- ╚══════════════════════════════════════════════════════════════════════╝
--
-- Add the agent-relevant tables to the supabase_realtime publication so the
-- web UI can subscribe to live audit and the agent can subscribe to commands.

do $$ begin
  perform 1 from pg_publication where pubname = 'supabase_realtime';
  if found then
    begin alter publication supabase_realtime add table public.rba_installs; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.rba_audit;    exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.rba_commands; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.rba_action_confirmations; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.connector_health; exception when duplicate_object then null; end;
  end if;
end $$;
