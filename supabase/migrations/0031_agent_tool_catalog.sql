-- 0031_agent_tool_catalog.sql
-- Reconcile the tool-kind contract between the local Repflow Background Agent
-- and the server. The agent's runtime/tools/ directory exports 17 tools; the
-- server's role_actions catalog (migration 0026) only listed 8 of them. This
-- migration adds the missing kinds so jobs enqueued by the AI sidebar will
-- pass Ring-2 (role check) when the matching agent tool name is used.
--
-- We also seed agency_capabilities so a tenant doesn't have to flip every
-- toggle by hand on day one. Operators can disable per-tenant via the
-- /api/agent/agency-capabilities endpoint.
--
-- Naming convention going forward: server kind === agent tool filename.
-- Where the server previously used a different name (transcribe_call vs the
-- agent's fathom_pull_notes), both names remain valid — agent ships a shim
-- module so either kind resolves to the same implementation. Over time the
-- server name wins as the canonical.

-- ---------------------------------------------------------------------------
-- 1. role_actions — Ring 2 catalog additions
-- ---------------------------------------------------------------------------

insert into public.role_actions(role, kind, allow) values
  -- Lead intake
  ('rep',     'create_lead', true),
  ('manager', 'create_lead', true),
  ('owner',   'create_lead', true),

  -- Composition (LLM-only, no external send)
  ('rep',     'draft_email', true),
  ('manager', 'draft_email', true),
  ('owner',   'draft_email', true),
  ('rep',     'draft_sms',   true),
  ('manager', 'draft_sms',   true),
  ('owner',   'draft_sms',   true),
  ('rep',     'script_review', true),
  ('manager', 'script_review', true),
  ('owner',   'script_review', true),
  ('rep',     'file_review', true),
  ('manager', 'file_review', true),
  ('owner',   'file_review', true),

  -- Comms (real send)
  ('rep',     'twilio_dial',    true),
  ('manager', 'twilio_dial',    true),
  ('owner',   'twilio_dial',    true),
  ('rep',     'phone_link_dial',true),
  ('manager', 'phone_link_dial',true),
  ('owner',   'phone_link_dial',true),
  ('rep',     'sendblue_send',  true),
  ('manager', 'sendblue_send',  true),
  ('owner',   'sendblue_send',  true),

  -- Social inbox / outreach (real)
  ('rep',     'ig_dm_reply',    true),
  ('manager', 'ig_dm_reply',    true),
  ('owner',   'ig_dm_reply',    true),
  ('rep',     'meta_dm_send',   true),
  ('manager', 'meta_dm_send',   true),
  ('owner',   'meta_dm_send',   true),
  ('manager', 'linkedin_send',  true),
  ('owner',   'linkedin_send',  true),
  ('manager', 'linkedin_inbox_scan', true),
  ('owner',   'linkedin_inbox_scan', true),

  -- Integrations / pulls
  ('rep',     'fathom_pull_notes',   true),
  ('manager', 'fathom_pull_notes',   true),
  ('owner',   'fathom_pull_notes',   true),
  ('manager', 'fb_pull_lead_forms',  true),
  ('owner',   'fb_pull_lead_forms',  true),

  -- Quote engine
  ('rep',     'auto_quote',  true),
  ('manager', 'auto_quote',  true),
  ('owner',   'auto_quote',  true),

  -- Generic Playwright browser session (gated by capability ledger)
  ('manager', 'browser_run', true),
  ('owner',   'browser_run', true),

  -- Diagnostic / debug
  ('rep',     'phone_link_inspect', true),
  ('manager', 'phone_link_inspect', true),
  ('owner',   'phone_link_inspect', true)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. agency_capabilities — Ring 1 defaults
-- ---------------------------------------------------------------------------
-- Enable every new kind for every existing agency. Daily caps left null —
-- operators can dial those in per-tenant via /api/agent/agency-capabilities.

insert into public.agency_capabilities (agency_id, kind, enabled, max_per_day)
select a.id, k.kind, true, k.max_per_day
from public.agencies a
cross join (values
  ('create_lead',         null::int),
  ('draft_email',         500),
  ('draft_sms',           500),
  ('script_review',       null),
  ('file_review',         null),
  ('twilio_dial',         300),
  ('phone_link_dial',     300),
  ('sendblue_send',       300),
  ('ig_dm_reply',         200),
  ('meta_dm_send',        200),
  ('linkedin_send',       100),
  ('linkedin_inbox_scan', null),
  ('fathom_pull_notes',   null),
  ('fb_pull_lead_forms',  null),
  ('auto_quote',          null),
  ('browser_run',         200),
  ('phone_link_inspect',  null)
) as k(kind, max_per_day)
on conflict (agency_id, kind) do nothing;
