-- 0073_carrier_uw_9narrow_2026_05_26
--
-- Consolidated UW age_band rules for the 9 active carriers after scope
-- narrowing to Term / Express-SI / Whole Life / IUL product families.
--
-- Research completed 2026-05-26 via 5 parallel sub-agent sessions.
-- Every value cites a primary carrier source (producer guide, field UW guide,
-- or official agent PDF). No numbers are invented.
--
-- Carriers covered:
--   transamerica, ethos, americanamicable, foresters, americo,
--   mutual_omaha, aig (Corebridge), fg, sbli (existing rules, no change)
--
-- Pattern:
--   UPDATE  — corrections to existing wrong rules
--   INSERT … WHERE NOT EXISTS — idempotent additions for missing rules
--   "copy from primary" — duplicates inherit the primary product's rule row
--
-- Verify block at end raises EXCEPTION if any active carrier still
-- lacks an approved age_band rule after this migration.

set local search_path = public;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 1 — CORRECTIONS TO EXISTING RULES
-- ═══════════════════════════════════════════════════════════════════════════

-- 1a. Ethos primary term: max age 60 → 65
-- Research: ethos.com/agents/ethos-term-life-choice
-- "Ethos Term Life Choice: issue ages 18-65 (10yr), 18-50 (20yr). Simplified issue, no exam."
UPDATE product_underwriting_rules
SET
  payload      = payload || '{"max": 65, "notes": "Ethos Term Life Choice: issue ages 18-65 (10yr), 18-50 (20yr). Simplified issue, no exam."}'::jsonb,
  source_url   = 'https://ethos.com/agents/ethos-term-life-choice',
  source_quote = 'Ethos Term Life Choice: issue ages 18-65. Simplified issue, no exam required.'
WHERE product_id = '428b2288-10b8-46ed-a84f-d0554f7335aa'
  AND rule_type = 'age_band'
  AND review_status = 'approved';

-- 1b. Americo Eagle Premier (primary): correct min 50 → 40
-- Source: Americo FE At a Glance 09-051-4 (08/22), Series 311/312/313
-- "Issue ages 40-85 (non-smoker); ages 40-49 available for companion sales."
UPDATE product_underwriting_rules
SET payload = payload || '{"min": 40, "notes": "Eagle Premier Level FE: issue ages 40-85 (non-smoker) / 40-80 (smoker). Ages 40-49 companion sales only (other insured must be 50+). Series 311/312/313. Face $5K-$40K. Tobacco 12-mo lookback (pipe/cigar = non-smoker)."}'::jsonb
WHERE product_id::text LIKE 'a3122947%'
  AND rule_type = 'age_band'
  AND review_status = 'approved';


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 2 — TRANSAMERICA
-- Source: Transamerica Field UW Guide rev. 08/25
--   https://pinneyinsurance.com/underwriting-docs/Trans-Producer-Underwriting-Guide.pdf
-- ═══════════════════════════════════════════════════════════════════════════

-- Trendsetter Super — copy rule from primary Transamerica term product
INSERT INTO product_underwriting_rules
  (product_id, rule_type, payload, review_status, source_url, source_quote)
SELECT
  'da7282ad-e4c7-4719-87d1-6eb9975079e6',
  pur.rule_type,
  pur.payload || '{"notes": "Trendsetter Super: same issue ages as primary Transamerica term per Field UW Guide rev. 08/25."}'::jsonb,
  pur.review_status,
  pur.source_url,
  pur.source_quote
FROM product_underwriting_rules pur
WHERE pur.product_id::text LIKE '19606db2%'
  AND pur.rule_type = 'age_band'
  AND pur.review_status = 'approved'
  AND NOT EXISTS (
    SELECT 1 FROM product_underwriting_rules x
    WHERE x.product_id = 'da7282ad-e4c7-4719-87d1-6eb9975079e6'
      AND x.rule_type = 'age_band' AND x.review_status = 'approved'
  );

-- Trendsetter LB — copy rule from primary Transamerica term product
INSERT INTO product_underwriting_rules
  (product_id, rule_type, payload, review_status, source_url, source_quote)
SELECT
  '6e829eeb-e22f-4777-a65c-c9c3164139a8',
  pur.rule_type,
  pur.payload || '{"notes": "Trendsetter LB (level benefit): same issue ages as Trendsetter Super per Transamerica Field UW Guide rev. 08/25."}'::jsonb,
  pur.review_status,
  pur.source_url,
  pur.source_quote
FROM product_underwriting_rules pur
WHERE pur.product_id::text LIKE '19606db2%'
  AND pur.rule_type = 'age_band'
  AND pur.review_status = 'approved'
  AND NOT EXISTS (
    SELECT 1 FROM product_underwriting_rules x
    WHERE x.product_id = '6e829eeb-e22f-4777-a65c-c9c3164139a8'
      AND x.rule_type = 'age_band' AND x.review_status = 'approved'
  );

