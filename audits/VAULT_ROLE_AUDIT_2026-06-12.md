# Vault Role / Downline-Propagation Audit — 2026-06-12

**Scope:** Can managers fully manage every Vault content type (create/edit/delete)?
Are manager-created items propagated to their downline? Is there a "global to my
downline" toggle?

**Method:** Static analysis of `page-extras.jsx` (UI), `data.jsx` (mutation layer),
and `supabase/migrations/*.sql` (schema + RLS).

> ⚠️ **Ground-truth caveat (CLAUDE.md):** local migration files "may lag prod by
> several numbers — check `supabase_migrations.schema_migrations` for ground truth."
> The **UI** column below is authoritative (read straight from source). The **DB RLS**
> column is reconstructed from migration files and **must be confirmed against live
> `pg_policies`** via the Supabase MCP before any change is shipped. The Supabase MCP
> was **not connected** in the session that produced this doc, so the live-RLS
> verification step is still **outstanding**.

---

## 1. Tab → table → UI gate → DB RLS map

UI role gate is global: `page-extras.jsx:93`
```js
const canEdit = role === "owner" || role === "super_admin" || role === "manager";
```
Every editable tab wraps its New/Edit/Delete controls in `{canEdit && …}`, so
**managers already see full CRUD in the UI on every editable tab**, and reps see
none. Visibility filtering uses `roleAllowed(role, targetRoles)` (`page-extras.jsx:27-30`,
applied at `:101-103` for scripts/docs/courses).

| Tab | Table | UI create/edit/delete gate | DB write policy (per migration files) | DB read policy (per migration files) | `target_roles`? | Downline-scoped? | `is_global`? |
|-----|-------|----------------------------|----------------------------------------|--------------------------------------|-----------------|------------------|--------------|
| Scripts | `agency_scripts` | `canEdit` (owner/super/mgr) — `:362,394,395` | ⚠️ `0010` "auth agency write" `FOR ALL` to **any** authenticated agency member (incl. reps). No later migration tightens it. | `0036` "tenant read scripts": agency + (manager OR target_roles match) | yes (`0034`) | **no** | **no** |
| Documents | `agency_docs` | `canEdit` — `:1428,1467,1468` | ⚠️ same `0010` "auth agency write" (any member) | `0036` "tenant read docs": agency + (manager OR target_roles) | yes (`0034`) | **no** | **no** |
| Videos | `agency_videos` | `canEdit` — `:544,582,583` | ⚠️ same `0010` "auth agency write" (any member) | `0010` "auth agency read": agency-wide | no | **no** | **no** |
| Quick links | `agency_quick_links` | `canEdit` — `:1002,1032,1033` | ⚠️ same `0010` "auth agency write" (any member) | `0010` agency-wide | no | **no** | **no** |
| Courses | `training_courses` | `canEdit` — `ProductTrainingEmbedded` | ✅ `0019`: write gated by `viewer_is_manager_in()` (owner/imo_owner/super/mgr) | `0036` "tenant read courses": agency + (manager OR target_roles) | yes (`0019`) | **no** | partial (`is_published`, not downline) |
| Segments | `vault_segments` | `canEdit` — `:1718,1733,1754` | ✅ `0026` "manager write vault_segments": `viewer_is_manager_in()` | `0026` "tenant read": agency-wide | no | **no** | **no** |
| Carrier appts | `agency_carrier_appointments` | `canEdit` — `:812,852,853` | (out of Vault-content scope — carrier ops) | — | — | — | — |
| Coaching | `call_recordings` / `coaching_*` | read-only (no CRUD) | — | rep sees own + coaching examples; mgr/owner see all (`:1112-1114`) | — | scoped (rep=self) | — |
| Carriers dir | `carriers` | read-only catalog | — | — | — | — | — |

---

## 2. Findings vs the three stated goals

**Goal 1 — Managers can fully manage every Vault content type.**
- **UI: already true.** `canEdit` includes `manager`; every editable tab shows New/Edit/Delete to managers.
- **DB: mostly true, with one inversion to confirm.** `training_courses` and `vault_segments`
  are correctly gated to manager-or-higher. **But `agency_scripts`, `agency_docs`,
  `agency_videos`, `agency_quick_links` still carry the `0010` "auth agency write"
  policy (`FOR ALL` to any authenticated agency member).** Per the migration files,
  that means a **rep could write these via the API** (UI hides the buttons; RLS does
  not forbid it). This is the opposite of a manager-can't-write gap — it's a
  **reps-aren't-read-only gap**, and it contradicts the "Reps remain read-only"
  requirement. ⚠️ **Must confirm against live `pg_policies`** — a later prod-only
  migration may already have replaced it.

