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
mobile, AI co-pilot rail, density. Use `⌘K` for the command palette.

> Note: The "AEP surge mode" toggle was archived on 2026-05-11 (see
> `OVERNIGHT_HANDOFF_2026-05-11.md`, P8). Backend tables stay; the UI
> surface — toggle, topbar pill, and conditional chips — was stripped.

## Backup

The pre-V2 KOINO Agency Next.js app (8 wired pages + 3 Gemini AI endpoints)
is preserved on branch `pre-v2-backup`.
