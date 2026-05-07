-- 0018_realtime_publication.sql — ensure notifications + commissions stream
-- via Supabase Realtime so the new client subscriptions in data.jsx
-- (TABLE_TO_KEY for "notifications" and "commissions") actually receive
-- events. The other tables in the subscription map are already in the
-- supabase_realtime publication (added via the dashboard at first wire-up).
--
-- This migration is idempotent — wrapping each ALTER in a DO block that
-- swallows the "table is already member of publication" error.

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_table  THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.commissions;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_table  THEN NULL;
  END;
END$$;
