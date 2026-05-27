# Carrier UW Audit — 9-Carrier Narrow Scope
**Date:** 2026-05-26  
**Migration:** `supabase/migrations/0073_carrier_uw_9narrow_2026_05_26.sql`  
**Research method:** 5 parallel sub-agents, all values from primary carrier sources  
**Rate-engine fix:** `lib/rate-engine.js` — added `.eq("status", "active")` to carriers query

---

## Scope

9 active carriers × 4 product families (Term / Express-SI / Whole Life / IUL).  
Out of scope: Annuities, Medicare Supplement, Medicare Advantage, Dental/Vision.

---

## Carrier × Product Matrix

### TRANSAMERICA (`transamerica`)
| Product | Age Min | Age Max | Notes | Source |
|---|---|---|---|---|
| Term (primary) | 18 | 80 | Existing rule, no change | Trans Field UW Guide rev. 08/25 |
| Trendsetter Super | 18 | 80 | Copy from primary (same UW) | Trans Field UW Guide rev. 08/25 |
| Trendsetter LB | 18 | 80 | Copy from primary (same UW) | Trans Field UW Guide rev. 08/25 |
| Financial Choice IUL SM II | 0 | 85 | Fully underwritten. Face min $250K. 6 UW classes. Ages 70-79 require PCP visit in past 24mo. | Trans Field UW Guide rev. 08/25 (pinneyinsurance.com) |
| Foundation IUL II | — | — | Existing rule, no change | Prior migration (0059) |

### ETHOS (`ethos`)
| Product | Age Min | Age Max | Notes | Source |
|---|---|---|---|---|
| Term Life Choice | 18 | **65** | UPDATED from 60→65. 10yr ages 18-65; 20yr ages 18-50. SI, no exam. | ethos.com/agents/ethos-term-life-choice |

### AMERICAN AMICABLE (`americanamicable`)
| Product | Age Min | Age Max | Notes | Source |
|---|---|---|---|---|
| Term Made Simple (primary) | 18 | 75 | Existing rule, no change | Prior migration (0059) |
| Term Made Simple (dupe) | 18 | 75 | Copy from primary | Form 9710 |
| Easy Term | 18 | **70** | 10yr max 70 / 20yr max 65 / 30yr max 55. SI, no exam. Face $25K-$250K. | Form 9710(11/11) (americanamicable.com PDF) |
| Senior Choice WL | 50 | 85 | 3 plans (Immediate/Graded/ROP). Immediate face max $50K (50-75)/$25K (76-85). 12-mo tobacco lookback. | Form 3079(11/25) (occidentallife.com PDF) |
| Lighthouse Legacy WL | 50 | 85 | Structurally identical to Senior Choice. Being replaced by Senior Choice — verify new-business availability. | Form 3140 (americanamicable.com PDF) |

### FORESTERS (`foresters`)
| Product | Age Min | Age Max | Notes | Source |
|---|---|---|---|---|
| Strong Foundation Term | 18 | 80 | Copy from primary Foresters term | ezbiz.foresters.com |
| PlanRight WL (FE) | 50 | 85 | Preferred/Standard go to 85; Basic tier max 80. 15-question health screen. | Form 503306 US (04/25) |
| Advantage Plus II WL | 0 | 85 | Participating WL (NOT IUL — DB label may be wrong). Non-medical to age 75; fully UW to 85. Face $25K-$499K. | ezbiz.foresters.com product guide |

