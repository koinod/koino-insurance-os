-- 0068_reps_carrier_prefs.sql
--
-- Per-rep "show this carrier in my Quote tool" / "show this carrier in my
-- Deal-write dropdown" toggles. Lets reps prune the carrier list down to
-- the ones they actually write, without affecting other reps in the agency.
--
-- Shape (empty default = all carriers visible):
--   {
--     "quotes": { "aetna": false, "cigna": true, ... },
--     "deals":  { "aetna": true, "naa": false, ... }
--   }
--
-- A missing key means "default visible." A key set to false means "hide."
-- A key set to true is explicit-show (same as missing). Storing both poles
-- so the UI can distinguish "user explicitly said yes" from "never touched."

alter table public.reps
  add column if not exists carrier_prefs jsonb not null default '{}'::jsonb;

-- No RLS change needed — reps already RLS-scoped by agency_id.
