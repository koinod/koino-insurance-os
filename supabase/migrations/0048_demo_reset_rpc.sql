-- 0048_demo_reset_rpc.sql
--
-- Adds is_demo flag to agencies, marks the atlas demo agency,
-- and creates the reset_demo_agency() RPC for demo resets.
--
-- SECURITY DEFINER — super_admin only. Refuses to wipe a non-demo agency.
-- Returns a jsonb summary of rows seeded so the caller can verify.

set local search_path = public;

------------------------------------------------------------------------------
-- 1. is_demo flag on agencies
------------------------------------------------------------------------------
alter table public.agencies
  add column if not exists is_demo boolean not null default false;

create index if not exists agencies_is_demo_idx on public.agencies (is_demo) where is_demo = true;

-- Mark the atlas demo agency. Uses slug so it's slug-stable across ID changes.
update public.agencies
   set is_demo = true
 where slug = 'atlas';

-- If atlas doesn't exist yet (fresh deploy), create a minimal row.
insert into public.agencies (id, name, slug, is_demo)
values ('e0a68c9f-cf48-47b0-bef7-dba3f27db0b9'::uuid, 'Atlas Insurance Agency', 'atlas', true)
on conflict (id) do update
  set is_demo = true,
      slug = coalesce(nullif(agencies.slug,''), 'atlas');

-- Ensure slug column has a unique constraint (idempotent).
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'agencies_slug_key' and conrelid = 'public.agencies'::regclass
  ) then
    alter table public.agencies add constraint agencies_slug_key unique (slug);
  end if;
end $$;

------------------------------------------------------------------------------
-- 2. reset_demo_agency(p_slug text default 'atlas') RPC
------------------------------------------------------------------------------
create or replace function public.reset_demo_agency(p_slug text default 'atlas')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agency_id     uuid;
  v_summary       jsonb;
  v_pol_count     bigint;
  v_comm_count    bigint;
  v_exp_count     bigint;
  v_pipe_count    bigint;
  v_appt_count    bigint;
  v_call_count    bigint;
