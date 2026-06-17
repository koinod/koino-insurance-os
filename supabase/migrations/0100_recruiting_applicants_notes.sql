-- 0100 — recruiter notes on applicants.
--
-- Free-form last-write-wins notes per applicant. Cheap, low-risk; a separate
-- timeline table (recruiting_applicant_notes) is the next step once we want
-- per-author entries + edit history. For v1, the operator wants somewhere
-- to type "this guy already has a 2-15 in FL, follow up Friday" without a
-- modal-and-back-to-modal dance.
alter table public.recruiting_applicants
  add column if not exists notes     text,
  add column if not exists notes_at  timestamptz,
  add column if not exists notes_by  text;
