-- 0012 pipeline cancelled stage.
--
-- The pipeline stage CHECK constraint stops at 'Issued' / 'Lost' but real
-- agencies need a 'Cancelled' bucket for policies that issued and then
-- cancelled before clawback (1099 will recapture comp). Right now those
-- get hidden in the policies table without a CRM-visible state.

alter table public.pipeline drop constraint if exists pipeline_stage_check;

alter table public.pipeline
  add constraint pipeline_stage_check
  check (stage in ('New','Contacted','Quoted','App In','Issued','Cancelled','Lost'));
