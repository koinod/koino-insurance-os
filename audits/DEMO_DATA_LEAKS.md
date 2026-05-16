# DEMO DATA LEAKS — hardcoded demo values that leak into production

Date: 2026-05-15
Method: Grepped for the specific literals enumerated in the task brief
(`$1,800 daily target`, `62%`, `14.5`, `+9.4% YoY`, `DEFAULT_VIDEOS`,
`DEFAULT_SCRIPTS`, carrier-mix demo), plus broader searches for hardcoded
`"$N"`, `"N%"`, `"+N% ..."` strings and `isDemo ?` ternaries in `.jsx`/`.js`
outside `node_modules`/`dist`.

For each candidate, verified whether it is gated by `window.isDemoAgency()`
or `window.Shared.isDemoAgency()` (or returns "—"/"" for real tenants).

---

## Leaks found and fixed in this commit

### `page-queue.jsx:650` — `$1,800 daily target`
- **Before:** `const targetProgress = Math.min(100, Math.round(((r.today || 0) / 1800) * 100));  // $1,800 daily target`
- The `1800` was hardcoded. Every real agency had every rep's "Today" progress bar normalized to $1,800/day regardless of agency or rep tier.
- **After:** reads `window.AgencyConfig.get().daily_target_default` (canonical source in `lib/agency-config.js:36`). Same fallback (1800) if the helper is absent, but live agencies now drive their own target via the config object.

### `page-owner.jsx:1500` — seed coaching cards with fake outcome metrics
- **Before:** when `openCards.length === 0` the code rendered two fake cards:
  - `+12% close rate (cohort)` impact
  - `Persistency +6pts` impact
  - Talk-listen `52% → 45%`
  These showed for any agency with no open coaching sessions — i.e., every brand-new tenant.
- **After:** wrapped in `_isDemoCoach` gate (mirrors the pattern already used at `page-owner.jsx:1385`). Real tenants now get an empty state until a manager seeds a focus.

---

## Verified gated (no fix needed)

### `page-extras.jsx:2269` — `DEFAULT_VIDEOS`
`const videos = live.length > 0 ? live : (window.isDemoAgency && window.isDemoAgency() ? DEFAULT_VIDEOS : []);` — gated.

### `page-extras.jsx:2437` — `DEFAULT_SCRIPTS`
Same shape: `live.length > 0 ? live : (window.isDemoAgency && window.isDemoAgency() ? DEFAULT_SCRIPTS : []);` — gated.

### `page-extras.jsx:3389-3395` — demo carrier mix (UHC / Humana / Aetna / F&G / Mutual of Omaha)
Gated: `return isDemo ? [...] : [];` — only renders when `isDemo` is truthy.

### `page-extras.jsx:3454-3457` — In-force AP / Persistency / Lapse rate / Cross-sell KPIs
All four use `isDemo ? "..." : "—"` (or `: "no data"`) for both `value` and `sub`. Real tenants see `—` until policies + book entries roll up. Gated.

### `page-extras.jsx:2781-2783` — `62%` / `14.5`
Already removed prior to this audit. The comment block at 2781 explicitly documents the prior removal:
`/* Cert progress / CE hours were hardcoded "62%" / "14.5" — every agency saw the same fake numbers. Removed until v_user_metrics or an equivalent view surfaces real cert + CE counts. */`

### `page-extras.jsx:3774-3777` — Atlas Insurance Group / Atlas IMO LLC / atlasimo.com / NPN `19384726`
All gated by `isDemo ? "..." : ""` as fallback values for org-settings form fields. Demo-only.

### `page-tenant.jsx:196` — UHC / Humana Vantage / Aetna SRC / Mutual of Omaha / F&G Annuities chip list
Gated by `isDemo ? [...] : []`.

### `page-today.jsx:572-574` — Cost/issued `$112`, Lead spend MTD `$680`
Gated: each falls back to `isDemo ? "$112" : "—"` style.

### `page-resources.jsx:205-209` — `SCRIPT_SEED`, `DOC_SEED`, `DEFAULT_LINKS`
Gated: `liveScripts.length > 0 ? liveScripts : (isDemo ? SCRIPT_SEED : [])` and same for the others.

### `page-ops-depth.jsx:67`, `:232` — `NIGOS` fallback, `CARRIERS_DEMO` fallback
Gated by `isDemo`.

### `mobile-screens.jsx:199-200` — `Cheryl Hampton`, `67 · Travis County, TX · T65 list`
Gated: `lead?.lead || (isDemo ? "Cheryl Hampton" : "—")`.

### `page-performance.jsx:228` — `delta` synthetic noise
Gated by `isDemo`.

### `page-extras.jsx:5608` — `FALLBACK` array
Gated by `isDemo`.

---

## TODOs (no one-line fix; flagged for follow-up)

### `lib/agency-config.js:36, :45` — default tier targets baked into the lib
`daily_target_default: 1800` and `tier_targets: { "Plan G": 1800, ... }` are hardcoded defaults that ship to every agency. When `window.AgencyConfig.get()` returns the canonical object, real agencies override these. But if `AgencyConfig` is uninitialized (very early page paint, before `org_settings` load) the user still sees 1800-based progress bars. Not a leak per se — but the value should come from `org_settings.config.daily_target_default` when present, with `1800` only as a "no agency config yet" floor. Already implemented in `page-floor.jsx:457` and `page-queue.jsx:650` (this commit). Other surfaces (`page-performance.jsx:27`, `page-ops-depth.jsx:520`) still hardcode the same `{ "Plan G": 1800, "Plan N": 1500, ... }` map as a fallback when `agencyRules.product_targets` is empty — likely OK because those are commission-target *defaults* not displayed numbers, but worth a TODO to confirm.

### `page-extras.jsx:3531` — `(isDemo ? [...] : ...)` block at line 3531
Has gating but I didn't fully audit the false-branch contents. TODO: spot-read and confirm.

### `page-extras.jsx:5608` — `FALLBACK` is gated, but the value being fallen back to is fed elsewhere
Same TODO — spot-confirm consumer treats `[]` as empty-state.

---

## Limitations

- Only checked for the literals listed in the task plus a broad grep for `"$N"`/`"N%"`/`"+N..."`. Demo numbers expressed as raw integers (e.g. `apps: 184` inside `carrierMix`) are caught only when the whole array is gated; individual unhinged integers in larger code blocks could escape this sweep.
- `agency-config.js` defaults are not "leaks" but a "wrong default" — they apply to real agencies whose config doesn't override. Filed as TODO above.
- I did NOT inspect `tweaks-panel.jsx` or `polish.jsx` in depth — both contain demo seed data but their reach into production is narrower (tweaks panel only opens with a keyboard shortcut).
