# Repflow — Insurance Agency OS

Operator-grade UI for life & health distribution — IMOs, agencies, recruiting downlines.

## What this is

Static client-rendered React prototype (Babel-standalone), wrapped for Vercel
static deploy. Loaded directly from `index.html`; mobile rep view at
`/mobile.html`.

Backed by Supabase project `Repflow` (`jfphwmzwteermalzwojp`) — schema mirrors
the demo data shapes in `data.jsx`. The migration in `supabase/migrations/`
provisions a matching DB.

## Local

Any static server works. Examples:

```
npx serve .
# or
python3 -m http.server 8000
```

Then open http://localhost:3000 (or :8000).

## Deploy

Push to `main` triggers production build on Vercel project
`koino-capital/koino-insurance-os`. No build step — Vercel serves the repo
root as static.

## Roles

Top-right tweaks panel switches between Rep, Manager, Owner views and toggles
mobile, AEP surge mode, AI co-pilot rail, density. Use `⌘K` for the command
palette.

## Configuration & Environment

There is no build step. Browser code can't read `process.env` at runtime, so
config flows through two surfaces:

| Surface                | Reads from                                                                 | Defined in                  |
|------------------------|----------------------------------------------------------------------------|-----------------------------|
| Browser (index/mobile) | `window.__ENV.<KEY>` → fallback literal in `lib/supabase-config.js`        | `lib/supabase-config.js`    |
| Edge / Node (`api/*`)  | `process.env.NEXT_PUBLIC_<KEY>` → `process.env.<KEY>` → fallback literal   | Each `api/*.js` directly    |

`lib/supabase-config.js` is the single place to change the Supabase
URL / anon key for the browser. It runs as the first project script in both
`index.html` and `mobile.html`, so every page sees `window.SUPABASE_URL` and
`window.SUPABASE_ANON` populated before `data.jsx` evaluates.

To env-inject browser values at deploy time without adding a build step, prepend
an inline `<script>` before `lib/supabase-config.js` in the HTML:

```html
<script>window.__ENV = { SUPABASE_URL: "https://...", SUPABASE_ANON: "sb_publishable_..." };</script>
<script src="lib/supabase-config.js?v=..."></script>
```

The Supabase anon key is **public-tier** by design — every browser already has
it, RLS in `supabase/migrations/` is what protects tenant data. The literal in
`lib/supabase-config.js` is a safe fallback, not a secret.

Server-side secrets (`STRIPE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`CRON_SECRET`, AI provider keys) live in the Vercel dashboard and are read by
`api/*` Edge functions via `process.env`. See `.env.example` for the full list.

### Adding a new config value

- **Browser-readable**: add a `window.__ENV.<KEY>` lookup in
  `lib/supabase-config.js` (or its own `lib/<thing>-config.js` if it has its own
  domain), give it a safe default, set `window.<KEY>`.
- **Server-only**: read `process.env.<KEY>` in the `api/*` route that needs it,
  document it in `.env.example`, add it to the Vercel project env.

## Backup

The pre-V2 KOINO Agency Next.js app (8 wired pages + 3 Gemini AI endpoints)
is preserved on branch `pre-v2-backup`.