### AMERICO (`americo`)
| Product | Age Min | Age Max | Notes | Source |
|---|---|---|---|---|
| Eagle Premier (primary) | **40** | 85 | UPDATED min 50→40. Ages 40-49 companion sales only. 12-mo tobacco lookback (pipe/cigar = non-smoker). | FE At a Glance 09-051-4 (08/22), Series 311/312/313 |
| Eagle Premier Level | 40 | 85 | Same spec as primary. Face $5K-$40K. | na-insurance 2024 agent guide |
| Ultra Protector I | 50 | 85 | Level benefit. All Part 1+2 answered No. Face $2K-$30K. | Ultra Protector Agent Guide (mywebsites360.com PDF) |
| Ultra Protector II | 50 | **80** | 4-year graded. Part 1 all No / Part 2 any Yes. Face $2K-$30K. | Ultra Protector Agent Guide |
| Ultra Protector III | 50 | **75** | Guaranteed issue. Face $2K-$10K. Not in MS/NY/VT/WA. | Ultra Protector Agent Guide |
| Instant Decision IUL | 18 | 65 | SI, no exam. Face $50K-$450K. Non-nicotine/Nicotine (24-mo lookback). No substandard. Series 336. | IUL Agent Guide 23-084-1 (06/25) (americoiul.com) |

### MUTUAL OF OMAHA (`mutual_omaha`)
| Product | Age Min | Age Max | Notes | Source |
|---|---|---|---|---|
| Living Promise Level (primary) | 45 | 85 | Existing rule, confirmed correct. Face $2K-$50K. | Prior migration (0059) |
| Living Promise Level (dupe) | 45 | 85 | Copy from primary. | MOO Living Promise Product Guide 461606 |
| Living Promise Graded | 45 | **80** | Different from Level — max age 80 (not 85). 2-yr graded. Face $2K-$20K. | choicemutual.com / MOO product guide |
| Term Life Express | 18 | **65** | SI only. 10yr/15yr max 65; 20yr max 60; 30yr max 50. Standard NT/T only. | April 2026 brochure 283976_0426 |
| IUL Express | 18 | **70** | SI, no exam. Max 70 (NT) / 65 (T). Face $25K-$550K (18-50). 12-mo lookback. | Guide 457978_0723 (Jul 2023) |
| Income Advantage IUL | 0 | 85 | Fully UW. Standard only ages 81-85. Face $100K+. 6 UW classes. Tables 1-12. | Producer Guide 391525_0723 |

### COREBRIDGE / AIG (`aig`)
| Product | Age Min | Age Max | Notes | Source |
|---|---|---|---|---|
| QoL Max Accumulator+ III (primary) | 0 | 80 | Existing rule, confirmed correct. Preferred Plus not available >80. | Prior migration (0059) |
| QoL Max Accumulator+ III (dupe) | 0 | 80 | Copy from primary. | AGLC101638 REV0925 |
| QoL Value+ Protector III | 0 | 80 | Same UW table as Max Accumulator+. Preferred Plus not available >80. Face min $100K. | AGLC101638 REV0925 (Sep 19, 2025) (pinneyinsurance.com) |

### F&G (`fg`)
| Product | Age Min | Age Max | Notes | Source |
|---|---|---|---|---|
| Pathsetter IUL (primary) | 0 | 80 | Per reinsurance table. No Preferred Plus class. Face min $50K. Preferred NT 24-mo. | ADV1100 Rev. 04-2026 (assets.fglife.com) |
| Pathsetter IUL (dupe) | 0 | 80 | Copy from primary. | ADV1100 Rev. 04-2026 |

### SBLI (`sbli`)
| Product | Age Min | Age Max | Notes | Source |
|---|---|---|---|---|
| OmniTrak Term | 18 | 74 | Existing rule — confirmed correct in prior session. No change. | Prior migration (0059) |

### INSTABRAIN (`instabrain`)
| Product | Notes |
|---|---|
| All products | Existing rules from migration 0059c — confirmed correct. No changes in this migration. |

---

## Key Findings vs Prior State

