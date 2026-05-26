# Carrier Contacts — Source Audit

**Generated:** 2026-05-26  
**Agency:** KOINO IMO (`a073f1cc-f4b4-44e9-8471-173455391e2f`)  
**Method:** 16 parallel sub-agents, WebSearch + WebFetch per carrier, Supabase upsert via REST  
**Tables updated:** `carriers`, `carrier_profiles`

---

## DB verification (post-fill)

```
16/16 carriers — phone populated
16/16 carriers — product_lines populated
15/16 carrier_profiles — producer_portal_url populated (corebridge=null, alias of aig)
```

---

## Schema note — category enum

The `carriers_category_check` constraint only permits:
`life | med_supp | final_expense | other`

`multi_line`, `medicare_supplement`, `term_life`, `mga_platform` are **not** valid.
Agents that intended `multi_line` used `other`; MGA platforms used `other` with `[mga_platform]` prefix in notes.

**Recommended migration** (if needed):
```sql
ALTER TABLE public.carriers
  DROP CONSTRAINT carriers_category_check,
  ADD CONSTRAINT carriers_category_check
    CHECK (category IN ('life','med_supp','final_expense','annuity','other','mga_platform','multi_line'));
```

---

## Per-carrier source log

### 1. uhc_aarp — UnitedHealthcare AARP Medicare Supplement
- **Category:** `med_supp`
- **Phone:** 1-888-381-8581 (Medicare Producer Help Desk, M-F 7am-9pm CST)
- **Portal:** https://www.uhcjarvis.com (UHC Jarvis — agent hub for Medicare products)
- **Confidence:** HIGH
- **Sources:**
  - https://www.uhcjarvis.com/content/jarvis/en/contact_public.html
  - https://www.myuhcagent.com/
  - https://www.uhc.com/medicare/health-insurance-brokers.html

---

### 2. humana — Humana
- **Category:** `other` (multi-line: MA, Med Supp, Dental, Life)
- **Phone:** 800-309-3163
- **Email:** agentsupport@humana.com
- **Portal:** https://www.ignitewithhumana.com (Humana Vantage)
- **E-App:** https://athena-portal.humana.com/AgentPortal/login
- **Confidence:** HIGH
- **Sources:**
  - https://nccagent.com/resources/agent-support/humana/
  - https://www.ignitewithhumana.com/login/
  - https://athena-portal.humana.com/AgentPortal/login

---

### 3. aetna_src — Aetna Senior Supplemental (CVS Health)
- **Category:** `med_supp`
- **Phone:** 1-866-272-6630 (agent support); 1-800-587-5139 (tech support)
- **Email:** AetSSIinformation@aetna.com
- **Portal:** https://www.aetnaseniorproducts.com/ssi/login.fcc
- **Confidence:** HIGH
- **Sources:**
  - https://www.aetnaseniorproducts.com/ssi/agent.html
  - https://www.aetnaseniorproducts.com/ssi/contactus.html

---

### 4. mutual_omaha — Mutual of Omaha / United of Omaha
- **Category:** `other` (FE, Med Supp, IUL, annuity)
- **Phone:** 800-867-6873 (Agent Services line)
- **Portal:** https://producer.mutualofomaha.com/enterprise/portal/home (SPA — Sales Professional Access)
- **Confidence:** HIGH
- **Sources:**
  - https://www.ahcpsales.com/carriers/mutual-of-omaha/
  - https://www.benavest.com/mutual-of-omaha-life-all-broker-resources/
  - https://tidewatermg.com/wp-content/uploads/2025/08/Mutual-of-Omaha-Contact-Guide-Producer-Use.pdf

---

### 5. cigna — Cigna (American Retirement Life / Loyal American Life)
- **Category:** `med_supp`
- **Phone:** 1-877-244-6215 (M–F 8am–8pm ET); alt: 1-866-442-7516 (CARL line)
- **Portal:** https://www.cignaforbrokers.com/
- **Confidence:** HIGH
- **Sources:**
  - https://www.cignaforbrokers.com/
  - https://www.cigna.com/brokers/supplemental-benefits-brokers

---

### 6. fg — Fidelity & Guaranty Life (F&G / FNF)
- **Category:** `other` (FE + annuity primarily)
- **Phone:** 800-445-6758 (M-F 8am-6pm ET / 7am-5pm CT)
- **Portal:** https://saleslink.fglife.com/ (SalesLink — new business, case mgmt, marketing)
- **Confidence:** HIGH
- **Note:** F&G contracts through IMOs — no direct-to-agent contracting
- **Sources:**
  - https://www.fglife.com/contact/agent-support
  - https://success.fglife.com/life-agent

---

