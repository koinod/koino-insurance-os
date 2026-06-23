-- 0101 — Sidebar layout persistence per user + role.
--
-- 0070 stored one row per user and only allowed manager/owner/admin-style
-- roles. The current UI lets every authenticated role customize its sidebar,
-- and super-admins can switch between Rep / Mgr / Admin views. One row per
-- user made those role layouts overwrite each other; the role check also made
-- rep/agent saves fail. This migration makes the table match the UI contract.

create table if not exists public.user_sidebar_layouts (
  user_id     uuid not null references auth.users(id) on delete cascade,
  agency_id   uuid references public.agencies(id) on delete cascade,
  role        text not null,
  layout      jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now(),
  constraint user_sidebar_layouts_pkey primary key (user_id, role)
);

alter table public.user_sidebar_layouts
  alter column agency_id drop not null;

alter table public.user_sidebar_layouts
  drop constraint if exists user_sidebar_layouts_role_check;

alter table public.user_sidebar_layouts
  add constraint user_sidebar_layouts_role_check
  check (role in ('rep','agent','manager','owner','super_admin','admin','imo_owner'));

alter table public.user_sidebar_layouts
  drop constraint if exists user_sidebar_layouts_pkey;

alter table public.user_sidebar_layouts
  add constraint user_sidebar_layouts_pkey primary key (user_id, role);

create index if not exists idx_user_sidebar_layouts_user_updated
  on public.user_sidebar_layouts (user_id, updated_at desc);

alter table public.user_sidebar_layouts enable row level security;

drop policy if exists "sidebar_layout_self" on public.user_sidebar_layouts;
create policy "sidebar_layout_self" on public.user_sidebar_layouts for all to authenticated
  using  (user_id = auth.uid() or public.is_super_admin())
  with check (user_id = auth.uid() or public.is_super_admin());

comment on table public.user_sidebar_layouts is
  'Per-user, per-role sidebar widget layout. NULL agency_id is allowed for platform-only super-admin accounts.';