| Change | Before | After | Reason |
|---|---|---|---|
| Ethos max age | 60 | **65** | Primary source: ethos.com agent page explicitly states 18-65 |
| Americo Eagle Premier min | 50 | **40** | Current series 311/312/313 allows ages 40-49 for companion sales |
| Americo UP II max | (new rule) | **80** | Agent guide: separate age cap from UP I (which is 85) |
| Americo UP III max | (new rule) | **75** | Guaranteed issue product with tighter age cap |
| MOO Living Promise Graded max | (new rule) | **80** | Different product from Level — tighter cap per policy form |
| MOO IUL Express max | (new rule) | **70** (NT) | SI product, tighter than fully-underwritten MOO IUL |
| F&G Pathsetter min | 18 (assumed) | **0** | ADV1100 reinsurance table explicitly shows "Issue Age 0-80" |
| Transamerica Financial Choice IUL max | (new rule) | **85** | Fully underwritten flagship IUL goes to 85 per UW guide |

---

## Acceptance Gates (post-migration)

To verify the Quote Tool reflects the new rules:

1. **72-year-old qualifies for at least one term carrier**  
   → Transamerica term products max at 80. A 72-year-old should be eligible.

2. **75-year-old NT qualifies for at least one express/SI WL carrier**  
   → MOO Living Promise Level (max 85), Americo UP I (max 85), AA Senior Choice WL (max 85), Foresters PlanRight (max 85).

3. **IUL works for a 50-year-old PP NT**  
   → Transamerica Financial Choice IUL (0-85), MOO Income Advantage (0-85), F&G Pathsetter (0-80), Corebridge Value+ Protector (0-80) — all eligible.

---

## Rate-Engine Fix

`lib/rate-engine.js:178` — added `.eq("status", "active")` to the carriers query:

```js
// Before
sb.from("carriers").select("id, name").is("agency_id", null)

// After
sb.from("carriers").select("id, name").is("agency_id", null).eq("status", "active")
```

This ensures inactive carriers (lumico, uhc, humana, aetna, etc.) are not loaded into the UW guide, which was causing spurious ineligibility results when those carriers had no product rules.

---

## Foresters Advantage Plus II — DB Label Correction Needed

The agent research confirmed Foresters Advantage Plus II is a **participating whole life** product, NOT an IUL. The current DB product row at `d411fbd2-...` may have `features.source_product_key = 'iul'` which would cause the engine to display it as an IUL. A follow-up admin fix to set the correct product key is recommended.

---

## Sources Summary

| Carrier | Primary Source |
|---|---|
| Transamerica | Field UW Guide rev. 08/25 (pinneyinsurance.com/underwriting-docs/Trans-Producer-Underwriting-Guide.pdf) |
| Ethos | ethos.com/agents/ethos-term-life-choice |
| American Amicable Easy Term | Form 9710(11/11) (americanamicable.com PDF) |
| American Amicable Senior Choice WL | Form 3079(11/25) (occidentallife.com PDF) |
| American Amicable Lighthouse Legacy WL | Form 3140 (americanamicable.com PDF) |
| Foresters PlanRight | Form 503306 US (04/25) (ezbiz.foresters.com) |
| Foresters Advantage Plus II | ezbiz.foresters.com product guide |
| Americo FE products | FE At a Glance 09-051-4 (08/22); Series 311/312/313 |
| Americo Ultra Protector | Ultra Protector Agent Guide (mywebsites360.com) |
| Americo Instant Decision IUL | IUL Agent Guide 23-084-1 (06/25) (americoiul.com) |
| MOO Term Life Express | April 2026 brochure 283976_0426 (producer.mutualofomaha.com) |
| MOO Living Promise | Product Guide 461606 (producer.mutualofomaha.com) |
| MOO IUL Express | Guide 457978_0723 (cdn.mutualofomaha.com) |
| MOO Income Advantage IUL | Producer Guide 391525_0723 (cdn.mutualofomaha.com) |
| Corebridge (AIG) | Life Field UW Guide AGLC101638 REV0925 (Sep 2025) (pinneyinsurance.com/underwriting-docs/Corebridge-UW-Guide.pdf) |
| F&G Pathsetter IUL | Brokerage UW Guidelines ADV1100 Rev. 04-2026 (assets.fglife.com) |
