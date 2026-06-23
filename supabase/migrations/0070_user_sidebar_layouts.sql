-- 0070 — Per-user sidebar layout persistence.
--
-- Applied to prod via mcp__claude_ai_Supabase__apply_migration on 2026-05-24.
-- Gated to manager / owner / super_admin / admin / imo_owner — reps never
-- write here (RLS enforced + app-layer gate).
--
-- layout shape: array of widget descriptors, order = render order:
--   { "id":"nav.today", "kind":"nav", "label":"Today", "icon":"Home", "pageId":"today" }
--   example legacy widget rows may have included non-nav items
--   { "id":"act.log-deal", "kind":"action", "label":"Log Deal", "icon":"Plus", "action":"openQuickLogDeal" }
--
-- Empty row is never written — DELETE = revert to role default (handled client-side).

create table if not exists public.user_sidebar_layouts (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  role        text not null check (role in ('manager','owner','super_admin','admin','imo_owner')),
  layout      jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.user_sidebar_layouts enable row level security;

drop policy if exists "sidebar_layout_self" on public.user_sidebar_layouts;
create policy "sidebar_layout_self" on public.user_sidebar_layouts for all to authenticated
  using  (user_id = auth.uid() or public.is_super_admin())
  with check (user_id = auth.uid() or public.is_super_admin());

-- verify table created
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_sidebar_layouts'
  ) THEN
    RAISE EXCEPTION 'user_sidebar_layouts table not created';
  END IF;
END $$;
