# Repflow Demo Runbook

**Site:** https://repflow.koino.capital  
**Demo agency:** Atlas Insurance Agency (slug: `atlas`, is_demo=true)  
**Super-admin:** iankmeeks@gmail.com  
**Last updated:** 2026-05-18

---

## Pre-Demo Checklist (5 minutes before the call)

Run these in order. Total time: ~3 minutes.

### 1. Reset demo data

**Option A — Supabase SQL (most reliable):**
```sql
select public.reset_demo_agency('atlas');
```
Open: https://supabase.com/dashboard/project/jfphwmzwteermalzwojp/editor → paste → run.  
Expected output:
```json
{
  "agency_id": "e0a68c9f-cf48-47b0-bef7-dba3f27db0b9",
  "slug": "atlas",
  "reps_seeded": 3,
  "policies_seeded": 12,
  "commissions_seeded": 9,
  "expenses_seeded": 8,
  "pipeline_seeded": 20,
  "appointments_seeded": 4,
  "call_events_seeded": 5,
  "reset_at": "..."
}
```

**Option B — cron endpoint (if you don't have DB access):**
```bash
curl -X POST https://repflow.koino.capital/api/cron/reset-demo \
  -H "Authorization: Bearer $CRON_SECRET"
```

**Option C — auto-reset:** The cron runs every 4 hours (0:00, 4:00, 8:00, 12:00, 16:00, 20:00 UTC). If your demo is within 4 hours of a reset, you're already clean. Check `reset_at` in the response.

### 2. Verify the P&L page loads

Log in at https://repflow.koino.capital  
Navigate to P&L → confirm:
- [ ] 4 KPI cards show dollar amounts (not $0)
- [ ] "Submitted AP" should be ~$1,491,000
- [ ] "Earned Comm" should be ~$1,397,500
- [ ] "Expenses" should show ~$1,422
- [ ] By-rep table shows Avery Chen, Marcus Hill, Sofia Reyes with non-zero rows

### 3. Verify Vault scripts

Vault → Scripts tab → confirm 10+ scripts visible with chips labeled Cold / Voicemail / Warm / Objection / Persistency / Closing.

### 4. Check your browser

- Open a fresh incognito window to confirm the login/redirect flow
- Make sure you're logged in as iankmeeks@gmail.com
- Make sure the agency context is set to Atlas

---

## The 12-Minute Demo Flow

*(Full narrative is in `KOINO/vault/REPFLOW_DEMO_PLAYBOOK_2026-05-16.md`)*

| Minute | Screen | What to show |
|--------|--------|-------------|
| 0–1 | (no screen yet) | The hook: "one tool, not eight" |
| 1–3 | P&L (`/pnl`) | 4 KPI cards + by-rep table + click a rep row → drawer |
| 3–5 | P&L + FAB | Log a deal (5 fields) → P&L refreshes. Log an expense. |
| 5–7 | Settings → Agents | One-liner install. Recent Commands pane. |
| 7–9 | Vault | Courses tab → Scripts tab → Segments tab |
| 9–11 | Lead Drip | Vendor webhooks, Sequences, Messaging |
| 11–12 | Tree | Hierarchy, IMO view, sub-agency drill-down |
| 12–15 | — | Close: 30-day free trial, 3-rep commitment |

### Critical demo beats (don't miss these)

1. **Click a rep name in the P&L table** — drawer opens with their policies + expenses. This is the most impressive moment.
2. **Submit a deal via FAB** — the P&L Earned Comm card bumps in ~2 seconds. Say "it's real-time."
3. **Show the install one-liner** — "runs on THEIR machine, not in our cloud."

---

## Post-Demo: Capture Prospect Notes

Right after hanging up, log to `KOINO/systems/business/prospects.csv`:

```
Date | Agency Name | Size (# reps) | Pain Point | What They Reacted To | Outcome | Follow-up Date
```

Three demos with the same reaction = a feature to highlight in marketing.  
Three demos with the same hesitation = a feature to build.

---

## Troubleshooting

### P&L shows $0 across the board

**Cause:** Demo data wasn't seeded, or the date range filter excludes the seeded policies.  
**Fix:** Run `reset_demo_agency('atlas')` → navigate back → hard-refresh (Cmd+Shift+R).

### "App in" FAB doesn't appear

**Cause:** User isn't logged in as a rep/manager/owner for atlas agency.  
**Fix:** Confirm iankmeeks@gmail.com is logged in. Check agency context selector shows "Atlas."

### FAB opens but submit fails / spinner hangs

**Cause:** RLS write policy blocking the insert, or missing required field.  
**Fix:**
1. Open DevTools → Network → find the failing POST → check the error body.
2. Common: `agency_id` not in payload — check page-extras.jsx FAB submit handler.
3. Fallback: log the deal manually via Supabase SQL editor and show the result.

### Vault shows 0 scripts

**Cause:** Migration 0050 wasn't applied, or the scripts were seeded to a different agency_id.  
**Fix:** Run migration 0050 manually via Supabase SQL editor:
```sql
-- paste contents of supabase/migrations/0050_vault_script_library.sql
```

### Coaching → Team Board dead-ends (nav loop)

**Cause:** Known nav routing bug fixed in commit `41bdbcd` (nav cull migration).  
**Fix:** Should be resolved in main. If still happening: navigate directly via URL `/coaching` and `/team`.

### Rep drawer doesn't open on row click

**Cause:** Component not wired in the current deploy.  
**Fix:** Acknowledge: "The per-rep drill-down is live in the data — we're finishing the drawer animation." Move to FAB demo.

### Appointments show wrong date/timezone

**Cause:** `starts_at` seeded as UTC. Displayed in browser local time.  
**Fix:** This is correct behavior. The 4 appointments should show as today + 2h, tomorrow, in 2 days, in 7 days (roughly).

### reset_demo_agency raises "super_admin only"

**Cause:** Calling via client-side RPC with anon key.  
**Fix:** Must use service-role key. Use the Supabase SQL editor (which runs as postgres, bypasses RLS), or call via `/api/cron/reset-demo` with CRON_SECRET.

### reset_demo_agency raises "no is_demo=true agency with slug=atlas"

**Cause:** Migration 0048 wasn't applied, or atlas agency doesn't have `is_demo=true`.  
**Fix:**
```sql
-- Apply the flag manually:
update public.agencies set is_demo = true where slug = 'atlas';
-- Then retry:
select public.reset_demo_agency('atlas');
```

---

## Manual On-Demand Reset (any time)

```sql
-- Supabase SQL editor:
select public.reset_demo_agency('atlas');
```

```bash
# Or via API:
curl -X POST "https://repflow.koino.capital/api/cron/reset-demo?slug=atlas" \
     -H "Authorization: Bearer $CRON_SECRET"
```

---

## What's Demo-Safe vs What to Skip

| Feature | Demo-safe? | Note |
|---------|-----------|------|
| P&L page | ✅ Yes | Show this first |
| FAB → Log Deal | ✅ Yes | Show this live |
| FAB → Log Expense | ✅ Yes | Immediate follow-on |
| Settings → Agents | ✅ Yes | One-liner is the differentiator |
| Vault → Courses | ✅ Yes | 3 starter courses seeded |
| Vault → Scripts | ✅ Yes | 10 scripts from migration 0050 |
| Lead Drip | ✅ Yes | Static pages render |
| Tree | ✅ Yes | Hierarchy renders |
| /lab | ❌ Skip | Super-admin orphan page |
| Quote Tool "run agent" | ❌ Skip | Bare UX |
| Auto-quoter session | ❌ Skip | Clunky |
| Floor | ❌ Skip | Being reworked |

---

## Seed Reference Numbers

After a fresh reset, the atlas agency should show:

| Metric | Value |
|--------|-------|
| Submitted AP (MTD) | ~$1,491,000 |
| Policies seeded | 12 (5 Avery + 4 Marcus + 3 Sofia) |
| Commissions seeded | 9 (issued + app_in only; pending excluded) |
| Expenses (total) | $1,422 (lead_spend + saas + travel + training + marketing + other) |
| Pipeline leads | 20 across all stages |
| Appointments | 4 (today+2h, tomorrow, +2d, +7d) |
| Call events | 5 (yesterday, various outcomes) |

---

*Update this file after every demo session if you find breaks. Last editor: auto-generated 2026-05-18.*
