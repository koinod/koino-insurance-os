-- ─────────────────────────────────────────────────────────────────────────
-- Call recordings + admin auto-promotion
-- ─────────────────────────────────────────────────────────────────────────
--
-- 1. call_recordings — every call started from the Floor panel writes a row.
--    Audio blob lives in Supabase storage bucket `call-recordings` at path
--    <rep_id>/<recording_id>.webm. RLS scoping mirrors quote_requests:
--    rep sees own, manager sees downline, owner sees agency.
--
-- 2. call-recordings storage bucket — private, signed-URL access only.
--
-- 3. Auto-admin trigger — when iankmeeks@gmail.com signs up, fire an
--    after-insert trigger on auth.users that creates:
--       a. an agencies row "Koino HQ"
--       b. a reps row tied to the new user
--       c. an agency_members row with role='owner'
--    so Ian gets owner-level access to every screen the moment he signs up
--    without an invite token.

-- 1) Table ────────────────────────────────────────────────────────────────
create table if not exists call_recordings (
  id          uuid primary key default gen_random_uuid(),
  rep_id      text not null references public.reps(id) on delete cascade,
  agency_id   uuid references public.agencies(id) on delete cascade,
  lead_id     uuid references public.pipeline(id) on delete set null,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  duration_sec integer,
  audio_path  text,                          -- storage path inside `call-recordings` bucket
  audio_bytes integer,
  audio_mime  text default 'audio/webm;codecs=opus',
  source      text default 'floor-panel',    -- floor-panel | dialer | mobile | manual-import
  channels    text default 'mic',            -- mic | mic+system | system
  outcome     text,                          -- e.g. answered | voicemail | no-answer | callback | sale
  notes       text,
  transcript_url text,                       -- populated later by an out-of-band transcriber
  created_at  timestamptz default now()
);

create index if not exists idx_call_rec_rep_started  on call_recordings(rep_id, started_at desc);
create index if not exists idx_call_rec_agency_started on call_recordings(agency_id, started_at desc);
create index if not exists idx_call_rec_lead         on call_recordings(lead_id);

alter table call_recordings enable row level security;

drop policy if exists "rep manages own call_recordings" on call_recordings;
create policy "rep manages own call_recordings"
  on call_recordings for all
  using (
    rep_id = (select rep_id from public.me() limit 1)
    or exists (
      select 1 from public.rep_managers rm
      where rm.manager_rep_id = (select rep_id from public.me() limit 1)
        and rm.rep_id = call_recordings.rep_id
    )
    or (select role from public.me() limit 1) in ('owner', 'admin')
  )
  with check (
    rep_id = (select rep_id from public.me() limit 1)
    or (select role from public.me() limit 1) in ('owner', 'admin')
  );

-- Same permissive anon read so the local agent / install-time check can
-- access (matches the auto-quoter pattern from migration 0013).
drop policy if exists "agent reads call_recordings" on call_recordings;
create policy "agent reads call_recordings"
  on call_recordings for select to anon
  using (true);


-- 2) Storage bucket ───────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'call-recordings', 'call-recordings', false,
  500 * 1024 * 1024,                                -- 500MB hard cap per object
  array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "rep uploads own call audio" on storage.objects;
create policy "rep uploads own call audio"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'call-recordings'
    and (storage.foldername(name))[1] = (select rep_id from public.me() limit 1)
  );

drop policy if exists "rep reads own call audio" on storage.objects;
create policy "rep reads own call audio"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'call-recordings'
    and (
      (storage.foldername(name))[1] = (select rep_id from public.me() limit 1)
      or exists (
        select 1 from public.rep_managers rm
        where rm.manager_rep_id = (select rep_id from public.me() limit 1)
          and rm.rep_id = (storage.foldername(name))[1]
      )
      or (select role from public.me() limit 1) in ('owner', 'admin')
    )
  );

drop policy if exists "rep deletes own call audio" on storage.objects;
create policy "rep deletes own call audio"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'call-recordings'
    and (
      (storage.foldername(name))[1] = (select rep_id from public.me() limit 1)
      or (select role from public.me() limit 1) in ('owner', 'admin')
    )
  );


-- 3) Auto-admin trigger for iankmeeks@gmail.com ───────────────────────────
create or replace function public.koino_promote_admin_emails()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email      text := lower(new.email);
  v_admin_set  text[] := array['iankmeeks@gmail.com'];   -- add more here as needed
  v_agency_id  uuid;
  v_rep_id     text;
  v_handle     text;
begin
  if v_email is null or not (v_email = any (v_admin_set)) then
    return new;
  end if;

  -- Idempotent: if a Koino HQ agency already owned by this user exists, reuse.
  select id into v_agency_id
  from public.agencies
  where lower(coalesce(name, '')) = 'koino hq'
  limit 1;

  if v_agency_id is null then
    insert into public.agencies (id, name)
    values (gen_random_uuid(), 'Koino HQ')
    returning id into v_agency_id;
  end if;

  -- Generate a deterministic rep_id so re-signups hit the same row.
  v_rep_id := 'admin-' || split_part(v_email, '@', 1);
  v_handle := '@' || split_part(v_email, '@', 1);

  insert into public.reps (id, name, handle, tier, agency_id, user_id, onboarded_at)
  values (v_rep_id, 'Ian Meeks', v_handle, 'gold', v_agency_id, new.id, now())
  on conflict (id) do update
    set user_id = excluded.user_id,
        agency_id = excluded.agency_id;

  insert into public.agency_members (agency_id, user_id, role, rep_id, joined_at, active)
  values (v_agency_id, new.id, 'owner', v_rep_id, now(), true)
  on conflict (agency_id, user_id) do update
    set role = 'owner', rep_id = v_rep_id, active = true;

  return new;
end;
$$;

drop trigger if exists koino_promote_admin_emails_trg on auth.users;
create trigger koino_promote_admin_emails_trg
  after insert on auth.users
  for each row execute function public.koino_promote_admin_emails();

-- Backfill: if Ian has already signed up before this migration ran, promote
-- him now. No-op otherwise.
do $$
declare
  v_uid uuid;
  v_user_email text;
begin
  select id, email into v_uid, v_user_email
  from auth.users
  where lower(email) = 'iankmeeks@gmail.com'
  limit 1;

  if v_uid is not null then
    -- Re-fire the trigger logic with a synthetic NEW row by calling it directly.
    perform 1;  -- placeholder; the trigger fires on subsequent inserts
    -- Direct insert (idempotent via the on-conflicts above):
    insert into public.agencies (id, name)
    values (gen_random_uuid(), 'Koino HQ')
    on conflict do nothing;

    insert into public.reps (id, name, handle, tier, agency_id, user_id, onboarded_at)
    select 'admin-iankmeeks', 'Ian Meeks', '@iankmeeks', 'gold',
           (select id from public.agencies where lower(name) = 'koino hq' limit 1),
           v_uid, now()
    on conflict (id) do update set user_id = excluded.user_id;

    insert into public.agency_members (agency_id, user_id, role, rep_id, joined_at, active)
    select (select id from public.agencies where lower(name) = 'koino hq' limit 1),
           v_uid, 'owner', 'admin-iankmeeks', now(), true
    on conflict (agency_id, user_id) do update set role = 'owner', active = true;
  end if;
end $$;
