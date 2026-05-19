-- 0058 — DB becomes single source of truth for ALL underwriting context
-- (eligibility rules + narrative). Adds 'narrative' to rule_type vocabulary
-- and seeds one info-severity narrative row per existing product, pulled
-- verbatim from lib/carrier-underwriting.deprecated.json. After this, the
-- rate engine can drop its JSON fetch entirely — every value (sweet_spot,
-- sources, discounts, uw_classes_notes, tobacco_notes, build_notes,
-- confidence) comes from product_underwriting_rules.
--
-- Applied to prod via mcp__claude_ai_Supabase__apply_migration on
-- 2026-05-19. File kept in supabase/migrations/ so the local tree
-- matches schema_migrations.

set local search_path = public;

-- 1) Extend rule_type vocabulary.
alter table public.product_underwriting_rules
  drop constraint if exists product_underwriting_rules_rule_type_check;

alter table public.product_underwriting_rules
  add constraint product_underwriting_rules_rule_type_check
  check (rule_type in (
    'id_type','citizenship','residency_months','state_avail',
    'age_band','gender_rules',
    'build_chart','tobacco','condition_decline','condition_rate_class',
    'rx_lookback','mib_rules','exam_required',
    'face_amount','income_multiple','net_worth_min','financial_just',
    'replacement','1035_exchange','business_purpose','trust_owned',
    'premium_finance',
    'foreign_travel','aviation','avocation',
    'criminal_history','dui_lookback','bankruptcy_lookback',
    'funding_source','rider_eligibility','conversion_window',
    'accelerated_uw_path',
    'narrative'
  ));

-- 2) Seed narrative rows. The 12 product UUIDs below are the live ids in
-- prod as of 2026-05-19. If those rows are ever re-created with new ids,
-- re-run the body of this migration against the new ids.
--
-- Idempotent: deletes any prior narrative row before inserting (lets
-- re-runs refresh the content).

delete from public.product_underwriting_rules where rule_type = 'narrative';

-- UHC AARP medsupp
insert into public.product_underwriting_rules
  (product_id, rule_type, payload, severity, source_url, source_quote,
   source_captured_at, review_status, reviewed_by, reviewed_at)
values (
  '728a48bc-43df-485c-88e9-d772a5544ef5', 'narrative',
  jsonb_build_object(
    'sweet_spot','T65 enrollees (especially smokers) and lower-cost states like Dallas/Atlanta where the brand pull and steep new-enrollee discount give the strongest 5-year price.',
    'tobacco_notes','AARP/UHC famously does NOT charge a tobacco surcharge in most states — single rate class. Big competitive moat for smokers.',
    'build_notes','No published industry-wide build chart; UHC reviews holistically. Comparison-site reports indicate generally lenient build review vs Humana/Cigna.',
    'uw_classes_notes','Single class (most states); Level 1/Level 2/Level 3 in attained-age states',
    'discounts', jsonb_build_object(
      'household','10-12% in many states (per NerdWallet 2026 review)',
      'new_enrollment','Up to 45% initial discount that decreases ~2%/year until age 80, then 3%/year (per seniorsmutual.com)'
    ),
    'sources', jsonb_build_array(
      jsonb_build_object('url','https://www.nerdwallet.com/insurance/medicare/aarp-unitedhealthcare-medicare-supplement-review','excerpt','household discounts ranged from 10% to 12% based on location'),
      jsonb_build_object('url','https://tlcinsurancegroup.com/wp-content/uploads/2024/04/UHC-Agent-Guide-030124.pdf','excerpt','EDC Agent Guide (Medicare Solutions producer reference)')
    ),
    'confidence','medium'
  ),
  'info',
  'https://www.nerdwallet.com/insurance/medicare/aarp-unitedhealthcare-medicare-supplement-review',
  'AARP plans in Massachusetts, Minnesota and Wisconsin fit each state''s respective standards',
  now(), 'approved', 'system:0058_migration', now()
);

-- Humana medsupp
insert into public.product_underwriting_rules
  (product_id, rule_type, payload, severity, source_url, source_quote,
   source_captured_at, review_status, reviewed_by, reviewed_at)
