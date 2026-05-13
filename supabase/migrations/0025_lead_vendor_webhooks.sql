-- 0025_lead_vendor_webhooks.sql
--
-- Two new tables:
--
--   lead_vendor_webhooks  — per-agency, per-vendor webhook config.
--                           Each vendor gets a unique endpoint_slug used in:
--                           POST /api/leads/vendor-webhook?slug=<slug>
--                           The hmac_secret is shared with the vendor so every
--                           inbound POST is HMAC-SHA256 signed.
--
--   drip_log              — immutable audit trail for the cadence runner.
--                           One row per step fired (queued / sent / failed /
--                           skipped). The cron at /api/cron/drip-runner writes
--                           here and bumps sequence_enrollments.current_step.

set local search_path = public;

-- =============================================================
-- 1. lead_vendor_webhooks
-- =============================================================
create table if not exists public.lead_vendor_webhooks (
  id                  uuid        primary key default gen_random_uuid(),
  agency_id           uuid        not null,
  vendor_name         text        not null,
  endpoint_slug       text        not null,
  hmac_secret         text        not null,
  is_active           boolean     not null default false,
  cost_per_lead_cents bigint      not null default 0,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (endpoint_slug)
);

create index if not exists idx_vendor_webhooks_agency  on public.lead_vendor_webhooks (agency_id);
create index if not exists idx_vendor_webhooks_slug    on public.lead_vendor_webhooks (endpoint_slug) where is_active;

alter table public.lead_vendor_webhooks enable row level security;

-- Any member of the agency can read (to show vendor list in UI)
create policy "tenant read vendor webhooks" on public.lead_vendor_webhooks
  for select to authenticated
  using (agency_id in (select public.viewer_agency_ids()));

-- Only owners/admins can create / modify / delete vendor configs
create policy "owner manage vendor webhooks" on public.lead_vendor_webhooks
  for all to authenticated
  using (
    agency_id in (select public.viewer_agency_ids())
    and exists (
      select 1 from public.agency_members m
       where m.agency_id = lead_vendor_webhooks.agency_id
         and m.user_id   = auth.uid()
         and m.active    = true
         and m.role      in ('owner', 'admin')
    )
  )
  with check (
    agency_id in (select public.viewer_agency_ids())
    and exists (
      select 1 from public.agency_members m
       where m.agency_id = lead_vendor_webhooks.agency_id
         and m.user_id   = auth.uid()
         and m.active    = true
         and m.role      in ('owner', 'admin')
    )
  );

-- The webhook handler reads vendor config using service role — no RLS issue there.
-- Anon policy is intentionally absent: the endpoint reads via service role, not anon.

-- =============================================================
-- 2. drip_log
-- =============================================================
create table if not exists public.drip_log (
  id               uuid        primary key default gen_random_uuid(),
  agency_id        uuid        not null,
  enrollment_id    uuid        references public.sequence_enrollments(id) on delete cascade,
  pipeline_lead_id uuid        references public.pipeline(id)             on delete cascade,
  step_index       integer     not null default 0,
  channel          text        not null default 'SMS',
  recipient        text,
  body_snapshot    text,
  status           text        not null
                   check (status in ('queued','sent','failed','skipped'))
                   default 'queued',
  error_text       text,
  fired_at         timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

create index if not exists idx_drip_log_agency     on public.drip_log (agency_id, fired_at desc);
create index if not exists idx_drip_log_enrollment on public.drip_log (enrollment_id);
create index if not exists idx_drip_log_queued     on public.drip_log (status) where status = 'queued';

alter table public.drip_log enable row level security;

create policy "tenant read drip log" on public.drip_log
  for select to authenticated
  using (agency_id in (select public.viewer_agency_ids()));

create policy "service insert drip log" on public.drip_log
  for insert to authenticated
  with check (agency_id in (select public.viewer_agency_ids()));

-- =============================================================
-- 3. Wire both tables into supabase_realtime publication
-- =============================================================
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_vendor_webhooks;
  EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.drip_log;
  EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END;
END$$;

-- =============================================================
-- 4. Demo seeds (Atlas agency e0a68c9f only).
--    is_active=false: operator must activate in Lead Drip > Vendors.
--    Secrets are random per-migration; operator will rotate before go-live.
-- =============================================================
insert into public.lead_vendor_webhooks
  (agency_id, vendor_name, endpoint_slug, hmac_secret, is_active, cost_per_lead_cents, notes)
values
  ('e0a68c9f-cf48-47b0-bef7-dba3f27db0b9'::uuid,
   'Hometown Quotes',
   'atlas-hometownquotes',
   'htq-' || encode(gen_random_bytes(16), 'hex'),
   false, 1800,
   'T65 Med Supp leads · pay-per-lead. Activate after confirming ping test with vendor.'),

  ('e0a68c9f-cf48-47b0-bef7-dba3f27db0b9'::uuid,
   'EverQuote',
   'atlas-everquote',
   'evq-' || encode(gen_random_bytes(16), 'hex'),
   false, 2200,
   'Shared Med Supp · auto-accept age 64–70. Rotate HMAC secret before first live send.'),

  ('e0a68c9f-cf48-47b0-bef7-dba3f27db0b9'::uuid,
   'Quinstreet',
   'atlas-quinstreet',
   'qst-' || encode(gen_random_bytes(16), 'hex'),
   false, 1500,
   'Final Expense leads · bulk tier. Verify phone field mapping before activating.'),

  ('e0a68c9f-cf48-47b0-bef7-dba3f27db0b9'::uuid,
   'MediaAlpha',
   'atlas-mediaalpha',
   'mal-' || encode(gen_random_bytes(16), 'hex'),
   false, 2800,
   'Exclusive T65 inbound · premium. Requires dedicated number for routing.')
on conflict (endpoint_slug) do nothing;
