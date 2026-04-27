# Deploying KOINO Insurance OS

## One-click Vercel import

If the repo is pushed to `koinod/koino-insurance-os` on GitHub, click:

> **https://vercel.com/new/clone?repository-url=https://github.com/koinod/koino-insurance-os&project-name=koino-insurance-os&repository-name=koino-insurance-os**

Or paste this URL in your browser:

```
https://vercel.com/new/git/external?repository-url=https%3A%2F%2Fgithub.com%2Fkoinod%2Fkoino-insurance-os
```

Vercel will detect Next.js automatically. No build config needed — defaults work.

## Manual import (no template URL)

1. Go to https://vercel.com/new
2. "Import Git Repository" → select `koinod/koino-insurance-os`
3. Framework: **Next.js** (auto-detected)
4. Build Command: `npm run build` (default)
5. Output Directory: `.next` (default)
6. Environment variables (optional — UI runs on mock data without them):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `AUTH_STUB_EMAIL` = `ian@koinocapital.com`
   - `AUTH_STUB_ROLE` = `OWNER`
7. Click **Deploy**.

First deploy takes ~90 seconds. The default Vercel domain is `koino-insurance-os.vercel.app`.

## Custom domain

After first deploy, attach a custom domain in Vercel project settings → Domains. Suggestions:
- `app.koinocapital.com`
- `os.koinocapital.com`
- `insurance.koinocapital.com`

## Supabase wiring (post-deploy)

Once you have a Supabase project:

1. Run `supabase/migrations/0001_init.sql` in the SQL editor.
2. Copy URL + anon key + service role key into Vercel env vars.
3. Trigger a redeploy.
4. Swap mock-data imports in `app/*/page.tsx` for Supabase queries (see `lib/supabase.ts`).
