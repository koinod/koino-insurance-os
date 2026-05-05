-- 0007 recruiting hierarchy + demo seed.
--
-- Adds the manager-downline scoping columns the recruiting tab needs
-- (GAP-MR1) and seeds Atlas demo data so the page renders something
-- meaningful in ?demo=1 mode instead of empty states.

-- ─── schema ───────────────────────────────────────────────────────────
alter table public.recruiting_applicants
  add column if not exists recruiter_id text references public.reps(id) on delete set null;

alter table public.recruiting_campaigns
  add column if not exists owner_rep_id text references public.reps(id) on delete set null,
  add column if not exists pipeline_stage text;

create index if not exists idx_recruiting_applicants_recruiter
  on public.recruiting_applicants (agency_id, recruiter_id);
create index if not exists idx_recruiting_campaigns_owner
  on public.recruiting_campaigns (agency_id, owner_rep_id);

-- ─── seed demo data for Atlas (idempotent: WHERE NOT EXISTS) ──────────
-- Campaigns
insert into public.recruiting_campaigns
  (id, name, status, source, budget_cents, applied, contracted, producing, cpa_cents, agency_id, owner_rep_id, pipeline_stage)
select * from (values
  ('cmp-spring-producer', 'Spring Producer Drive',     'active', 'instagram', 480000, 24,  9, 5,  53000, 'e0a68c9f-cf48-47b0-bef7-dba3f27db0b9'::uuid, 'marc', 'active'),
  ('cmp-vt-career',       'VT Career Fair · Q2',       'active', 'event',     220000, 12,  4, 1,  55000, 'e0a68c9f-cf48-47b0-bef7-dba3f27db0b9'::uuid, 'dani', 'active'),
  ('cmp-linkedin-vets',   'LinkedIn Insurance Vets',   'paused', 'linkedin',  640000, 18,  3, 2,  213000,'e0a68c9f-cf48-47b0-bef7-dba3f27db0b9'::uuid, 'remy', 'paused'),
  ('cmp-referral-wave',   'Referral Bonus Wave',       'active', 'referral',  180000, 22, 12, 9,  15000, 'e0a68c9f-cf48-47b0-bef7-dba3f27db0b9'::uuid, 'marc', 'active')
) v(id, name, status, source, budget_cents, applied, contracted, producing, cpa_cents, agency_id, owner_rep_id, pipeline_stage)
where not exists (select 1 from public.recruiting_campaigns where id = v.id);

