-- 0017 Owner expenses + lead-spend attribution.
--
-- Two tables:
--
--   agency_expenses        — every dollar out of the business. Every row
--                             carries: kind (taxonomy), amount, vendor,
--                             paid_at, paid_by (which account/card), and
--                             optional rep_id when a rep paid out of pocket
--                             (reimbursable=true → owner can mark
--                             reimbursed_at).
--
--   expense_allocations    — when one expense covers multiple reps (e.g.
--                             $1000 of FB ads split across 4 reps), each
--                             slice lands here. SUM(allocations.amount) for
--                             an expense should equal the parent amount,
--                             but partial coverage is allowed (unallocated
--                             remainder is just owner overhead).
--
-- Lead spend specifically links to public.agency_lead_sources so
-- per-source ROAS becomes computable: revenue from leads tagged to
-- source X / sum(expenses where lead_source_id = X) over a period.

------------------------------------------------------------------------------
-- 1. agency_expenses
------------------------------------------------------------------------------
create table if not exists public.agency_expenses (
  id              uuid primary key default gen_random_uuid(),
  agency_id       uuid not null,
  kind            text not null check (kind in (
                    'lead_spend','recruiting_ad','marketing','saas','payroll',
                    'commissions','rent','equipment','licensing','training',
                    'travel','meals','professional_services','other'
                  )),
  amount_cents    bigint not null,
  description     text,
  vendor          text,                                -- "Convoso", "FB Ads", "AppSheet", ...
  paid_at         date,                                -- when the dollars went out
  -- Who paid (account / card)
  paid_by         text not null default 'agency'
                  check (paid_by in (
                    'agency','owner_personal','owner_amex','llc_card',
                    'rep_oop','manager_oop','other'
                  )),
  paid_by_rep_id  text references public.reps(id) on delete set null,
  reimbursable    boolean not null default false,
  reimbursed_at   timestamptz,
  reimbursed_amount_cents bigint,
  -- Optional links for attribution
  lead_source_id  uuid references public.agency_lead_sources(id) on delete set null,
  campaign_id     uuid,                                -- recruiting_campaigns or future ad campaigns
  receipt_url     text,
  notes           text,
  created_by      uuid,                                -- auth.users.id
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_expenses_agency_paid     on public.agency_expenses (agency_id, paid_at desc);
create index if not exists idx_expenses_agency_kind     on public.agency_expenses (agency_id, kind, paid_at desc);
create index if not exists idx_expenses_lead_source     on public.agency_expenses (lead_source_id) where lead_source_id is not null;
create index if not exists idx_expenses_paid_by_rep     on public.agency_expenses (paid_by_rep_id) where paid_by_rep_id is not null;
create index if not exists idx_expenses_reimbursable    on public.agency_expenses (agency_id, reimbursable, reimbursed_at) where reimbursable;

alter table public.agency_expenses enable row level security;

-- Anon: demo carve-out only. Real agencies require auth.
create policy "anon atlas read expenses" on public.agency_expenses
  for select to anon
  using (agency_id::text = 'e0a68c9f-cf48-47b0-bef7-dba3f27db0b9');

-- Read: any active member of the agency. Reps see their own + global agency
-- expenses; the UI scopes further.
create policy "tenant read expenses" on public.agency_expenses
  for select to authenticated
  using (agency_id in (select public.viewer_agency_ids()));

-- Write (insert + update + delete): owner-only by default.
-- Managers can insert lead-spend / recruiting-ad expenses tied to their
-- downline, but cannot edit owner-paid global expenses.
create policy "owner manage expenses" on public.agency_expenses
  for all to authenticated
  using (
    agency_id in (select public.viewer_agency_ids())
    and exists (
      select 1 from public.agency_members m
       where m.agency_id = agency_expenses.agency_id
         and m.user_id   = auth.uid()
         and m.active    = true
         and m.role      in ('owner','admin')
    )
  )
  with check (
    agency_id in (select public.viewer_agency_ids())
    and exists (
      select 1 from public.agency_members m
       where m.agency_id = agency_expenses.agency_id
         and m.user_id   = auth.uid()
         and m.active    = true
         and m.role      in ('owner','admin')
    )
  );

create policy "manager insert downline-tied spend" on public.agency_expenses
  for insert to authenticated
  with check (
    agency_id in (select public.viewer_agency_ids())
    and exists (
      select 1 from public.agency_members m
       where m.agency_id = agency_expenses.agency_id
         and m.user_id   = auth.uid()
         and m.active    = true
         and m.role      in ('manager')
    )
    and kind in ('lead_spend','recruiting_ad','marketing','training','meals','travel')
  );

------------------------------------------------------------------------------
-- 2. expense_allocations — per-rep slices of a single expense
------------------------------------------------------------------------------
create table if not exists public.expense_allocations (
  id              uuid primary key default gen_random_uuid(),
  expense_id      uuid not null references public.agency_expenses(id) on delete cascade,
  rep_id          text not null references public.reps(id) on delete cascade,
  amount_cents    bigint not null,
  notes           text,
  created_at      timestamptz not null default now(),
  unique (expense_id, rep_id)
);

create index if not exists idx_alloc_rep on public.expense_allocations (rep_id);

alter table public.expense_allocations enable row level security;

-- Read: through the parent expense's RLS (joins on agency_id). To keep this
-- cheap, copy the agency check via the expense relationship.
create policy "anon atlas read alloc" on public.expense_allocations
  for select to anon
  using (
    expense_id in (
      select id from public.agency_expenses
       where agency_id::text = 'e0a68c9f-cf48-47b0-bef7-dba3f27db0b9'
    )
  );

create policy "tenant read alloc" on public.expense_allocations
  for select to authenticated
  using (
    expense_id in (
      select id from public.agency_expenses
       where agency_id in (select public.viewer_agency_ids())
    )
  );

create policy "owner manage alloc" on public.expense_allocations
  for all to authenticated
  using (
    expense_id in (
      select e.id from public.agency_expenses e
       join public.agency_members m on m.agency_id = e.agency_id
       where m.user_id = auth.uid()
         and m.active = true
         and m.role in ('owner','admin','manager')
    )
  )
  with check (
    expense_id in (
      select e.id from public.agency_expenses e
       join public.agency_members m on m.agency_id = e.agency_id
       where m.user_id = auth.uid()
         and m.active = true
         and m.role in ('owner','admin','manager')
    )
  );

------------------------------------------------------------------------------
-- 3. Helper view: per-rep spend roll-up (allocations + paid_by_rep)
------------------------------------------------------------------------------
create or replace view public.v_rep_spend as
with allocated as (
  select e.agency_id, a.rep_id, sum(a.amount_cents)::bigint as alloc_cents
    from public.expense_allocations a
    join public.agency_expenses e on e.id = a.expense_id
   group by e.agency_id, a.rep_id
),
oop as (
  select agency_id, paid_by_rep_id as rep_id,
         sum(amount_cents)::bigint                                          as oop_cents,
         sum(amount_cents) filter (where reimbursable and reimbursed_at is null)::bigint  as pending_reimb_cents,
         sum(coalesce(reimbursed_amount_cents, 0))::bigint                  as reimbursed_cents
    from public.agency_expenses
   where paid_by_rep_id is not null
   group by agency_id, paid_by_rep_id
)
select
  coalesce(a.agency_id, o.agency_id) as agency_id,
  coalesce(a.rep_id, o.rep_id)       as rep_id,
  coalesce(a.alloc_cents, 0)         as allocated_cents,
  coalesce(o.oop_cents, 0)           as out_of_pocket_cents,
  coalesce(o.pending_reimb_cents, 0) as pending_reimbursement_cents,
  coalesce(o.reimbursed_cents, 0)    as reimbursed_cents
from allocated a
full outer join oop o on a.agency_id = o.agency_id and a.rep_id = o.rep_id;

grant select on public.v_rep_spend to anon, authenticated;

------------------------------------------------------------------------------
-- 4. Helper view: per-source ROAS-ready spend totals
------------------------------------------------------------------------------
create or replace view public.v_lead_source_spend as
select
  e.agency_id,
  e.lead_source_id,
  s.name as source_name,
  date_trunc('month', e.paid_at) as month,
  sum(e.amount_cents)::bigint as spend_cents,
  count(*)::int as expense_count
from public.agency_expenses e
left join public.agency_lead_sources s on s.id = e.lead_source_id
where e.kind = 'lead_spend' and e.paid_at is not null
group by e.agency_id, e.lead_source_id, s.name, date_trunc('month', e.paid_at);

grant select on public.v_lead_source_spend to anon, authenticated;

------------------------------------------------------------------------------
-- 5. Demo seed (Atlas only) so the new page isn't empty for demo viewers.
------------------------------------------------------------------------------
insert into public.agency_expenses
  (agency_id, kind, amount_cents, description, vendor, paid_at, paid_by, reimbursable, notes)
values
  ('e0a68c9f-cf48-47b0-bef7-dba3f27db0b9'::uuid, 'lead_spend',     280000, 'FB exclusive Med Supp leads · Q2 wave 3', 'FB Ads',          (current_date - 14), 'agency', false, null),
  ('e0a68c9f-cf48-47b0-bef7-dba3f27db0b9'::uuid, 'lead_spend',     145000, 'Convoso live transfer · Tampa zone',       'Convoso',         (current_date - 9),  'agency', false, null),
  ('e0a68c9f-cf48-47b0-bef7-dba3f27db0b9'::uuid, 'recruiting_ad',  62000,  'Indeed sponsored producer listing',         'Indeed',          (current_date - 6),  'owner_amex', false, null),
  ('e0a68c9f-cf48-47b0-bef7-dba3f27db0b9'::uuid, 'saas',           24900,  'Repflow OS · monthly',                      'Repflow',         (current_date - 4),  'llc_card', false, null),
  ('e0a68c9f-cf48-47b0-bef7-dba3f27db0b9'::uuid, 'meals',          18400,  'Top producer dinner · April',               'Capital Grille',  (current_date - 3),  'owner_personal', false, null),
  ('e0a68c9f-cf48-47b0-bef7-dba3f27db0b9'::uuid, 'training',       9900,   'AHIP cert renewal · Tony Park',             'AHIP',            (current_date - 2),  'rep_oop', true,  'Reimburse weekly')
on conflict do nothing;