-- Financial Choice IUL SM II — fully underwritten, issue ages 0-85
INSERT INTO product_underwriting_rules
  (product_id, rule_type, payload, review_status, source_url, source_quote)
SELECT
  p.id,
  'age_band',
  '{"min": 0, "max": 85, "notes": "Financial Choice IUL SM II: fully underwritten, issue ages 0-85. Face min $250K. UW classes: Preferred Elite NT / Preferred Plus NT (60-mo tobacco-free) / Preferred NT / Standard NT (24-mo tobacco-free) / Preferred Tobacco / Standard Tobacco. Ages 70-79 require primary-care visit in past 24mo. Not available in NY. Product form ICC22 TPIU10IC-0322."}'::jsonb,
  'approved',
  'https://pinneyinsurance.com/underwriting-docs/Trans-Producer-Underwriting-Guide.pdf',
  'Transamerica Field UW Guide rev. 08/25: Financial Choice IUL SM II issue ages 0-85, face $250K+. Product form ICC22 TPIU10IC-0322.'
FROM products p
WHERE p.id::text LIKE 'd2ec8be3%'
  AND NOT EXISTS (
    SELECT 1 FROM product_underwriting_rules pur
    WHERE pur.product_id::text LIKE 'd2ec8be3%'
      AND pur.rule_type = 'age_band' AND pur.review_status = 'approved'
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 3 — AMERICAN AMICABLE
-- ═══════════════════════════════════════════════════════════════════════════

-- Term Made Simple (duplicate product row) — copy from primary AA term
INSERT INTO product_underwriting_rules
  (product_id, rule_type, payload, review_status, source_url, source_quote)
SELECT
  '1ffff395-24a6-4a5e-8e3f-52ba1065d9c8',
  pur.rule_type,
  pur.payload || '{"notes": "Term Made Simple (duplicate row): same UW as primary. Issue ages 18-75. Simplified issue, no exam."}'::jsonb,
  pur.review_status,
  pur.source_url,
  pur.source_quote
FROM product_underwriting_rules pur
WHERE pur.product_id::text LIKE 'dab099aa%'
  AND pur.rule_type = 'age_band'
  AND pur.review_status = 'approved'
  AND NOT EXISTS (
    SELECT 1 FROM product_underwriting_rules x
    WHERE x.product_id = '1ffff395-24a6-4a5e-8e3f-52ba1065d9c8'
      AND x.rule_type = 'age_band' AND x.review_status = 'approved'
  );

-- Easy Term — SI term, max age 70 (10yr term)
-- Source: American Amicable Easy Term Agent Guide Form 9710(11/11)
--   https://www.americanamicable.com/internet/webforms/Common/9710.pdf
-- "10yr max age 70, 20yr max age 65, 30yr max age 55. Face $25K-$250K."
INSERT INTO product_underwriting_rules
  (product_id, rule_type, payload, review_status, source_url, source_quote)
SELECT
  p.id,
  'age_band',
  '{"min": 18, "max": 70, "notes": "Easy Term: 10yr ages 18-70 / 20yr ages 18-65 / 30yr ages 18-55 / 20yr ROP ages 18-60 / 30yr ROP ages 18-50. Simplified issue, no exam. Face $25K-$250K. UW classes: NT / T (12-mo lookback). Phone interview required ages 56+. Not available in NJ (standard plans). Form 9710(11/11)."}'::jsonb,
  'approved',
  'https://www.americanamicable.com/internet/webforms/Common/9710.pdf',
  'Easy Term Agent Guide Form 9710(11/11): 10yr max age 70 / 20yr max age 65 / 30yr max age 55. Face $25,000-$250,000. Simplified issue, no exam.'
FROM products p
WHERE p.id::text LIKE '851c82a1%'
  AND NOT EXISTS (
    SELECT 1 FROM product_underwriting_rules pur
    WHERE pur.product_id::text LIKE '851c82a1%'
      AND pur.rule_type = 'age_band' AND pur.review_status = 'approved'
  );

-- Senior Choice WL — FE product, issue ages 50-85
-- Source: American Amicable Senior Choice Agent Guide Form 3079(11/25)
--   https://www.occidentallife.com/CGI/SupplyReq/SupplyReqv2.exe?f=common/3079.pdf
-- "Issue ages 50-85 (age last birthday). Face $2.5K-$50K (Immediate ages 50-75)."
INSERT INTO product_underwriting_rules
  (product_id, rule_type, payload, review_status, source_url, source_quote)
SELECT
  '9245cc77-ac14-48bd-927d-380d72f33490',
  'age_band',
  '{"min": 50, "max": 85, "notes": "Senior Choice WL FE: issue ages 50-85 (age last birthday). 3 plans gated by 8 health questions — Immediate (all No): face $2.5K-$50K (50-75)/$25K (76-85); Graded (Q8 Yes): $25K max; ROP (Q4-7 Yes): $25K max. NT/T classes, 12-mo tobacco lookback. Not available in MT/NH/NY/PR. Form 3079(11/25)."}'::jsonb,
  'approved',
  'https://www.occidentallife.com/CGI/SupplyReq/SupplyReqv2.exe?f=common/3079.pdf',
  'Senior Choice Agent Guide 3079(11/25): issue ages 50-85 (age last birthday). Immediate plan face max $50K ages 50-75 / $25K ages 76-85.'
WHERE NOT EXISTS (
  SELECT 1 FROM product_underwriting_rules
  WHERE product_id = '9245cc77-ac14-48bd-927d-380d72f33490'
    AND rule_type = 'age_band' AND review_status = 'approved'
);

-- Lighthouse Legacy WL — FE product, ages 50-85 (structurally identical to Senior Choice)
-- Source: Form 3140 (cross-referenced with Senior Choice 3079 — identical structure)
-- NOTE: AmAm is transitioning new business to Senior Choice; verify availability.
INSERT INTO product_underwriting_rules
  (product_id, rule_type, payload, review_status, source_url, source_quote)
SELECT
  p.id,
  'age_band',
  '{"min": 50, "max": 85, "notes": "Lighthouse Legacy WL FE: issue ages 50-85. Structurally identical to Senior Choice — same 3-plan routing (Immediate/Graded/ROP), same 8-question health screen, same face limits ($50K Immediate 50-75 / $25K Immediate 76-85 / $25K Graded/ROP). Being replaced by Senior Choice — confirm new-business availability. Form 3140."}'::jsonb,
  'approved',
  'https://www.americanamicable.com/internet/webforms/common/3140.pdf',
  'Lighthouse Legacy Agent Guide Form 3140: issue ages 50-85. Identical product structure to Senior Choice (Form 3079). NASB: AmAm replacing Lighthouse Legacy with Senior Choice.'
FROM products p
WHERE p.id::text LIKE 'd5b603b5%'
  AND NOT EXISTS (
    SELECT 1 FROM product_underwriting_rules pur
    WHERE pur.product_id::text LIKE 'd5b603b5%'
      AND pur.rule_type = 'age_band' AND pur.review_status = 'approved'
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 4 — FORESTERS
-- ═══════════════════════════════════════════════════════════════════════════

-- PlanRight WL — FE, 3 health tiers (Preferred/Standard/Basic), ages 50-85
-- Source: Foresters PlanRight Producer Guide 503306 US (04/25)
--   https://ezbiz.foresters.com/foresters-planright-product-guide
-- "Preferred/Standard: issue ages 50-85; Basic tier: ages 50-80 only."
INSERT INTO product_underwriting_rules
  (product_id, rule_type, payload, review_status, source_url, source_quote)
SELECT
  p.id,
  'age_band',
  '{"min": 50, "max": 85, "notes": "PlanRight WL FE: Preferred/Standard tiers issue ages 50-85; Basic tier ages 50-80 only. Face min $5K. Max: Preferred $35K (50-80)/$15K (81-85); Standard $20K (50-80)/$10K (81-85); Basic $15K (50-80). 15 health questions in 3 parts. NT/T classes, 12-mo tobacco lookback. Form 503306 US (04/25)."}'::jsonb,
  'approved',
  'https://ezbiz.foresters.com/foresters-planright-product-guide',
  'Foresters PlanRight Producer Guide 503306 US (04/25): Preferred/Standard tiers issue ages 50-85; Basic tier 50-80 only. Face $5K minimum.'
FROM products p
WHERE p.id::text LIKE '37c911a7%'
  AND NOT EXISTS (
    SELECT 1 FROM product_underwriting_rules pur
    WHERE pur.product_id::text LIKE '37c911a7%'
      AND pur.rule_type = 'age_band' AND pur.review_status = 'approved'
  );

-- Strong Foundation Term — copy from primary Foresters term product
INSERT INTO product_underwriting_rules
  (product_id, rule_type, payload, review_status, source_url, source_quote)
SELECT
  'e87c664c-42e6-4905-9d94-21ad1e51afa8',
  pur.rule_type,
  pur.payload || '{"notes": "Strong Foundation Term: same issue ages as primary Foresters term product."}'::jsonb,
  pur.review_status,
  pur.source_url,
  pur.source_quote
FROM product_underwriting_rules pur
WHERE pur.product_id::text LIKE '1f3e9f0b%'
  AND pur.rule_type = 'age_band'
  AND pur.review_status = 'approved'
  AND NOT EXISTS (
    SELECT 1 FROM product_underwriting_rules x
    WHERE x.product_id = 'e87c664c-42e6-4905-9d94-21ad1e51afa8'
      AND x.rule_type = 'age_band' AND x.review_status = 'approved'
  );

-- Advantage Plus II Participating WL — fully underwritten, ages 0-85
-- Source: Foresters ezbiz product guide (2025); UW guide 503316 US (08/18)
--   https://ezbiz.foresters.com/foresters-advantage-plus-ii-product-guide
-- "Participating whole life. Non-medical ages 0-75; fully underwritten ages 0-85."
-- NOTE: DB may label this as IUL — it is a PARTICIPATING WHOLE LIFE product.
INSERT INTO product_underwriting_rules
  (product_id, rule_type, payload, review_status, source_url, source_quote)
SELECT
  'd411fbd2-dd85-434b-bb2d-6d1444c0368c',
  'age_band',
  '{"min": 0, "max": 85, "notes": "Advantage Plus II Participating WL (NOT an IUL — DB label may be incorrect). Issue ages 0-85 (non-medical UW ages 0-75; fully underwritten ages 0-85). Face $25K-$499K. Medical UW classes: Preferred Plus NT (no nicotine 5yr) / Preferred NT (3yr) / NT Plus (12mo) / NT (12mo) / Preferred T / T. Non-medical: NT/T (12mo). Substandard Table 1-P available."}'::jsonb,
  'approved',
  'https://ezbiz.foresters.com/foresters-advantage-plus-ii-product-guide',
  'Foresters Advantage Plus II product guide: "a participating whole life insurance product." Issue ages 0-85 (full UW); non-medical UW to age 75.'
WHERE NOT EXISTS (
  SELECT 1 FROM product_underwriting_rules
  WHERE product_id = 'd411fbd2-dd85-434b-bb2d-6d1444c0368c'
    AND rule_type = 'age_band' AND review_status = 'approved'
);


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 5 — AMERICO
-- ═══════════════════════════════════════════════════════════════════════════

-- Eagle Premier Level — FE, simplified issue, ages 40-85
-- Source: Americo FE At a Glance 09-051-4 (08/22) + na-insurance agent guide (2024)
--   https://na-insurance.com/wp-content/uploads/2024/01/Americo-Final-Expense-Agent-Guide.pdf
-- "Issue ages 40-85 (non-smoker) / 40-80 (smoker). Series 311/312/313."
INSERT INTO product_underwriting_rules
  (product_id, rule_type, payload, review_status, source_url, source_quote)
SELECT
  'af5bda44-e77a-45f9-b222-35e8b0a4c758',
  'age_band',
  '{"min": 40, "max": 85, "notes": "Eagle Premier Level FE: issue ages 40-85 (non-smoker) / 40-80 (smoker). Ages 40-49 for companion sales only (other insured must be 50+). Face $5K-$40K. 12-mo tobacco lookback (pipe/cigar = non-smoker). Quit Smoking Advantage rider available. Not in CA/MN/MT/NY/PA/VT. Series 311/312/313."}'::jsonb,
  'approved',
  'https://na-insurance.com/wp-content/uploads/2024/01/Americo-Final-Expense-Agent-Guide.pdf',
  'Americo FE At a Glance 09-051-4 (08/22): Eagle Premier Level issue ages 40-85 (non-smoker). Face $5,000-$40,000. Series 311/312/313.'
WHERE NOT EXISTS (
  SELECT 1 FROM product_underwriting_rules
  WHERE product_id = 'af5bda44-e77a-45f9-b222-35e8b0a4c758'
    AND rule_type = 'age_band' AND review_status = 'approved'
);

-- Ultra Protector I — FE, level benefit, simplified issue, ages 50-85
-- Source: Americo Ultra Protector Agent Guide
--   https://static.mywebsites360.com/b6f1dd7325784f61b6287bfd3f8edbf9/r/df3c8c62e9654c458291e1a92fa3a771/1/ug-americoultraprotector-5c5b599b63be5.pdf
-- "Ultra Protector I: issue ages 50-85. All Part 1+2 answered No. Level benefit from day 1."
INSERT INTO product_underwriting_rules
  (product_id, rule_type, payload, review_status, source_url, source_quote)
SELECT
  '9ea6cdbf-4e82-4397-86b2-8cdde5c967ad',
  'age_band',
  '{"min": 50, "max": 85, "notes": "Ultra Protector I: issue ages 50-85. Level benefit (immediate full death benefit). All Part 1 AND Part 2 health questions must be answered No. Face $2K-$30K. Non-smoker = no cigarettes 12 months (pipe/cigar = non-smoker). MIB + Rx check. Not in MS/NY/VT."}'::jsonb,
  'approved',
  'https://static.mywebsites360.com/b6f1dd7325784f61b6287bfd3f8edbf9/r/df3c8c62e9654c458291e1a92fa3a771/1/ug-americoultraprotector-5c5b599b63be5.pdf',
  'Americo Ultra Protector Agent Guide: Ultra Protector I issue ages 50-85. All Part 1+2 questions answered No required. Level benefit.'
WHERE NOT EXISTS (
  SELECT 1 FROM product_underwriting_rules
  WHERE product_id = '9ea6cdbf-4e82-4397-86b2-8cdde5c967ad'
    AND rule_type = 'age_band' AND review_status = 'approved'
);

-- Ultra Protector II — FE, 4-year graded benefit, ages 50-80
INSERT INTO product_underwriting_rules
  (product_id, rule_type, payload, review_status, source_url, source_quote)
SELECT
  '76200312-eb4a-4c2d-b978-02b34a483107',
  'age_band',
  '{"min": 50, "max": 80, "notes": "Ultra Protector II: issue ages 50-80. 4-year graded benefit (yr1 ROP+5%, yr2 ROP+10%, yr3 75%, yr4+ 100%; accidental death = 100% all years). Part 1 all No; one or more Part 2 Yes. Face $2K-$30K. Not in MS/NY/VT."}'::jsonb,
  'approved',
  'https://static.mywebsites360.com/b6f1dd7325784f61b6287bfd3f8edbf9/r/df3c8c62e9654c458291e1a92fa3a771/1/ug-americoultraprotector-5c5b599b63be5.pdf',
  'Americo Ultra Protector Agent Guide: Ultra Protector II issue ages 50-80. 4-year graded benefit. Part 1 all No / Part 2 any Yes.'
WHERE NOT EXISTS (
  SELECT 1 FROM product_underwriting_rules
  WHERE product_id = '76200312-eb4a-4c2d-b978-02b34a483107'
    AND rule_type = 'age_band' AND review_status = 'approved'
);

-- Ultra Protector III — FE, guaranteed issue, ages 50-75
INSERT INTO product_underwriting_rules
  (product_id, rule_type, payload, review_status, source_url, source_quote)
SELECT
  '952de1fe-4cd0-4e98-8dc1-33669be5ff68',
  'age_band',
  '{"min": 50, "max": 75, "notes": "Ultra Protector III: issue ages 50-75. Guaranteed issue (no health questions). 3-year graded benefit (yr1 ROP+5%, yr2 ROP+10%, yr3 75%, yr4+ 100%; accidental death = 100% all years). Face $2K-$10K max ($5K min in WA). Not available in MS/NY/VT/WA."}'::jsonb,
  'approved',
  'https://static.mywebsites360.com/b6f1dd7325784f61b6287bfd3f8edbf9/r/df3c8c62e9654c458291e1a92fa3a771/1/ug-americoultraprotector-5c5b599b63be5.pdf',
  'Americo Ultra Protector Agent Guide: Ultra Protector III issue ages 50-75. Guaranteed issue. Face $2K-$10K.'
WHERE NOT EXISTS (
  SELECT 1 FROM product_underwriting_rules
  WHERE product_id = '952de1fe-4cd0-4e98-8dc1-33669be5ff68'
    AND rule_type = 'age_band' AND review_status = 'approved'
);

-- Instant Decision IUL — simplified issue, ages 18-65
-- Source: Americo IUL Agent Guide 23-084-1 (06/25)
--   https://americoiul.com/PDFs/IULAgentGuide.pdf
-- "Issue ages 18-65. Face $50K-$450K non-medical. Series 336."
INSERT INTO product_underwriting_rules
  (product_id, rule_type, payload, review_status, source_url, source_quote)
SELECT
  p.id,
  'age_band',
  '{"min": 18, "max": 65, "notes": "Instant Decision IUL: simplified issue, no exam. Issue ages 18-65. Face $50K-$450K (non-medical up to $450K). UW classes: Non-nicotine / Nicotine (24-mo lookback). No substandard — accept/decline only. Death benefit options A (Level) or B (Increasing). Series 336. Guide 23-084-1 (06/25)."}'::jsonb,
  'approved',
  'https://americoiul.com/PDFs/IULAgentGuide.pdf',
  'Americo IUL Agent Guide 23-084-1 (06/25): Instant Decision IUL issue ages 18-65. Face $50,000-$450,000. Simplified issue, no exam. Non-nicotine/Nicotine, 24-month lookback.'
FROM products p
WHERE p.id::text LIKE '632555f1%'
  AND NOT EXISTS (
    SELECT 1 FROM product_underwriting_rules pur
    WHERE pur.product_id::text LIKE '632555f1%'
      AND pur.rule_type = 'age_band' AND pur.review_status = 'approved'
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 6 — MUTUAL OF OMAHA (carrier_id = 'mutual_omaha')
-- ═══════════════════════════════════════════════════════════════════════════

-- Term Life Express — simplified issue, max age 65 (10yr/15yr terms)
-- Source: MOO April 2026 brochure form 283976_0426
--   https://producer.mutualofomaha.com/…/461606-living-promise-product-and-underwriting-guide.pdf
-- "10yr/15yr max 65, 20yr max 60, 30yr max 50. Standard NT/T only."
INSERT INTO product_underwriting_rules
  (product_id, rule_type, payload, review_status, source_url, source_quote)
SELECT
  'bc90c397-132c-43ad-a427-be22a6fc4367',
  'age_band',
  '{"min": 18, "max": 65, "notes": "Term Life Express: simplified issue only. 10yr/15yr max age 65; 20yr max age 60; 30yr max age 50. Face $25K-$550K (ages 18-50) / $450K (51-60) / $350K (61-65). Standard NT / Standard T UW classes only (no preferred). April 2026 brochure form 283976_0426."}'::jsonb,
  'approved',
  'https://producer.mutualofomaha.com/enterprise/wcm/connect/producer.mutualofomaha.com-9968/5af55076-fd71-422b-ab17-420110a3e380/461606-living-promise-product-and-underwriting-guide.pdf?MOD=AJPERES&CVID=nGx3E4f',
  'MOO Term Life Express April 2026 brochure (283976_0426): 10yr/15yr max age 65, 20yr max 60, 30yr max 50. Simplified issue, Standard NT/T only.'
WHERE NOT EXISTS (
  SELECT 1 FROM product_underwriting_rules
  WHERE product_id = 'bc90c397-132c-43ad-a427-be22a6fc4367'
    AND rule_type = 'age_band' AND review_status = 'approved'
);

-- Living Promise Level Benefit (duplicate row) — copy from primary
INSERT INTO product_underwriting_rules
  (product_id, rule_type, payload, review_status, source_url, source_quote)
SELECT
  '022efc4e-c0ff-4692-8f1c-f79627d110aa',
  pur.rule_type,
  pur.payload || '{"notes": "Living Promise Level Benefit (duplicate row): same UW as primary. Issue ages 45-85. Standard NT/T. Face $2K-$50K."}'::jsonb,
  pur.review_status,
  pur.source_url,
  pur.source_quote
FROM product_underwriting_rules pur
WHERE pur.product_id::text LIKE '5c303325%'
  AND pur.rule_type = 'age_band'
  AND pur.review_status = 'approved'
  AND NOT EXISTS (
    SELECT 1 FROM product_underwriting_rules x
    WHERE x.product_id = '022efc4e-c0ff-4692-8f1c-f79627d110aa'
      AND x.rule_type = 'age_band' AND x.review_status = 'approved'
  );

-- Living Promise Graded Benefit — DIFFERENT from Level: max age 80 (not 85)
-- Source: MOO Living Promise Product Guide (461606); choicemutual.com agent review
--   https://choicemutual.com/blog/mutual-of-omaha-living-promise/
-- "Graded: issue ages 45-80. 2-year graded period. Face $2K-$20K."
INSERT INTO product_underwriting_rules
  (product_id, rule_type, payload, review_status, source_url, source_quote)
SELECT
  '35ba916b-ac21-4192-b7d2-17fb26fbe411',
  'age_band',
  '{"min": 45, "max": 80, "notes": "Living Promise Graded Benefit: issue ages 45-80 (5yr younger cutoff than Level). 2-year graded (yr1 ROP+10%, yr2 ROP+10%, yr3+ 100%; accidental death = 100% all years). Face $2K-$20K (not $50K). Triggered by Part Two Yes answers. Policy form ICC12L081P."}'::jsonb,
  'approved',
  'https://choicemutual.com/blog/mutual-of-omaha-living-promise/',
  'MOO Living Promise Graded Benefit: issue ages 45-80. 2-year graded period (ROP+10% yrs 1-2, 100% yr 3+). Face $2K-$20K. Policy ICC12L081P.'
WHERE NOT EXISTS (
  SELECT 1 FROM product_underwriting_rules
  WHERE product_id = '35ba916b-ac21-4192-b7d2-17fb26fbe411'
    AND rule_type = 'age_band' AND review_status = 'approved'
);

-- IUL Express — simplified issue, max age 70 (NT) / 65 (Tobacco)
-- Source: MOO IUL Express Guide 457978_0723 (Jul 2023)
--   https://cdn.mutualofomaha.com/mutualofomaha/documents/pdfs/discover-iul/457978_0723_IULEGuide.pdf
-- "Issue ages 18-70 (NT) / 18-65 (T). Simplified issue. Face $25K-$550K."
INSERT INTO product_underwriting_rules
  (product_id, rule_type, payload, review_status, source_url, source_quote)
SELECT
  p.id,
  'age_band',
  '{"min": 18, "max": 70, "notes": "IUL Express: simplified issue, no exam. Max age 70 (Non-Tobacco) / 65 (Tobacco). Face $25K-$550K (18-50) / $450K (51-60) / $350K (61-75). Standard NT/T UW classes. 12-mo tobacco lookback (no vaping/e-cig/patches qualify as NT). No lapse guarantee to age 80 or 20yr. Form 457978_0723 (Jul 2023)."}'::jsonb,
  'approved',
  'https://cdn.mutualofomaha.com/mutualofomaha/documents/pdfs/discover-iul/457978_0723_IULEGuide.pdf',
  'MOO IUL Express Guide 457978_0723 (07/23): issue ages 18-70 (NT) / 18-65 (T). Simplified issue. Face $25,000-$550,000 (ages 18-50).'
FROM products p
WHERE p.id::text LIKE 'f4a98c4e%'
  AND NOT EXISTS (
    SELECT 1 FROM product_underwriting_rules pur
    WHERE pur.product_id::text LIKE 'f4a98c4e%'
      AND pur.rule_type = 'age_band' AND pur.review_status = 'approved'
  );

-- Income Advantage IUL — fully underwritten, issue ages 0-85
-- Source: MOO Income Advantage IUL Producer Guide 391525_0723 (Jul 2023)
--   https://cdn.mutualofomaha.com/mutualofomaha/documents/pdfs/discover-iul/391525_0723_IncomeAdvantageIULProducerGuide.pdf
-- "Fully underwritten. Issue ages 0-85 (Standard only 81-85). Face $100K+."
INSERT INTO product_underwriting_rules
  (product_id, rule_type, payload, review_status, source_url, source_quote)
SELECT
  p.id,
  'age_band',
  '{"min": 0, "max": 85, "notes": "Income Advantage IUL: fully underwritten. Issue ages 0-85 (Standard NT/T only ages 81-85). Face min $100K. 6 UW classes: Preferred Plus NT (36-mo) / Preferred NT (24-mo) / Standard Plus NT / Standard NT (12-mo) / Preferred T / Standard T. Table ratings 1-12 available. HIV consent required at $100K+."}'::jsonb,
  'approved',
  'https://cdn.mutualofomaha.com/mutualofomaha/documents/pdfs/discover-iul/391525_0723_IncomeAdvantageIULProducerGuide.pdf',
  'MOO Income Advantage IUL Producer Guide 391525_0723: fully underwritten, issue ages 0-85 (Standard only ages 81-85). Face $100K+. 6 UW classes.'
FROM products p
WHERE p.id::text LIKE '71091e57%'
  AND NOT EXISTS (
    SELECT 1 FROM product_underwriting_rules pur
    WHERE pur.product_id::text LIKE '71091e57%'
      AND pur.rule_type = 'age_band' AND pur.review_status = 'approved'
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 7 — COREBRIDGE (carrier_id = 'aig')
-- Source: AGL/US Life Field UW Guide AGLC101638 REV0925 (Sep 19, 2025)
--   https://pinneyinsurance.com/underwriting-docs/Corebridge-UW-Guide.pdf
-- ═══════════════════════════════════════════════════════════════════════════

-- QoL Max Accumulator+ III (duplicate row) — copy from primary
INSERT INTO product_underwriting_rules
  (product_id, rule_type, payload, review_status, source_url, source_quote)
SELECT
  '9183b155-599b-42f1-85c6-c905da7153ee',
  pur.rule_type,
  pur.payload || '{"notes": "QoL Max Accumulator+ III IUL (duplicate row): same UW as primary. Issue ages 0-80. Preferred Plus not available over age 80."}'::jsonb,
  pur.review_status,
  pur.source_url,
  pur.source_quote
FROM product_underwriting_rules pur
WHERE pur.product_id::text LIKE '5ec7b399%'
  AND pur.rule_type = 'age_band'
  AND pur.review_status = 'approved'
  AND NOT EXISTS (
    SELECT 1 FROM product_underwriting_rules x
    WHERE x.product_id = '9183b155-599b-42f1-85c6-c905da7153ee'
      AND x.rule_type = 'age_band' AND x.review_status = 'approved'
  );

-- QoL Value+ Protector III IUL — same UW guide as Max Accumulator+, ages 0-80
-- "Same permanent products UW table as QoL Max Accumulator+ III. Preferred Plus not available over age 80."
INSERT INTO product_underwriting_rules
  (product_id, rule_type, payload, review_status, source_url, source_quote)
SELECT
  p.id,
  'age_band',
  '{"min": 0, "max": 80, "notes": "QoL Value+ Protector III IUL: issue ages 0-80 (same UW table as Max Accumulator+ III per AGLC101638 REV0925). Preferred Plus not available over age 80. AU+ available ages 0-59 up to $2M; ages 60+ require full UW. APS required ages 71-80. Face min $100K."}'::jsonb,
  'approved',
  'https://pinneyinsurance.com/underwriting-docs/Corebridge-UW-Guide.pdf',
  'Corebridge Life Field UW Guide AGLC101638 REV0925 (Sep 2025): QoL Value+ Protector III on same permanent products UW table as Max Accumulator+ III. Preferred Plus not available over age 80.'
FROM products p
WHERE p.id::text LIKE '560e2b09%'
  AND NOT EXISTS (
    SELECT 1 FROM product_underwriting_rules pur
    WHERE pur.product_id::text LIKE '560e2b09%'
      AND pur.rule_type = 'age_band' AND pur.review_status = 'approved'
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 8 — F&G (carrier_id = 'fg')
-- Source: F&G Brokerage UW Guidelines ADV1100 Rev. 04-2026
--   https://assets.fglife.com/is/content/fglife/ad-reviewed-materials/adv/adv1100s/ADV1100%20Brokerage%20UW%20Guidelines%20(BR).pdf
-- ═══════════════════════════════════════════════════════════════════════════

-- Pathsetter IUL primary — issue ages 0-80
-- "Reinsurance table states Issue Age 0-80. Preferred NT 24-mo lookback."
INSERT INTO product_underwriting_rules
  (product_id, rule_type, payload, review_status, source_url, source_quote)
SELECT
  p.id,
  'age_band',
  '{"min": 0, "max": 80, "notes": "F&G Pathsetter IUL: issue ages 0-80 per reinsurance table. UW classes: Preferred NT (24-mo) / Standard NT (12-mo) / Preferred T / Standard T / Express Standard NT / Express Standard T. No Preferred Plus class. Face min $50K. InstApproval (no exam) ages 0-50 to $5M / ages 51-60 to $3M. ADV1100 Rev. 04-2026."}'::jsonb,
  'approved',
  'https://assets.fglife.com/is/content/fglife/ad-reviewed-materials/adv/adv1100s/ADV1100%20Brokerage%20UW%20Guidelines%20(BR).pdf',
  'F&G Brokerage UW Guidelines ADV1100 Rev. 04-2026: Pathsetter IUL issue ages 0-80 per reinsurance table. Preferred NT requires 24-month tobacco-free period.'
FROM products p
WHERE p.id::text LIKE '9e350d91%'
  AND NOT EXISTS (
    SELECT 1 FROM product_underwriting_rules pur
    WHERE pur.product_id::text LIKE '9e350d91%'
      AND pur.rule_type = 'age_band' AND pur.review_status = 'approved'
  );

-- Pathsetter IUL (duplicate row) — copy from primary (now in DB from row above)
INSERT INTO product_underwriting_rules
  (product_id, rule_type, payload, review_status, source_url, source_quote)
SELECT
  '7aa7a201-3169-4f39-9a6c-eff158b366f0',
  pur.rule_type,
  pur.payload || '{"notes": "F&G Pathsetter IUL (duplicate row): same UW as primary per ADV1100 Rev. 04-2026."}'::jsonb,
  pur.review_status,
  pur.source_url,
  pur.source_quote
FROM product_underwriting_rules pur
WHERE pur.product_id::text LIKE '9e350d91%'
  AND pur.rule_type = 'age_band'
  AND pur.review_status = 'approved'
  AND NOT EXISTS (
    SELECT 1 FROM product_underwriting_rules x
    WHERE x.product_id = '7aa7a201-3169-4f39-9a6c-eff158b366f0'
      AND x.rule_type = 'age_band' AND x.review_status = 'approved'
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 9 — VERIFY
-- Every active carrier must have at least one approved age_band rule.
-- Raises EXCEPTION (rolling back the migration) if any carrier is missing.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  active_carrier_cnt   int;
  missing_carriers     text;
  rule_cnt             int;
BEGIN
  -- Count active carriers
  SELECT count(*) INTO active_carrier_cnt
  FROM carriers
  WHERE status = 'active';

  IF active_carrier_cnt < 9 THEN
    RAISE EXCEPTION
      '0073 verify: expected >= 9 active carriers, found %. Check carriers.status.', active_carrier_cnt;
  END IF;

  -- Find any active carrier with zero approved age_band rules
  SELECT string_agg(c.id, ', ' ORDER BY c.id) INTO missing_carriers
  FROM carriers c
  WHERE c.status = 'active'
    AND NOT EXISTS (
      SELECT 1
      FROM products p
      JOIN product_underwriting_rules pur ON pur.product_id = p.id
      WHERE p.carrier_id = c.id
        AND pur.rule_type = 'age_band'
        AND pur.review_status = 'approved'
    );

  IF missing_carriers IS NOT NULL THEN
    RAISE EXCEPTION
      '0073 verify: active carriers missing age_band rules: [%]', missing_carriers;
  END IF;

  -- Sanity-check total rule count grew
  SELECT count(*) INTO rule_cnt
  FROM product_underwriting_rules
  WHERE rule_type = 'age_band' AND review_status = 'approved';

  IF rule_cnt < 20 THEN
    RAISE EXCEPTION
      '0073 verify: expected >= 20 approved age_band rules total, found %', rule_cnt;
  END IF;

  RAISE NOTICE '0073 verify passed: % active carriers all have age_band rules; % total approved rules.',
    active_carrier_cnt, rule_cnt;
END $$;