values (
  '6ceda9fb-2707-4784-9fa0-2810a092c026', 'narrative',
  jsonb_build_object(
    'sweet_spot','Standard-build T65 applicants in suburban/rural states where Humana has heavy MAPD overlap and aggressive medsupp pricing.',
    'tobacco_notes','Tobacco vs non-tobacco rates differ ~10-20% depending on state; Humana surcharges where allowed.',
    'build_notes','Producer guide GNHHNV6EN explicit BMI table: BMI 40.5 or higher AND BMI 14 or lower = decline. Example: 5''10" decline >=282 lbs or <=98 lbs.',
    'uw_classes_notes','Standard (single), Tobacco/Non-Tobacco where applicable',
    'sources', jsonb_build_array(
      jsonb_build_object('url','https://medicareagenttraining.com/wp-content/uploads/Med-Supp-Underwriting-Reference-Guide.pdf','excerpt','Humana producer guide GNHHNV6EN: deniable BMI of 14 or less / deniable BMI of 40.5 or more')
    ),
    'confidence','high'
  ),
  'info',
  'https://medicareagenttraining.com/wp-content/uploads/Med-Supp-Underwriting-Reference-Guide.pdf',
  'Humana producer guide GNHHNV6EN',
  now(), 'approved', 'system:0058_migration', now()
);

-- Humana MA
insert into public.product_underwriting_rules
  (product_id, rule_type, payload, severity, source_url, source_quote,
   source_captured_at, review_status, reviewed_by, reviewed_at)
values (
  '33847261-9763-4dd5-89c8-7a11997030d5', 'narrative',
  jsonb_build_object(
    'sweet_spot','Dual-eligible / chronic-condition SNPs and rural counties where Humana has dominant network share.',
    'uw_classes_notes','Single (no underwriting on MA)',
    'state_exclusions_notes','Plan availability is COUNTY-level; not all plans in all counties. Humana is a top-3 MA carrier nationally.',
    'sources', jsonb_build_array(
      jsonb_build_object('url','https://www.nerdwallet.com/insurance/medicare/humana-medicare-advantage-review','excerpt','chronic-condition SNPs, dual SNPs available in many counties')
    ),
    'confidence','high'
  ),
  'info',
  'https://www.nerdwallet.com/insurance/medicare/humana-medicare-advantage-review',
  'Humana Medicare Advantage review — chronic-condition SNPs available',
  now(), 'approved', 'system:0058_migration', now()
);

-- Aetna SRC medsupp
insert into public.product_underwriting_rules
  (product_id, rule_type, payload, severity, source_url, source_quote,
   source_captured_at, review_status, reviewed_by, reviewed_at)
values (
  '080d4165-bd3a-41e7-aad9-9bdda22a5f64', 'narrative',
  jsonb_build_object(
    'sweet_spot','Mid-range health T65 buyers; Aetna SRC tends to win on price after first re-rate cycle vs Humana/Cigna in attained-age states.',
    'tobacco_notes','Tobacco use within past 12 months is asked. Primarily a single non-tobacco rate but combines tobacco with other conditions to drive decline.',
    'build_notes','Build chart in producer guide; narrower than Humana on the high end, similar on low end.',
    'uw_classes_notes','Standard (single class)',
    'sources', jsonb_build_array(
      jsonb_build_object('url','https://www.aetnaseniorproducts.com/assets/pdf/ToolsAndTraining/CGFLP04359_PRODUCER_GUIDE.pdf','excerpt','Diabetes with heart or artery blockage at any time. Diabetes with any history of aneurysm, stroke or TIA.'),
      jsonb_build_object('url','https://themedicarefamily.com/wp-content/uploads/2023/01/Aetna-Supp-Producer-Guide-Updated-9.22.pdf','excerpt','Lung or respiratory disorder with tobacco use in the past 12 months [auto-decline]')
    ),
    'confidence','high'
  ),
  'info',
  'https://www.aetnaseniorproducts.com/assets/pdf/ToolsAndTraining/CGFLP04359_PRODUCER_GUIDE.pdf',
  'Aetna Senior Supplemental Producer Guide CGFLP04359',
  now(), 'approved', 'system:0058_migration', now()
);

-- Mutual of Omaha medsupp
insert into public.product_underwriting_rules
  (product_id, rule_type, payload, severity, source_url, source_quote,
   source_captured_at, review_status, reviewed_by, reviewed_at)
