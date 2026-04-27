# KOINO Insurance OS

The operating system for insurance teams. Pipeline → Policy → Payout, in one repo, one deployment.

This is the v0 of a **CommissionIQ replacement** built for Ian Meeks' KOINO Capital insurance team. It clones the 14-module structure of getcommissioniq.com (the IMO/MGA SaaS used by United Equity Partners and others) and is the foundation for an AI-native upgrade: lead routing, follow-up generation, call-coaching from Granola transcripts, license verification, carrier auto-appointment, and live realtime dashboards.

## What it is

- **Next.js 14** (App Router) + **TypeScript** + **Tailwind CSS**
- Dark theme matching CommissionIQ aesthetic (near-black, gold titles, blue active pills, green=issued, yellow=underwriting)
- Persistent left sidebar, owner badge, top header on every page
- 4 fully-fleshed pages, 10 stubs (the schema is defined, the UI is next)

## The 14 modules

| # | Module | Status | Notes |
|---|--------|--------|-------|
| 1 | Pipeline | **Wired** | Kanban (New / Contacted / Qualified / Quoted / App Started / Submitted), KPI strip, mock data |
| 2 | Clients | Stub | Households, policy holders |
| 3 | Deals | **Wired** | KPI tiles, period+view+agent filters, full table per CommissionIQ Deals page, 15 seed deals |
| 4 | P&L | Stub | Per-agent / per-team |
| 5 | Leaderboard | Stub | Issued / AP / commission / activity rankings |
| 6 | Vault | Stub | Contracts, licenses, E&O, W9, carrier letters |
| 7 | Follow-ups | Stub | AI-generated tasks tied to leads/clients |
| 8 | Activities | Stub | Call/email/SMS/meeting log |
| 9 | Analytics | Stub | Realtime dashboards |
| 10 | Team | Stub | Org chart + override structure |
| 11 | Recruiting | **Wired** | Invite → Onboard → License → Appoint → Activate funnel, 10 seed candidates |
| 12 | Carriers | Stub | Transamerica / ETHOS / F&G + comp grids |
| 13 | Lead Vendors | **Wired** | Vendor performance table, 30-day ROI, recent lead flow, 6 seed vendors |
| 14 | Settings | Stub | Org / billing / integrations / API keys |

## Architecture

```
app/                 # Next.js App Router pages — one folder per module
components/          # Sidebar, PageHeader, StatusPill, StubPage
lib/
  types.ts           # Domain types (Deal, PipelineLead, RecruitingCandidate, LeadVendor)
  format.ts          # fmtMoney (cents → $), fmtDate, initials
  mock-data.ts       # 15 deals, 10 pipeline leads, 10 recruits, 6 vendors
  supabase.ts        # Env-driven client; returns null if not configured
  auth-stub.ts       # Hardcoded ian@koinocapital.com / OWNER session — TODO replace
supabase/
  migrations/
    0001_init.sql    # orgs, users, reps, carriers, products, commission_grids,
                     # lead_vendors, leads, clients, deals, activities, follow_ups,
                     # recruiting_candidates — RLS stubbed
```

All money is `*_cents` (bigint). Never floats.

## Wired vs stubbed

**Wired:**
- UI shell (sidebar, header, theme, owner badge)
- 4 pages with mock data: `/deals`, `/pipeline`, `/recruiting`, `/leads`
- Domain types + Supabase client + SQL migration
- Auth stub (returns `ian@koinocapital.com / OWNER`)
- 10 stub pages so the sidebar never 404s

**Stubbed (TODOs in code):**
- NextAuth magic-link (currently hardcoded session)
- Supabase live reads (currently reading `lib/mock-data.ts`)
- RLS policies (commented in migration)
- New Deal modal, license verification API, carrier appointment workflow, Sheets sync, AI follow-up generation

## Env vars

Copy `.env.example` to `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
AUTH_STUB_EMAIL=ian@koinocapital.com
AUTH_STUB_ROLE=OWNER
```

The UI runs on mock data without any of these set — Supabase is only required once you're ready to wire real data.

## Local dev

```bash
npm install
npm run dev   # http://localhost:3000 — redirects to /deals
npm run build
```

## Deployment

See [DEPLOY.md](./DEPLOY.md) for the GitHub-to-Vercel one-click import flow.

## Roadmap (next sprints)

1. Replace auth stub with NextAuth + Supabase email magic link
2. Wire `/deals`, `/pipeline`, `/recruiting`, `/leads` to live Supabase reads
3. New Deal modal with auto-commission calc from `commission_grids`
4. Recruiting flow: e-sign (Documenso/PandaDoc), license verification API (NIPR), carrier auto-appointment
5. Lead vendor Sheets sync + Zapier webhook
6. AI follow-ups from Granola transcripts
7. Realtime dashboards via Supabase channels
