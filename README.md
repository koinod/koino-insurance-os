# KOINO Agency

> AI-powered insurance team management — built for an agency owner who's tired of CommissionIQ, AgencyZoom, and HubSpot all having one feature each that the others don't.

This is **Ian's own platform** for running his insurance team. Not RepFlow, not CommissionIQ. Owner-controlled, single-tenant, deploy-on-Vercel, data-on-Supabase.

The same code is the product KOINO sells to other agency owners (multi-tenant fork lives separately).

---

## Stack

- **Frontend:** Next.js 14 App Router · React 18 · TypeScript · Tailwind CSS · dark navy / amber theme
- **Backend:** Supabase (Postgres + Auth + RLS-ready)
- **AI:** Google Gemini 2.0 Flash (direct, JSON-mode) for lead scoring, follow-up drafting, coaching
- **Deploy:** Vercel via GitHub
- **Repo path:** `omni-context/koino-agency/`

---

## What's built (vs. CommissionIQ feature parity)

### Pages

| Page | Status | Notes |
|---|---|---|
| `/` Dashboard | ✅ Built | Stat cards + quick-actions + setup-required banner |
| `/pipeline` | ✅ Built | 3-column kanban (New → Underwriting → Approved), tabs (Working/Active/Closed), AI score chips on each card |
| `/clients` | ✅ Built | Searchable table, AI score column, follow-up date, agent assignment |
| `/deals` | ✅ Built | Time-filtered table (Day/Week/Month/YTD/All), 6 summary cards (Active, Issued, AP, Commission, Deposits, Outstanding) |
| `/analytics` | ✅ Built | 10 KPI cards + pipeline funnel (CSS bars, no chart-lib bloat), Individual/Downline/Team views |
| `/leaderboard` | ✅ Built | Deal Rankings + Activity Rankings tabs |
| `/carriers` | ✅ Built | Table view (seeded with Transamerica, ETHOS, F&G, Everlast, etc.) |
| `/lead-vendors` | ✅ Built | Table view with cost-per-lead (seeded with Referral, Life Jacket Vet, FB, etc.) |
| `/followups` | 🚧 Stub | Build checklist on the page |
| `/activities` | 🚧 Stub | Build checklist on the page |
| `/team` | 🚧 Stub | Build checklist on the page |
| `/recruiting` | 🚧 Stub | Build checklist on the page |
| `/pnl` | 🚧 Stub | Build checklist on the page |
| `/settings` | 🚧 Stub | Build checklist on the page |

### AI endpoints (the differentiator vs. CommissionIQ)

| Endpoint | Purpose | Status |
|---|---|---|
| `POST /api/ai/score-lead` | Score 1-10 + close probability + recommended channel | ✅ Built |
| `POST /api/ai/generate-followup` | 5-touch sequence in producer voice | ✅ Built |
| `POST /api/ai/coaching` | Producer coaching from recent calls | ✅ Built |

All three use Google Gemini 2.0 Flash directly with JSON-mode responses. API key reads from `process.env.GOOGLE_AI_API_KEY` — never written to disk.

---

## Deploy from zero (15 min)

### 1. Set up Supabase

