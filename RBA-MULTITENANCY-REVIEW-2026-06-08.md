# RBA / Auto-Quoter multitenancy review — 2026-06-08

Post-work review of per-agent / per-agency isolation across the carrier-setup
→ credential → RBA surface, after the 2026-06-08 wiring + hardening pass
(commits: creds→agent wiring, carrier-setup UX, saved rate-path maps, anon
read scoping + credential audit).

## Isolation matrix (current state)

| Surface | Scoping today | Verdict |
|---|---|---|
| `agency_carrier_appointments` | authenticated tenant read (`viewer_agency_ids()`), owner/manager write | ✅ correct |
| `reps.carrier_prefs` (quote/deal visibility) | per-user row | ✅ correct |
| `carrier_quote_maps` (new) | authenticated tenant read; owner/manager/admin write; **agent reads via `/api/agent/quote-map` token endpoint scoped to the install's `agency_id`** (never anon) | ✅ correct, per-agency |
| `connector_vault` (carrier logins) | authenticated self-only read/delete; upsert via SECURITY-DEFINER RPC that stamps the caller's `agency_id`; agent fetch via `/api/agent/connector-exchange` (agent_token → that install's `user_id`) | ⚠️ scoping OK, **but plaintext at rest** |
| `auto_quote_requests` | authenticated tenant read (agency); **anon read now scoped to `queued`/`running` only** (was `true`); anon insert/update still `using true` | ⚠️ partial |
| `auto_quote_results` | authenticated "follows request access"; **anon read + insert still `using true`** | ❌ cross-agency |
| `carrier_sessions` | authenticated tenant read; **anon upsert `using true`** | ❌ cross-agency write |
| `auto_quoter_settings` | authenticated tenant read; **anon upsert `using true`** | ❌ cross-agency write |

## Root cause of the remaining gaps

The local quote agent authenticates to Supabase with the **public anon key**
(embedded in the client + shipped in every install) and self-scopes by adding
`rep_id=eq.<id>` filters. RLS can't trust a client-supplied filter, so the
anon policies are written `using (true)`. Net effect: **anyone holding the
public anon key can**:

- **S1 (read)** — read other agencies' `auto_quote_results` (premiums/errors)
  and in-flight `auto_quote_requests` (lead age/state/profile PII). *Requests
  history was closed in migration 0090; results + in-flight requests remain.*
- **S2 (write/forge)** — insert fake `auto_quote_results` rows against any
  `request_id`, and upsert any rep's `carrier_sessions` / `auto_quoter_settings`
  (e.g. spoof "agent online", poison session-health, flip headless).

Severity: **S1 = medium (PII/competitive leak), S2 = medium (integrity/spoof)**.
Not a credential leak — `connector_vault` is already self-scoped and never
anon-readable.

## Recommended fix — token-auth cutover (the real fix)

The agent already carries an `agent_token` after the 2026-06-08 wiring. Move
its Supabase access OFF the anon key and onto token-authenticated
`/api/agent/*` endpoints that run as **service role, scoped server-side to the
install's `rep_id` + `agency_id`** (same pattern as `connector-exchange` and
the new `quote-map`):

1. `POST /api/agent/quote-jobs/next`   — claim next queued job for *this*
   install's rep (atomic status→running), return it.
2. `POST /api/agent/quote-jobs/result` — write a result + advance status, with
   the endpoint verifying the `request_id` belongs to the install's agency.
3. `POST /api/agent/session-state`     — upsert `carrier_sessions` /
   `auto_quoter_settings` for the install's rep only.
4. Agent: prefer these when `agent_token` is set; keep anon REST as fallback
   **only** until the fleet is re-installed with a token.
5. Once all installs are token-bearing → **drop the anon policies** on
   `auto_quote_results` / `carrier_sessions` / `auto_quoter_settings` and the
   remaining anon read on `auto_quote_requests`.

This is a breaking change for already-installed tokenless agents (they must
reinstall with `KOINO_RBA_TOKEN`), which is why it's staged behind a fallback
rather than a hard flip.

## Decision needed — `connector_vault` encryption at rest

Columns are named `*_enc` but store **plaintext** (pgsodium deferred). To
encrypt without locking reps out of live quoting we need one decision:

- **Key location**: a server-only `CRED_ENC_KEY` in Vercel env (Edge functions
  encrypt on upsert / decrypt on exchange via `pgcrypto pgp_sym_*`), so the key
  never lives in the DB. Alternative: Supabase Vault / pgsodium key id (more
  moving parts; pgsodium column-TCE is being deprecated).
- **Migration of existing rows**: re-encrypt in place (one-time backfill) vs.
  require reps to re-save credentials. Re-encrypt-in-place is preferred (no rep
  action), but means the backfill briefly reads plaintext server-side.

Until that decision lands, encryption stays deferred (documented here so it
isn't silently assumed done).

## What's already fixed (this pass)

- Migration 0090: anon read of `auto_quote_requests` scoped to in-flight only
  (closed the requests-history PII leak).
- `connector-exchange` now audits every credential fetch (`agent_audit`).
- `carrier_quote_maps` built per-agency from day one (agent reads via token,
  never anon) — no new tenancy debt.
