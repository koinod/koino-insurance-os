-- Tighten agent_install_tokens RLS.
--
-- Problem: previous policies allowed `anon` role to INSERT and SELECT this
-- table directly via PostgREST. Anyone with the public anon key (i.e., anyone
-- who can read the deployed JS) could mint enrollment tokens or list every
-- minted token. Bypassed the API auth gate entirely.
--
-- Fix: drop the anon policies. Host enrollment + heartbeat both go through
-- SECURITY DEFINER RPCs (enroll_host, heartbeat_host) which bypass RLS, so
-- the install.sh flow keeps working. The operator-side mint path uses a
-- caller JWT (authenticated), so its INSERT is covered by the existing
-- authenticated policy.

drop policy if exists "anon mint token" on public.agent_install_tokens;
drop policy if exists "anon read agent_install_tokens" on public.agent_install_tokens;
