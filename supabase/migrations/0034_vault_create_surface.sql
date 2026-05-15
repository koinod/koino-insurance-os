-- 0034_vault_create_surface.sql
-- Vault CREATE surface: role-gated visibility + starter-content flag + segment filter rules.
--
-- Live audit on repflow.koino.capital confirmed the Vault is a display/assign shell
-- over empty tables — no UI to actually create courses, scripts, documents, or segments.
-- This migration adds the columns the new CREATE modals need:
--
--   - target_roles text[]   on agency_scripts / agency_docs
--                           (training_courses already has it — added in 0019)
--                           Drives row-level visibility per role; empty/null = all.
--   - is_starter bool       on agency_scripts / agency_docs / training_courses /
--                           vault_segments. Marks rows planted by 0035 seed so the
--                           UI can render a "starter" chip and Ian can tell user-
--                           authored content apart from the walk-through samples.
--   - description text      on agency_scripts (Scripts modal carries one).
--   - cover_url text        on training_courses (Course modal has an optional cover).
--   - filter_rules jsonb    on vault_segments. Stores [{field, op, value}] rows
--                           that Lead Drip will later consume to target sequences.
--
-- All additive. Existing reads keep working when columns default to null/false/[].

------------------------------------------------------------------------------
-- 1. agency_scripts — role-visibility + starter flag + description
------------------------------------------------------------------------------
alter table public.agency_scripts
  add column if not exists target_roles text[] not null default array['owner','manager','rep']::text[];
alter table public.agency_scripts
  add column if not exists is_starter  boolean not null default false;
alter table public.agency_scripts
  add column if not exists description text;

create index if not exists agency_scripts_starter_idx
  on public.agency_scripts (agency_id) where is_starter = true;

------------------------------------------------------------------------------
-- 2. agency_docs — role-visibility + starter flag
------------------------------------------------------------------------------
alter table public.agency_docs
  add column if not exists target_roles text[] not null default array['owner','manager','rep']::text[];
alter table public.agency_docs
  add column if not exists is_starter  boolean not null default false;

create index if not exists agency_docs_starter_idx
  on public.agency_docs (agency_id) where is_starter = true;

------------------------------------------------------------------------------
-- 3. training_courses — starter flag + cover URL (target_roles already in 0019)
------------------------------------------------------------------------------
alter table public.training_courses
  add column if not exists is_starter boolean not null default false;
alter table public.training_courses
  add column if not exists cover_url  text;

create index if not exists training_courses_starter_idx
  on public.training_courses (agency_id) where is_starter = true;

------------------------------------------------------------------------------
-- 4. vault_segments — filter rules + starter flag
--    filter_rules is an array of {field, op, value} objects. Validated at the
--    app layer (Lead Drip targeting) — kept loose here so the UI can evolve.
------------------------------------------------------------------------------
alter table public.vault_segments
  add column if not exists filter_rules jsonb not null default '[]'::jsonb;
alter table public.vault_segments
  add column if not exists is_starter   boolean not null default false;

create index if not exists vault_segments_starter_idx
  on public.vault_segments (agency_id) where is_starter = true;
