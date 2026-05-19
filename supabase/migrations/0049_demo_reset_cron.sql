-- 0049_demo_reset_cron.sql
--
-- Schedules automatic demo reset every 4 hours via pg_cron.
-- Falls back gracefully if pg_cron is not enabled in this Supabase project.
--
-- FALLBACK (Vercel cron): If pg_cron is unavailable, schedule via
--   vercel.json: { "crons": [{ "path": "/api/cron/reset-demo", "schedule": "0 */4 * * *" }] }
-- The /api/cron/reset-demo route calls:
--   supabase.rpc('reset_demo_agency', { p_slug: 'atlas' })
-- using the service-role key (which bypasses RLS and has super_admin context).
-- See docs/DEMO_RUNBOOK.md for the full setup.

do $$
declare
  v_cron_available boolean;
  v_job_name text := 'reset-demo-agency-atlas-4h';
begin
  -- Check if pg_cron extension is available
  select exists(
    select 1 from pg_extension where extname = 'pg_cron'
  ) into v_cron_available;

  if not v_cron_available then
    raise notice 'pg_cron not enabled in this project. Schedule resets via Vercel cron at /api/cron/reset-demo instead. See docs/DEMO_RUNBOOK.md.';
    return;
  end if;

  -- Unschedule any prior version of this job
  perform cron.unschedule(v_job_name)
   where exists (
     select 1 from cron.job where jobname = v_job_name
   );

  -- Schedule: every 4 hours (0:00, 4:00, 8:00, 12:00, 16:00, 20:00 UTC)
  perform cron.schedule(
    v_job_name,
    '0 */4 * * *',
    $cmd$select public.reset_demo_agency('atlas')$cmd$
  );

  raise notice 'pg_cron job "%" scheduled: every 4 hours.', v_job_name;

exception when others then
  raise notice 'pg_cron schedule failed (%). Use Vercel cron fallback. Error: %', v_job_name, sqlerrm;
end $$;
