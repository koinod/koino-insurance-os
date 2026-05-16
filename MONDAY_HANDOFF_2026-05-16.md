# Monday handoff — get reps dialing leads in production

**Authored:** 2026-05-16 (Friday). Target: producers dialing real leads from
RepFlow Monday 2026-05-19.

---

## TL;DR — what's already shipped, what's still gating

**Shipped + live on `origin/main`, serving from `https://repflow.koino.capital`:**

| Layer | Detail |
|---|---|
| 0029 life+annuity underwriting schema + RPCs | 6 tables (`carrier_profiles`, `product_features_life`, `product_features_annuity`, `product_underwriting_rules`, `carrier_scrape_jobs`, `carrier_scrape_findings`) + `approve_/reject_carrier_scrape_finding` |
| 0031 lead drip phase 1 columns | `agency_lead_sources` extended with `kind`, `inbound_slug`, `inbound_hmac_secret`, `field_map`, `default_sequence_id`, `last_received_at`, `inbound_count`, `notes` |
| `create_inbound_lead_source` RPC | Mints slug + 64-char HMAC secret, security-definer, scoped to caller's agency |
| 8 carriers + 12 products + **73 approved underwriting rules** | Seeded from `lib/carrier-underwriting.json` |
| Quote tool DB hydration | `lib/rate-engine.js?v=93` — `hydrateFromSupabase()` overrides JSON fallback when DB rows exist |
| Connect Source wizard | `page-crm.js?v=95` — webhook (Ringy/Convoso/Lead Heroes/TLW/Generic/Custom) + CSV upload + OAuth-pivots-to-webhook |
| Carrier add/edit fix | `page-tenant.js?v=93` — UI categories/statuses match DB CHECK enum |
| AuthGate fixes | `page-auth.js?v=87` — refreshMe awaited, tenant.member authoritative |
| `provision_sub_agency` RPC param names | `p_*` prefixed — fresh signups can actually create agencies |
| App-wide cross-IIFE crash fix | `app.js?v=95` — `F(key, props)` helper degrades to `PageStub` when `window[key]` is missing |
| Lead-drip horizontal pill bar removed | `page-leaddrip.js?v=87` |

**DB ground truth as of authoring:**

```
active_twilio_conns:     0   ← softphone won't dial anywhere
active_lead_sources:     4
sources w/ real inbound: 0   ← nobody has pointed a vendor at the URL yet
pipeline rows:           8   (test data)
onboarded reps:          2   (Ian × 2 aliases)
active sequences:        6
```

The plumbing is live; no real water is flowing through it yet.

---

## Monday bar — gating gaps ranked by impact

Each item has a concrete starting action.

### 1. Wire Twilio for real

Number is in verification with Twilio (Ian, 2026-05-16). Verification alone
isn't enough; once it lands:

- Set Vercel env vars (Production + Preview): `TWILIO_ACCOUNT_SID`,
  `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_TWIML_APP_SID`,
  `TWILIO_CALLER_ID`. **Force redeploy** of latest production deployment so the
  env vars actually take effect (Vercel doesn't propagate env to existing
  deployments — see LEARNINGS.md).
- Insert a `connections` row per agency going live:

  ```sql
  INSERT INTO public.connections (agency_id, category, name, status, config, meta)
  VALUES (
    '<agency_uuid>', 'twilio', 'Twilio (production)', 'active',
    jsonb_build_object(
      'account_sid', 'AC…',
      'api_key_sid', 'SK…',
      'twiml_app_sid', 'AP…',
      'caller_id', '+1…'
    ),
    jsonb_build_object('verified_at', now())
  );
  ```

- Smoke-test as a non-super-admin rep: open Floor → click any lead → click
  Phone. Expect Voice SDK to mint a token, register a device, and dial. If
  the softphone errors, the `/api/twilio-token` edge fn is the first
  suspect (graceful 503 if env missing).

### 2. Connect at least one real lead source for the launch agency

`agency_lead_sources` has 4 rows but 0 with `inbound_count > 0`. Reps log in
to an empty queue otherwise.

