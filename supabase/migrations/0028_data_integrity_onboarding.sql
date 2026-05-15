-- 0028_data_integrity_onboarding.sql
--
-- 1. Add verification fields to onboarding_progress.
-- 2. Auto-promote reps to 'manager' role when they have a downline.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Onboarding Verification
-- ────────────────────────────────────────────────────────────────────────────
alter table public.onboarding_progress
  add column if not exists verified_by_id text references public.reps(id) on delete set null,
  add column if not exists verified_at    timestamptz,
  add column if not exists is_verified    boolean not null default false;

comment on column public.onboarding_progress.is_verified is 'True when a manager/owner has vetted the documents (license/banking/NIPR).';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Auto-Promotion Trigger
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public._t_reps_auto_promote_manager()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  -- When a rep is assigned an upline, that upline becomes a Manager by definition
  -- if they were previously just a Rep.
  if new.upline_id is not null then
    update public.agency_members
       set role = 'manager'
     where agency_id = new.agency_id
       and user_id = (select user_id from public.reps where id = new.upline_id)
       and role = 'rep';
  end if;
  return new;
end;
$$;

drop trigger if exists reps_auto_promote_manager_trg on public.reps;
create trigger reps_auto_promote_manager_trg
  after insert or update of upline_id on public.reps
  for each row execute function public._t_reps_auto_promote_manager();

-- Backfill: promote anyone who already has a downline
update public.agency_members am
   set role = 'manager'
 where am.role = 'rep'
   and exists (
     select 1 from public.reps r
      where r.upline_id = (select id from public.reps where user_id = am.user_id and agency_id = am.agency_id limit 1)
   );
