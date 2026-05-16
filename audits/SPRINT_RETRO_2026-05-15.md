# Sprint Retro — 2026-05-15

Five parallel agents in git worktrees produced 18 commits across 5 `sprint/*` branches in ~25 min wall-clock. None pushed. Branches sit local-only in `.claude/worktrees/`.

## Branches (none merged to main yet)

| Branch | Commits | Audit docs | Migrations drafted | Risk |
|---|---|---|---|---|
| `sprint/audits-bundle` | 5 | SCHEMA_DRIFT, RLS_AUDIT, DEAD_CODE, DEMO_DATA_LEAKS, REALTIME_COVERAGE | `1778891249_close_schema_drift.sql`, `1778891250_rls_harden.sql` | **HIGH** — fixes cross-tenant write leak |
| `sprint/api-hardening` | 2 | API_VALIDATION, WEBHOOK_HMAC | `0037_webhook_replay_seen.sql` | MEDIUM — security + new dedupe table |
| `sprint/code-quality` | 2 | ERROR_SWALLOWING, TOAST_TAXONOMY | none | LOW — 82 silent catches → toast+console |
| `sprint/onboarding` | 6 | ONBOARDING_GAPS | none (5 RPCs missing in deployed DB — flagged) | MEDIUM — frontend trap-proofed, RPC blocker upstream |
| `sprint/scaffolds` | 3 | none | `1778891444_recruits.sql`, `1778891445_user_prefs.sql` | LOW — additive features |

## Critical findings (real, file-cited)

1. **Cross-tenant write leak**: `auth write X using(true) with check(true) for all` on 19+ tables from `supabase/migrations/0002_fill_missing_domains.sql:597`, never dropped. Plus residual `anon read X using(true)` on 10 tables. Patched in `1778891250_rls_harden.sql`. NOT applied.

2. **Schema drift**: 13 tables referenced in client code but not in current migrations tree (`agency_members`, `agency_audit_log`, `routing_rules`, etc.). 15 tables missing columns code references. Some may exist via legacy b64-archived migrations — needs cross-check against deployed DB.

3. **Onboarding RPC gap**: 5 RPCs needed by the wizard don't exist in deployed Supabase. Hard blocker: `provision_sub_agency` — without it no fresh owner can create an agency. Frontend is now trap-proofed (clear inline error instead of silent loop) but the missing-RPC migration is the real fix.

4. **3 false-live UIs** (suggest realtime updates, no Supabase channel subscribed): notifications bell at `page-admin.jsx:733` (table `agency_notifications`), in-app chat at `page-messages.jsx:25`, vault carriers block at `page-extras.jsx:1874`.

## Merge order (dependencies force this sequence)

1. `sprint/audits-bundle` — schema-drift migration FIRST, then RLS-harden (RLS references columns added by drift)
2. `sprint/api-hardening` — security; standalone
3. `sprint/code-quality` — broad `.jsx` sweep; merge before scaffolds to minimize conflict surface
4. `sprint/onboarding` — page-first-run / page-onboarding / page-invite-team / page-auth / page-tenant edits
5. `sprint/scaffolds` — ⚠️ **Decision needed**: existing `page-recruiting.jsx` (sophisticated outreach workbench against `recruiting_applicants` tables) vs. new minimal `page-recruits.jsx` (kanban scaffold). Both coexist after merge.

## Migration numbering inconsistency

Terminal C used sequential `0037_webhook_replay_seen.sql`; Terminals A and D used unix timestamps (`1778891249`, `1778891444`, etc.). Disjoint tables — no functional conflict — but on next merge, normalize on one convention. The codebase's existing style is sequential `00NN_*`.

## Lessons

1. **Cite-file-line + hard-cap + branch artifact + do-not-push** is the discipline trifecta that makes autonomous runs verifiable. The openclaw-legacy theater pattern was successfully avoided.
2. **Spec assumptions must be verified before delegation.** Three of mine were wrong: `reps.id` was assumed uuid (actually text), `page-recruiting.jsx` was assumed missing (exists), `VaultSegmentsPane` was assumed deleted (still alive). 10 min of grep saves agent attention.
3. **Migration numbering convention belongs in the spec** — never let two agents pick different formats.
4. **The biggest production risks live at the client/Supabase boundary** (drifted schema, RLS gaps, missing RPCs), not in UI code.
5. **Heavy parallel work without a merge plan creates compounding debt.** Next session must be merge, not more parallel sprints.

## Worktree paths (for the next session)

- A audits: `~/repos/koino-insurance-os/.claude/worktrees/agent-abd20482da1fb8043`
- B code-quality: `~/repos/koino-insurance-os/.claude/worktrees/agent-aa280da2aa14867e6`
- C api-hardening: `~/repos/koino-insurance-os/.claude/worktrees/agent-a15d4845043c779f8`
- D scaffolds: `~/repos/koino-insurance-os/.claude/worktrees/agent-a3d9986f770cdb89e`
- E onboarding: `~/repos/koino-insurance-os/.claude/worktrees/agent-a9d554d985c776dc1`

Branch names in each worktree are `sprint/*` as listed above (also accessible from main repo via `git branch -a`).