- Pick the cheapest source you can re-point today (Ringy / Convoso / a CSV
  of yesterday's leads).
- Open RepFlow → CRM → **Connect source** → mint webhook URL → paste into
  Ringy/Convoso webhook settings. The endpoint is
  `https://repflow.koino.capital/api/leads/inbound-source?source=<slug>`
  and verifies HMAC via `x-repflow-signature: sha256=<hex>`.
- Watch for `inbound_count > 0` in `agency_lead_sources` and a new row in
  `public.pipeline` with `stage='New'`.
- If you can't point a real source: use CSV upload (also in Connect Source
  modal). It bulk-inserts into `pipeline` directly.

### 3. Walk producer onboarding end-to-end

The 9-step `agency_onboarding_steps` wizard (profile → branding → carriers →
products → connectors → agents_install → invite_team → billing → first_lead)
**has not been smoke-tested with a fresh email since the
`provision_sub_agency` RPC param fix landed**. Every Monday-invited rep hits
this. If step 5 (Connectors) or step 6 (AI agents) RPC throws, they're
stranded with no recovery path.

- Sign up with a throwaway email through the "Join with invite" path on
  `repflow.koino.capital`.
- Walk every step. Note which step's `complete_onboarding_step` RPC errors.
- The wizard's source: `page-first-run.jsx`. Each step is in `StepProfile`,
  `StepBranding`, etc.
- Reference: `v_agency_onboarding_status` view, `agency_onboarding_steps`
  table.

### 4. Disposition + pipeline-stage advance

After a call ends, the rep needs to mark Interested / Voicemail / Sold / No
answer. That writes back to `pipeline.stage`. Postgres triggers on
`pipeline.stage='Issued'` fan out notifications + commissions.

- Find the disposition UI on the Floor (`page-floor.jsx` /
  `page-floor-actions.jsx`).
- Smoke: pick a test lead, change stage to "Issued" via the UI, confirm a
  `commissions` row appears.
- If the trigger doesn't fire, the issue is likely in `0008_*` or
  whichever migration added the pipeline-stage trigger.

### 5. SOA + call recording compliance

Med Supp + Med Adv require:
- TPMO disclosure script read at the top of every MA call (one-party
  consent in most states, two-party in CA/FL/IL/PA/WA).
- SOA (Scope of Appointment) signed BEFORE any plan comparison — generated
  via the `generateSOAPdf` helper in `page-onboarding.jsx`.
- Recorded call → lands in `vault_artifacts` with `kind='Recording'` via
  `api/twilio-recording.js`.

Verify: dial → record → check `vault_artifacts` for a new row with the
right `consent` flag and TPMO disclosure metadata.

### 6. Commission math when Issued

When `pipeline.stage` flips to `Issued`, a `commissions` row should
auto-write via postgres trigger. Verify the trigger exists in the live
schema and the math (commission % from `products.comp_pct`, override % from
`agency_members.config_json` upline cascade) matches what Cody actually
pays.

---

## Things that are NOT blockers Monday

Don't burn the weekend on these:

- Underwriting rule editor UI (Cody's reps don't add rules; Ian seeded 73)
- Lead source list/edit screen (workaround: keep secrets in 1Password)
- Concurrent-writer chaos in the working tree (operational pain, not
  rep-facing)
- Marketing site, public pricing, demo-agency seed
- Cross-IIFE bare references in non-app.jsx files (`F()` codemod can wait;
  app.jsx was the path that crashed)

---

## Important traps discovered this session

### Concurrent writers stomp every commit

Eight parallel `sprint/*` branches exist. Every single commit I made today
had to `git stash push -u` of 5–7 unrelated dirty files (`icons.jsx`,
`shared.jsx`, `page-floor.jsx`, `page-admin.jsx`, `page-pipeline.jsx`,
`page-queue.jsx`) before I could push. If a parallel sprint agent commits
during your work, you'll need to rebase or merge.

**Pattern:** stash → push → pop → continue. Don't `git checkout -- <file>`
on a dirty file you didn't touch.

### `?v=N` cache-buster is hand-managed and lies

The site uses `<script src="dist/X.js?v=N"></script>` for cache invalidation.
**The version number is decoupled from the actual file content.** I saw
`?v=82` serve broken SpendStrip content because someone bumped the version
before the right build deployed. When you push a fix, bump the version on
the affected file AND verify the new dist has your changes (`grep` for a
known marker in `dist/page-X.js`).