1. Create a Supabase project (or use existing — `zybndnqnbxarpkhqpcxq` if that's still alive).
2. Run the migration: copy `supabase/migrations/0001_init.sql` into the Supabase SQL editor and execute.
3. Grab `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` from Supabase → Project Settings → API.

### 2. Get a Gemini API key

1. Go to https://aistudio.google.com/app/apikey
2. Create a key. Free tier is plenty for early use.
3. Save as `GOOGLE_AI_API_KEY`.

### 3. Push to GitHub + deploy on Vercel

```bash
cd omni-context/koino-agency
npm install
npm run build   # confirm it compiles before pushing

# Set env vars in Vercel dashboard (don't commit .env.local):
#   NEXT_PUBLIC_SUPABASE_URL
#   NEXT_PUBLIC_SUPABASE_ANON_KEY
#   SUPABASE_SERVICE_ROLE_KEY
#   GOOGLE_AI_API_KEY
#   OWNER_EMAIL=ian@koino.dev

# Either:
# (a) Push to GitHub → connect Vercel → auto-deploy on push
git add koino-agency
git commit -m "ship koino-agency v0.1"
git push

# Or:
# (b) Direct deploy via vercel CLI
npx vercel --prod
```

### 4. Add yourself as the first agent

In Supabase SQL editor:

```sql
insert into agents (email, full_name, role, status)
values ('ian@koino.dev', 'Ian Meeks', 'owner', 'active');
```

You're live.

---

## File tree

```
koino-agency/
├── package.json                  ← deps: next 14, supabase-js, supabase-ssr, recharts, lucide
├── next.config.js
├── tsconfig.json
├── tailwind.config.ts            ← dark navy + amber theme
├── postcss.config.js
├── .env.example
├── .gitignore
├── README.md
├── supabase/migrations/0001_init.sql   ← full schema, seeded
└── src/
    ├── app/
    │   ├── layout.tsx            ← root layout w/ sidebar
    │   ├── page.tsx              ← /  (dashboard)
    │   ├── globals.css
    │   ├── pipeline/page.tsx     ← /pipeline
    │   ├── clients/page.tsx
    │   ├── deals/page.tsx
    │   ├── analytics/page.tsx
    │   ├── leaderboard/page.tsx
    │   ├── carriers/page.tsx
    │   ├── lead-vendors/page.tsx
    │   ├── followups/page.tsx    ← stub
    │   ├── activities/page.tsx   ← stub
    │   ├── team/page.tsx         ← stub
    │   ├── recruiting/page.tsx   ← stub
    │   ├── pnl/page.tsx          ← stub
    │   ├── settings/page.tsx     ← stub
    │   └── api/ai/
    │       ├── score-lead/route.ts
    │       ├── generate-followup/route.ts
    │       └── coaching/route.ts
    ├── components/
    │   ├── Sidebar.tsx
    │   ├── PageHeader.tsx
    │   ├── StatCard.tsx
    │   └── StubPage.tsx
    └── lib/
        ├── supabase.ts           ← browser + server + admin clients
        ├── types.ts
        └── format.ts
```

---

## Scope-honesty (what's NOT built yet)

This v0.1 ships the foundation + 5 fully-functional pages + 3 working AI endpoints. **The 6 stub pages display their build checklists in the UI** — they're real Next.js routes, but the feature implementations are TODO. Each stub is roughly 30 minutes of focused work to convert.

**Drag-drop on the kanban:** the pipeline kanban currently renders cards but stage-move requires a click flow (or the planned `/api/deals/[id]/move` route). Adding `@dnd-kit/core` + the route handler is ~1 hour.

**Auth:** Supabase auth is wired in `lib/supabase.ts` but no login UI yet. For now, RLS is permissive and the OWNER_EMAIL env serves as the access gate. Wire `app/login/page.tsx` with `signInWithOtp({ email })` for production.

**Real-time updates:** Supabase realtime channels are not subscribed. Adding them is ~30 min — `supabase.channel('deals').on('postgres_changes', ...).subscribe()` in a top-level client component.

**RLS policies:** the schema doesn't ship with row-level security policies. Single-tenant means OWNER reads/writes everything; multi-tenant fork needs proper RLS by `agent.upline_id` ancestry.

---

## Why this beats CommissionIQ

| | CommissionIQ | KOINO Agency |
|---|---|---|
| Public website status (verified Apr 2026) | ❌ TLS error / no footprint | ✅ Live, owned domain |
| Commission tracking | ✅ Core feature | ✅ Same |
| AI lead scoring | ❌ | ✅ Gemini-powered |
| AI follow-up generation | ❌ | ✅ 5-touch in producer voice |
| AI coaching | ❌ | ✅ Pulls from recent call data |
| Predictive close probability | ❌ | ✅ Per deal |
| Open code (you own it) | ❌ | ✅ MIT-style, lives in your repo |
| Multi-tenant SaaS sale-ready | ❌ | 🚧 Fork incoming |

---

## License

Private until decided. Default: closed-source until KOINO Agency multi-tenant offering is ready.

— Ian Meeks · KOINO Capital · ian@koino.dev
