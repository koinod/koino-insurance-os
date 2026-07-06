/* lib/licensing-study-guides.js
   Hardcoded, curated study guide sections for the major licensing exam lines across all 50 states.
   These load instantly — no LLM call required.
*/
(function () {

function domainKey(domain) {
  return (domain || "").toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

const UNIFORM_SECTIONS = {
  "i_types_of_policies": {
    "title": "TYPES OF POLICIES",
    "subtitle": "Whole life \u00b7 Universal life \u00b7 Variable policies \u00b7 Term types \u00b7 Annuities \u00b7 Combination plans",
    "blocks": [
      {
        "type": "heading",
        "text": "Permanent vs. Term Life Insurance"
      },
      {
        "type": "table",
        "rows": [
          {
            "label": "Ordinary Whole Life",
            "value": "Age 100 maturity",
            "description": "Guaranteed level premium, guaranteed death benefit, and guaranteed cash value accumulation up to age 100."
          },
          {
            "label": "Limited-Pay Whole Life",
            "value": "Compressed premiums",
            "description": "Premiums paid over shorter period (e.g., 20-pay or paid-up at 65), but coverage lasts for life."
          },
          {
            "label": "Universal Life (UL)",
            "value": "Flexible premiums",
            "description": "Unbundled cash value policy with flexible premiums, adjustable death benefit, and monthly deductions."
          },
          {
            "label": "Variable Life / VUL",
            "value": "Separate accounts",
            "description": "Cash value invested in stocks/bonds via separate accounts; requires FINRA Series 6/7 license + Life license."
          },
          {
            "label": "Indexed Life (IUL)",
            "value": "Equity index cap/floor",
            "description": "Interest credited based on equity index (e.g., S&P 500) subject to minimum floor (0%) and cap rate."
          }
        ]
      },
      {
        "type": "heading",
        "text": "Term Insurance & Annuities"
      },
      {
        "type": "table",
        "rows": [
          {
            "label": "Term Life Types",
            "value": "Level / Decreasing / ROP",
            "description": "Pure death protection. Decreasing term is used for mortgage protection. ROP returns premiums if survived."
          },
          {
            "label": "Term Special Features",
            "value": "Renewable & Convertible",
            "description": "Renewable without medical exam at attained age rate; Convertible to permanent without evidence of insurability."
          },
          {
            "label": "Annuity Phases",
            "value": "Accumulation & Annuitization",
            "description": "Accumulation phase grows tax-deferred; Annuitization converts principal into guaranteed income stream."
          }
        ]
      },
      {
        "type": "callout",
        "kind": "test_trick",
        "text": "\u2713 Test trick: Variable Life requires TWO licenses \u2014 State Life Producer License + FINRA Series 6 or 7 registration."
      }
    ]
  },
  "ii_life_provisions_riders_options_and_exclusions": {
    "title": "LIFE PROVISIONS, RIDERS, OPTIONS, AND EXCLUSIONS",
    "subtitle": "Mandatory provisions \u00b7 Nonforfeiture options \u00b7 Dividend options \u00b7 Policy riders \u00b7 Exclusions",
    "blocks": [
      {
        "type": "heading",
        "text": "Mandatory Policy Provisions"
      },
      {
        "type": "table",
        "rows": [
          {
            "label": "Entire Contract",
            "value": "Policy + Application",
            "description": "Policy document and attached application constitute the complete legal contract. No outside documents apply."
          },
          {
            "label": "Grace Period",
            "value": "30-31 days standard",
            "description": "Coverage remains in force if premium unpaid. Death during grace period pays benefit minus overdue premium."
          },
          {
            "label": "Incontestability",
            "value": "2 years",
            "description": "After 2 years, insurer cannot contest misstatements on application (except nonpayment of premium)."
          },
          {
            "label": "Reinstatement",
            "value": "3-5 years from lapse",
            "description": "Requires back premiums + interest + proof of insurability + loan repayment. Cannot reinstate if surrendered."
          },
          {
            "label": "Misstatement of Age/Gender",
            "value": "Adjust death benefit",
            "description": "Adjusts benefit to what paid premium would have purchased at correct age/gender. Never voids policy."
          }
        ]
      },
      {
        "type": "heading",
        "text": "Nonforfeiture & Dividend Options"
      },
      {
        "type": "table",
        "rows": [
          {
            "label": "Nonforfeiture Options",
            "value": "Cash / Reduced Paid-Up / Extended Term",
            "description": "Extended Term is automatic default if policyholder fails to select an option upon lapse."
          },
          {
            "label": "Dividend Options",
            "value": "CRAPPO (Cash, Reduce Prem, Accumulate, Paid-up add, One-year term)",
            "description": "Dividends are a non-taxable return of excess premium paid on participating policies."
          }
        ]
      },
      {
        "type": "callout",
        "kind": "warning",
        "text": "\u25a0 Warning: Extended Term nonforfeiture option gives the HIGHEST death benefit (full face amount), while Reduced Paid-Up gives the LONGEST period of coverage (to age 100)."
      }
    ]
  },
  "iii_completing_the_application_underwriting_and_delivering_the_policy": {
    "title": "APPLICATION, UNDERWRITING, AND POLICY DELIVERY",
    "subtitle": "Field underwriting \u00b7 Disclosures \u00b7 Risk classification \u00b7 Contract law \u00b7 Delivery requirements",
    "blocks": [
      {
        "type": "heading",
        "text": "Application & Underwriting"
      },
      {
        "type": "table",
        "rows": [
          {
            "label": "Insurable Interest",
            "value": "Required at inception",
            "description": "Must exist at time of application (financial interest, love/affection). Not required at time of death."
          },
          {
            "label": "Conditional Receipt",
            "value": "Coverage from application date",
            "description": "Coverage effective from application/exam date IF applicant is approved as applied for."
          },
          {
            "label": "MIB Report",
            "value": "Medical Information Bureau",
            "description": "Shares coded medical data among insurers to detect fraud. Cannot be sole basis for declination."
          },
          {
            "label": "Fair Credit Reporting Act",
            "value": "FCRA Notice",
            "description": "Requires advance written notice if investigative consumer credit report will be conducted."
          }
        ]
      },
      {
        "type": "heading",
        "text": "Contract Law & Policy Delivery"
      },
      {
        "type": "table",
        "rows": [
          {
            "label": "Contract Elements",
            "value": "COAL (Consideration, Offer, Acceptance, Legal)",
            "description": "Consideration is premium + application statements by applicant, promise to pay by insurer."
          },
          {
            "label": "Contract Characteristics",
            "value": "Adhesion / Aleatory / Unilateral / Conditional",
            "description": "Adhesion = insurer drafts, ambiguities favor insured. Aleatory = unequal values exchanged."
          },
          {
            "label": "Policy Delivery",
            "value": "Statement of Good Health required",
            "description": "If initial premium not paid with application, agent must collect premium + signed Statement of Good Health."
          }
        ]
      },
      {
        "type": "callout",
        "kind": "info",
        "text": "\u2713 Test trick: Warranties are guaranteed to be literally true. Representations are statements believed to be true to the best of applicant's knowledge."
      }
    ]
  },
  "iv_retirement_tax_and_other_insurance_concepts": {
    "title": "RETIREMENT, TAX, AND OTHER INSURANCE CONCEPTS",
    "subtitle": "Tax treatment \u00b7 MEC rules \u00b7 1035 exchanges \u00b7 Business life \u00b7 Qualified plans",
    "blocks": [
      {
        "type": "heading",
        "text": "Tax Treatment of Life & Annuities"
      },
      {
        "type": "table",
        "rows": [
          {
            "label": "Death Benefit Taxation",
            "value": "Income tax-FREE",
            "description": "Lump sum death benefit paid to named beneficiary is received 100% free of federal income tax."
          },
          {
            "label": "Cash Value Withdrawals",
            "value": "FIFO (First In, First Out)",
            "description": "Withdrawals up to cost basis (premiums paid) are tax-free. Gains above cost basis taxed as ordinary income."
          },
          {
            "label": "Modified Endowment (MEC)",
            "value": "7-Pay Test & LIFO Taxation",
            "description": "If premiums exceed 7-pay limit, withdrawals/loans become LIFO taxed + 10% penalty prior to age 59\u00bd."
          },
          {
            "label": "Section 1035 Exchange",
            "value": "Tax-free exchange",
            "description": "Life to Life, Life to Annuity, Annuity to Annuity (NOT Annuity to Life)."
          }
        ]
      },
      {
        "type": "heading",
        "text": "Business Life Insurance"
      },
      {
        "type": "table",
        "rows": [
          {
            "label": "Buy-Sell Funding",
            "value": "Cross-Purchase vs Entity",
            "description": "Cross-purchase: owners buy policies on each other. Entity: business buys policy on each owner."
          },
          {
            "label": "Key Person Insurance",
            "value": "Business owner & beneficiary",
            "description": "Business pays premium (non-deductible) and receives tax-free death benefit if key employee dies."
          }
        ]
      },
      {
        "type": "callout",
        "kind": "warning",
        "text": "\u25a0 Warning: Once a policy becomes a Modified Endowment Contract (MEC), it remains a MEC FOREVER \u2014 it can never revert to regular life insurance status."
      }
    ]
  }
};

const GUIDES = {};

GUIDES['al_life_producer'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'alabama_insurance_statutes_rules_and_regulations': {
    title: 'ALABAMA INSURANCE LAWS & REGULATIONS',
    subtitle: 'Alabama Insurance Code · Ala. Code Title 27 · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'Alabama State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'Ala. Code Title 27', description: 'Alabama Department of Insurance & Commissioner Authority (Ala. Code § 27-2-1)' },
          { label: 'Statutory Standard', value: 'Ala. Code Title 27', description: 'Producer Licensing Requirements (20 prelicensing hrs, 24 CE / 3 ethics, 2-year renewal)' },
          { label: 'Statutory Standard', value: 'Ala. Code Title 27', description: 'Alabama Unfair Trade Practices Act (Ala. Code § 27-12-1: Rebating, Twisting, Churning)' },
          { label: 'Statutory Standard', value: 'Ala. Code Title 27', description: 'Fiduciary Duties & Premium Handling (Ala. Code § 27-12-17)' },
          { label: 'Statutory Standard', value: 'Ala. Code Title 27', description: 'Alabama Life & Disability Insurance Guaranty Association (Ala. Code § 27-44-1)' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify Alabama state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['al'] = GUIDES['al_life_producer'];
GUIDES['ak_life_producer'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'alaska_insurance_statutes_rules_and_regulations': {
    title: 'ALASKA INSURANCE LAWS & REGULATIONS',
    subtitle: 'Alaska Insurance Code · AS Title 21 · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'Alaska State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'AS Title 21', description: 'Alaska Division of Insurance & Director Powers (AS 21.06)' },
          { label: 'Statutory Standard', value: 'AS Title 21', description: 'Producer Licensing Rules (AS 21.27: 24 CE / 3 ethics every 2 years)' },
          { label: 'Statutory Standard', value: 'AS Title 21', description: 'Alaska Trade Practices & Frauds (AS 21.36: Rebating, Misrepresentation, Twisting)' },
          { label: 'Statutory Standard', value: 'AS Title 21', description: 'Fiduciary Responsibilities (AS 21.27.360)' },
          { label: 'Statutory Standard', value: 'AS Title 21', description: 'Alaska Life & Health Insurance Guaranty Association (AS 21.79)' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify Alaska state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['ak'] = GUIDES['ak_life_producer'];
GUIDES['az_life_producer'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'arizona_insurance_statutes_rules_and_regulations': {
    title: 'ARIZONA INSURANCE LAWS & REGULATIONS',
    subtitle: 'Arizona Insurance Code · A.R.S. Title 20 · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'Arizona State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'A.R.S. Title 20', description: 'Arizona Department of Insurance and Financial Institutions (DIFI Director Powers - A.R.S. § 20-142)' },
          { label: 'Statutory Standard', value: 'A.R.S. Title 20', description: 'Producer Licensing Requirements (A.R.S. § 20-281: 48 CE / 6 ethics every 4 years)' },
          { label: 'Statutory Standard', value: 'A.R.S. Title 20', description: 'Unfair Trade Practices & Frauds (A.R.S. § 20-441: Rebating, Twisting, False Financial Statements)' },
          { label: 'Statutory Standard', value: 'A.R.S. Title 20', description: 'Fiduciary Duty & Premium Accounts (A.R.S. § 20-297)' },
          { label: 'Statutory Standard', value: 'A.R.S. Title 20', description: 'Arizona Life and Disability Insurance Guaranty Fund (A.R.S. § 20-681)' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify Arizona state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['az'] = GUIDES['az_life_producer'];
GUIDES['az_life_accident_health'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'arizona_insurance_statutes_rules_and_regulations': {
    title: 'ARIZONA INSURANCE LAWS & REGULATIONS',
    subtitle: 'Arizona Insurance Code · A.R.S. Title 20 · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'Arizona State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'A.R.S. Title 20', description: 'Arizona Department of Insurance and Financial Institutions (DIFI Director Powers - A.R.S. § 20-142)' },
          { label: 'Statutory Standard', value: 'A.R.S. Title 20', description: 'Producer Licensing Requirements (A.R.S. § 20-281: 48 CE / 6 ethics every 4 years)' },
          { label: 'Statutory Standard', value: 'A.R.S. Title 20', description: 'Unfair Trade Practices & Frauds (A.R.S. § 20-441: Rebating, Twisting, False Financial Statements)' },
          { label: 'Statutory Standard', value: 'A.R.S. Title 20', description: 'Fiduciary Duty & Premium Accounts (A.R.S. § 20-297)' },
          { label: 'Statutory Standard', value: 'A.R.S. Title 20', description: 'Arizona Life and Disability Insurance Guaranty Fund (A.R.S. § 20-681)' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify Arizona state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['az'] = GUIDES['az_life_accident_health'];
GUIDES['ar_life_producer'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'arkansas_insurance_statutes_rules_and_regulations': {
    title: 'ARKANSAS INSURANCE LAWS & REGULATIONS',
    subtitle: 'Arkansas Insurance Code · Ark. Code Ann. Title 23 · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'Arkansas State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'Ark. Code Ann. Title 23', description: 'Arkansas Insurance Department & Commissioner Powers (ACA § 23-61-101)' },
          { label: 'Statutory Standard', value: 'Ark. Code Ann. Title 23', description: 'Producer Licensing & Prelicensing (ACA § 23-64-201: 20 hrs prelicense, 24 CE / 3 ethics)' },
          { label: 'Statutory Standard', value: 'Ark. Code Ann. Title 23', description: 'Trade Practices & Frauds (ACA § 23-66-201: Rebating, Twisting, Misrepresentation)' },
          { label: 'Statutory Standard', value: 'Ark. Code Ann. Title 23', description: 'Fiduciary Funds & Premium Accounting (ACA § 23-64-223)' },
          { label: 'Statutory Standard', value: 'Ark. Code Ann. Title 23', description: 'Arkansas Life & Health Insurance Guaranty Association (ACA § 23-96-101)' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify Arkansas state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['ar'] = GUIDES['ar_life_producer'];
GUIDES['ca_life_only'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'california_insurance_statutes_rules_and_regulations': {
    title: 'CALIFORNIA INSURANCE LAWS & REGULATIONS',
    subtitle: 'California Insurance Code · California Insurance Code (CIC) · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'California State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'California Insurance Code (CIC)', description: 'California Insurance Commissioner & CDI Enforcement (CIC § 12919-12978)' },
          { label: 'Statutory Standard', value: 'California Insurance Code (CIC)', description: 'Producer Licensing & Prelicensing (CIC § 1625: 20 hrs line + 12 hrs ethics; 24 CE / 3 ethics)' },
          { label: 'Statutory Standard', value: 'California Insurance Code (CIC)', description: 'California Senior Protections & 30-Day Free Look (CIC § 785 - Seniors Age 60+)' },
          { label: 'Statutory Standard', value: 'California Insurance Code (CIC)', description: 'Unfair Trade Practices & Anti-Rebating Rules (CIC § 790 - Misrepresentation & Twisting)' },
          { label: 'Statutory Standard', value: 'California Insurance Code (CIC)', description: 'California Life and Health Insurance Guarantee Association (CIC § 1067)' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify California state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['ca'] = GUIDES['ca_life_only'];
GUIDES['co_life_producer'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'colorado_insurance_statutes_rules_and_regulations': {
    title: 'COLORADO INSURANCE LAWS & REGULATIONS',
    subtitle: 'Colorado Insurance Code · C.R.S. Title 10 · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'Colorado State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'C.R.S. Title 10', description: 'Colorado Division of Insurance & Commissioner Powers (C.R.S. § 10-1-104)' },
          { label: 'Statutory Standard', value: 'C.R.S. Title 10', description: 'Producer Licensing & 50-Hour Prelicensing Requirement (C.R.S. § 10-2-301; 24 CE / 3 ethics)' },
          { label: 'Statutory Standard', value: 'C.R.S. Title 10', description: '15-Day Free Look & Replacement Rules (C.R.S. § 10-7-102; Reg 4-2-1)' },
          { label: 'Statutory Standard', value: 'C.R.S. Title 10', description: 'Unfair Competition & Deceptive Practices (C.R.S. § 10-3-1104: Rebating, Twisting, Fraud)' },
          { label: 'Statutory Standard', value: 'C.R.S. Title 10', description: 'Colorado Life & Health Protection Association (C.R.S. § 10-20-101)' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify Colorado state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['co'] = GUIDES['co_life_producer'];
GUIDES['ct_life_producer'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'connecticut_insurance_statutes_rules_and_regulations': {
    title: 'CONNECTICUT INSURANCE LAWS & REGULATIONS',
    subtitle: 'Connecticut Insurance Code · C.G.S. Title 38a · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'Connecticut State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'C.G.S. Title 38a', description: 'Connecticut Insurance Department & Commissioner Authority (CGS § 38a-8)' },
          { label: 'Statutory Standard', value: 'C.G.S. Title 38a', description: 'Producer Licensing & 40 Prelicensing Hours (CGS § 38a-702a; 24 CE / 3 ethics)' },
          { label: 'Statutory Standard', value: 'C.G.S. Title 38a', description: 'Unfair Insurance Practices Act (CGS § 38a-815: Rebating, Twisting, Misrepresentation)' },
          { label: 'Statutory Standard', value: 'C.G.S. Title 38a', description: 'Fiduciary Responsibilities & Premium Accounts (CGS § 38a-702l)' },
          { label: 'Statutory Standard', value: 'C.G.S. Title 38a', description: 'Connecticut Life & Health Insurance Guaranty Association (CGS § 38a-858)' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify Connecticut state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['ct'] = GUIDES['ct_life_producer'];
GUIDES['de_life_producer'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'delaware_insurance_statutes_rules_and_regulations': {
    title: 'DELAWARE INSURANCE LAWS & REGULATIONS',
    subtitle: 'Delaware Insurance Code · DE Insurance Code · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'Delaware State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'DE Insurance Code', description: 'DE Department of Insurance & Commissioner Powers' },
          { label: 'Statutory Standard', value: 'DE Insurance Code', description: 'DE Producer Licensing Rules (24 CE / 3 Ethics)' },
          { label: 'Statutory Standard', value: 'DE Insurance Code', description: 'DE Unfair Trade Practices (Rebating, Twisting, Misrepresentation)' },
          { label: 'Statutory Standard', value: 'DE Insurance Code', description: 'DE Fiduciary Duties & Premium Accounts' },
          { label: 'Statutory Standard', value: 'DE Insurance Code', description: 'DE Life & Health Insurance Guaranty Association' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify Delaware state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['de'] = GUIDES['de_life_producer'];
GUIDES['dc_life_producer'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'district_of_columbia_insurance_statutes_rules_and_regulations': {
    title: 'DISTRICT OF COLUMBIA INSURANCE LAWS & REGULATIONS',
    subtitle: 'District of Columbia Insurance Code · DC Insurance Code · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'District of Columbia State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'DC Insurance Code', description: 'DC Department of Insurance & Commissioner Powers' },
          { label: 'Statutory Standard', value: 'DC Insurance Code', description: 'DC Producer Licensing Rules (24 CE / 3 Ethics)' },
          { label: 'Statutory Standard', value: 'DC Insurance Code', description: 'DC Unfair Trade Practices (Rebating, Twisting, Misrepresentation)' },
          { label: 'Statutory Standard', value: 'DC Insurance Code', description: 'DC Fiduciary Duties & Premium Accounts' },
          { label: 'Statutory Standard', value: 'DC Insurance Code', description: 'DC Life & Health Insurance Guaranty Association' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify District of Columbia state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['dc'] = GUIDES['dc_life_producer'];
GUIDES['fl_2_14_life_annuity_variable'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'florida_insurance_statutes_rules_and_regulations': {
    title: 'FLORIDA INSURANCE LAWS & REGULATIONS',
    subtitle: 'Florida Insurance Code · Florida Statutes Ch. 626 & 627 · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'Florida State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'Florida Statutes Ch. 626 & 627', description: 'Florida Department of Financial Services (DFS) & Office of Insurance Regulation (OIR) Powers' },
          { label: 'Statutory Standard', value: 'Florida Statutes Ch. 626 & 627', description: 'Florida 2-14 License Requirements (F.S. § 626.7851: 40 prelicensing hrs, 24 CE with 5hr Law & Ethics)' },
          { label: 'Statutory Standard', value: 'Florida Statutes Ch. 626 & 627', description: 'Florida 14-Day Life & 30-Day Annuity Free Look Provisions (F.S. § 627.455)' },
          { label: 'Statutory Standard', value: 'Florida Statutes Ch. 626 & 627', description: 'Unfair Insurance Trade Practices (F.S. § 626.9541: Rebating rules, Twisting, Sliding, Churning)' },
          { label: 'Statutory Standard', value: 'Florida Statutes Ch. 626 & 627', description: 'Florida Life & Health Insurance Guaranty Association (F.S. § 631.711)' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify Florida state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['fl'] = GUIDES['fl_2_14_life_annuity_variable'];
GUIDES['ga_life_agent'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'georgia_insurance_statutes_rules_and_regulations': {
    title: 'GEORGIA INSURANCE LAWS & REGULATIONS',
    subtitle: 'Georgia Insurance Code · O.C.G.A. Title 33 · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'Georgia State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'O.C.G.A. Title 33', description: 'Georgia Office of Commissioner of Insurance & Safety Fire Authority (OCGA § 33-2-1)' },
          { label: 'Statutory Standard', value: 'O.C.G.A. Title 33', description: 'Producer Licensing & 20 Prelicensing Hours (OCGA § 33-23-1; 24 CE / 3 ethics)' },
          { label: 'Statutory Standard', value: 'O.C.G.A. Title 33', description: 'Georgia Unfair Trade Practices Act (OCGA § 33-6-1: Rebating, Twisting, Misrepresentation)' },
          { label: 'Statutory Standard', value: 'O.C.G.A. Title 33', description: 'Fiduciary Responsibilities & Premium Handling (OCGA § 33-23-35)' },
          { label: 'Statutory Standard', value: 'O.C.G.A. Title 33', description: 'Georgia Life & Health Insurance Guaranty Association (OCGA § 33-38-1)' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify Georgia state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['ga'] = GUIDES['ga_life_agent'];
GUIDES['hi_life_producer'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'hawaii_insurance_statutes_rules_and_regulations': {
    title: 'HAWAII INSURANCE LAWS & REGULATIONS',
    subtitle: 'Hawaii Insurance Code · HI Insurance Code · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'Hawaii State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'HI Insurance Code', description: 'HI Department of Insurance & Commissioner Powers' },
          { label: 'Statutory Standard', value: 'HI Insurance Code', description: 'HI Producer Licensing Rules (24 CE / 3 Ethics)' },
          { label: 'Statutory Standard', value: 'HI Insurance Code', description: 'HI Unfair Trade Practices (Rebating, Twisting, Misrepresentation)' },
          { label: 'Statutory Standard', value: 'HI Insurance Code', description: 'HI Fiduciary Duties & Premium Accounts' },
          { label: 'Statutory Standard', value: 'HI Insurance Code', description: 'HI Life & Health Insurance Guaranty Association' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify Hawaii state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['hi'] = GUIDES['hi_life_producer'];
GUIDES['id_life_producer'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'idaho_insurance_statutes_rules_and_regulations': {
    title: 'IDAHO INSURANCE LAWS & REGULATIONS',
    subtitle: 'Idaho Insurance Code · ID Insurance Code · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'Idaho State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'ID Insurance Code', description: 'ID Department of Insurance & Commissioner Powers' },
          { label: 'Statutory Standard', value: 'ID Insurance Code', description: 'ID Producer Licensing Rules (24 CE / 3 Ethics)' },
          { label: 'Statutory Standard', value: 'ID Insurance Code', description: 'ID Unfair Trade Practices (Rebating, Twisting, Misrepresentation)' },
          { label: 'Statutory Standard', value: 'ID Insurance Code', description: 'ID Fiduciary Duties & Premium Accounts' },
          { label: 'Statutory Standard', value: 'ID Insurance Code', description: 'ID Life & Health Insurance Guaranty Association' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify Idaho state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['id'] = GUIDES['id_life_producer'];
GUIDES['il_life_producer'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'illinois_insurance_statutes_rules_and_regulations': {
    title: 'ILLINOIS INSURANCE LAWS & REGULATIONS',
    subtitle: 'Illinois Insurance Code · 215 ILCS 5/ · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'Illinois State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: '215 ILCS 5/', description: 'Illinois Department of Insurance & Director Powers (215 ILCS 5/401)' },
          { label: 'Statutory Standard', value: '215 ILCS 5/', description: 'Producer Licensing & 20 Prelicensing Hours (215 ILCS 5/500-25: 7.5 classroom hrs; 24 CE / 3 ethics)' },
          { label: 'Statutory Standard', value: '215 ILCS 5/', description: 'Illinois Insurance Placement & Replacement Regulations (50 Ill. Adm. Code 917)' },
          { label: 'Statutory Standard', value: '215 ILCS 5/', description: 'Unfair Trade Practices & Rebating Restrictions (215 ILCS 5/149; 5/500-110)' },
          { label: 'Statutory Standard', value: '215 ILCS 5/', description: 'Illinois Life & Health Insurance Guaranty Association (215 ILCS 5/531.01)' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify Illinois state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['il'] = GUIDES['il_life_producer'];
GUIDES['in_life_producer'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'indiana_insurance_statutes_rules_and_regulations': {
    title: 'INDIANA INSURANCE LAWS & REGULATIONS',
    subtitle: 'Indiana Insurance Code · IN Insurance Code · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'Indiana State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'IN Insurance Code', description: 'IN Department of Insurance & Commissioner Powers' },
          { label: 'Statutory Standard', value: 'IN Insurance Code', description: 'IN Producer Licensing Rules (24 CE / 3 Ethics)' },
          { label: 'Statutory Standard', value: 'IN Insurance Code', description: 'IN Unfair Trade Practices (Rebating, Twisting, Misrepresentation)' },
          { label: 'Statutory Standard', value: 'IN Insurance Code', description: 'IN Fiduciary Duties & Premium Accounts' },
          { label: 'Statutory Standard', value: 'IN Insurance Code', description: 'IN Life & Health Insurance Guaranty Association' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify Indiana state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['in'] = GUIDES['in_life_producer'];
GUIDES['ia_life_producer'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'iowa_insurance_statutes_rules_and_regulations': {
    title: 'IOWA INSURANCE LAWS & REGULATIONS',
    subtitle: 'Iowa Insurance Code · IA Insurance Code · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'Iowa State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'IA Insurance Code', description: 'IA Department of Insurance & Commissioner Powers' },
          { label: 'Statutory Standard', value: 'IA Insurance Code', description: 'IA Producer Licensing Rules (24 CE / 3 Ethics)' },
          { label: 'Statutory Standard', value: 'IA Insurance Code', description: 'IA Unfair Trade Practices (Rebating, Twisting, Misrepresentation)' },
          { label: 'Statutory Standard', value: 'IA Insurance Code', description: 'IA Fiduciary Duties & Premium Accounts' },
          { label: 'Statutory Standard', value: 'IA Insurance Code', description: 'IA Life & Health Insurance Guaranty Association' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify Iowa state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['ia'] = GUIDES['ia_life_producer'];
GUIDES['ks_life_producer'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'kansas_insurance_statutes_rules_and_regulations': {
    title: 'KANSAS INSURANCE LAWS & REGULATIONS',
    subtitle: 'Kansas Insurance Code · KS Insurance Code · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'Kansas State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'KS Insurance Code', description: 'KS Department of Insurance & Commissioner Powers' },
          { label: 'Statutory Standard', value: 'KS Insurance Code', description: 'KS Producer Licensing Rules (24 CE / 3 Ethics)' },
          { label: 'Statutory Standard', value: 'KS Insurance Code', description: 'KS Unfair Trade Practices (Rebating, Twisting, Misrepresentation)' },
          { label: 'Statutory Standard', value: 'KS Insurance Code', description: 'KS Fiduciary Duties & Premium Accounts' },
          { label: 'Statutory Standard', value: 'KS Insurance Code', description: 'KS Life & Health Insurance Guaranty Association' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify Kansas state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['ks'] = GUIDES['ks_life_producer'];
GUIDES['ky_life_producer'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'kentucky_insurance_statutes_rules_and_regulations': {
    title: 'KENTUCKY INSURANCE LAWS & REGULATIONS',
    subtitle: 'Kentucky Insurance Code · KY Insurance Code · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'Kentucky State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'KY Insurance Code', description: 'KY Department of Insurance & Commissioner Powers' },
          { label: 'Statutory Standard', value: 'KY Insurance Code', description: 'KY Producer Licensing Rules (24 CE / 3 Ethics)' },
          { label: 'Statutory Standard', value: 'KY Insurance Code', description: 'KY Unfair Trade Practices (Rebating, Twisting, Misrepresentation)' },
          { label: 'Statutory Standard', value: 'KY Insurance Code', description: 'KY Fiduciary Duties & Premium Accounts' },
          { label: 'Statutory Standard', value: 'KY Insurance Code', description: 'KY Life & Health Insurance Guaranty Association' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify Kentucky state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['ky'] = GUIDES['ky_life_producer'];
GUIDES['la_life_producer'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'louisiana_insurance_statutes_rules_and_regulations': {
    title: 'LOUISIANA INSURANCE LAWS & REGULATIONS',
    subtitle: 'Louisiana Insurance Code · LA Insurance Code · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'Louisiana State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'LA Insurance Code', description: 'LA Department of Insurance & Commissioner Powers' },
          { label: 'Statutory Standard', value: 'LA Insurance Code', description: 'LA Producer Licensing Rules (24 CE / 3 Ethics)' },
          { label: 'Statutory Standard', value: 'LA Insurance Code', description: 'LA Unfair Trade Practices (Rebating, Twisting, Misrepresentation)' },
          { label: 'Statutory Standard', value: 'LA Insurance Code', description: 'LA Fiduciary Duties & Premium Accounts' },
          { label: 'Statutory Standard', value: 'LA Insurance Code', description: 'LA Life & Health Insurance Guaranty Association' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify Louisiana state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['la'] = GUIDES['la_life_producer'];
GUIDES['me_life_producer'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'maine_insurance_statutes_rules_and_regulations': {
    title: 'MAINE INSURANCE LAWS & REGULATIONS',
    subtitle: 'Maine Insurance Code · ME Insurance Code · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'Maine State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'ME Insurance Code', description: 'ME Department of Insurance & Commissioner Powers' },
          { label: 'Statutory Standard', value: 'ME Insurance Code', description: 'ME Producer Licensing Rules (24 CE / 3 Ethics)' },
          { label: 'Statutory Standard', value: 'ME Insurance Code', description: 'ME Unfair Trade Practices (Rebating, Twisting, Misrepresentation)' },
          { label: 'Statutory Standard', value: 'ME Insurance Code', description: 'ME Fiduciary Duties & Premium Accounts' },
          { label: 'Statutory Standard', value: 'ME Insurance Code', description: 'ME Life & Health Insurance Guaranty Association' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify Maine state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['me'] = GUIDES['me_life_producer'];
GUIDES['md_life_producer'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'maryland_insurance_statutes_rules_and_regulations': {
    title: 'MARYLAND INSURANCE LAWS & REGULATIONS',
    subtitle: 'Maryland Insurance Code · MD Insurance Code · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'Maryland State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'MD Insurance Code', description: 'MD Department of Insurance & Commissioner Powers' },
          { label: 'Statutory Standard', value: 'MD Insurance Code', description: 'MD Producer Licensing Rules (24 CE / 3 Ethics)' },
          { label: 'Statutory Standard', value: 'MD Insurance Code', description: 'MD Unfair Trade Practices (Rebating, Twisting, Misrepresentation)' },
          { label: 'Statutory Standard', value: 'MD Insurance Code', description: 'MD Fiduciary Duties & Premium Accounts' },
          { label: 'Statutory Standard', value: 'MD Insurance Code', description: 'MD Life & Health Insurance Guaranty Association' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify Maryland state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['md'] = GUIDES['md_life_producer'];
GUIDES['ma_life_producer'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'massachusetts_insurance_statutes_rules_and_regulations': {
    title: 'MASSACHUSETTS INSURANCE LAWS & REGULATIONS',
    subtitle: 'Massachusetts Insurance Code · MA Insurance Code · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'Massachusetts State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'MA Insurance Code', description: 'MA Department of Insurance & Commissioner Powers' },
          { label: 'Statutory Standard', value: 'MA Insurance Code', description: 'MA Producer Licensing Rules (24 CE / 3 Ethics)' },
          { label: 'Statutory Standard', value: 'MA Insurance Code', description: 'MA Unfair Trade Practices (Rebating, Twisting, Misrepresentation)' },
          { label: 'Statutory Standard', value: 'MA Insurance Code', description: 'MA Fiduciary Duties & Premium Accounts' },
          { label: 'Statutory Standard', value: 'MA Insurance Code', description: 'MA Life & Health Insurance Guaranty Association' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify Massachusetts state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['ma'] = GUIDES['ma_life_producer'];
GUIDES['mi_life_producer'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'michigan_insurance_statutes_rules_and_regulations': {
    title: 'MICHIGAN INSURANCE LAWS & REGULATIONS',
    subtitle: 'Michigan Insurance Code · MI Insurance Code · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'Michigan State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'MI Insurance Code', description: 'MI Department of Insurance & Commissioner Powers' },
          { label: 'Statutory Standard', value: 'MI Insurance Code', description: 'MI Producer Licensing Rules (24 CE / 3 Ethics)' },
          { label: 'Statutory Standard', value: 'MI Insurance Code', description: 'MI Unfair Trade Practices (Rebating, Twisting, Misrepresentation)' },
          { label: 'Statutory Standard', value: 'MI Insurance Code', description: 'MI Fiduciary Duties & Premium Accounts' },
          { label: 'Statutory Standard', value: 'MI Insurance Code', description: 'MI Life & Health Insurance Guaranty Association' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify Michigan state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['mi'] = GUIDES['mi_life_producer'];
GUIDES['mn_life_producer'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'minnesota_insurance_statutes_rules_and_regulations': {
    title: 'MINNESOTA INSURANCE LAWS & REGULATIONS',
    subtitle: 'Minnesota Insurance Code · MN Insurance Code · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'Minnesota State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'MN Insurance Code', description: 'MN Department of Insurance & Commissioner Powers' },
          { label: 'Statutory Standard', value: 'MN Insurance Code', description: 'MN Producer Licensing Rules (24 CE / 3 Ethics)' },
          { label: 'Statutory Standard', value: 'MN Insurance Code', description: 'MN Unfair Trade Practices (Rebating, Twisting, Misrepresentation)' },
          { label: 'Statutory Standard', value: 'MN Insurance Code', description: 'MN Fiduciary Duties & Premium Accounts' },
          { label: 'Statutory Standard', value: 'MN Insurance Code', description: 'MN Life & Health Insurance Guaranty Association' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify Minnesota state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['mn'] = GUIDES['mn_life_producer'];
GUIDES['ms_life_producer'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'mississippi_insurance_statutes_rules_and_regulations': {
    title: 'MISSISSIPPI INSURANCE LAWS & REGULATIONS',
    subtitle: 'Mississippi Insurance Code · MS Insurance Code · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'Mississippi State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'MS Insurance Code', description: 'MS Department of Insurance & Commissioner Powers' },
          { label: 'Statutory Standard', value: 'MS Insurance Code', description: 'MS Producer Licensing Rules (24 CE / 3 Ethics)' },
          { label: 'Statutory Standard', value: 'MS Insurance Code', description: 'MS Unfair Trade Practices (Rebating, Twisting, Misrepresentation)' },
          { label: 'Statutory Standard', value: 'MS Insurance Code', description: 'MS Fiduciary Duties & Premium Accounts' },
          { label: 'Statutory Standard', value: 'MS Insurance Code', description: 'MS Life & Health Insurance Guaranty Association' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify Mississippi state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['ms'] = GUIDES['ms_life_producer'];
GUIDES['mo_life_producer'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'missouri_insurance_statutes_rules_and_regulations': {
    title: 'MISSOURI INSURANCE LAWS & REGULATIONS',
    subtitle: 'Missouri Insurance Code · MO Insurance Code · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'Missouri State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'MO Insurance Code', description: 'MO Department of Insurance & Commissioner Powers' },
          { label: 'Statutory Standard', value: 'MO Insurance Code', description: 'MO Producer Licensing Rules (24 CE / 3 Ethics)' },
          { label: 'Statutory Standard', value: 'MO Insurance Code', description: 'MO Unfair Trade Practices (Rebating, Twisting, Misrepresentation)' },
          { label: 'Statutory Standard', value: 'MO Insurance Code', description: 'MO Fiduciary Duties & Premium Accounts' },
          { label: 'Statutory Standard', value: 'MO Insurance Code', description: 'MO Life & Health Insurance Guaranty Association' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify Missouri state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['mo'] = GUIDES['mo_life_producer'];
GUIDES['mt_life_producer'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'montana_insurance_statutes_rules_and_regulations': {
    title: 'MONTANA INSURANCE LAWS & REGULATIONS',
    subtitle: 'Montana Insurance Code · MT Insurance Code · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'Montana State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'MT Insurance Code', description: 'MT Department of Insurance & Commissioner Powers' },
          { label: 'Statutory Standard', value: 'MT Insurance Code', description: 'MT Producer Licensing Rules (24 CE / 3 Ethics)' },
          { label: 'Statutory Standard', value: 'MT Insurance Code', description: 'MT Unfair Trade Practices (Rebating, Twisting, Misrepresentation)' },
          { label: 'Statutory Standard', value: 'MT Insurance Code', description: 'MT Fiduciary Duties & Premium Accounts' },
          { label: 'Statutory Standard', value: 'MT Insurance Code', description: 'MT Life & Health Insurance Guaranty Association' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify Montana state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['mt'] = GUIDES['mt_life_producer'];
GUIDES['ne_life_producer'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'nebraska_insurance_statutes_rules_and_regulations': {
    title: 'NEBRASKA INSURANCE LAWS & REGULATIONS',
    subtitle: 'Nebraska Insurance Code · NE Insurance Code · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'Nebraska State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'NE Insurance Code', description: 'NE Department of Insurance & Commissioner Powers' },
          { label: 'Statutory Standard', value: 'NE Insurance Code', description: 'NE Producer Licensing Rules (24 CE / 3 Ethics)' },
          { label: 'Statutory Standard', value: 'NE Insurance Code', description: 'NE Unfair Trade Practices (Rebating, Twisting, Misrepresentation)' },
          { label: 'Statutory Standard', value: 'NE Insurance Code', description: 'NE Fiduciary Duties & Premium Accounts' },
          { label: 'Statutory Standard', value: 'NE Insurance Code', description: 'NE Life & Health Insurance Guaranty Association' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify Nebraska state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['ne'] = GUIDES['ne_life_producer'];
GUIDES['nv_life_producer'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'nevada_insurance_statutes_rules_and_regulations': {
    title: 'NEVADA INSURANCE LAWS & REGULATIONS',
    subtitle: 'Nevada Insurance Code · NV Insurance Code · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'Nevada State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'NV Insurance Code', description: 'NV Department of Insurance & Commissioner Powers' },
          { label: 'Statutory Standard', value: 'NV Insurance Code', description: 'NV Producer Licensing Rules (24 CE / 3 Ethics)' },
          { label: 'Statutory Standard', value: 'NV Insurance Code', description: 'NV Unfair Trade Practices (Rebating, Twisting, Misrepresentation)' },
          { label: 'Statutory Standard', value: 'NV Insurance Code', description: 'NV Fiduciary Duties & Premium Accounts' },
          { label: 'Statutory Standard', value: 'NV Insurance Code', description: 'NV Life & Health Insurance Guaranty Association' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify Nevada state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['nv'] = GUIDES['nv_life_producer'];
GUIDES['nh_life_producer'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'new_hampshire_insurance_statutes_rules_and_regulations': {
    title: 'NEW HAMPSHIRE INSURANCE LAWS & REGULATIONS',
    subtitle: 'New Hampshire Insurance Code · NH Insurance Code · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'New Hampshire State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'NH Insurance Code', description: 'NH Department of Insurance & Commissioner Powers' },
          { label: 'Statutory Standard', value: 'NH Insurance Code', description: 'NH Producer Licensing Rules (24 CE / 3 Ethics)' },
          { label: 'Statutory Standard', value: 'NH Insurance Code', description: 'NH Unfair Trade Practices (Rebating, Twisting, Misrepresentation)' },
          { label: 'Statutory Standard', value: 'NH Insurance Code', description: 'NH Fiduciary Duties & Premium Accounts' },
          { label: 'Statutory Standard', value: 'NH Insurance Code', description: 'NH Life & Health Insurance Guaranty Association' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify New Hampshire state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['nh'] = GUIDES['nh_life_producer'];
GUIDES['nj_life_producer'] = {
  i_types_of_policies: {
    title: "TYPES OF POLICIES",
    subtitle: "Whole life · Universal life · Variable policies · Term types · Annuities · Combination plans",
    blocks: [
      { type: "heading", text: "1.1 Traditional Whole Life Products" },
      { type: "table", rows: [
          { label: "Ordinary (Straight) Life", value: "Level premium paid for life", description: "Lowest annual premium of all whole life variants. Cash value grows slowly early, accelerates over time." },
          { label: "Limited-Pay Life", value: "Paid for set period", description: "Premiums paid for a set period (20-Pay, 30-Pay, Paid-Up at 65) but coverage lasts for life. Higher annual premium than straight life." },
          { label: "Single Premium Life", value: "One lump-sum payment", description: "Policy is immediately paid up. Almost always classified as a MEC — loans and withdrawals taxed as gains first + 10% penalty if under 59½." },
          { label: "Adjustable Life", value: "Flexible parameters", description: "Policyholder can adjust the face amount, premium, and payment period within limits. Hybrid of term and whole life flexibility." }
      ]},
      { type: "heading", text: "1.2 Interest-Sensitive Life Products" },
      { type: "table", rows: [
          { label: "Universal Life (UL)", value: "Flexible premium", description: "Flexible premium, adjustable death benefit. Cash value earns declared interest rate set by insurer. Option A = level death benefit. Option B = increasing death benefit (face + cash value)." },
          { label: "Variable Whole Life", value: "Separate account", description: "Fixed premium like whole life, but cash value in a separate account — tied to market performance. NO guaranteed cash value. Policyholder bears investment risk. Requires securities license." },
          { label: "Variable Universal Life (VUL)", value: "Flexible + Separate", description: "Flexible premium + separate account investments. Most flexible product. Most risk on policyholder. Requires securities license AND life license." },
          { label: "Interest-Sensitive Whole Life", value: "Current rate credits", description: "Whole life with credits tied to current interest rates. Guaranteed minimums exist. No securities license needed." }
      ]},
      { type: "callout", kind: "warning", text: "Variable products (Variable Whole Life, VUL) are securities. Agent must hold a life insurance license AND be registered with FINRA. Selling without registration is a federal violation." },
      { type: "heading", text: "1.3 Term Life" },
      { type: "table", rows: [
          { label: "Level Term", value: "Level prem & death benefit", description: "Premium AND death benefit stay the same for the entire term. Most common type." },
          { label: "Decreasing Term", value: "Decreasing death benefit", description: "Death benefit decreases over time. Premium stays level. Commonly used for mortgage protection." },
          { label: "Increasing Term", value: "Increasing death benefit", description: "Death benefit increases over time. Often added as a rider to permanent policies." },
          { label: "Renewable", value: "Renew without medical", description: "Can renew at end of term WITHOUT evidence of insurability. Premium increases at renewal based on attained age." },
          { label: "Convertible", value: "Convert without medical", description: "Can convert to permanent insurance WITHOUT evidence of insurability. Must convert before expiry date." }
      ]},
      { type: "callout", kind: "info", text: "KNOW THIS: Term has NO cash value. It is pure death protection. Highest death benefit per premium dollar." },
      { type: "heading", text: "1.4 Annuities" },
      { type: "table", rows: [
          { label: "Single Premium", value: "One lump sum", description: "Funded with one lump sum. Common for rollovers, settlements, inheritance." },
          { label: "Level Premium", value: "Fixed periodic payments", description: "Fixed periodic payments during accumulation — like a savings plan with insurance wrapper." },
          { label: "Flexible Premium", value: "Variable payments", description: "Vary the amount and frequency of payments during accumulation." },
          { label: "Immediate Annuity", value: "Starts within 12 months", description: "Income starts within 12 months of purchase. Always single premium." },
          { label: "Deferred Annuity", value: "Income starts later", description: "Accumulation phase first, then income later. Has both accumulation and distribution phases." },
          { label: "Fixed Annuity", value: "Guaranteed min interest", description: "Insurer guarantees a minimum interest rate. Insurer bears investment risk. No securities license." },
          { label: "Variable Annuity", value: "Market-linked", description: "Cash value in a separate account — market-linked. Policyholder bears risk. CAN lose value. Requires securities license." },
          { label: "Equity Index Annuity", value: "Tied to stock index", description: "Tied to a stock index (e.g., S&P 500). Has a floor (0% min — no loss) and cap (limits upside). Fixed insurance product — no securities license needed." }
      ]},
      { type: "heading", text: "1.5 Combination Plans" },
      { type: "table", rows: [
          { label: "Joint Life (First-to-Die)", value: "Pays on first death", description: "Covers two or more lives. Pays death benefit on FIRST death. Used for income replacement for the surviving partner/spouse." },
          { label: "Survivorship Life (Second-to-Die)", value: "Pays on second death", description: "Covers two lives. Pays on SECOND death only. Premium is lower than two individual policies. Primary use: estate planning and estate tax funding." }
      ]}
    ]
  },
  ii_policy_riders_provisions_options_and_exclusions: {
    title: "POLICY RIDERS, PROVISIONS, OPTIONS & EXCLUSIONS",
    subtitle: "Waiver of premium · Policy provisions · Dividend options · Exclusions",
    blocks: [
      { type: "heading", text: "2.1 Policy Riders" },
      { type: "table", rows: [
          { label: "Waiver of Premium", value: "Waives future premiums", description: "If totally disabled for 6 months or more, future premiums are waived. Policy stays in force. Disability must begin before a specified age (usually 60 or 65)." },
          { label: "Waiver of Premium + Disability Income", value: "Waived prem + monthly income", description: "Same as above PLUS pays a monthly income benefit while disabled." },
          { label: "Guaranteed Insurability (GIR)", value: "No medical required", description: "Policyholder can purchase additional coverage at specified future dates or events with NO medical exam. No evidence of insurability required." },
          { label: "Payor Benefit", value: "Juvenile policies", description: "On juvenile (child) policies — if the premium payor (parent/guardian) dies or becomes disabled, premiums are waived until the child reaches a specified age." },
          { label: "Accidental Death Benefit (ADB)", value: "Double indemnity", description: "Pays an additional death benefit (usually equal to the face amount) if death results from an accident. Death must occur within 90 days of the accident. Also called 'double indemnity.'" },
          { label: "Accidental Death & Dismemberment (AD&D)", value: "Dismemberment schedule", description: "Pays full benefit for death or loss of two limbs/eyes. Pays partial for loss of one limb/eye." },
          { label: "Term Riders", value: "Temporary boost", description: "Additional term coverage added to a base permanent policy. Cost-effective way to boost death benefit temporarily." },
          { label: "Spouse/Children's Rider", value: "One rider premium", description: "Adds term coverage on spouse or all children under one rider premium. Children's rider is convertible to individual policy at adulthood without evidence of insurability." },
          { label: "Cost of Living (COLA)", value: "Tied to CPI", description: "Death benefit automatically increases with inflation (tied to CPI). No new underwriting required at increase dates." }
      ]},
      { type: "heading", text: "2.2 Policy Provisions and Options" },
      { type: "table", rows: [
          { label: "Entire Contract", value: "Policy + Application", description: "Policy + application = the entire legal agreement. Insurer cannot add to or change it after issuance without consent." },
          { label: "Insuring Clause", value: "Insurer's core promise", description: "Core promise of the policy — insurer agrees to pay the death benefit to the beneficiary upon the insured's death." },
          { label: "Free Look", value: "Right to examine", description: "Policyholder has a right to examine and return the policy for a full refund. NJ = 10 days minimum. (Longer for replacements and seniors in some cases.)" },
          { label: "Consideration", value: "Exchanged values", description: "Something of value exchanged by both parties. Insured's consideration = application + first premium. Insurer's consideration = promise to pay benefits." },
          { label: "Owner's Rights", value: "Policyowner controls", description: "The policyowner controls the policy: designates/changes beneficiary, takes loans, assigns the policy, surrenders it. Owner ≠ insured necessarily." },
          { label: "Beneficiary — Primary", value: "First in line", description: "First to receive death benefit. If alive at insured's death, they receive the proceeds." },
          { label: "Beneficiary — Contingent", value: "Backup beneficiary", description: "Backup beneficiary. Receives proceeds only if primary predeceases the insured." },
          { label: "Revocable Beneficiary", value: "Changeable anytime", description: "Can be changed at any time by the policyowner without the beneficiary's consent. DEFAULT." },
          { label: "Irrevocable Beneficiary", value: "Consent required", description: "Cannot be changed without the beneficiary's written consent. Beneficiary has a vested right in the policy." },
          { label: "Common Disaster", value: "Simultaneous death", description: "If insured and primary beneficiary die in same event, policy proceeds go to contingent beneficiary as if insured survived." },
          { label: "Minor Beneficiaries", value: "Guardian/Trust required", description: "Minors cannot directly receive insurance proceeds. A guardian or trust must be established to manage funds until majority." },
          { label: "Grace Period", value: "31 days in NJ", description: "If premium is not paid on due date, policy remains in force for 31 days. Death during grace period: benefit paid minus overdue premium." },
          { label: "Automatic Premium Loan (APL)", value: "Prevents lapse", description: "If premium is unpaid after grace period and cash value exists, insurer automatically takes a loan from cash value to pay the premium. Prevents lapse." },
          { label: "Level or Flexible Premium", value: "Premium structure", description: "Whole life = level (fixed). UL = flexible (vary amount within limits)." },
          { label: "Reinstatement", value: "Typically 3 years", description: "Lapsed policy can be reinstated within a specified period (typically 3 years in NJ). Requirements: back premiums + interest + evidence of insurability. Restarts contestability and suicide clauses." },
          { label: "Policy Loans", value: "Not taxable", description: "Borrow against cash value. Not taxable. Outstanding loan reduces death benefit dollar for dollar. Interest accrues." },
          { label: "Withdrawals/Partial Surrenders", value: "Permanent reduction", description: "Permanent reduction in cash value and potentially death benefit. Gains withdrawn first on MEC (LIFO). Gains withdrawn last on non-MEC (FIFO)." },
          { label: "Nonforfeiture Options", value: "Cash/Reduced Paid-Up/Extended Term", description: "Required by law on cash value policies. When stopping premium payments: (1) Cash Surrender Value, (2) Reduced Paid-Up, (3) Extended Term." },
          { label: "Dividends", value: "Return of premium", description: "Return of excess premium (not investment income). Not guaranteed. Not taxable unless they exceed total premiums paid." },
          { label: "Dividend Options", value: "CRAPPO", description: "(1) Cash, (2) Reduce Next Premium, (3) Paid-Up Additions, (4) Accumulate at Interest, (5) One-Year Term." },
          { label: "Incontestability", value: "2-year limit", description: "After policy has been in force for 2 years, insurer CANNOT contest validity based on misrepresentation. Fraud may be an exception." },
          { label: "Assignments", value: "Transfer ownership", description: "Policyowner can transfer ownership rights. Absolute assignment = permanent transfer of all ownership. Collateral assignment = temporary, as loan security." },
          { label: "Suicide Clause", value: "2-year window", description: "If insured dies by suicide within 2 years of policy issue, insurer returns premiums only — no death benefit. After 2 years, full death benefit paid." },
          { label: "Misstatement of Age/Gender", value: "Adjust benefit", description: "Policy is NOT voided. Benefit adjusted to what premiums would have purchased at correct age/gender." },
          { label: "Settlement Options", value: "How payout is made", description: "How the death benefit is paid: (1) Lump Sum (default), (2) Interest Only, (3) Fixed Period, (4) Fixed Amount, (5) Life Income (highest monthly pmt = life only)." }
      ]},
      { type: "heading", text: "2.3 Policy Exclusions" },
      { type: "bullets", items: [
          { bold: "War/Military exclusion", text: "— death in active military service may be excluded" },
          { bold: "Aviation exclusion", text: "— death while piloting non-commercial aircraft may be excluded" },
          "Hazardous occupation/activity exclusions",
          "Suicide within the suicide clause period (first 2 years)"
      ]},
      { type: "callout", kind: "test_trick", text: "Exclusions must be clearly stated in the policy. The insurer bears the burden of proving an exclusion applies. When in doubt on the exam, the answer that protects the insured is usually correct." }
    ]
  },
  iii_completing_the_application_underwriting_and_delivering_the_policy: {
    title: "APPLICATION, UNDERWRITING & POLICY DELIVERY",
    subtitle: "Completing the application · Field underwriting · Deliver requirements",
    blocks: [
      { type: "heading", text: "3.1 Completing the Application" },
      { type: "table", rows: [
          { label: "Required Signatures", value: "Agent, Insured, Owner", description: "Application must be signed by: (1) the proposed insured, (2) the policyowner if different from insured, (3) the agent/producer." },
          { label: "Changes in the Application", value: "Initialed by applicant", description: "Any change to the application must be initialed by the applicant. Agent CANNOT alter the application without applicant's knowledge." },
          { label: "Incomplete Application", value: "Insurer returns it", description: "If application is materially incomplete, insurer will return it and cannot process. Coverage does not begin until complete application received." },
          { label: "Warranties vs. Representations", value: "True vs. Guaranteed", description: "Representations: statements believed to be true — material misrepresentation can void policy. Warranties: guaranteed absolutely true — breach voids policy regardless of materiality. Most life applications are representations." },
          { label: "Collecting Initial Premium", value: "Effective date timing", description: "If initial premium collected with application: coverage may begin immediately (conditional receipt). If no premium collected: coverage begins upon policy delivery and payment." },
          { label: "Conditional Receipt", value: "Coverage condition", description: "Given when application is submitted WITH first premium. Coverage begins either on the date of application or on the date of medical exam (whichever is later), PROVIDED the applicant is found to be insurable." },
          { label: "Replacement", value: "Replacement notice", description: "When replacing existing life insurance: must give the applicant a Notice Regarding Replacement. Replacing insurer must notify existing insurer. Rules exist to protect against twisting/churning. (NJ Ref: 11:4-2.1 thru 2.8)" },
          { label: "HIPAA Disclosure", value: "Protected health info", description: "Health information collected for underwriting must be handled per HIPAA privacy rules." },
          { label: "HIV Consent", value: "Written consent required", description: "NJ requires written consent before HIV testing as part of underwriting. Results are confidential." }
      ]},
      { type: "heading", text: "3.2 Underwriting" },
      { type: "table", rows: [
          { label: "Insurable Interest", value: "At application time", description: "Must exist at time of application for life insurance. You always have insurable interest in your own life. Exists between spouses, parent/child, business partners, key employees. Not required at time of claim." },
          { label: "Medical Information", value: "Insurer sources", description: "Insurer may require medical exam, blood tests, attending physician statements, or paramedical exams depending on face amount and age." },
          { label: "Consumer Reports", value: "FCRA scope", description: "Insurer may obtain credit reports, inspection reports, or MIB (Medical Information Bureau) data for underwriting." },
          { label: "Fair Credit Reporting Act (FCRA)", value: "Applicant rights", description: "If an applicant is denied or rated because of a consumer report, they must be notified and have the right to obtain a copy of the report and dispute inaccuracies." },
          { label: "Risk Classification", value: "Ratings classifications", description: "Preferred (below average risk, lowest premium), Standard (average risk), Substandard/Rated (above average — higher premium, exclusion rider, or reduced benefit), Declined (uninsurable)." }
      ]},
      { type: "heading", text: "3.3 Delivering the Policy" },
      { type: "table", rows: [
          { label: "When Coverage Begins", value: "Premium timing rules", description: "(1) If premium paid with application + insurable: effective date of application or exam. (2) If no premium with app: upon delivery of policy + payment of first premium + good health statement." },
          { label: "Statement of Good Health", value: "Delivery requirement", description: "If health has changed between application and delivery, agent must obtain a written statement that insured's health is unchanged. If health changed, report to insurer." },
          { label: "Agent's Duty at Delivery", value: "Policy explanation", description: "Explain the policy, its provisions, riders, exclusions, and ratings. Answer all questions. Get delivery receipt signed." }
      ]},
      { type: "heading", text: "3.4 Do Not Call List" },
      { type: "bullets", items: [
          "Federal Do Not Call Registry — agents must honor the national registry",
          "Cannot call numbers on the list for solicitation purposes",
          "Exceptions: existing business relationship, prior written consent, nonprofit organizations",
          "Violations subject to federal FTC penalties"
      ]}
    ]
  },
  iv_taxes_retirement_and_other_insurance_concepts: {
    title: "TAXES, RETIREMENT & OTHER INSURANCE CONCEPTS",
    subtitle: "Third-party ownership · Group life · Retirement plans · Business insurance",
    blocks: [
      { type: "heading", text: "4.1 Third-Party Ownership" },
      { type: "table", rows: [
          { label: "Definition", value: "Different owner & insured", description: "When the policyOWNER is different from the INSURED. Common in business insurance and estate planning." },
          { label: "Example", value: "Key person setup", description: "Employer owns a policy on key employee. Employer = owner/beneficiary. Employee = insured." },
          { label: "Estate Planning", value: "Irrevocable trusts", description: "Parents own policies on adult children, or irrevocable life insurance trusts (ILITs) own policies to keep proceeds out of taxable estate." }
      ]},
      { type: "heading", text: "4.2 Group Life Insurance" },
      { type: "table", rows: [
          { label: "Eligible Groups", value: "Group purpose", description: "Employer groups, associations, creditor-debtor groups, labor unions. Must have a reason to exist other than obtaining insurance." },
          { label: "Master Policy", value: "Certificates of coverage", description: "One policy covers all eligible members. Individuals receive certificates of coverage (not individual policies)." },
          { label: "Contributory", value: "75% participation", description: "Employee pays part of the premium. At least 75% of eligible employees must participate." },
          { label: "Non-Contributory", value: "100% participation", description: "Employer pays the entire premium. 100% of eligible employees must be covered." },
          { label: "Conversion Privilege", value: "31-day window", description: "Upon leaving the group, member can convert to an individual permanent policy within 31 days — NO evidence of insurability required. Cannot convert to term. (NJ: NJSA 17B:27-1 thru 8)" },
          { label: "Credit Life", value: "Decreasing term", description: "Decreasing term insurance tied to a loan balance. Pays off the remaining loan if borrower dies. (NJ: 11:2-3.1 thru 3.19)" }
      ]},
      { type: "callout", kind: "test_trick", text: "KNOW THIS: Contributory = 75%. Non-contributory = 100%. This is on every insurance exam. Memorize it cold." },
      { type: "heading", text: "4.3 Retirement Plans" },
      { type: "table", rows: [
          { label: "Tax-Qualified Plans", value: "Pre-tax dollars", description: "Pre-tax contributions. Tax-deferred growth. Withdrawals taxed as ordinary income. Examples: 401(k), 403(b), Traditional IRA, SEP-IRA, SIMPLE IRA." },
          { label: "Non-Qualified Plans", value: "After-tax dollars", description: "After-tax contributions. Growth is tax-deferred. Only the GAIN portion of withdrawals is taxable. Examples: non-qualified annuities, deferred compensation." },
          { label: "Traditional IRA", value: "Pre-tax (subject to limits)", description: "$7,000/year (2024). $8,000 if 50+. May be tax-deductible depending on income and workplace plan. RMDs begin at age 73." },
          { label: "Roth IRA", value: "After-tax", description: "After-tax contributions. Qualified withdrawals are completely TAX-FREE. No RMDs during owner's lifetime." },
          { label: "401(k)", value: "Employer-sponsored", description: "Employer-sponsored. $23,000/year (2024). $30,500 if 50+. RMDs at 73." },
          { label: "403(b)", value: "Non-profit / Public education", description: "Non-profit and public school employees. Same contribution limits as 401(k)." },
          { label: "Early Withdrawal Penalty", value: "10% under age 59½", description: "10% penalty on distributions before age 59½. Some exceptions: death, disability, first home, certain medical expenses." },
          { label: "RMD", value: "Required minimums", description: "Required Minimum Distributions must begin April 1 following the year you turn 73. Failure to take RMD = 25% excise tax on amount not withdrawn." }
      ]},
      { type: "heading", text: "4.4 Business Insurance" },
      { type: "table", rows: [
          { label: "Key Person Insurance", value: "Compensates business", description: "Business owns, pays premium, and is beneficiary on a key employee's life. Premiums NOT deductible. Death benefit received tax-free by business. Compensates company for financial loss of that individual." },
          { label: "Buy-Sell Agreement", value: "Funds business buyout", description: "Legal contract between business partners. Life insurance funds the agreement. On partner's death, survivor buys out deceased partner's interest using the death benefit. Premiums NOT deductible." },
          { label: "Split-Dollar Plan", value: "Shared premiums", description: "Employer and employee share premium costs and policy benefits. Multiple arrangements possible. Used to provide executive death benefit." },
          { label: "COLI (Corporate-Owned Life Insurance)", value: "Executive benefits", description: "Company-owned policies on multiple employees. Used for tax-advantaged benefit funding. Subject to specific IRC rules." }
      ]},
      { type: "heading", text: "4.5 Social Security Benefits" },
      { type: "bullets", items: [
          "Survivor benefits paid to surviving spouse and dependent children",
          "Disability benefits if insured worker meets definition of total disability",
          "Life insurance supplements (does not replace) Social Security survivor protection"
      ]},
      { type: "heading", text: "4.6 Tax Treatment of Premiums, Proceeds, Dividends" },
      { type: "table", rows: [
          { label: "Individual Life Premiums", value: "Not deductible", description: "NOT tax deductible for individuals." },
          { label: "Death Benefit", value: "Tax-free", description: "ALWAYS income tax-free to beneficiary (IRC § 101(a))." },
          { label: "Cash Value Growth", value: "Tax-deferred", description: "Tax-deferred. No tax while inside the policy." },
          { label: "Non-MEC Withdrawals", value: "FIFO basis", description: "FIFO — premiums (basis) come out first tax-free, then gains are taxable." },
          { label: "Non-MEC Loans", value: "Not taxable", description: "NOT taxable. Loans are not income." },
          { label: "MEC Withdrawals/Loans", value: "LIFO basis", description: "LIFO — gains come out first, taxable as ordinary income + 10% penalty if under 59½." },
          { label: "Dividends", value: "Return of premium", description: "Return of premium — NOT taxable until they exceed total premiums paid." },
          { label: "Group Life (first $50K)", value: "Tax-free for employees", description: "Employer-paid group term life is tax-free to employee up to $50,000 of coverage. Excess is imputed income — taxable to employee." },
          { label: "1035 Exchange", value: "Tax-free rollover", description: "Tax-free exchange: Life-to-Life, Life-to-Annuity, Annuity-to-Annuity. Annuity-to-Life is NOT valid." }
      ]},
      { type: "heading", text: "4.7 Accelerated Death Benefits (Living Benefits)" },
      { type: "table", rows: [
          { label: "Trigger", value: "Terminal/Chronic/Critical", description: "Terminal illness (life expectancy 12-24 months), chronic illness, critical illness." },
          { label: "Tax Treatment", value: "Income tax-free", description: "Generally income tax-free if terminally ill. Chronic illness benefits may be limited." },
          { label: "Effect", value: "Reduces remaining benefit", description: "Advances a portion of the death benefit while alive. Reduces remaining death benefit paid at death." },
          { label: "Viatical Settlement", value: "Sale to third party", description: "Terminally ill insured sells the policy to a third party (viatical company) for a lump sum less than face value. Tax-free if terminally ill." }
      ]},
      { type: "heading", text: "4.8 Endowments" },
      { type: "bullets", items: [
          "Policy that pays the face amount if the insured SURVIVES to the end of the endowment period OR dies during the period",
          "Cash value equals the face amount at maturity",
          "Most endowments are MECs — because they accumulate cash value very rapidly",
          "Rarely sold today due to MEC tax treatment — but still tested on the exam"
      ]}
    ]
  },
  v_new_jersey_laws_rules_and_regulations_common_to_life_accident_and_health_property_and_casualty_insurance: {
    title: "NJ LAWS COMMON TO ALL LINES — 25 ITEMS",
    subtitle: "N.J.S.A. Title 17 & 17B · DOBI Commissioner Powers · Licensing & General Standards",
    blocks: [
      { type: "callout", kind: "warning", text: "KEY: NJ UNIQUE: Section 5 is 30% of the exam — the largest section. NJ state law questions are where this test is won or lost. Master NJ statutes first." },
      { type: "heading", text: "NJ Statute Reference Key" },
      { type: "table", rows: [
          { label: "Title 17B", value: "NJ Insurance Statutes", description: "New Jersey Insurance Laws (primary insurance statutes)" },
          { label: "Title 17", value: "Additional Statutes", description: "Additional NJ Insurance Laws" },
          { label: "Title 11", value: "Administrative Code", description: "NJ Administrative Code (regulations issued by DOBI)" },
          { label: "DOBI", value: "State Regulator", description: "Department of Banking and Insurance — the NJ insurance regulator" },
          { label: "Commissioner", value: "DOBI Head", description: "Head of DOBI. Appointed by Governor." }
      ]},
      { type: "heading", text: "5.1 State Regulatory Jurisdiction" },
      { type: "table", rows: [
          { label: "NJ State Laws", value: "DOBI Regulations", description: "NJ Legislature enacts insurance statutes. Commissioner issues regulations implementing those statutes." },
          { label: "Court Action", value: "Legal precedent", description: "Courts interpret insurance statutes. Decisions become binding precedent." },
          { label: "Paul v. Virginia (1869)", value: "States regulate", description: "U.S. Supreme Court ruled insurance was NOT interstate commerce — therefore states could regulate it." },
          { label: "US v. South-Eastern Underwriters (1944)", value: "Interstate commerce", description: "U.S. Supreme Court reversed — ruled insurance IS interstate commerce — brought insurance under federal jurisdiction briefly." },
          { label: "McCarran-Ferguson Act (1945)", value: "State authority restored", description: "Congress restored state regulation of insurance. Federal law applies to insurance only to the extent state law does not regulate it. States remain primary regulators." },
          { label: "Effect on Policy Forms", value: "Commissioner approval", description: "NJ Commissioner must approve all policy forms and rates before they can be used in NJ." },
          { label: "Commissioner's Powers", value: "DOBI Authority", description: "Enforce NJ insurance laws, issue regulations, examine company records, issue licenses, impose fines, revoke licenses, issue cease-and-desist orders. (Ref: 17:1-8.1, 17:1-15, 17:22A-45)" },
          { label: "Notice and Hearing", value: "Licensee rights", description: "Before adverse action (license revocation, fine), licensee must receive notice and opportunity for a hearing. (Ref: 17:22A-45, 17:1-16)" },
          { label: "Penalties", value: "Violations penalties", description: "Commissioner may impose civil fines for violations. Criminal penalties for fraud. (Ref: 17:22A-40, 17:22A-45)" }
      ]},
      { type: "heading", text: "5.2 Definitions" },
      { type: "table", rows: [
          { label: "Insurance-Related Conduct", value: "DOBI definition", description: "Actions constituting the business of insurance in NJ. Requires license. (Ref: 11:17-1.2)" },
          { label: "Domestic Company", value: "Incorporated in NJ", description: "Incorporated in New Jersey." },
          { label: "Foreign Company", value: "Other state", description: "Incorporated in another U.S. state but licensed to do business in NJ. (Ref: 17B:17-7)" },
          { label: "Alien Company", value: "Other country", description: "Incorporated in a foreign country but licensed to do business in NJ." },
          { label: "Stock Company", value: "Shareholder owned", description: "Owned by shareholders. Issues non-participating policies. Profit distributed to stockholders." },
          { label: "Mutual Company", value: "Policyholder owned", description: "Owned by policyholders. Issues participating policies. May pay dividends to policyholders. (Ref: 17B:18-2,3)" },
          { label: "Reinsurance", value: "Insurer transfer", description: "Insurance for insurance companies. Primary insurer transfers part of risk to reinsurer." },
          { label: "Retrocession", value: "Reinsurer transfer", description: "Reinsurer reinsures with another reinsurer. Risk transferred a second time. (Ref: 17B:18-62)" },
          { label: "Certificate of Authority", value: "Insurer license", description: "Required for any insurer doing business in NJ. Must be obtained from DOBI before writing policies. (Ref: 17B:17-10,12)" },
          { label: "Insurance Agent", value: "Represents insurer", description: "Licensed producer who represents one or more insurers. Acts as insurer's representative. (Ref: 11:17B-1.3)" },
          { label: "Insurance Broker", value: "Represents client", description: "Licensed producer who represents the insured (not the insurer). Shops market for client." },
          { label: "Insurance Consultant", value: "Advises for fee", description: "Licensed professional who provides advice on insurance for a fee. Does not sell policies. (Ref: 17:22A-28)" },
          { label: "Sell, Solicit, and Negotiate", value: "Licensable activities", description: "The three activities that require a producer license in NJ." }
      ]},
      { type: "heading", text: "5.3 Licensing" },
      { type: "table", rows: [
          { label: "Producer License", value: "Individual producer", description: "Required to sell, solicit, or negotiate insurance in NJ. (Ref: 17:22A-29,32,33; 11:17-1.2)" },
          { label: "Business Entity License", value: "Firm license", description: "An agency or firm must also be separately licensed if it transacts insurance. (Ref: 17:22A-32,33)" },
          { label: "Nonresident Producer", value: "Reciprocal licensing", description: "Licensed in their home state, may apply for NJ nonresident license. Reciprocal rules apply. (Ref: 17:22A-34)" },
          { label: "Prelicensing Requirements", value: "Education", description: "Must complete state-approved pre-license education before taking the exam. (Ref: 11:17-2, 11:17-3.5, 3.7, 4)" },
          { label: "Surplus Lines", value: "Non-admitted placement", description: "Coverage placed with non-admitted insurers when admitted market declines. Surplus lines broker needed. (Ref: 17:22A-38)" },
          { label: "Temporary Work Authority", value: "60 days max", description: "Issued after passing exam and submitting fingerprints, valid for up to 60 days. (Ref: 11:17-2.1, 2.4)" },
          { label: "Company/Producer Relationship", value: "Contractual", description: "Contractual. Insurer appoints producer. Producer acts with express, implied, and apparent authority. (Ref: 22A-42; 11:17-2.9)" },
          { label: "Producer Employing Another", value: "DOBI notification", description: "A licensed producer may employ another producer under their license with DOBI notification. (Ref: 11:17-2.9(b))" },
          { label: "Substituting for Disabled Producer", value: "180 days max", description: "Producer may take over business of disabled/deceased producer under specific DOBI approval. (Ref: 17:22A-37; 11:17-2.10(c))" },
          { label: "License Renewal", value: "Biennial schedule", description: "Must renew per DOBI schedule. CE required for renewal. (Ref: 11:17-2.1, 2.5; 11:17-25)" },
          { label: "License Denial", value: "Refusal grounds", description: "DOBI may deny application for criminal history, fraud, misrepresentation. (Ref: 11:17-2.13; 17:22A-40)" },
          { label: "Cancellation/Reinstatement", value: "Termination", description: "License may be cancelled. Reinstatement requires application and may require CE. (Ref: 11:17-2.13)" },
          { label: "Revocation/Suspension", value: "Penalties", description: "Commissioner may revoke or suspend for violations. Revoked licensee may not reapply for period set by Commissioner. (Ref: 17:22A-40; 17D:2.1, 2.5-2.7)" }
      ]},
      { type: "heading", text: "5.4 Trade Practices — Prohibited Practices" },
      { type: "table", rows: [
          { label: "Misrepresentation", value: "False statements", description: "Making false or misleading statements about policy benefits, terms, or competitor products. (Ref: 17:29B-1 thru 14)" },
          { label: "False Advertising", value: "Deceptive ads", description: "Advertising that is deceptive or misleading about any insurance product. (Ref: 11:2-23.1 thru 23.10)" },
          { label: "Defamation", value: "Injurious statements", description: "Making false statements about another insurer's financial condition or business practices." },
          { label: "Unfair Discrimination", value: "Discriminatory rates", description: "Charging different rates or refusing coverage based on race, religion, national origin, or other protected characteristics. Sex-based rating rules apply in NJ." },
          { label: "Rebating", value: "Inducement", description: "Giving the client anything of value (part of commission, gifts, free services) as an inducement to purchase. Illegal in NJ. (Ref: 17:29B-1 thru 14)" },
          { label: "Twisting", value: "Illegal replacement", description: "Convincing a client to replace an existing policy through misrepresentation for the agent's benefit. (Ref: 17B:30-6)" },
          { label: "Churning", value: "Internal replacement", description: "Replacing a client's own policy to generate a new commission. Agent's own client. Illegal." },
          { label: "Sliding", value: "Adding coverage", description: "Adding coverage to a policy without the client's knowledge or consent." },
          { label: "Fraud", value: "Criminal offense", description: "Intentional deception for financial gain. Criminal offense in NJ. (Ref: 17:33A)" },
          { label: "Coercion", value: "Force/threats", description: "Using force, threats, or intimidation to influence insurance decisions." },
          { label: "Boycott", value: "Conspiracy", description: "Conspiring to harm or drive out a competitor through collective action." },
          { label: "Business Names", value: "DOBI approval", description: "Must register fictitious business names with DOBI before use. (Ref: 17:22A-36; 11:17-1.2, 2.7)" },
          { label: "Branch Offices", value: "DOBI reporting", description: "Must report branch office locations to DOBI. (Ref: 11:17-1.2, 2.8)" },
          { label: "Address Change", value: "30 days limit", description: "Must report change in address (including email) to DOBI promptly. (Ref: 11:17-2.7(f),(g))" },
          { label: "Standards of Conduct", value: "Ethics compliance", description: "Must comply with NJ standards of ethical and professional conduct. (Ref: 11:17A thru 17D)" }
      ]},
      { type: "heading", text: "Information Privacy — NJ Requirements" },
      { type: "table", rows: [
          { label: "HIPAA", value: "Health privacy", description: "Health Insurance Portability and Accountability Act. Governs use and disclosure of protected health information (PHI). Must provide notice of privacy practices." },
          { label: "HITECH", value: "Strengthened HIPAA", description: "Strengthened HIPAA. Applies to business associates. Breach notification requirements." },
          { label: "Gramm-Leach-Bliley", value: "Financial privacy", description: "Requires financial institutions (including insurers) to protect nonpublic personal information (NPI). Must provide privacy notice and opt-out rights." },
          { label: "NJ Privacy (17:23A)", value: "NJ-specific rules", description: "NJ-specific information privacy rules for insurance. Restricts sharing of consumer data. (Ref: NJSA 17:23A)" }
      ]},
      { type: "heading", text: "5.5 Guaranty Associations" },
      { type: "table", rows: [
          { label: "NJ Life & Health Guaranty Association", value: "Consumer safety net", description: "Protects policyholders if a licensed insurer becomes insolvent. (Ref: Title 17 Chapter 30A)" },
          { label: "Coverage Limits", value: "Statutory caps", description: "Pays claims up to statutory limits. Varies by line of insurance." },
          { label: "Funded By", value: "Assessments", description: "Assessments on all licensed insurers in NJ." },
          { label: "What It Does NOT Cover", value: "Exclusions", description: "Surplus lines (non-admitted) carriers. Variable products (securities). Self-insured plans." }
      ]},
      { type: "callout", kind: "warning", text: "WARNING: Guaranty Association does NOT cover surplus lines policies, variable life, or variable annuities. Those are not insurance — they are securities." },
      { type: "heading", text: "5.6 Ethics" },
      { type: "bullets", items: [
          "Place client's interest above your own in every transaction",
          "Full disclosure of all material facts — policy terms, costs, limitations",
          "Disclose your relationship to the insurer (agent vs. broker)",
          "Never use deceptive, high-pressure, or misleading sales tactics",
          "Continuing education requirement exists partly to maintain ethical standards"
      ]}
    ]
  },
  vi_new_jersey_laws_rules_and_regulations_pertinent_to_life_and_regulations: {
    title: "NJ LAWS PERTINENT TO LIFE INSURANCE — 8 ITEMS",
    subtitle: "N.J.S.A. Title 17B · N.J.A.C. Title 11 · Replacement, Disclosures & Annuity Suitability",
    blocks: [
      { type: "heading", text: "Credit Life Insurance (11:2-3.1 thru 3.19)" },
      { type: "table", rows: [
          { label: "Definition", value: "Decreasing term", description: "Decreasing term insurance tied to a loan. Pays off the outstanding loan balance if borrower dies." },
          { label: "Maximum Coverage", value: "Loan balance cap", description: "Cannot exceed the outstanding loan balance — no over-insurance." },
          { label: "Disclosure Required", value: "Lender disclosure", description: "Lender must disclose that credit life is optional. Borrower cannot be required to purchase it." },
          { label: "Premium", value: "Premium rate caps", description: "May be included in loan payments. Must be disclosed. Cannot exceed NJ maximum rates." }
      ]},
      { type: "heading", text: "Group Life Insurance — NJ Specific (11:2-13.1 thru 13.9; NJSA 17B:27-1 thru 8, 11, 21)" },
      { type: "table", rows: [
          { label: "Eligible Groups in NJ", value: "Group definition", description: "Employer groups, labor unions, associations, creditor-debtor groups, etc. Group must exist for purpose other than insurance." },
          { label: "Conversion Right", value: "31-day window", description: "Must be offered when leaving the group. 31 days to convert to individual permanent policy without evidence of insurability. Cannot convert to term." },
          { label: "NJ Mandated Benefits", value: "Minimum benefits", description: "NJ requires certain minimum benefits in group life policies issued in NJ." },
          { label: "Portability", value: "Coverage transfer", description: "In some cases, group members may take coverage with them when leaving — separate from conversion." }
      ]},
      { type: "heading", text: "Marketing Methods and Practices (17B:30-1 thru 22)" },
      { type: "table", rows: [
          { label: "Advertising Standards", value: "Truth in advertising", description: "All life insurance advertising in NJ must be truthful and not misleading. Must clearly identify the insurer. (Ref: 11:2-23.1 thru 23.10)" },
          { label: "Illustrations", value: "Projections standard", description: "Policy illustrations must distinguish guaranteed from non-guaranteed values. Cannot project non-guaranteed values in a misleading way." },
          { label: "Suitability", value: "Client alignment", description: "Before recommending a life or annuity product, agent must determine it is suitable for the client based on their financial situation, needs, and objectives. (Ref: Bulletin No. 09-06; NJSA 17B:25-34)" },
          { label: "Business Title Rules", value: "Designation limits", description: "Cannot use titles or designations (like 'financial advisor,' 'senior specialist') that mislead consumers about qualifications. (Ref: Bulletin No. 09-06; NJSA 17B:25-36)" }
      ]},
      { type: "heading", text: "Replacement — NJ Rules (11:4-2.1 thru 2.8)" },
      { type: "table", rows: [
          { label: "Definition", value: "Policy replacement", description: "Replacement occurs when a new policy is purchased and an existing policy is lapsed, surrendered, converted, or otherwise terminated." },
          { label: "Agent Duties", value: "Notice requirement", description: "Must complete a replacement notice and give it to the applicant. Must list all existing policies being replaced." },
          { label: "Insurer Duties", value: "Notification timeline", description: "Replacing insurer must send notice to existing insurer within specific timeframes." },
          { label: "Purpose", value: "Consumer protection", description: "Protect consumers from unnecessary replacements driven by commission motives." },
          { label: "Anti-Twisting", value: "Twisting prevention", description: "Replacement rules are specifically designed to prevent twisting and churning." }
      ]},
      { type: "heading", text: "Disclosures (11:4-11.1 thru 11.7)" },
      { type: "table", rows: [
          { label: "Life Insurance Disclosure", value: "Cost & benefits disclosure", description: "NJ requires specific disclosures at point of sale for life insurance — cost, benefits, limitations." },
          { label: "Buyer's Guide", value: "DOBI guide", description: "Must be provided to the applicant at or before application." },
          { label: "Policy Summary", value: "Summary of terms", description: "Summary of policy terms, cost indexes, death benefits. Must be provided at or before delivery." },
          { label: "Cost Comparison Indexes", value: "Cost indexes", description: "Surrender cost index and net payment cost index help consumers compare policy costs." }
      ]},
      { type: "heading", text: "The Insurance Contract — NJ (NJSA 17B:24-1 thru 12)" },
      { type: "table", rows: [
          { label: "Contract Requirements", value: "Mandatory clauses", description: "Life insurance contracts in NJ must include mandatory provisions as set by NJ statutes." },
          { label: "Free Look", value: "10 days min", description: "NJ requires minimum 10-day free look period for life policies." },
          { label: "Grace Period", value: "31 days min", description: "31 days minimum — statutory requirement in NJ." },
          { label: "Incontestability", value: "2 years limit", description: "2 years — statutory. Insurer cannot contest after 2 years." },
          { label: "Reinstatement", value: "Typical window", description: "Right to reinstate lapsed policy within specified period upon meeting conditions." },
          { label: "Misstatement of Age", value: "Adjustment", description: "Benefit adjusted — policy not voided." }
      ]},
      { type: "heading", text: "Twisting — NJ Specific (17B:30-6)" },
      { type: "bullets", items: [
          "Twisting = inducing replacement through misrepresentation or incomplete comparison",
          "Applies to ALL replacements where agent uses deception or pressure",
          "Subject to license suspension, revocation, and civil fines",
          "Churning = twisting your OWN client's policy to earn a new commission"
      ]},
      { type: "heading", text: "Suitability of Annuities and Life Products (NJSA 17B:25-34)" },
      { type: "bullets", items: [
          "Before recommending any annuity or life product, agent must perform a suitability analysis",
          "Must consider: age, income, financial situation, tax status, investment objectives, risk tolerance, time horizon, liquidity needs",
          "Enhanced protections for seniors — additional suitability review required",
          "Agent must have reasonable basis to believe the product is suitable for THAT specific client",
          "Documentation of suitability analysis must be maintained"
      ]}
    ]
  },
  master_numbers_drill: {
    title: "MASTER NUMBERS DRILL",
    subtitle: "Every testable number on the NJ exam. Know these cold before you walk in.",
    blocks: [
      { type: "heading", text: "Time Periods — NJ Statutory" },
      { type: "table", rows: [
          { label: "Free Look", value: "10 days", description: "Right to return policy for full refund (NJ minimum)" },
          { label: "Grace Period", value: "31 days", description: "Late premium — policy stays in force" },
          { label: "Incontestability", value: "2 years", description: "Insurer cannot contest after this period" },
          { label: "Suicide Clause", value: "2 years", description: "Return of premium only within this window" },
          { label: "Reinstatement", value: "3 years", description: "Window to reinstate lapsed policy (typical NJ)" },
          { label: "Waiver of Premium", value: "6 months", description: "Must be disabled 6 months before premiums waived" },
          { label: "ADB Window", value: "90 days", description: "Death must occur within 90 days of accident for double benefit" },
          { label: "MEC 7-Pay Test", value: "7 years", description: "Overfund in first 7 years = MEC" },
          { label: "Group Conversion", value: "31 days", description: "Convert group to individual on leaving — no evidence of insurability" }
      ]},
      { type: "heading", text: "Key Numbers — Money and Percentages" },
      { type: "table", rows: [
          { label: "Contributory Participation", value: "75%", description: "75% of eligible employees must participate" },
          { label: "Non-Contributory", value: "100%", description: "100% must be covered when employer pays all premium" },
          { label: "ADB Payout", value: "2x", description: "Double the face amount if accidental death" },
          { label: "MEC Penalty", value: "10%", description: "Early withdrawal penalty before age 59.5" },
          { label: "Tax-Free Group Life", value: "$50K", description: "First $50,000 of employer group life is tax-free to employee" },
          { label: "IRA Limit (2024)", value: "$7,000", description: "Plus $1,000 catch-up if age 50+" },
          { label: "401k Limit (2024)", value: "$23,000", description: "Plus $7,500 catch-up if age 50+" },
          { label: "RMD Age", value: "73", description: "Required minimum distributions begin" },
          { label: "Early Penalty Age", value: "59.5", description: "10% penalty before this age on qualified plans and MECs" }
      ]},
      { type: "heading", text: "NJ-Specific Rules to Know Cold" },
      { type: "table", rows: [
          { label: "Title 17B", value: "NJ Insurance Laws", description: "NJ insurance LAWS — primary life insurance statutes" },
          { label: "Title 17", value: "Additional Laws", description: "Additional NJ insurance LAWS" },
          { label: "Title 11", value: "Administrative Code", description: "NJ Administrative CODE — DOBI regulations implementing the laws" },
          { label: "DOBI", value: "State Regulator", description: "Department of Banking and Insurance — NJ insurance regulator" },
          { label: "McCarran-Ferguson", value: "States regulate", description: "States regulate insurance. Federal law fills gaps only." },
          { label: "Paul v. Virginia", value: "Not interstate commerce", description: "Insurance is NOT interstate commerce (1869 — later reversed)." },
          { label: "South-Eastern Underwriters", value: "Interstate commerce", description: "Insurance IS interstate commerce (1944 — led to McCarran-Ferguson)." },
          { label: "Guaranty Association", value: "Title 17 Chapter 30A", description: "Protects policyholders if insurer fails. Does NOT cover surplus lines or variable products." },
          { label: "Replacement Notice", value: "N.J.A.C. 11:4-2", description: "Required when replacing existing life policy. (11:4-2.1 thru 2.8)" },
          { label: "HIV Testing", value: "Written consent", description: "Written consent required before testing in NJ. Results confidential." },
          { label: "Suitability", value: "NJSA 17B:25-34", description: "Must be documented before selling any annuity or life product." },
          { label: "Business Title Rules", value: "Bulletin No. 09-06", description: "Cannot use misleading designations/titles in marketing." },
          { label: "Credit Life Max", value: "Loan balance limit", description: "Cannot exceed outstanding loan balance. Borrower cannot be required to purchase." },
          { label: "Twisting Statute", value: "17B:30-6", description: "Specific NJ anti-twisting rule." },
          { label: "Group Life NJ", value: "17B:27-1", description: "17B:27-1 thru 8. Mandatory conversion right within 31 days of leaving group." }
      ]},
      { type: "heading", text: "NJ Exam Traps — What They'll Try to Trick You On" },
      { type: "bullets", items: [
          "WARNING: TRAP: 'McCarran-Ferguson means federal law governs insurance.' FALSE — it means STATES govern. Federal law only applies where states have not acted.",
          "WARNING: TRAP: 'A broker represents the insurer.' FALSE — a broker represents the INSURED. An agent represents the insurer.",
          "WARNING: TRAP: 'Guaranty Association covers all insurance products.' FALSE — does NOT cover surplus lines or variable products.",
          "WARNING: TRAP: 'Group conversion allows conversion to term.' FALSE — must convert to permanent (whole life) only.",
          "WARNING: TRAP: 'Replacement is always illegal.' FALSE — replacement is legal. TWISTING is illegal. The difference is whether the agent used misrepresentation.",
          "WARNING: TRAP: 'MEC rules apply only to withdrawals.' FALSE — loans on a MEC are ALSO taxable + 10% penalty. This is the opposite of non-MEC where loans are always tax-free.",
          "WARNING: TRAP: 'Insurable interest must exist at the time of the claim.' FALSE — insurable interest must exist at TIME OF APPLICATION for life insurance.",
          "WARNING: TRAP: 'The conditional receipt guarantees immediate coverage.' FALSE — coverage is conditional on the applicant being found insurable at the standard rate."
      ]},
      { type: "heading", text: "70% to PASS" },
      { type: "callout", kind: "info", text: "You know more than that now. Pass the exam. Get your NJ license. Build the team." }
    ]
  }
};

GUIDES['nj'] = GUIDES['nj_life_producer'];
GUIDES['nj_accident_health'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'new_jersey_laws_rules_and_regulations_common_to_life_accident_and_health_property_and_casualty_insurance': {
    title: 'NEW JERSEY INSURANCE LAWS & REGULATIONS',
    subtitle: 'New Jersey Insurance Code · NJ Insurance Statutes · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'New Jersey State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'NJ Insurance Statutes', description: 'State Regulatory Jurisdiction (4 items)' },
          { label: 'Statutory Standard', value: 'NJ Insurance Statutes', description: 'Definitions (4 items)' },
          { label: 'Statutory Standard', value: 'NJ Insurance Statutes', description: 'Licensing (8 items)' },
          { label: 'Statutory Standard', value: 'NJ Insurance Statutes', description: 'Trade Practices (6 items)' },
          { label: 'Statutory Standard', value: 'NJ Insurance Statutes', description: 'Guaranty Associations (1 item)' },
          { label: 'Statutory Standard', value: 'NJ Insurance Statutes', description: 'Ethics' },
          { label: 'Statutory Standard', value: 'NJ Insurance Statutes', description: 'Fraud (2 items)' },
          { label: 'Statutory Standard', value: 'NJ Insurance Statutes', description: 'Information Privacy' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify New Jersey state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['nj'] = GUIDES['nj_accident_health'];
GUIDES['nm_life_producer'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'new_mexico_insurance_statutes_rules_and_regulations': {
    title: 'NEW MEXICO INSURANCE LAWS & REGULATIONS',
    subtitle: 'New Mexico Insurance Code · NM Insurance Code · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'New Mexico State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'NM Insurance Code', description: 'NM Department of Insurance & Commissioner Powers' },
          { label: 'Statutory Standard', value: 'NM Insurance Code', description: 'NM Producer Licensing Rules (24 CE / 3 Ethics)' },
          { label: 'Statutory Standard', value: 'NM Insurance Code', description: 'NM Unfair Trade Practices (Rebating, Twisting, Misrepresentation)' },
          { label: 'Statutory Standard', value: 'NM Insurance Code', description: 'NM Fiduciary Duties & Premium Accounts' },
          { label: 'Statutory Standard', value: 'NM Insurance Code', description: 'NM Life & Health Insurance Guaranty Association' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify New Mexico state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['nm'] = GUIDES['nm_life_producer'];
GUIDES['ny_series_10_51_life'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'new_york_insurance_statutes_rules_and_regulations': {
    title: 'NEW YORK INSURANCE LAWS & REGULATIONS',
    subtitle: 'New York Insurance Code · NY Insurance Law · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'New York State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'NY Insurance Law', description: 'New York Department of Financial Services (DFS Superintendent Authority - NY Ins. Law § 301)' },
          { label: 'Statutory Standard', value: 'NY Insurance Law', description: 'NY Life Agent Licensing (NY Ins. Law § 2103: 40 prelicensing hrs, 15 CE hrs per cycle)' },
          { label: 'Statutory Standard', value: 'NY Insurance Law', description: 'NY Regulation 60 - Life Insurance & Annuity Replacement Requirements' },
          { label: 'Statutory Standard', value: 'NY Insurance Law', description: 'NY Insurance Law § 2404 - Unfair Methods of Competition, Rebating & Twisting' },
          { label: 'Statutory Standard', value: 'NY Insurance Law', description: 'Life Insurance Company Guaranty Corporation of New York (NY Ins. Law Art. 77)' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify New York state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['ny'] = GUIDES['ny_series_10_51_life'];
GUIDES['nc_life_agent'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'north_carolina_insurance_statutes_rules_and_regulations': {
    title: 'NORTH CAROLINA INSURANCE LAWS & REGULATIONS',
    subtitle: 'North Carolina Insurance Code · NC Insurance Code · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'North Carolina State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'NC Insurance Code', description: 'NC Department of Insurance & Commissioner Powers' },
          { label: 'Statutory Standard', value: 'NC Insurance Code', description: 'NC Producer Licensing Rules (24 CE / 3 Ethics)' },
          { label: 'Statutory Standard', value: 'NC Insurance Code', description: 'NC Unfair Trade Practices (Rebating, Twisting, Misrepresentation)' },
          { label: 'Statutory Standard', value: 'NC Insurance Code', description: 'NC Fiduciary Duties & Premium Accounts' },
          { label: 'Statutory Standard', value: 'NC Insurance Code', description: 'NC Life & Health Insurance Guaranty Association' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify North Carolina state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['nc'] = GUIDES['nc_life_agent'];
GUIDES['nd_life_producer'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'north_dakota_insurance_statutes_rules_and_regulations': {
    title: 'NORTH DAKOTA INSURANCE LAWS & REGULATIONS',
    subtitle: 'North Dakota Insurance Code · ND Insurance Code · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'North Dakota State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'ND Insurance Code', description: 'ND Department of Insurance & Commissioner Powers' },
          { label: 'Statutory Standard', value: 'ND Insurance Code', description: 'ND Producer Licensing Rules (24 CE / 3 Ethics)' },
          { label: 'Statutory Standard', value: 'ND Insurance Code', description: 'ND Unfair Trade Practices (Rebating, Twisting, Misrepresentation)' },
          { label: 'Statutory Standard', value: 'ND Insurance Code', description: 'ND Fiduciary Duties & Premium Accounts' },
          { label: 'Statutory Standard', value: 'ND Insurance Code', description: 'ND Life & Health Insurance Guaranty Association' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify North Dakota state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['nd'] = GUIDES['nd_life_producer'];
GUIDES['oh_life_agent'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'ohio_insurance_statutes_rules_and_regulations': {
    title: 'OHIO INSURANCE LAWS & REGULATIONS',
    subtitle: 'Ohio Insurance Code · OH Insurance Code · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'Ohio State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'OH Insurance Code', description: 'OH Department of Insurance & Commissioner Powers' },
          { label: 'Statutory Standard', value: 'OH Insurance Code', description: 'OH Producer Licensing Rules (24 CE / 3 Ethics)' },
          { label: 'Statutory Standard', value: 'OH Insurance Code', description: 'OH Unfair Trade Practices (Rebating, Twisting, Misrepresentation)' },
          { label: 'Statutory Standard', value: 'OH Insurance Code', description: 'OH Fiduciary Duties & Premium Accounts' },
          { label: 'Statutory Standard', value: 'OH Insurance Code', description: 'OH Life & Health Insurance Guaranty Association' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify Ohio state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['oh'] = GUIDES['oh_life_agent'];
GUIDES['ok_life_producer'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'oklahoma_insurance_statutes_rules_and_regulations': {
    title: 'OKLAHOMA INSURANCE LAWS & REGULATIONS',
    subtitle: 'Oklahoma Insurance Code · OK Insurance Code · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'Oklahoma State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'OK Insurance Code', description: 'OK Department of Insurance & Commissioner Powers' },
          { label: 'Statutory Standard', value: 'OK Insurance Code', description: 'OK Producer Licensing Rules (24 CE / 3 Ethics)' },
          { label: 'Statutory Standard', value: 'OK Insurance Code', description: 'OK Unfair Trade Practices (Rebating, Twisting, Misrepresentation)' },
          { label: 'Statutory Standard', value: 'OK Insurance Code', description: 'OK Fiduciary Duties & Premium Accounts' },
          { label: 'Statutory Standard', value: 'OK Insurance Code', description: 'OK Life & Health Insurance Guaranty Association' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify Oklahoma state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['ok'] = GUIDES['ok_life_producer'];
GUIDES['or_life_producer'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'oregon_insurance_statutes_rules_and_regulations': {
    title: 'OREGON INSURANCE LAWS & REGULATIONS',
    subtitle: 'Oregon Insurance Code · OR Insurance Code · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'Oregon State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'OR Insurance Code', description: 'OR Department of Insurance & Commissioner Powers' },
          { label: 'Statutory Standard', value: 'OR Insurance Code', description: 'OR Producer Licensing Rules (24 CE / 3 Ethics)' },
          { label: 'Statutory Standard', value: 'OR Insurance Code', description: 'OR Unfair Trade Practices (Rebating, Twisting, Misrepresentation)' },
          { label: 'Statutory Standard', value: 'OR Insurance Code', description: 'OR Fiduciary Duties & Premium Accounts' },
          { label: 'Statutory Standard', value: 'OR Insurance Code', description: 'OR Life & Health Insurance Guaranty Association' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify Oregon state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['or'] = GUIDES['or_life_producer'];
GUIDES['pa_life_producer'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'pennsylvania_insurance_statutes_rules_and_regulations': {
    title: 'PENNSYLVANIA INSURANCE LAWS & REGULATIONS',
    subtitle: 'Pennsylvania Insurance Code · 40 P.S. (Pennsylvania Statutes) · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'Pennsylvania State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: '40 P.S. (Pennsylvania Statutes)', description: 'Pennsylvania Insurance Department & Insurance Commissioner Authority (40 P.S. § 41)' },
          { label: 'Statutory Standard', value: '40 P.S. (Pennsylvania Statutes)', description: 'Producer Licensing & 24 Prelicensing Hours (40 P.S. § 310.6; 24 CE / 3 ethics)' },
          { label: 'Statutory Standard', value: '40 P.S. (Pennsylvania Statutes)', description: 'PA Replacement Regulation & Disclosure Notice (31 Pa. Code Ch. 81)' },
          { label: 'Statutory Standard', value: '40 P.S. (Pennsylvania Statutes)', description: 'PA Unfair Insurance Practices Act (40 P.S. § 1171.1: Rebating, Misrepresentation, Twisting)' },
          { label: 'Statutory Standard', value: '40 P.S. (Pennsylvania Statutes)', description: 'Pennsylvania Life & Health Insurance Guaranty Association (40 P.S. § 991.1701)' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify Pennsylvania state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['pa'] = GUIDES['pa_life_producer'];
GUIDES['ri_life_producer'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'rhode_island_insurance_statutes_rules_and_regulations': {
    title: 'RHODE ISLAND INSURANCE LAWS & REGULATIONS',
    subtitle: 'Rhode Island Insurance Code · RI Insurance Code · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'Rhode Island State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'RI Insurance Code', description: 'RI Department of Insurance & Commissioner Powers' },
          { label: 'Statutory Standard', value: 'RI Insurance Code', description: 'RI Producer Licensing Rules (24 CE / 3 Ethics)' },
          { label: 'Statutory Standard', value: 'RI Insurance Code', description: 'RI Unfair Trade Practices (Rebating, Twisting, Misrepresentation)' },
          { label: 'Statutory Standard', value: 'RI Insurance Code', description: 'RI Fiduciary Duties & Premium Accounts' },
          { label: 'Statutory Standard', value: 'RI Insurance Code', description: 'RI Life & Health Insurance Guaranty Association' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify Rhode Island state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['ri'] = GUIDES['ri_life_producer'];
GUIDES['sc_life_producer'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'south_carolina_insurance_statutes_rules_and_regulations': {
    title: 'SOUTH CAROLINA INSURANCE LAWS & REGULATIONS',
    subtitle: 'South Carolina Insurance Code · SC Insurance Code · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'South Carolina State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'SC Insurance Code', description: 'SC Department of Insurance & Commissioner Powers' },
          { label: 'Statutory Standard', value: 'SC Insurance Code', description: 'SC Producer Licensing Rules (24 CE / 3 Ethics)' },
          { label: 'Statutory Standard', value: 'SC Insurance Code', description: 'SC Unfair Trade Practices (Rebating, Twisting, Misrepresentation)' },
          { label: 'Statutory Standard', value: 'SC Insurance Code', description: 'SC Fiduciary Duties & Premium Accounts' },
          { label: 'Statutory Standard', value: 'SC Insurance Code', description: 'SC Life & Health Insurance Guaranty Association' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify South Carolina state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['sc'] = GUIDES['sc_life_producer'];
GUIDES['sd_life_producer'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'south_dakota_insurance_statutes_rules_and_regulations': {
    title: 'SOUTH DAKOTA INSURANCE LAWS & REGULATIONS',
    subtitle: 'South Dakota Insurance Code · SD Insurance Code · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'South Dakota State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'SD Insurance Code', description: 'SD Department of Insurance & Commissioner Powers' },
          { label: 'Statutory Standard', value: 'SD Insurance Code', description: 'SD Producer Licensing Rules (24 CE / 3 Ethics)' },
          { label: 'Statutory Standard', value: 'SD Insurance Code', description: 'SD Unfair Trade Practices (Rebating, Twisting, Misrepresentation)' },
          { label: 'Statutory Standard', value: 'SD Insurance Code', description: 'SD Fiduciary Duties & Premium Accounts' },
          { label: 'Statutory Standard', value: 'SD Insurance Code', description: 'SD Life & Health Insurance Guaranty Association' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify South Dakota state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['sd'] = GUIDES['sd_life_producer'];
GUIDES['tn_life_producer'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'tennessee_insurance_statutes_rules_and_regulations': {
    title: 'TENNESSEE INSURANCE LAWS & REGULATIONS',
    subtitle: 'Tennessee Insurance Code · TN Insurance Code · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'Tennessee State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'TN Insurance Code', description: 'TN Department of Insurance & Commissioner Powers' },
          { label: 'Statutory Standard', value: 'TN Insurance Code', description: 'TN Producer Licensing Rules (24 CE / 3 Ethics)' },
          { label: 'Statutory Standard', value: 'TN Insurance Code', description: 'TN Unfair Trade Practices (Rebating, Twisting, Misrepresentation)' },
          { label: 'Statutory Standard', value: 'TN Insurance Code', description: 'TN Fiduciary Duties & Premium Accounts' },
          { label: 'Statutory Standard', value: 'TN Insurance Code', description: 'TN Life & Health Insurance Guaranty Association' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify Tennessee state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['tn'] = GUIDES['tn_life_producer'];
GUIDES['tx_life_agent'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'texas_insurance_statutes_rules_and_regulations': {
    title: 'TEXAS INSURANCE LAWS & REGULATIONS',
    subtitle: 'Texas Insurance Code · Texas Insurance Code (TIC) · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'Texas State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'Texas Insurance Code (TIC)', description: 'Texas Department of Insurance (TDI) & Commissioner Powers (TIC Ch. 31)' },
          { label: 'Statutory Standard', value: 'Texas Insurance Code (TIC)', description: 'Texas General Life Agent Licensing (TIC Ch. 4001/4054: 24 CE / 2 ethics biennially)' },
          { label: 'Statutory Standard', value: 'Texas Insurance Code (TIC)', description: 'Texas Unfair Competition & Unfair Practices Act (TIC Ch. 541: Rebating, Twisting, Misrepresentation)' },
          { label: 'Statutory Standard', value: 'Texas Insurance Code (TIC)', description: 'Texas Replacement Regulation & Disclosure Notice (TIC Ch. 1114)' },
          { label: 'Statutory Standard', value: 'Texas Insurance Code (TIC)', description: 'Texas Life & Health Insurance Guaranty Association (TIC Ch. 463)' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify Texas state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['tx'] = GUIDES['tx_life_agent'];
GUIDES['ut_life_producer'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'utah_insurance_statutes_rules_and_regulations': {
    title: 'UTAH INSURANCE LAWS & REGULATIONS',
    subtitle: 'Utah Insurance Code · UT Insurance Code · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'Utah State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'UT Insurance Code', description: 'UT Department of Insurance & Commissioner Powers' },
          { label: 'Statutory Standard', value: 'UT Insurance Code', description: 'UT Producer Licensing Rules (24 CE / 3 Ethics)' },
          { label: 'Statutory Standard', value: 'UT Insurance Code', description: 'UT Unfair Trade Practices (Rebating, Twisting, Misrepresentation)' },
          { label: 'Statutory Standard', value: 'UT Insurance Code', description: 'UT Fiduciary Duties & Premium Accounts' },
          { label: 'Statutory Standard', value: 'UT Insurance Code', description: 'UT Life & Health Insurance Guaranty Association' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify Utah state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['ut'] = GUIDES['ut_life_producer'];
GUIDES['vt_life_producer'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'vermont_insurance_statutes_rules_and_regulations': {
    title: 'VERMONT INSURANCE LAWS & REGULATIONS',
    subtitle: 'Vermont Insurance Code · VT Insurance Code · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'Vermont State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'VT Insurance Code', description: 'VT Department of Insurance & Commissioner Powers' },
          { label: 'Statutory Standard', value: 'VT Insurance Code', description: 'VT Producer Licensing Rules (24 CE / 3 Ethics)' },
          { label: 'Statutory Standard', value: 'VT Insurance Code', description: 'VT Unfair Trade Practices (Rebating, Twisting, Misrepresentation)' },
          { label: 'Statutory Standard', value: 'VT Insurance Code', description: 'VT Fiduciary Duties & Premium Accounts' },
          { label: 'Statutory Standard', value: 'VT Insurance Code', description: 'VT Life & Health Insurance Guaranty Association' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify Vermont state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['vt'] = GUIDES['vt_life_producer'];
GUIDES['va_life_annuities'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'virginia_insurance_statutes_rules_and_regulations': {
    title: 'VIRGINIA INSURANCE LAWS & REGULATIONS',
    subtitle: 'Virginia Insurance Code · Va. Code Title 38.2 · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'Virginia State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'Va. Code Title 38.2', description: 'Virginia State Corporation Commission (SCC) Bureau of Insurance Powers (Va. Code § 38.2-200)' },
          { label: 'Statutory Standard', value: 'Va. Code Title 38.2', description: 'Virginia Life Producer Licensing (Va. Code § 38.2-1800: 16 CE hrs single line / 3 ethics)' },
          { label: 'Statutory Standard', value: 'Va. Code Title 38.2', description: 'Virginia Unfair Trade Practices Act (Va. Code § 38.2-500: Rebating, Twisting, Misrepresentation)' },
          { label: 'Statutory Standard', value: 'Va. Code Title 38.2', description: 'Fiduciary Responsibilities & Premium Handling (Va. Code § 38.2-1813)' },
          { label: 'Statutory Standard', value: 'Va. Code Title 38.2', description: 'Virginia Life & Health Insurance Guaranty Association (Va. Code § 38.2-1700)' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify Virginia state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['va'] = GUIDES['va_life_annuities'];
GUIDES['wa_life_producer'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'washington_insurance_statutes_rules_and_regulations': {
    title: 'WASHINGTON INSURANCE LAWS & REGULATIONS',
    subtitle: 'Washington Insurance Code · WA Insurance Code · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'Washington State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'WA Insurance Code', description: 'WA Department of Insurance & Commissioner Powers' },
          { label: 'Statutory Standard', value: 'WA Insurance Code', description: 'WA Producer Licensing Rules (24 CE / 3 Ethics)' },
          { label: 'Statutory Standard', value: 'WA Insurance Code', description: 'WA Unfair Trade Practices (Rebating, Twisting, Misrepresentation)' },
          { label: 'Statutory Standard', value: 'WA Insurance Code', description: 'WA Fiduciary Duties & Premium Accounts' },
          { label: 'Statutory Standard', value: 'WA Insurance Code', description: 'WA Life & Health Insurance Guaranty Association' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify Washington state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['wa'] = GUIDES['wa_life_producer'];
GUIDES['wv_life_producer'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'west_virginia_insurance_statutes_rules_and_regulations': {
    title: 'WEST VIRGINIA INSURANCE LAWS & REGULATIONS',
    subtitle: 'West Virginia Insurance Code · WV Insurance Code · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'West Virginia State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'WV Insurance Code', description: 'WV Department of Insurance & Commissioner Powers' },
          { label: 'Statutory Standard', value: 'WV Insurance Code', description: 'WV Producer Licensing Rules (24 CE / 3 Ethics)' },
          { label: 'Statutory Standard', value: 'WV Insurance Code', description: 'WV Unfair Trade Practices (Rebating, Twisting, Misrepresentation)' },
          { label: 'Statutory Standard', value: 'WV Insurance Code', description: 'WV Fiduciary Duties & Premium Accounts' },
          { label: 'Statutory Standard', value: 'WV Insurance Code', description: 'WV Life & Health Insurance Guaranty Association' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify West Virginia state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['wv'] = GUIDES['wv_life_producer'];
GUIDES['wi_life_producer'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'wisconsin_insurance_statutes_rules_and_regulations': {
    title: 'WISCONSIN INSURANCE LAWS & REGULATIONS',
    subtitle: 'Wisconsin Insurance Code · WI Insurance Code · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'Wisconsin State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'WI Insurance Code', description: 'WI Department of Insurance & Commissioner Powers' },
          { label: 'Statutory Standard', value: 'WI Insurance Code', description: 'WI Producer Licensing Rules (24 CE / 3 Ethics)' },
          { label: 'Statutory Standard', value: 'WI Insurance Code', description: 'WI Unfair Trade Practices (Rebating, Twisting, Misrepresentation)' },
          { label: 'Statutory Standard', value: 'WI Insurance Code', description: 'WI Fiduciary Duties & Premium Accounts' },
          { label: 'Statutory Standard', value: 'WI Insurance Code', description: 'WI Life & Health Insurance Guaranty Association' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify Wisconsin state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['wi'] = GUIDES['wi_life_producer'];
GUIDES['wy_life_producer'] = {
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'wyoming_insurance_statutes_rules_and_regulations': {
    title: 'WYOMING INSURANCE LAWS & REGULATIONS',
    subtitle: 'Wyoming Insurance Code · WY Insurance Code · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'Wyoming State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'WY Insurance Code', description: 'WY Department of Insurance & Commissioner Powers' },
          { label: 'Statutory Standard', value: 'WY Insurance Code', description: 'WY Producer Licensing Rules (24 CE / 3 Ethics)' },
          { label: 'Statutory Standard', value: 'WY Insurance Code', description: 'WY Unfair Trade Practices (Rebating, Twisting, Misrepresentation)' },
          { label: 'Statutory Standard', value: 'WY Insurance Code', description: 'WY Fiduciary Duties & Premium Accounts' },
          { label: 'Statutory Standard', value: 'WY Insurance Code', description: 'WY Life & Health Insurance Guaranty Association' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify Wyoming state-specific statute numbers and DOI regulations prior to your exam.' }
    ]
  }
};

GUIDES['wy'] = GUIDES['wy_life_producer'];

function getStaticGuideSection(lineId, domainName, stateCode, varietyId) {
  const key = domainKey(domainName);
  const isMasterDrill = key === "master_numbers_drill";
  
  // 1. Direct variety lookup
  if (varietyId && GUIDES[varietyId] && GUIDES[varietyId][key]) {
    return GUIDES[varietyId][key];
  }
  
  // 2. State code lookup
  if (stateCode && GUIDES[stateCode.toLowerCase()] && GUIDES[stateCode.toLowerCase()][key]) {
    return GUIDES[stateCode.toLowerCase()][key];
  }
  
  // 3. Fallback to uniform sections
  if (UNIFORM_SECTIONS[key]) {
    return UNIFORM_SECTIONS[key];
  }
  
  // 4. Fuzzy fallback matching
  const allGuides = (varietyId && GUIDES[varietyId]) || (stateCode && GUIDES[stateCode.toLowerCase()]);
  if (allGuides) {
    const matchedKey = Object.keys(allGuides).find(k => k.includes(key.slice(0, 10)) || key.includes(k.slice(0, 10)));
    if (matchedKey) return allGuides[matchedKey];
  }
  
  // 5. Dynamic section fallback
  return {
    title: (domainName || "EXAM DOMAIN").toUpperCase(),
    subtitle: `Study guide section for ${stateCode || ""} ${lineId || ""}`,
    blocks: [
      { type: "heading", text: `${domainName} — Core Requirements` },
      { type: "table", rows: [
        { label: "State Focus", value: stateCode || "State DOI", description: `Review specific state statutes and handbook provisions for ${domainName}.` },
        { label: "Exam Standard", value: "NAIC / Statute", description: "Master mandatory policy provisions, time limits, and regulatory rules." }
      ]},
      { type: "callout", kind: "info", text: `Study Tip: Review key definitions, time limits, and statutory penalties for ${domainName}.` }
    ]
  };
}

if (typeof window !== "undefined") {
  window.LicensingStudyGuides = { GUIDES, domainKey, getStaticGuideSection };
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { GUIDES, domainKey, getStaticGuideSection };
}

})();