**Goal 2 — Manager-created items visible to their entire downline.**
- **Today it's broader than downline: it's agency-wide.** None of the Vault tables are
  downline-scoped. `0018`'s hierarchical RLS loop explicitly **skipped** these tables
  because it only rewrote tables having an `owner_rep_id`/`rep_id`/`recruiter_id`
  column — the Vault tables have only `created_by text`. So every rep in the agency
  already sees every manager's scripts/docs (subject to `target_roles`).
- **Implication / recalibration:** in a single agency, "visible to my downline" is a
  **narrowing**, not an addition. Implementing the literal union spec
  (`owner_rep_id = viewer OR (is_global AND ancestor)`) as a *replacement* would
  **hide existing starter content** (no `owner_rep_id`, not global) from reps — a
  breaking change to live visibility. See the decision in §4.

**Goal 3 — "Global to my downline" toggle + union query.**
- **Does not exist.** No `is_global` column on any Vault table; no toggle in any
  create/edit modal; no "Shared by [manager]" badge.

---

## 3. Hierarchy primitives already available for Phase 2

The building blocks the requested model needs **already exist** — no need to invent
`is_upline_ancestor` from scratch:

| Primitive | Source | Signature / behavior | Note |
|-----------|--------|----------------------|------|
| `reps.upline_id` | `0004`, `0009` | `text` → `reps.id` self-ref; auto-stamped on invite redeem | **rep ids are `text`, not `uuid`** — the task spec assumed uuid; recalibrate. The user's "`agents.upline_id`" is actually `reps.upline_id`. |
| `public.downline_of(root text)` | `0004` | recursive CTE down the `upline_id` tree; returns root + all descendants | `security invoker`, granted anon+authenticated |
| `public.is_manager_of(mgr text, target text)` | `0018` | `target ∈ downline_of(mgr)` | This **is** the ancestor check (modulo self) |
| `public.viewer_rep_id()` | `0018` | current viewer's `rep_id` (text) via `me()` | |
| `public.viewer_is_manager_in(agency uuid)` | `0019` | true for `owner/imo_owner/super_admin/manager` | already used by course/segment write policies |
| `public.me()` | `0004` | returns `rep_id, role, agency_id` | |

So `is_upline_ancestor(ancestor, descendant)` ≈
`ancestor <> descendant AND descendant IN (SELECT rep_id FROM downline_of(ancestor))`
— a thin SECURITY DEFINER wrapper over existing logic, on **text** ids.

---

## 4. The one decision that gates the migration shape

Current Vault reads are **agency-wide**. The requested union is **downline-scoped**.
These differ, and the difference touches **live production visibility**:

- **(A) Additive (non-breaking, recommended default):** keep current agency-wide +
  `target_roles` reads; **add** an OR-branch so a rep also sees
  `owner_rep_id = viewer` OR `(is_global AND is_upline_ancestor(owner_rep_id, viewer))`.
  Managers/owners keep full visibility (audit). Nothing currently visible disappears.
  Delivers the toggle + badge + "manager publishes to downline" without regressions.
  Does **not** enforce "manager A's content hidden from manager B's team" (that
  sibling-isolation requires removing agency-wide reads).
- **(B) Downline-scoped (breaking):** replace agency-wide reads with the literal union.
  Enforces sibling isolation, but **hides existing starter scripts/docs** (and any
  legacy rows without `owner_rep_id` / not `is_global`) from reps until backfilled.
  Requires a data backfill of `owner_rep_id` + an `is_global=true` pass on
  agency-wide content to avoid a visibility cliff.

This is a production-schema change touching live data → **operator's call** per
CLAUDE.md ("ask before … production schema changes that touch sensitive data").

---

## 5. What's blocking completion in this session

| Phase | Status | Blocker |
|-------|--------|---------|
| 1 — Audit | **UI: done.** DB RLS: drafted from files, **not** confirmed against prod. | Supabase MCP not connected → cannot read live `pg_policies`. |
| 2 — Migration | **Draft written** (`supabase/migrations/0091_vault_downline_global.sql`), **not applied**. | Supabase MCP not connected → cannot `apply_migration`; cannot confirm current policy names to drop. |
| 3 — UI (toggle + badge) | **Not started** — deferred until the migration shape is locked (depends on the §4 decision and the `is_global` column existing). | — |
| 4 — Verify (4 proofs) | **Blocked entirely.** | Supabase MCP (SQL confirm) **and** Chrome extension (3-rep walkthrough + screenshots) both not connected. |

**To finish:** (1) operator picks A or B in §4; (2) reconnect the Supabase MCP so the
migration can be confirmed-against-prod and applied; (3) reconnect the Chrome
extension for the live 3-rep walkthrough + screenshots. Then Phase 3 UI + Phase 4
verification proceed in one pass.