values (
  '6f71999d-3880-4a44-84c8-920c6fc8d161', 'narrative',
  jsonb_build_object(
    'sweet_spot','Standard-health T65 in class-rating states; Mutual is the frequent winner in attained-age states for clean cases due to brand and re-rate stability.',
    'tobacco_notes','Tobacco rates apply in most states; do NOT apply during open enrollment or guaranteed-issue scenarios in named states. Typical 10-15% surcharge.',
    'build_notes','Two charts: Class Rating states (allows higher BMI to be table-rated) and Non-Class-Rating states (single chart, deniable above).',
    'uw_classes_notes','Standard; Class Rating tier (in class-rating states only)',
    'discounts', jsonb_build_object(
      'household','Available in most states (varies; 7-12%); excludes some states'
    ),
    'sources', jsonb_build_array(
      jsonb_build_object('url','https://medicareagenttraining.com/wp-content/uploads/Mutual-of-Omaha-Med-Supp-UW-Guide.pdf','excerpt','People with diabetes (insulin dependent or treated with oral medications) who also have one or more of the complicating conditions ... are not eligible for coverage. For purposes of this question, hypertension is considered a heart condition.')
    ),
    'confidence','high'
  ),
  'info',
  'https://medicareagenttraining.com/wp-content/uploads/Mutual-of-Omaha-Med-Supp-UW-Guide.pdf',
  'Mutual of Omaha Med-Supp UW Guide',
  now(), 'approved', 'system:0058_migration', now()
);

-- Mutual of Omaha Living Promise FE
insert into public.product_underwriting_rules
  (product_id, rule_type, payload, severity, source_url, source_quote,
   source_captured_at, review_status, reviewed_by, reviewed_at)
values (
  '5c303325-18b4-4fc9-bca5-7ffce1236485', 'narrative',
  jsonb_build_object(
    'sweet_spot','Ages 50-75 with manageable conditions (controlled diabetes, mild heart history) — Mutual is the FE benchmark and wins on standard rates.',
    'tobacco_notes','Tobacco vs non-tobacco rates differ; final-expense market typically ~25-35% higher for tobacco.',
    'build_notes','Build chart in producer guide; senior FE typical (decline above ~45 BMI for level, more lenient for graded).',
    'uw_classes_notes','Level (Preferred-equivalent); Graded (2-year waiting period for natural-cause death; pays accident in full)',
    'graded_period_months', 24,
    'graded_payout_during_waiting','Return of premium + 10% interest if natural death in first 2 years',
    'sources', jsonb_build_array(
      jsonb_build_object('url','https://choicemutual.com/life-insurance-reviews/mutual-of-omaha/living-promise/','excerpt','Level: 45-85 / $2,000-$50,000 / All except New York. Graded: 45-80 / $2,000-$20,000 / All except MT, NC & NY / 2-Year Waiting Period: Yes')
    ),
    'confidence','high'
  ),
  'info',
  'https://choicemutual.com/life-insurance-reviews/mutual-of-omaha/living-promise/',
  'Mutual of Omaha Living Promise — face amounts and graded period',
  now(), 'approved', 'system:0058_migration', now()
);

-- Cigna medsupp
insert into public.product_underwriting_rules
  (product_id, rule_type, payload, severity, source_url, source_quote,
   source_captured_at, review_status, reviewed_by, reviewed_at)
values (
  '703f94f0-9f6b-4e06-85c0-c9e453f2adcb', 'narrative',
  jsonb_build_object(
    'sweet_spot','Plan N applicants with mild substandard health (table-rated diabetic, mild build issues) — Std II/III tiers let Cigna keep cases competitors decline. Strong on Plan N pricing nationally.',
    'tobacco_notes','In Florida specifically, plans MUST be quoted using tobacco/non-tobacco rates regardless of OE/GI. Other states use single rate class with tobacco baked into Standard tier.',
    'build_notes','Two height/weight thresholds: Maximum Weight (Preferred eligible) and Maximum Weight with Selected Conditions (Standard II/III). Outside both = decline.',
    'uw_classes_notes','Cigna is one of few carriers with a 4-class structure — table-rates instead of declining when applicant is borderline. Std II/III not available in all states. Selected-conditions rules NOT applicable in ID/MN/MI/OR.',
    'discounts', jsonb_build_object(
      'household','Available — same household with another ARLIC/affiliate Medsupp policy'
    ),
    'sources', jsonb_build_array(
      jsonb_build_object('url','https://nimbroker.com/wp-content/uploads/2023/07/Cigna-Medicare-Supplement-Agent-Guide.pdf','excerpt','Standard II rate class: STD II and III rate classes are not available in all states.'),
      jsonb_build_object('url','https://nimbroker.com/wp-content/uploads/2023/07/Cigna-Medicare-Supplement-Agent-Guide.pdf','excerpt','Diabetes with tobacco use. / Diabetes with hypertension taking less than three medications. / Diabetes with weight above the Maximum weight with selected conditions.')
    ),
    'confidence','high'
  ),
  'info',
  'https://nimbroker.com/wp-content/uploads/2023/07/Cigna-Medicare-Supplement-Agent-Guide.pdf',
  'Cigna Medicare Supplement Agent Guide — 4-class structure',
  now(), 'approved', 'system:0058_migration', now()
);

