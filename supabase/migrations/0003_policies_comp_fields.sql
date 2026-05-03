-- 0003_policies_comp_fields.sql
-- Add the deal-entry fields that page-deal-write.jsx writes (and that
-- page-extras.jsx > PageCommissions reads) so commissions calculate
-- straight off the rep-entered comp % at deal-write time.
--
-- target_premium_cents       — only set when product is IUL; commission base
--                              uses target_premium when present, else ap_cents
-- comp_rate_pct               — rep enters this on deal entry; defaults from
--                              product.comp_pct but overridable
-- expected_commission_cents   — auto-derived by trigger when not provided
-- submission_date / initial_draft_date — paperwork dates rep enters

alter table public.policies add column if not exists target_premium_cents       bigint;
alter table public.policies add column if not exists comp_rate_pct              numeric(6,2);
alter table public.policies add column if not exists expected_commission_cents  bigint;
alter table public.policies add column if not exists submission_date            date;
alter table public.policies add column if not exists initial_draft_date         date;

create or replace function public._t_policies_expected_commission() returns trigger
language plpgsql as $$
begin
  if new.comp_rate_pct is not null and new.expected_commission_cents is null then
    new.expected_commission_cents := round(coalesce(new.target_premium_cents, new.ap_cents) * new.comp_rate_pct / 100.0);
  end if;
  return new;
end;
$$;

drop trigger if exists policies_expected_commission_trg on public.policies;
create trigger policies_expected_commission_trg
  before insert or update of ap_cents, target_premium_cents, comp_rate_pct, expected_commission_cents
  on public.policies
  for each row execute function public._t_policies_expected_commission();

create index if not exists policies_owner_month_idx on public.policies (owner_rep_id, submission_date desc);