### 7. lumico — Lumico Life (Swiss Re subsidiary)
- **Category:** `other` (term + Med Supp + FE)
- **Phone (Life):** 1-866-440-4047
- **Phone (Health/MedSupp):** 1-855-774-4491
- **Email:** customerservice@lumico.com
- **Portal (Life):** https://www.ap.lumico.com/
- **Portal (Health/MedSupp):** https://service.iasadmin.com/agentportal?cc=c199 (IAS Admin)
- **E-App:** https://lumico.com/login-agent
- **Confidence:** HIGH
- **Sources:**
  - https://lumico.com/login-agent
  - https://lumico.com/product-main-page
  - https://lumico.com/contact-us-main

---

### 8. aig — AIG / Corebridge Financial (American General Life)
- **Category:** `life`
- **Phone:** 1-877-246-4501 (Independent Advisors / VALIC sales & service, M-F 8am-7pm CT)
- **Portal:** https://connext.corebridgefinancial.com/life/connext-producer-details/public/login (Connext)
- **E-App:** https://lifeportal.corebridgefinancial.com/
- **Confidence:** HIGH
- **Note:** AIG Life / American General rebranded as Corebridge Financial (CRBG, NYSE) in 2022. See also `corebridge` (index 16) — duplicate slug.
- **Sources:**
  - https://www.corebridgefinancial.com/rs/home/contact-us
  - https://connext.corebridgefinancial.com/life/connext-producer-details/public/login
  - https://lifeportal.corebridgefinancial.com/

---

### 9. transamerica — Transamerica Life Insurance Company
- **Category:** `other` (term, IUL, FE, annuity)
- **Phone:** 1-866-545-9058 (National Sales Desk)
- **Portal:** https://secure.transamerica.com/login/sign-in/login.html (Agent Home)
- **Confidence:** HIGH
- **Note:** Aegon subsidiary. TransACT at transact.transamerica.com for new business tracking.
- **Sources:**
  - https://www.transamerica.com/financial-pro/insurance/agent-resources
  - https://www.transamerica.com/contact-us

---

### 10. ethos — Ethos Life (digital MGA)
- **Category:** `other` [mga_platform]
- **Phone:** 415-915-0665 (M-F 6am-6pm PT)
- **Email:** agents@ethoslife.com
- **Portal/E-App/Quoter:** https://agents.ethoslife.com (unified platform)
- **Confidence:** HIGH
- **Paper carriers (2026):** Ameritas (term), Banner Life (term + FE), TruStage/CMFG (whole life), North American (IUL added Jan 2026)
- **Note:** SBLI no longer listed as active Ethos partner. Legal & General America is now Banner Life.
- **Sources:**
  - https://www.ethos.com/agents/
  - https://agents.ethoslife.com/login
  - https://www.ethos.com/carriers/
  - https://www.globenewswire.com/news-release/2026/01/07/3214499/...
  - https://www.bannerlife.com/about-us/news/detail/2026/03/25/ethos-and-banner-life...

---

### 11. americanamicable — American Amicable
- **Category:** `life`
- **Phone:** 800-736-7311 (M-F 8am-4pm CT)
- **Email:** contactus@aatx.com
- **Portal/E-App:** https://www.americanamicable.com/v4/AgentLogin.php
- **Quoter:** https://www.insuranceapplication.com/cgi/webapp/mlogin.aspx
- **Confidence:** HIGH
- **Sources:**
  - https://www.americanamicable.com/v4/contact-us.php
  - https://www.americanamicable.com/v4/AgentLogin.php

---

### 12. foresters — Foresters Financial (fraternal benefit society)
- **Category:** `life`
- **Phone:** 1-866-466-7166 (opt 1=sales, opt 2=new business/UW, opt 3=payments; M-F 9am-6pm ET)
- **Email:** service@foresters.com
- **Portal:** https://ezbiz.foresters.com
- **E-App:** https://ipipeline.com (iPipeline iGO — PlanRight excluded, paper only)
- **Confidence:** HIGH
- **Note:** PlanRight whole life (FE) requires paper application. All other products support e-app. ForestersBiz mobile app for certificate tracking.
- **Sources:**
  - https://www.foresters.com/en/for-agents
  - https://ezbiz.foresters.com/en/contact-us

---

### 13. sbli — SBLI (Savings Bank Mutual Life of Massachusetts)
- **Category:** `life` (constraint blocks `term_life`)
- **Phone:** 1-888-224-7254 opt 1 (Broker Support)
- **Email:** brokerage@sbli.com
- **Portal:** https://www.sbliagent.com/
- **E-App:** https://www.sblibrokerage.com/accelerate/ (AcceleRate — accelerated UW platform)
- **Confidence:** HIGH
- **Sources:**
  - https://www.sblibrokerage.com/
  - https://www.sbliagent.com/agentauth/login.aspx
  - https://www.sbli.com/support/contact-us

