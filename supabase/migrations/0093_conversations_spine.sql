-- 0075 Conversations spine — channel-agnostic unified inbox.
--
-- One shape for every messaging lane:
--   • leads      → SMS (Twilio / sms_outbox + inbound_messages today)
--   • recruits   → Instagram / Facebook DM (Meta Graph API)
--   • any other  → LinkedIn etc. via the local RBA agent (consent-based session)
--
-- SHAPE ONLY — no seed rows. Each lane writes into these two tables; the
-- inbox UI reads ONE shape instead of unioning sms_outbox / inbound_messages /
-- recruiting_messages / meta tables forever. Webhooks (service role) bypass
-- RLS to write inbound; authenticated members read/act within their agency.

set local search_path = public;

-- ── conversations — one thread per (channel, external party) ───────────────
create table if not exists public.conversations (
  id                 uuid primary key default gen_random_uuid(),
  agency_id          uuid not null references public.agencies(id) on delete cascade,
  channel            text not null
                       check (channel in ('sms','instagram','facebook','linkedin','email','imessage','other')),
  party_kind         text not null default 'lead'
                       check (party_kind in ('lead','recruit','other')),
  -- soft pointer to the lead (pipeline.id) or recruit (recruiting_applicants.id);
  -- no hard FK because the referent table depends on party_kind.
  party_ref          uuid,
  external_thread_id text,                       -- platform thread/convo id (webhook matching)
  external_handle    text,                       -- phone / @ig_handle / li profile urn
  display_name       text,
  owner_rep_id       text references public.reps(id) on delete set null,
  status             text not null default 'open'
                       check (status in ('open','snoozed','closed')),
  unread             boolean not null default false,
  last_message_at    timestamptz,
  last_inbound_at    timestamptz,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  -- one canonical thread per platform conversation
  unique (agency_id, channel, external_thread_id)
);

create index if not exists conversations_agency_idx
  on public.conversations (agency_id, status, last_message_at desc);
create index if not exists conversations_owner_idx
  on public.conversations (owner_rep_id, last_message_at desc);
create index if not exists conversations_party_idx
  on public.conversations (party_kind, party_ref);
create index if not exists conversations_unread_idx
  on public.conversations (agency_id, unread) where unread = true;

-- ── conversation_messages — every inbound + outbound message ───────────────
create table if not exists public.conversation_messages (
  id                  uuid primary key default gen_random_uuid(),
  conversation_id     uuid not null references public.conversations(id) on delete cascade,
  agency_id           uuid not null references public.agencies(id) on delete cascade,
  direction           text not null check (direction in ('in','out')),
  channel             text not null,
  body                text,
  ai_drafted          boolean not null default false,
  status              text not null default 'sent'
                        check (status in ('queued','sent','delivered','failed','received','awaiting_confirmation')),
  delivery_path       text,                      -- 'twilio' | 'sms_outbox' | 'meta_api' | 'rba_linkedin' | ...
  external_message_id text,                      -- twilio sid / platform message id (idempotency)
  sent_by_rep_id      text references public.reps(id) on delete set null,
  error_text          text,
  payload             jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

create index if not exists conv_messages_thread_idx
  on public.conversation_messages (conversation_id, created_at);
create index if not exists conv_messages_agency_idx
  on public.conversation_messages (agency_id, created_at desc);
-- webhook idempotency: never ingest the same platform message twice
create unique index if not exists conv_messages_external_uq
  on public.conversation_messages (channel, external_message_id)
  where external_message_id is not null;

-- ── RLS — agency-scoped for authenticated members (matches sms_outbox) ─────
alter table public.conversations          enable row level security;
alter table public.conversation_messages  enable row level security;

drop policy if exists "conversations_read"   on public.conversations;
drop policy if exists "conversations_write"  on public.conversations;
create policy "conversations_read" on public.conversations
  for select to authenticated
  using (agency_id in (select public.viewer_agency_ids()));
create policy "conversations_write" on public.conversations
  for all to authenticated
  using (agency_id in (select public.viewer_agency_ids()))
  with check (agency_id in (select public.viewer_agency_ids()));

drop policy if exists "conv_messages_read"  on public.conversation_messages;
drop policy if exists "conv_messages_write" on public.conversation_messages;
create policy "conv_messages_read" on public.conversation_messages
  for select to authenticated
  using (agency_id in (select public.viewer_agency_ids()));
create policy "conv_messages_write" on public.conversation_messages
  for all to authenticated
  using (agency_id in (select public.viewer_agency_ids()))
  with check (agency_id in (select public.viewer_agency_ids()));

-- ── verify block — fail loudly on partial apply ───────────────────────────
do $$
declare cnt int;
begin
  select count(*) into cnt from information_schema.tables
   where table_schema='public' and table_name in ('conversations','conversation_messages');
  if cnt <> 2 then
    raise exception 'conversations spine incomplete: expected 2 tables, got %', cnt;
  end if;
  select count(*) into cnt from pg_policies
   where schemaname='public' and tablename in ('conversations','conversation_messages');
  if cnt < 4 then
    raise exception 'conversations spine RLS incomplete: expected >=4 policies, got %', cnt;
  end if;
end $$;