begin
  -- ── 1. Auth gate ─────────────────────────────────────────────────────────
  -- Allow: super_admin JWT OR direct postgres/service-role session (auth.uid IS NULL).
  -- The NULL case covers: Supabase SQL Editor, Management API, Vercel cron via service-role.
  if auth.uid() is not null and not public.is_super_admin() then
    raise exception 'reset_demo_agency: super_admin or service_role only';
  end if;

  -- ── 2. Resolve agency ────────────────────────────────────────────────────
  select id into v_agency_id
    from public.agencies
   where slug = p_slug and is_demo = true
   limit 1;

  if v_agency_id is null then
    raise exception 'reset_demo_agency: no is_demo=true agency with slug=%', p_slug;
  end if;

  -- ── 3. Wipe mutable demo state ───────────────────────────────────────────
  -- commissions cascade via policy FK, but delete explicitly for clarity
  delete from public.commissions
   where policy_id in (
     select id from public.policies where agency_id = v_agency_id
   );

  delete from public.policies          where agency_id = v_agency_id;
  delete from public.agency_expenses   where agency_id = v_agency_id;
  -- expense_allocations cascade from agency_expenses

  -- pipeline (leads); cascade takes sequence_enrollments with it
  delete from public.pipeline          where agency_id = v_agency_id;

  -- workflow assignments for this agency
  delete from public.workflow_assignments where agency_id = v_agency_id;

  delete from call_recordings          where agency_id = v_agency_id;
  delete from public.call_events       where agency_id = v_agency_id;
  delete from public.appointments      where agency_id = v_agency_id;
  delete from public.meeting_notes     where agency_id = v_agency_id;
  delete from public.drip_log          where agency_id = v_agency_id;
  delete from public.feature_interest_signups where agency_id = v_agency_id;

  -- ── 4. Ensure three demo reps exist (idempotent upsert) ──────────────────
  insert into public.reps (id, name, handle, tier, agency_id, mtd_cents, today_cents, streak_days, dials, presence, appts)
  values
    ('atlas-avery',  'Avery Chen',  '@averychen',  'gold',   v_agency_id, 0, 0, 14, 0, 'idle', 0),
    ('atlas-marcus', 'Marcus Hill', '@marcushill', 'silver', v_agency_id, 0, 0,  7, 0, 'idle', 0),
    ('atlas-sofia',  'Sofia Reyes', '@sofiareyes', 'bronze', v_agency_id, 0, 0,  3, 0, 'idle', 0)
  on conflict (id) do update
    set name      = excluded.name,
        handle    = excluded.handle,
        tier      = excluded.tier,
        agency_id = excluded.agency_id,
        mtd_cents = 0, today_cents = 0;

  -- ── 5. Seed 12 policies + matching commissions ───────────────────────────
  --
  -- ap_cents represent annual premium dollars * 100 (cents).
  -- Commission = ap_cents * comp_rate_pct / 100.
  -- Seeded for issued/app_in policies only (those hit the P&L).
  --
  with pol_seed as (
    insert into public.policies
      (agency_id, owner_rep_id, product_text, ap_cents,
       comp_rate_pct, status, persistency_status, state, submission_date)
    values
      -- Avery Chen — 5 deals, ~$710K AP
      (v_agency_id,'atlas-avery','Final Expense $15K',         156000, 110,'issued','on_book','GA', current_date - 28),
      (v_agency_id,'atlas-avery','Term Life 20yr $250K',        84000, 100,'issued','on_book','FL', current_date - 21),
      (v_agency_id,'atlas-avery','MAPD $0 Premium',             36000,  80,'issued','on_book','TX', current_date - 14),
      (v_agency_id,'atlas-avery','IUL Max Fund',               240000, 120,'app_in','on_book','GA', current_date -  7),
      (v_agency_id,'atlas-avery','Final Expense $20K',         204000, 110,'pending','on_book','NC',current_date -  3),
      -- Marcus Hill — 4 deals, ~$440K AP
      (v_agency_id,'atlas-marcus','Final Expense $10K',        104000, 110,'issued','on_book','TX', current_date - 25),
      (v_agency_id,'atlas-marcus','Med Supp Plan G',           192000, 100,'issued','on_book','FL', current_date - 18),
      (v_agency_id,'atlas-marcus','MAPD SNP',                   48000,  80,'issued','on_book','GA', current_date - 11),
      (v_agency_id,'atlas-marcus','Term Life 30yr $500K',       96000, 100,'app_in','on_book','VA', current_date -  5),
      -- Sofia Reyes — 3 deals, ~$341K AP
      (v_agency_id,'atlas-sofia','Final Expense $12K',         125000, 110,'issued','on_book','GA', current_date - 22),
      (v_agency_id,'atlas-sofia','IUL Target Premium',         180000, 120,'issued','on_book','TX', current_date - 15),
      (v_agency_id,'atlas-sofia','MAPD $0 Premium',             36000,  80,'pending','on_book','NC',current_date -  8)
    returning id, owner_rep_id, ap_cents, comp_rate_pct, status, submission_date
  )
  insert into public.commissions
    (policy_id, rep_id, amount_cents, kind, earned_at, source)
  select
    id,
    owner_rep_id,
    round(ap_cents * comp_rate_pct / 100.0)::bigint,
    'advance',
    (submission_date + 7)::date,
    'carrier_statement'
  from pol_seed
  where status in ('issued','app_in');

  -- ── 6. Seed 8 expenses ───────────────────────────────────────────────────
  insert into public.agency_expenses
    (agency_id, kind, amount_cents, description, vendor, paid_at, paid_by, reimbursable)
  values
    (v_agency_id,'lead_spend', 45000,'FB Leads – Final Expense Georgia batch',  'FB Ads',          current_date - 27,'agency',       false),
    (v_agency_id,'lead_spend', 32000,'Convoso live-transfer leads – Florida',   'Convoso',         current_date - 21,'agency',       false),
    (v_agency_id,'saas',        8900,'Repflow OS monthly license',              'Repflow',         current_date - 15,'llc_card',     false),
    (v_agency_id,'saas',       12900,'Calendly Teams annual (pro-rated)',        'Calendly',        current_date - 10,'owner_amex',   false),
    (v_agency_id,'travel',      4500,'Mileage – client meetings week of 5/6',   'Personal Vehicle',current_date - 12,'rep_oop',      true),
    (v_agency_id,'training',    9900,'AHIP 2026 cert renewal – Avery Chen',     'AHIP',            current_date -  8,'rep_oop',      true),
    (v_agency_id,'marketing',  25000,'Google Ads – branded search',             'Google Ads',      current_date -  5,'owner_amex',   false),
    (v_agency_id,'other',       4000,'Office supplies + printer ink',           'Office Depot',    current_date -  3,'llc_card',     false);

  -- ── 7. Seed 20 pipeline leads ────────────────────────────────────────────
  insert into public.pipeline
    (agency_id, lead_name, age, state, stage, product, ap_cents, owner_rep_id, heat, source, consent)
  values
    (v_agency_id,'Martha Okafor',   68,'GA','New',       'Final Expense',       0,'atlas-avery', 'fresh','FB Lead Form','verified'),
    (v_agency_id,'James Whitfield', 72,'FL','New',       'MAPD',                0,'atlas-marcus','fresh','T65 List',    'verified'),
    (v_agency_id,'Carol Nguyen',    65,'TX','New',       'Med Supp',            0,'atlas-sofia', 'hot',  'Inbound Call','verified'),
    (v_agency_id,'Robert Patel',    58,'NC','Contacted', 'Final Expense',       0,'atlas-avery', 'hot',  'FB Lead Form','verified'),
    (v_agency_id,'Linda Russo',     71,'VA','Contacted', 'MAPD',                0,'atlas-marcus','warm', 'Referral',   'verified'),
    (v_agency_id,'Tom Bradley',     63,'GA','Quoted',    'Final Expense',  142000,'atlas-avery', 'warm', 'Direct Mail','verified'),
    (v_agency_id,'Angela Davis',    67,'TX','Quoted',    'Med Supp Plan G',216000,'atlas-sofia', 'warm', 'FB Lead Form','verified'),
    (v_agency_id,'Mike Chen',       55,'FL','Quoted',    'Term Life',       96000,'atlas-marcus','warm', 'LinkedIn',   'pending'),
    (v_agency_id,'Rosa Martinez',   70,'GA','Quoted',    'MAPD SNP',        48000,'atlas-avery', 'warm', 'T65 List',   'verified'),
    (v_agency_id,'Frank Johnson',   62,'NC','Contacted', 'Final Expense',       0,'atlas-sofia', 'warm', 'Direct Mail','verified'),
    (v_agency_id,'Helen Torres',    69,'GA','App In',    'Final Expense',  168000,'atlas-avery', 'hot',  'FB Lead Form','verified'),
    (v_agency_id,'David Kim',       61,'TX','App In',    'IUL',            240000,'atlas-marcus','hot',  'Referral',   'verified'),
    (v_agency_id,'Nancy Williams',  74,'FL','App In',    'MAPD',            36000,'atlas-sofia', 'warm', 'T65 List',   'verified'),
    (v_agency_id,'George Brown',    66,'VA','Issued',    'Med Supp Plan G',192000,'atlas-marcus','warm', 'Inbound Call','verified'),
    (v_agency_id,'Sandra Lee',      68,'GA','Issued',    'Final Expense',  156000,'atlas-avery', 'warm', 'Direct Mail','verified'),
    (v_agency_id,'Paul Anderson',   70,'TX','Lost',      'Final Expense',       0,'atlas-avery', 'cold', 'FB Lead Form','none'),
    (v_agency_id,'Dorothy Harris',  73,'FL','Lost',      'MAPD',                0,'atlas-sofia', 'cold', 'T65 List',   'none'),
    (v_agency_id,'Charles Wilson',  60,'NC','Contacted', 'Term Life',           0,'atlas-marcus','warm', 'LinkedIn',   'pending'),
    (v_agency_id,'Betty Taylor',    65,'GA','Quoted',    'Final Expense',  125000,'atlas-sofia', 'warm', 'Direct Mail','verified'),
    (v_agency_id,'Donald Jackson',  78,'TX','New',       'Final Expense',       0,'atlas-avery', 'fresh','Direct Mail','verified');

  -- ── 8. Seed 4 appointments ───────────────────────────────────────────────
  -- external_id is required for unique(source, external_id) on non-manual rows.
  -- source='manual' allows null external_id (unique constraint skips NULLs).
  insert into public.appointments
    (agency_id, source, external_id, title, starts_at, ends_at,
     attendee_name, attendee_email, status, owner_rep_id)
  values
    (v_agency_id,'manual',null,
     'Coverage Review – Tom Bradley',
     now() + interval '2 hours',  now() + interval '2 hours 30 min',
     'Tom Bradley',  'tombradley@demo.example','scheduled','atlas-avery'),
    (v_agency_id,'manual',null,
     'Final Expense Quote – Angela Davis',
     now() + interval '1 day',    now() + interval '1 day 30 min',
     'Angela Davis', 'adavis@demo.example',    'scheduled','atlas-sofia'),
    (v_agency_id,'manual',null,
     'IUL Strategy Call – David Kim',
     now() + interval '2 days',   now() + interval '2 days 45 min',
     'David Kim',    'dkim@demo.example',      'scheduled','atlas-marcus'),
    (v_agency_id,'manual',null,
     'Med Supp Renewal – Carol Nguyen',
     now() + interval '7 days',   now() + interval '7 days 30 min',
     'Carol Nguyen', 'cnguyen@demo.example',   'scheduled','atlas-sofia');

  -- ── 9. Seed 5 call_events from yesterday ─────────────────────────────────
  insert into public.call_events
    (call_sid, status, duration_sec, direction, to_number, from_number, agency_id, created_at)
  values
    ('CA' || replace(gen_random_uuid()::text,'-',''), 'completed',  312,'outbound','+14045550101','+14045559900',v_agency_id, now() - interval '18 hours'),
    ('CA' || replace(gen_random_uuid()::text,'-',''), 'no-answer',    0,'outbound','+12815550202','+14045559900',v_agency_id, now() - interval '17 hours'),
    ('CA' || replace(gen_random_uuid()::text,'-',''), 'completed',  487,'outbound','+17705550303','+14045559900',v_agency_id, now() - interval '16 hours'),
    ('CA' || replace(gen_random_uuid()::text,'-',''), 'completed',  183,'outbound','+19195550404','+14045559900',v_agency_id, now() - interval '15 hours'),
    ('CA' || replace(gen_random_uuid()::text,'-',''), 'busy',         0,'outbound','+15125550505','+14045559900',v_agency_id, now() - interval '14 hours');

  -- ── 10. Build summary ────────────────────────────────────────────────────
  select count(*) into v_pol_count  from public.policies       where agency_id = v_agency_id;
  select count(*) into v_comm_count from public.commissions c
    join public.policies p on p.id = c.policy_id               where p.agency_id = v_agency_id;
  select count(*) into v_exp_count  from public.agency_expenses where agency_id = v_agency_id;
  select count(*) into v_pipe_count from public.pipeline        where agency_id = v_agency_id;
  select count(*) into v_appt_count from public.appointments    where agency_id = v_agency_id;
  select count(*) into v_call_count from public.call_events     where agency_id = v_agency_id;

  v_summary := jsonb_build_object(
    'agency_id',         v_agency_id,
    'slug',              p_slug,
    'reps_seeded',       3,
    'policies_seeded',   v_pol_count,
    'commissions_seeded',v_comm_count,
    'expenses_seeded',   v_exp_count,
    'pipeline_seeded',   v_pipe_count,
    'appointments_seeded',v_appt_count,
    'call_events_seeded',v_call_count,
    'reset_at',          now()
  );

  return v_summary;
end;
$$;

grant execute on function public.reset_demo_agency(text) to authenticated;

comment on function public.reset_demo_agency(text) is
  'Wipes and re-seeds the named demo agency. Super_admin only. is_demo=true gate prevents accidental real-agency wipes.';
