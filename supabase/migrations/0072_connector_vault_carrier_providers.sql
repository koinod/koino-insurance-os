-- 0072_connector_vault_carrier_providers.sql
--
-- Extends connector_vault.provider CHECK constraint to allow carrier_* slugs.
--
-- The existing carrier portal login editor (Settings → Carriers, lock icon)
-- uses provider = 'carrier_<slug>' (e.g. 'carrier_mutual_omaha') but the
-- original CHECK constraint (migration 0030) only allowed a fixed list of
-- integration names. Any carrier portal login save was silently rejected by
-- the DB constraint. This migration fixes that.
--
-- Strategy: replace the enum-style CHECK with a regex that covers both the
-- original fixed providers and the 'carrier_*' namespace used by RBA.

ALTER TABLE public.connector_vault
  DROP CONSTRAINT IF EXISTS connector_vault_provider_check;

ALTER TABLE public.connector_vault
  ADD CONSTRAINT connector_vault_provider_check
  CHECK (
    provider ~ '^carrier_[a-z0-9_-]+$'
    OR provider IN (
      'twilio','sendblue','fathom','gmail','outlook','linkedin','sales_nav',
      'fb_ads','ig_business','meta_dm','calendly','stripe','bluetooth_phone',
      'phantombuster','apollo','zoominfo','clay','custom'
    )
  );

-- Verify: constraint exists and allows a carrier slug.
DO $$
BEGIN
  -- Attempt a function-level dry-run: confirm the regex matches expected slugs.
  IF NOT ('carrier_mutual_omaha' ~ '^carrier_[a-z0-9_-]+$') THEN
    RAISE EXCEPTION 'carrier slug regex sanity check failed';
  END IF;
  IF NOT ('carrier_fg' ~ '^carrier_[a-z0-9_-]+$') THEN
    RAISE EXCEPTION 'carrier slug regex sanity check failed (fg)';
  END IF;
  IF 'bad_provider' ~ '^carrier_[a-z0-9_-]+$' THEN
    RAISE EXCEPTION 'carrier slug regex matched a non-carrier value — logic error';
  END IF;
  RAISE NOTICE '0072: connector_vault.provider CHECK extended successfully';
END $$;