-- F&G MYGA (annuity)
insert into public.product_underwriting_rules
  (product_id, rule_type, payload, severity, source_url, source_quote,
   source_captured_at, review_status, reviewed_by, reviewed_at)
values (
  '1117fedb-60aa-4326-8178-2f4659fac95f', 'narrative',
  jsonb_build_object(
    'sweet_spot','Pre-retirees ages 55-75 with $10K-$500K rollover money looking for 5-10yr fixed guaranteed crediting; F&G consistently top-3 on rate sheets.',
    'uw_classes_notes','Standard annuity (no health classes)',
    'minimum_premium', 10000,
    'free_withdrawal','10% of total account value per year (starting year 2)',
    'mva_states_excluded', jsonb_build_array('AK','AL','CT','ID','IL','MN','MO','MS','MT','OR','PA','WA'),
    'sources', jsonb_build_array(
      jsonb_build_object('url','https://myannuitystore.com/annuity-review/fg-power-accumulator/','excerpt','Minimum Premium $10,000. Free Withdrawals 10% of total account value per year (starting year 2). Market Value Adjustment Yes (does not apply in AK, AL, CT, ID, IL, MN, MO, MS, MT, OR, PA, WA). Fixed Rate Option 3.75%')
    ),
    'confidence','high'
  ),
  'info',
  'https://myannuitystore.com/annuity-review/fg-power-accumulator/',
  'F&G Power Accumulator — Minimum Premium $10,000; 10% free withdrawals from year 2',
  now(), 'approved', 'system:0058_migration', now()
);

-- F&G Pathsetter IUL
insert into public.product_underwriting_rules
  (product_id, rule_type, payload, severity, source_url, source_quote,
   source_captured_at, review_status, reviewed_by, reviewed_at)
values (
  '9e350d91-f57b-4111-9ca2-0455f1501a6c', 'narrative',
  jsonb_build_object(
    'sweet_spot','Pre-retirees and high-earners ages 40-65 wanting cash-accumulation with downside protection; F&G Top-10 IUL sales nationally per Wink.',
    'tobacco_notes','IUL tobacco rates run ~50-100% surcharge over non-tobacco depending on age band; F&G in line with industry.',
    'build_notes','Standard IUL build chart; not extracted from consumer brochure ADV2261.',
    'uw_classes_notes','Preferred Plus NT / Preferred NT / Standard Plus NT / Standard NT / Preferred Tobacco / Standard Tobacco / Substandard A-J',
    'guaranteed_minimum_floor','0.25% on fixed and indexed accounts',
    'persistency_bonus','0.25% added in policy years 11+',
    'sources', jsonb_build_array(
      jsonb_build_object('url','https://assets.fglife.com/is/content/fglife/ad-reviewed-materials/adv/adv2200s/ADV2261%20FG%20Pathsetter%20%28CB%29-Standard.pdf','excerpt','F&G Pathsetter IUL — fixed and index crediting guaranteed not below 0.25%. Policy years 11+ add 0.25% Persistency Bonus.')
    ),
    'confidence','medium'
  ),
  'info',
  'https://assets.fglife.com/is/content/fglife/ad-reviewed-materials/adv/adv2200s/ADV2261%20FG%20Pathsetter%20%28CB%29-Standard.pdf',
  'F&G Pathsetter IUL — 0.25% floor, persistency bonus year 11+',
  now(), 'approved', 'system:0058_migration', now()
);

-- Lumico FE
insert into public.product_underwriting_rules
  (product_id, rule_type, payload, severity, source_url, source_quote,
   source_captured_at, review_status, reviewed_by, reviewed_at)
values (
  '897f1150-6518-484b-a1e8-843eede98876', 'narrative',
  jsonb_build_object(
    'sweet_spot','Ages 55-75 in good-to-fair health needing $10K-$30K — Lumico''s unisex build chart and granular rate classes make it the top pick for healthy female smokers and average-build males.',
    'tobacco_notes','Separate Preferred Tobacco / Standard Tobacco rate classes. Modified is unismoker (single rate regardless of tobacco).',
    'build_notes','Unisex build chart (single chart for M/F — unusual differentiator). Specific numerics in producer guide LUM-SIFE-UWGuide-2021-006.',
    'uw_classes_notes','Preferred Non-Tobacco, Preferred Tobacco, Standard Non-Tobacco, Standard Tobacco, Modified (Unismoker) — 5 distinct classes, more granular than most FE carriers.',
    'sources', jsonb_build_array(
      jsonb_build_object('url','https://www.yourlifesecure.com/RCenter/Lumico_Final_Expense_Agent-UW-Guide.pdf','excerpt','Issue Ages: 50-80 for Preferred, 50-85 for Standard, 50-80 for Modified. Risk Classes: Preferred NT, Preferred Tobacco, Standard NT, Standard Tobacco, Modified (Unismoker)')
    ),
    'confidence','high'
  ),
  'info',
  'https://www.yourlifesecure.com/RCenter/Lumico_Final_Expense_Agent-UW-Guide.pdf',
  'Lumico Simplified Issue FE UW Guide LUM-SIFE-UWGuide-2021-006',
  now(), 'approved', 'system:0058_migration', now()
);

