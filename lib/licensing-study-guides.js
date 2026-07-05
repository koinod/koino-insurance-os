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
  i_types_of_policies: UNIFORM_SECTIONS.i_types_of_policies,
  ii_life_provisions_riders_options_and_exclusions: UNIFORM_SECTIONS.ii_life_provisions_riders_options_and_exclusions,
  iii_completing_the_application_underwriting_and_delivering_the_policy: UNIFORM_SECTIONS.iii_completing_the_application_underwriting_and_delivering_the_policy,
  iv_retirement_tax_and_other_insurance_concepts: UNIFORM_SECTIONS.iv_retirement_tax_and_other_insurance_concepts,
  'new_jersey_insurance_statutes_rules_and_regulations': {
    title: 'NEW JERSEY INSURANCE LAWS & REGULATIONS',
    subtitle: 'New Jersey Insurance Code · N.J.S.A. Title 17B · Licensing, CE & Unfair Trade Practices',
    blocks: [
      { type: 'heading', text: 'New Jersey State Law Requirements' },
      { type: 'table', rows: [
          { label: 'Statutory Standard', value: 'N.J.S.A. Title 17B', description: 'New Jersey Department of Banking & Insurance (DOBI Commissioner Powers - N.J.S.A. 17:1C-19)' },
          { label: 'Statutory Standard', value: 'N.J.S.A. Title 17B', description: 'NJ Life Producer Licensing (N.J.S.A. 17B:22A-1: 20 prelicensing hrs, 24 CE / 3 ethics biennially)' },
          { label: 'Statutory Standard', value: 'N.J.S.A. Title 17B', description: 'NJ Replacement Regulations & 30-Day Free Look (N.J.A.C. 11:2-13)' },
          { label: 'Statutory Standard', value: 'N.J.S.A. Title 17B', description: 'NJ Unfair Trade Practices & Rebating Prohibition (N.J.S.A. 17B:30-1)' },
          { label: 'Statutory Standard', value: 'N.J.S.A. Title 17B', description: 'New Jersey Life & Health Insurance Guaranty Association (N.J.S.A. 17B:32A-1)' }
      ]},
      { type: 'callout', kind: 'warning', text: '■ Note: Always verify New Jersey state-specific statute numbers and DOI regulations prior to your exam.' }
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