### Migrations don't auto-apply

Migration files in `supabase/migrations/` are NOT applied to the live DB
automatically. Vercel deploys the API; the DB only gets new schema via
explicit `supabase db push` or via the Supabase MCP `apply_migration` tool.
**0030_rba_installs.sql** existed in tree but the underwriting tables
weren't on the live DB until I explicitly applied 0029.

### Sprint branches vs main

When you check `git rev-parse --abbrev-ref HEAD`, you may be on a
`sprint/*` branch from a parallel agent's worktree. All production work
should be `git push origin main` — explicitly target main, don't just
`git push`. Verify with `git branch -a --contains <sha>` that your commit
landed on `origin/main`.

### Cross-IIFE bare references crash whole pages

Each `*.jsx` is wrapped in an IIFE by `scripts/build-jsx.mjs`. Bare
`<PageTeam/>` in `app.jsx` only works if `page-owner.js` ran first AND
assigned `window.PageTeam = PageTeam`. Any cache mismatch, parse error, or
load order issue throws `"Can't find variable: PageTeam"` and crashes the
whole app on render. **Fix pattern:** use the new `F(key, props)` helper
in `app.jsx`, which falls back to `<PageStub/>`.

### Settings → Carriers had silent CHECK violations

Both `carriers.category` (display strings vs `med_supp`-style enum) and
`carriers.status` (`paused`/`terminated` vs `active`/`pending`/`inactive`)
had UI/DB mismatches that silently 23514'd. Both fixed. Pattern: when a
Supabase insert fails with the generic save-failed toast, look for CHECK
constraint violation in postgres logs.

---

## Key paths for the next session

```
/Users/macmini/repos/koino-insurance-os/
├── page-quote.jsx           # Quote tool (reads from product_underwriting_rules)
├── page-crm.jsx             # Has ConnectModal + WebhookSetupView + CsvUploadView
├── page-tenant.jsx          # SettingsCarriers (the just-fixed enum bugs)
├── page-first-run.jsx       # 9-step onboarding wizard (UNTESTED end-to-end)
├── page-auth.jsx            # AuthGate routing
├── app.jsx                  # F() helper, switch over `page` state
├── lib/rate-engine.js       # hydrateFromSupabase() reads product_underwriting_rules
├── api/leads/inbound-source.js  # Webhook receiver, HMAC verify
├── api/twilio-token.js      # Voice SDK token mint
├── api/twilio-recording.js  # Recording webhook → vault_artifacts
└── supabase/migrations/
    ├── 0029_life_annuity_underwriting.sql  (applied)
    └── 0031_lead_drip_phase1.sql           (applied)
```

**Supabase project ID:** `jfphwmzwteermalzwojp` (use Supabase MCP — read
allowed for any authed user, write requires service-role via
`apply_migration` or service-role direct SQL).

**Ian's user_ids (super_admin in koino-imo agency `a073f1cc-f4b4-44e9-8471-173455391e2f`):**
- `f8bc64cf-e727-4d9d-b137-83528174a241` (iankmeeks@gmail.com)
- bigbacon61@gmail.com — `13cdbf0c-f884-45b5-888b-27638e134fcd`

**Vercel project:** `prj_oLmPIcDH5OEgBJ1Mh0Urm13MIhRP` under team
`koinocapital-7163s-projects` (`team_zMGoewg8vNKneGcEDlfmeXuh`). MCP queries
return 403 — re-auth needed via `vercel login`.

---

## How to start (suggested order)

1. **#3 first (onboarding smoke).** Highest silent-failure risk. Walk it
   with a throwaway email; fix any RPC that throws. No external
   dependencies blocking. ~30 min including any fixes.
2. **#4 (disposition smoke).** Verify the existing Floor flow before
   reps need it. ~15 min.
3. **#1 (Twilio).** As soon as the number verifies, set env vars + force
   redeploy + insert connections row + smoke dial. ~30 min.
4. **#2 (connect a real source).** Lower priority than the above because
   you can manually CSV-upload Cody's leads if needed for Monday opening.

Items 5 and 6 are Monday-week follow-ups, not Friday-night blockers.