-- AIG GIWL FE
insert into public.product_underwriting_rules
  (product_id, rule_type, payload, severity, source_url, source_quote,
   source_captured_at, review_status, reviewed_by, reviewed_at)
values (
  '70191094-0bea-4c14-981e-35c015483ab5', 'narrative',
  jsonb_build_object(
    'sweet_spot','Ages 60-80 with declined-elsewhere health (recent cancer, CHF, insulin-dependent diabetes with complications) — AIG GIWL is the de-facto safety-net product when Lumico Modified isn''t enough.',
    'tobacco_notes','GIWL has no health questions and no tobacco distinction — single rate class.',
    'uw_classes_notes','Single class (guaranteed-issue)',
    'graded_period_months', 24,
    'graded_payout_during_waiting','Return of premium + 10% interest if natural-cause death in first 2 years; full benefit on accidental death from day 1',
    'sources', jsonb_build_array(
      jsonb_build_object('url','https://guaranteedissuelife.com/aig/','excerpt','Face Amounts: $5,000-$25,000. Age 50-80. Unavailable in NY. Graded Period: 24 months. Premiums Returned: 10%.')
    ),
    'confidence','high'
  ),
  'info',
  'https://guaranteedissuelife.com/aig/',
  'AIG GIWL — $5K-$25K face, ages 50-80, 24-month graded',
  now(), 'approved', 'system:0058_migration', now()
);

-- AIG Select-a-Term
insert into public.product_underwriting_rules
  (product_id, rule_type, payload, severity, source_url, source_quote,
   source_captured_at, review_status, reviewed_by, reviewed_at)
values (
  'b64bf140-c083-46e5-9a41-6912a12bb232', 'narrative',
  jsonb_build_object(
    'sweet_spot','Healthy 30-55yo wanting non-standard term length (e.g., 23-year, 17-year) — AIG''s Flex Term has 18 different durations. Convertible to permanent without evidence up to age 70.',
    'tobacco_notes','Tobacco classes ~80-130% surcharge depending on age and class. Marijuana use evaluated separately as of REV0523 update.',
    'build_notes','Preferred Plus NT BMI 18.5-29.5; Preferred NT 18.5-31.5; Standard Plus 18.5-33; Standard NT 18.5-31.5.',
    'uw_classes_notes','Preferred Plus NT / Preferred NT / Standard Plus NT (Term only) / Standard NT / Preferred Tobacco / Standard Tobacco / Substandard tables',
    'sources', jsonb_build_array(
      jsonb_build_object('url','https://cornerstonefinancialnetwork.com/wp-content/uploads/2025/02/AIG-Field-Underwriting-Guide-1.pdf','excerpt','Build BMI 18.5-29.5 [Preferred Plus] / 18.5-31.5 [Preferred] / 18.5-33 [Standard Plus] / 18.5-31.5 [Standard]'),
      jsonb_build_object('url','https://cornerstonefinancialnetwork.com/wp-content/uploads/2025/02/AIG-Field-Underwriting-Guide-1.pdf','excerpt','Clarified auto-decline guidance for HIV Positive and Organ Transplant (page 10). Diabetes Type I [in auto-decline list]')
    ),
    'confidence','high'
  ),
  'info',
  'https://cornerstonefinancialnetwork.com/wp-content/uploads/2025/02/AIG-Field-Underwriting-Guide-1.pdf',
  'AIG Field Underwriting Guide — build chart and auto-decline list',
  now(), 'approved', 'system:0058_migration', now()
);

-- Verify: 12 narrative rules now exist.
do $$
declare cnt int;
begin
  select count(*) into cnt from public.product_underwriting_rules where rule_type='narrative' and review_status='approved';
  if cnt <> 12 then
    raise exception 'expected 12 narrative rules, got %', cnt;
  end if;
end $$;
