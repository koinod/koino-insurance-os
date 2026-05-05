-- 0010 resources persistence.
--
-- Moves the four operator-managed resource lists out of localStorage and
-- into agency-scoped Postgres tables so a manager who adds a video on one
-- machine actually shares it with reps on every other machine.
--
--   - agency_scripts      — call scripts library (was repflow:scripts)
--   - agency_videos        — training video library (was repflow:videos)
--   - agency_docs          — document hub (was repflow:owner:docs)
--   - agency_quick_links   — sidebar portal locker (was repflow:owner:links)
--
-- All four are RLS-scoped by agency_id. The demo agency
-- (e0a68c9f-cf48-47b0-bef7-dba3f27db0b9) is readable by `anon` so the
-- public demo URL still shows seed content.

------------------------------------------------------------------------------
-- agency_scripts
------------------------------------------------------------------------------
create table if not exists public.agency_scripts (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null,
  title       text not null,
  cat         text not null default 'Open',
  version     text not null default 'v1.0',
  body        text not null,
  created_by  text,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists idx_agency_scripts_agency on public.agency_scripts (agency_id);
alter table public.agency_scripts enable row level security;

drop policy if exists "anon atlas read" on public.agency_scripts;
create policy "anon atlas read" on public.agency_scripts for select to anon
  using (agency_id::text = 'e0a68c9f-cf48-47b0-bef7-dba3f27db0b9');

drop policy if exists "auth agency read" on public.agency_scripts;
create policy "auth agency read" on public.agency_scripts for select to authenticated
  using (agency_id = (select agency_id from public.me() limit 1));

drop policy if exists "auth agency write" on public.agency_scripts;
create policy "auth agency write" on public.agency_scripts for all to authenticated
  using (agency_id = (select agency_id from public.me() limit 1))
  with check (agency_id = (select agency_id from public.me() limit 1));

------------------------------------------------------------------------------
-- agency_videos
------------------------------------------------------------------------------
create table if not exists public.agency_videos (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null,
  title         text not null,
  cat           text not null default 'Med Supp',
  src           text not null,                   -- already-resolved iframe src
  source_url    text,                             -- original pasted URL
  source_label  text,                             -- 'YouTube' | 'Vimeo' | 'Loom' | 'Wistia' | 'Direct' | 'Embed'
  thumb         text,
  dur_min       integer not null default 0,
  created_by    text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_agency_videos_agency on public.agency_videos (agency_id);
alter table public.agency_videos enable row level security;

drop policy if exists "anon atlas read" on public.agency_videos;
create policy "anon atlas read" on public.agency_videos for select to anon
  using (agency_id::text = 'e0a68c9f-cf48-47b0-bef7-dba3f27db0b9');

drop policy if exists "auth agency read" on public.agency_videos;
create policy "auth agency read" on public.agency_videos for select to authenticated
  using (agency_id = (select agency_id from public.me() limit 1));

drop policy if exists "auth agency write" on public.agency_videos;
create policy "auth agency write" on public.agency_videos for all to authenticated
  using (agency_id = (select agency_id from public.me() limit 1))
  with check (agency_id = (select agency_id from public.me() limit 1));

------------------------------------------------------------------------------
-- agency_docs — link/upload/gdoc records (file blobs themselves live in the
-- `vault` storage bucket; this table just holds the metadata + public URL).
------------------------------------------------------------------------------
create table if not exists public.agency_docs (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null,
  title         text not null,
  cat           text not null default 'Internal',
  url           text,
  kind          text not null default 'link',     -- 'link' | 'upload' | 'gdoc'
  gdoc_kind     text,                              -- 'document' | 'spreadsheet' | 'presentation'
  ext           text,
  size_bytes    bigint,
  storage_path  text,                              -- path within the `vault` bucket for upload kind
  text_excerpt  text,                              -- imported plaintext for gdoc kind, hard-capped
  created_by    text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_agency_docs_agency on public.agency_docs (agency_id);
alter table public.agency_docs enable row level security;

drop policy if exists "anon atlas read" on public.agency_docs;
create policy "anon atlas read" on public.agency_docs for select to anon
  using (agency_id::text = 'e0a68c9f-cf48-47b0-bef7-dba3f27db0b9');

drop policy if exists "auth agency read" on public.agency_docs;
create policy "auth agency read" on public.agency_docs for select to authenticated
  using (agency_id = (select agency_id from public.me() limit 1));

drop policy if exists "auth agency write" on public.agency_docs;
create policy "auth agency write" on public.agency_docs for all to authenticated
  using (agency_id = (select agency_id from public.me() limit 1))
  with check (agency_id = (select agency_id from public.me() limit 1));

------------------------------------------------------------------------------
-- agency_quick_links — owner-editable sidebar portal locker.
------------------------------------------------------------------------------
create table if not exists public.agency_quick_links (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null,
  cat         text not null default 'Internal',
  label       text not null,
  url         text not null,
  sort_order  integer not null default 0,
  created_by  text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_agency_quick_links_agency on public.agency_quick_links (agency_id);
alter table public.agency_quick_links enable row level security;

drop policy if exists "anon atlas read" on public.agency_quick_links;
create policy "anon atlas read" on public.agency_quick_links for select to anon
  using (agency_id::text = 'e0a68c9f-cf48-47b0-bef7-dba3f27db0b9');

drop policy if exists "auth agency read" on public.agency_quick_links;
create policy "auth agency read" on public.agency_quick_links for select to authenticated
  using (agency_id = (select agency_id from public.me() limit 1));

drop policy if exists "auth agency write" on public.agency_quick_links;
create policy "auth agency write" on public.agency_quick_links for all to authenticated
  using (agency_id = (select agency_id from public.me() limit 1))
  with check (agency_id = (select agency_id from public.me() limit 1));

------------------------------------------------------------------------------
-- Seed the demo agency so anonymous demo viewers see populated screens.
------------------------------------------------------------------------------
insert into public.agency_scripts (agency_id, title, cat, version, body) values
  ('e0a68c9f-cf48-47b0-bef7-dba3f27db0b9', 'Med Supp — Plan G open',     'Open',       'v3.1', 'Hi {{lead_name}}, this is {{rep_first}} with Atlas. The reason for my call is to make sure your Medicare Supplement gives you the same Plan G coverage at a lower rate.'),
  ('e0a68c9f-cf48-47b0-bef7-dba3f27db0b9', 'Final Expense — empathy',     'Open',       'v2.4', 'Most of my clients tell me the hardest part isn''t paying for a policy, it''s the thought of leaving the people they love with a bill on top of grief.'),
  ('e0a68c9f-cf48-47b0-bef7-dba3f27db0b9', 'TPMO disclosure (verbatim)',  'Compliance', 'v1.0', 'We do not offer every plan available in your area. Please contact Medicare.gov or 1-800-MEDICARE to get information on all of your options.'),
  ('e0a68c9f-cf48-47b0-bef7-dba3f27db0b9', 'AEP — switch reasons',         'Open',       'v4.2', 'Three reasons people switch during AEP: drug list changed, doctor dropped, or premium jumped. Which is hitting you hardest?')
on conflict do nothing;

insert into public.agency_quick_links (agency_id, cat, label, url, sort_order) values
  ('e0a68c9f-cf48-47b0-bef7-dba3f27db0b9', 'Carrier portal', 'UHC Producer Portal',     'https://www.uhcjarvis.com/',                                              10),
  ('e0a68c9f-cf48-47b0-bef7-dba3f27db0b9', 'Carrier portal', 'Humana Vantage',           'https://vantage.humana.com/',                                              20),
  ('e0a68c9f-cf48-47b0-bef7-dba3f27db0b9', 'Compliance',     'AHIP certification',       'https://www.ahipmedicaretraining.com/',                                    30),
  ('e0a68c9f-cf48-47b0-bef7-dba3f27db0b9', 'Compliance',     'TPMO disclaimer (CMS PDF)','https://www.cms.gov/files/document/tpmo-disclaimer.pdf',                  40)
on conflict do nothing;

insert into public.agency_docs (agency_id, title, cat, url, kind) values
  ('e0a68c9f-cf48-47b0-bef7-dba3f27db0b9', 'Scope of Appointment (SOA)', 'Compliance', 'https://www.cms.gov/files/document/scope-appointment-form.pdf', 'link'),
  ('e0a68c9f-cf48-47b0-bef7-dba3f27db0b9', 'TPMO Disclaimer (CMS PDF)',   'Compliance', 'https://www.cms.gov/files/document/tpmo-disclaimer.pdf',         'link'),
  ('e0a68c9f-cf48-47b0-bef7-dba3f27db0b9', 'AHIP study guide',            'Training',   'https://www.ahipmedicaretraining.com/',                          'link')
on conflict do nothing;
