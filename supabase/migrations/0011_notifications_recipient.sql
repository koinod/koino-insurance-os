-- 0011 notifications recipient.
--
-- Closes GAP-C1 — the agency_notifications table currently broadcasts
-- everything to everyone, so a rep sees coaching nudges meant for their
-- teammate. Adding an optional recipient_rep_id lets us narrow:
--
--   recipient_rep_id IS NULL          → agency-wide broadcast (default)
--   recipient_rep_id = '<rep id>'      → only that rep sees it
--
-- The UI filter joins this with public.me() so reps see only their own
-- targeted notifications + every agency-wide broadcast.

alter table if exists public.agency_notifications
  add column if not exists recipient_rep_id text;

create index if not exists agency_notifications_recipient_idx
  on public.agency_notifications (recipient_rep_id, created_at desc)
  where recipient_rep_id is not null;

-- Drop + replace the read policies so the SELECT/UPDATE checks honor the
-- new column. Keep the agency-scope check intact (RLS still pins to the
-- viewer's agency_id from public.me()).

drop policy if exists "auth read agency notifications" on public.agency_notifications;
create policy "auth read agency notifications"
  on public.agency_notifications for select to authenticated
  using (
    agency_id = (select agency_id from public.me() limit 1)
    and (
      recipient_rep_id is null
      or recipient_rep_id = (select rep_id from public.me() limit 1)
      or (select role from public.me() limit 1) in ('manager','owner')
    )
  );