---

### 14. instabrain — Instabrain (digital UW platform / Fidelity Life)
- **Category:** `other` [mga_platform]
- **Phone:** 866-297-5699
- **Email:** instabrainsupport@fidelitylife.com
- **Portal/E-App:** https://portal.instabrain.io/Account/Login
- **Quoter:** https://instabrain.io
- **Confidence:** HIGH
- **Paper carrier:** Fidelity Life Association (not Fidelity Investments)
- **Note:** RAPIDecision product family. Instant-issue decisions. Agent onboarding <3 days. HQ: 15169 N. Scottsdale Rd Ste 205, Scottsdale AZ 85254.
- **Sources:**
  - https://instabrain.io/Home/Agent
  - https://instabrain.io/Home/Contact
  - https://portal.instabrain.io/
  - https://brokersalliance.com/instabrain

---

### 15. americo — Americo Financial Life and Annuity
- **Category:** `final_expense`
- **Phone:** 816-641-2850 (Agent Services, M-F 8am-5pm CT)
- **Email:** agent.services@americo.com
- **Portal:** https://portal.americoagent.com/
- **E-App:** https://tools.americoagent.com/ (instant-decision FE)
- **Confidence:** HIGH
- **Sources:**
  - https://www.americo.com/contact/
  - https://www.americo.com/agents/
  - https://portal.americoagent.com/

---

### 16. corebridge — Corebridge Financial (AIG Life) — DUPLICATE
- **Category:** `life`
- **DUPLICATE OF:** `aig` (index 8)
- **Phone:** 1-877-246-4501 (same as aig)
- **Portal:** null (alias — use aig portal)
- **Confidence:** HIGH
- **Action needed:** Ian should consolidate `agency_carrier_appointments` to use one slug (`aig` preferred). The `corebridge` carriers row exists to prevent FK orphan — it is a valid alias but redundant.
- **Sources:** https://corebridgefinancial.com

---

## Summary table

| # | carrier_id | Category | Products | Phone | Portal | Confidence |
|---|---|---|---|---|---|---|
| 1 | uhc_aarp | med_supp | 9 | 1-888-381-8581 | uhcjarvis.com | HIGH |
| 2 | humana | other | 7 | 800-309-3163 | ignitewithhumana.com | HIGH |
| 3 | aetna_src | med_supp | 10 | 1-866-272-6630 | aetnaseniorproducts.com | HIGH |
| 4 | mutual_omaha | other | 9 | 800-867-6873 | producer.mutualofomaha.com | HIGH |
| 5 | cigna | med_supp | 9 | 1-877-244-6215 | cignaforbrokers.com | HIGH |
| 6 | fg | other | 7 | 800-445-6758 | saleslink.fglife.com | HIGH |
| 7 | lumico | other | 6 | 1-866-440-4047 | ap.lumico.com | HIGH |
| 8 | aig | life | 9 | 1-877-246-4501 | connext.corebridgefinancial.com | HIGH |
| 9 | transamerica | other | 9 | 1-866-545-9058 | secure.transamerica.com | HIGH |
| 10 | ethos | other [mga] | 7 | 415-915-0665 | agents.ethoslife.com | HIGH |
| 11 | americanamicable | life | 7 | 800-736-7311 | americanamicable.com/v4 | HIGH |
| 12 | foresters | life | 7 | 1-866-466-7166 | ezbiz.foresters.com | HIGH |
| 13 | sbli | life | 8 | 1-888-224-7254 | sbliagent.com | HIGH |
| 14 | instabrain | other [mga] | 4 | 866-297-5699 | portal.instabrain.io | HIGH |
| 15 | americo | final_expense | 7 | 816-641-2850 | portal.americoagent.com | HIGH |
| 16 | corebridge | life (alias) | 9 | 1-877-246-4501 | — (duplicate of aig) | HIGH |

**Confidence breakdown:** HIGH: 16/16, MEDIUM: 0, LOW: 0

---

## Action items for Ian

1. **Corebridge / AIG duplicate** — two `agency_carrier_appointments` rows (`aig` + `corebridge`) point to the same company. Consolidate to `aig` slug when convenient (or keep both if different NPN arrangements apply). No rush — both rows have valid FK targets now.
2. **Category enum migration** — if Quote Tool or filter UI needs to distinguish `multi_line` or `mga_platform` as categories, add those values to the `carriers_category_check` constraint.
3. **Lumico MedSupp portal** — the health/MedSupp portal routes through IAS Admin (third-party), not Lumico directly. Confirm this is the correct agent portal for your contracting path.
4. **F&G IMO contracting** — F&G does not direct-contract agents; all appointments go through IMOs. Confirm your IMO relationship before quoting F&G products.