-- Applicants — spread across stages, recruiters, campaigns
insert into public.recruiting_applicants (id, campaign_id, name, handle, state, status, enrolled_at, agency_id, recruiter_id)
select gen_random_uuid(), v.campaign_id, v.name, v.handle, v.state, v.status, v.enrolled_at, 'e0a68c9f-cf48-47b0-bef7-dba3f27db0b9'::uuid, v.recruiter_id
from (values
  ('cmp-spring-producer', 'Jordan Hayes',     '@jhayes',     'GA', 'prospect',     now() - interval '2 days',  'marc'),
  ('cmp-spring-producer', 'Maria Cortez',     '@mcortez',    'TX', 'contacted',    now() - interval '5 days',  'dani'),
  ('cmp-spring-producer', 'Trent Dawson',     '@tdawson',    'FL', 'applied',      now() - interval '8 days',  'dani'),
  ('cmp-spring-producer', 'Brielle Watts',    '@brielle',    'GA', 'interviewed',  now() - interval '11 days', 'marc'),
  ('cmp-spring-producer', 'Cory Vance',       '@cvance',     'NC', 'offered',      now() - interval '14 days', 'marc'),
  ('cmp-spring-producer', 'Linnea Park',      '@linnea',     'GA', 'hired',        now() - interval '21 days', 'dani'),
  ('cmp-vt-career',       'Wesley Ng',        '@wesley_ng',  'VA', 'contacted',    now() - interval '3 days',  'dani'),
  ('cmp-vt-career',       'Sasha Rao',        '@sasharao',   'VA', 'applied',      now() - interval '6 days',  'dani'),
  ('cmp-vt-career',       'Daniel Munoz',     '@danmunoz',   'VA', 'interviewed',  now() - interval '9 days',  'dani'),
  ('cmp-vt-career',       'Priya Iyer',       '@priya',      'NC', 'declined',     now() - interval '12 days', 'dani'),
  ('cmp-linkedin-vets',   'Elena Brooks',     '@elenab',     'GA', 'prospect',     now() - interval '4 days',  'remy'),
  ('cmp-linkedin-vets',   'Marcus Pham',      '@mpham',      'TX', 'contacted',    now() - interval '7 days',  'remy'),
  ('cmp-linkedin-vets',   'Tasha Greene',     '@tasha',      'CA', 'applied',      now() - interval '10 days', 'remy'),
  ('cmp-linkedin-vets',   'Owen Faulkner',    '@owen',       'NY', 'offered',      now() - interval '13 days', 'remy'),
  ('cmp-referral-wave',   'Jordan Tate',      '@jtate',      'GA', 'applied',      now() - interval '5 days',  'marc'),
  ('cmp-referral-wave',   'Mei Lin',          '@meilin',     'WA', 'interviewed',  now() - interval '8 days',  'marc'),
  ('cmp-referral-wave',   'Amari Bell',       '@amari',      'GA', 'hired',        now() - interval '17 days', 'marc'),
  ('cmp-referral-wave',   'Ravi Joshi',       '@ravi',       'TX', 'hired',        now() - interval '24 days', 'dani'),
  ('cmp-referral-wave',   'Chloe Stein',      '@chloe',      'CO', 'producing',    now() - interval '38 days', 'marc')
) v(campaign_id, name, handle, state, status, enrolled_at, recruiter_id)
where not exists (
  select 1 from public.recruiting_applicants a
  where a.agency_id = 'e0a68c9f-cf48-47b0-bef7-dba3f27db0b9' and a.handle = v.handle
);

-- Messages — a few per applicant in active conversations
insert into public.recruiting_messages (id, applicant_id, direction, channel, body, ai_drafted, sent_at, agency_id)
select gen_random_uuid(), a.id, m.direction, m.channel, m.body, m.ai_drafted, m.sent_at, 'e0a68c9f-cf48-47b0-bef7-dba3f27db0b9'::uuid
from public.recruiting_applicants a
cross join lateral (
  values
    ('out', 'instagram', 'Hey ' || split_part(a.name, ' ', 1) || ' — saw your profile, would love 15 min on what we are building at Atlas.', false, now() - interval '6 days'),
    ('in',  'instagram', 'sure — what days work?', false, now() - interval '5 days 22 hours'),
    ('out', 'instagram', 'Tomorrow 3p ET? I can send a calendar link.', true, now() - interval '5 days 21 hours')
) as m(direction, channel, body, ai_drafted, sent_at)
where a.agency_id = 'e0a68c9f-cf48-47b0-bef7-dba3f27db0b9'
  and a.status in ('contacted','applied','interviewed','offered')
  and not exists (
    select 1 from public.recruiting_messages rm
    where rm.applicant_id = a.id and rm.body = m.body
  );

-- Bring anon-read RLS up to date for the new column-bearing tables (already
-- covered by 0006's loop, but recreate to ensure it picked these up).
do $$
begin
  for r in select c.table_name from information_schema.columns c
           where c.table_schema='public' and c.column_name='agency_id'
             and c.table_name in ('recruiting_applicants','recruiting_campaigns','recruiting_messages')
  loop
    execute format('drop policy if exists %I on public.%I', 'anon atlas read', r.table_name);
    execute format(
      'create policy %I on public.%I for select to anon using (agency_id::text = %L)',
      'anon atlas read', r.table_name, 'e0a68c9f-cf48-47b0-bef7-dba3f27db0b9'
    );
  end loop;
end$$;
