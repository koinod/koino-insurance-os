/* lib/licensing-study-guides.js
   Hardcoded, curated study guide sections for the major licensing exam lines.
   These load instantly — no LLM call required.
*/
(function () {

// Helper to slugify domain names to lookup keys
function domainKey(domain) {
  return (domain || "").toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

// Master hardcoded study guide bank.
const GUIDES = {

  /* ══════════════════════════════════════════════════════════
     NEW JERSEY LIFE & ANNUITIES PRODUCER (PSI 83-ITEM EXAM)
     ══════════════════════════════════════════════════════════ */
  nj_life_producer: {
    types_of_policies: {
      title: "TYPES OF POLICIES (NJ LIFE & ANNUITIES)",
      subtitle: "Traditional whole life · interest-sensitive products · term life · annuities · combination plans",
      blocks: [
        { type: "heading", text: "Traditional Whole Life Products (1.1)" },
        { type: "table", rows: [
          { label: "Ordinary (straight) life", value: "Level premium to age 100", description: "Guaranteed death benefit and cash value accumulation to age 100. Lowest annual premium of whole life policies." },
          { label: "Limited-pay life", value: "Paid-up at set age/year", description: "Premiums paid over specified period (e.g. 20-Pay Life, Life Paid-Up at 65). Higher early premiums, zero premiums due after pay period." },
          { label: "Single-premium life", value: "1 lump-sum payment", description: "Immediate cash value created. Policy is automatically classified as a Modified Endowment Contract (MEC) under IRS tax law." },
          { label: "Adjustable life", value: "Flexible features", description: "Policyowner can change face amount, premium amount, or period of protection as financial needs evolve." },
        ]},
        { type: "heading", text: "Interest-Sensitive Life Products (1.2)" },
        { type: "table", rows: [
          { label: "Universal life (UL)", value: "Unbundled components", description: "Flexible premium and adjustable death benefit. Separates insurance cost, administration fees, and interest earned on cash value." },
          { label: "Variable whole life", value: "Fixed premium + separate account", description: "Premiums invested in equities/bonds separate account. Guaranteed minimum death benefit; cash value varies with investment performance." },
          { label: "Variable universal life (VUL)", value: "Flexible premium + subaccounts", description: "Combines UL premium flexibility with variable investment choices. NO guaranteed cash value floor." },
          { label: "Interest-sensitive whole life", value: "Fixed premium + current interest", description: "Cash value growth tied to current market interest rates. Insurer may adjust premium or dividends based on performance." },
        ]},
        { type: "heading", text: "Term Life & Special Features (1.3)" },
        { type: "table", rows: [
          { label: "Level term", value: "Constant benefit & premium", description: "Death benefit and premium remain unchanged for 10, 20, or 30 years." },
          { label: "Decreasing term", value: "Declining face amount", description: "Face amount decreases over time (often used for mortgage protection). Premium stays level." },
          { label: "Increasing term", value: "Growing face amount", description: "Death benefit increases over time; typically sold as a rider for cost-of-living or return of premium." },
          { label: "Renewable feature", value: "No evidence of insurability", description: "Right to renew policy at expiration without proof of health. Premium increases based on attained age." },
          { label: "Convertible feature", value: "Term to permanent conversion", description: "Right to convert term to permanent policy (Whole/UL) without medical exam. Premium based on attained or original age." },
        ]},
        { type: "callout", kind: "test_trick", text: "PSI Exam Tip: In New Jersey, fixed annuities are tested and sold under the Life Producer line of authority. Producers do NOT need a separate annuity license, but MUST complete a one-time 4-hour NAIC Model 275 Best Interest training." },
        { type: "heading", text: "Annuities (1.4)" },
        { type: "table", rows: [
          { label: "Premium payment modes", value: "Single, Level, Flexible", description: "Single premium (lump sum) vs recurring level/flexible payments into accumulation phase." },
          { label: "Immediate vs Deferred", value: "Payment timing", description: "Immediate: Payouts begin within 1 year/period. Deferred: Accumulation phase precedes payout phase." },
          { label: "Fixed annuity", value: "Guaranteed rate", description: "Insurer bears investment risk; cash value grows at guaranteed interest rate backed by general account." },
          { label: "Variable annuity", value: "Separate account subaccounts", description: "Annuitant bears investment risk; returns tied to stock/bond subaccount performance. Requires FINRA Series 6/7." },
          { label: "Equity index annuity", value: "S&P 500 index link", description: "Yields linked to stock market index with guaranteed minimum floor (e.g. 0%-1%). Protected against market loss." },
        ]},
        { type: "heading", text: "Combination Plans (1.5)" },
        { type: "table", rows: [
          { label: "Joint life (First-to-die)", value: "Pays on 1st death", description: "Covers 2+ lives. Pays death benefit upon the death of the FIRST insured only; policy then terminates." },
          { label: "Survivorship life (Second-to-die)", value: "Pays on 2nd death", description: "Covers 2+ lives. Pays death benefit only when the LAST surviving insured dies. Commonly used for estate planning." },
        ]}
      ]
    },

    policy_riders_provisions_options_and_exclusions: {
      title: "POLICY RIDERS, PROVISIONS, OPTIONS & EXCLUSIONS",
      subtitle: "Standard provisions · policy riders · nonforfeiture · settlement options · exclusions",
      blocks: [
        { type: "heading", text: "Policy Provisions & Options (2.2)" },
        { type: "table", rows: [
          { label: "Entire Contract", value: "Policy + Application", description: "The policy, attached application, and riders constitute the complete agreement. No outside verbal promises apply." },
          { label: "Insuring Clause", value: "Core promise to pay", description: "Insurer's agreement to pay the face amount upon proof of death." },
          { label: "Free Look", value: "10 days (30 for replacement)", description: "Unconditional right to return policy for 100% refund of premium within 10 days of delivery (30 days for replacement policies)." },
          { label: "Consideration", value: "Premium + Application answers", description: "Applicant's consideration = premium + truthful application statements; Insurer's consideration = promise to pay claims." },
          { label: "Owner's Rights", value: "Policy ownership", description: "Right to name beneficiary, select settlement options, assign policy, take loans, and receive dividends." },
          { label: "Grace Period", value: "31 days", description: "31-day window after premium due date during which policy remains in force. If death occurs, unpaid premium is deducted from claim." },
          { label: "Reinstatement", value: "3 years max", description: "Restores lapsed policy upon paying back premiums + interest and providing proof of insurability." },
          { label: "Incontestability", value: "2 years", description: "Insurer cannot contest policy statements after 2 years in force, except for nonpayment of premium." },
          { label: "Misstatement of Age & Gender", value: "Adjust benefit amount", description: "Insurer adjusts death benefit to match what premium paid would have purchased at correct age/gender. Policy is NEVER voided." },
        ]},
        { type: "heading", text: "Beneficiary Designations" },
        { type: "table", rows: [
          { label: "Primary vs Contingent", value: "Order of payout", description: "Primary receives proceeds first. Contingent receives proceeds only if Primary predeceases the insured." },
          { label: "Revocable vs Irrevocable", value: "Change permissions", description: "Revocable: owner can change beneficiary anytime. Irrevocable: requires beneficiary written consent to change designation or take policy loan." },
          { label: "Common Disaster Clause", value: "Uniform Simultaneous Death", description: "Assumes primary beneficiary died first if death occurs within 30-60 days of common accident; proceeds go to contingent." },
          { label: "Minor Beneficiaries", value: "Guardian required", description: "Insurance proceeds cannot be paid directly to minors; must be paid to legal guardian or trust." },
        ]},
        { type: "heading", text: "Policy Riders (2.1)" },
        { type: "table", rows: [
          { label: "Waiver of Premium", value: "Waives premium during disability", description: "Waives premiums if insured is totally disabled for 6 months; retroactive reimbursement provided." },
          { label: "Waiver with Disability Income", value: "Waives premium + monthly stipend", description: "Waives premiums AND pays monthly income benefit to insured during total disability." },
          { label: "Guaranteed Insurability (GIR)", value: "Buy more without medical exam", description: "Allows purchase of additional coverage at specified future ages/events (marriage, birth) without proof of health." },
          { label: "Payor Benefit", value: "Juvenile policy protection", description: "Waives premiums if payor (parent) dies or becomes disabled before child reaches specified age (usually 21)." },
          { label: "Accidental Death & Dismemberment", value: "Double / Triple Indemnity", description: "Pays multiple of face value if death occurs within 90 days of an accidental injury. Dismemberment pays portion." },
          { label: "Term Riders", value: "Add temporary coverage", description: "Attaches term life coverage to permanent policy for spouse, children, or additional insured." },
          { label: "Cost of Living (COLA)", value: "Inflation adjustment", description: "Increases face amount automatically based on Consumer Price Index (CPI) without medical exam." },
        ]},
        { type: "callout", kind: "test_trick", text: "Nonforfeiture Rule: Extended Term is the DEFAULT nonforfeiture option if none is selected. Extended Term provides the maximum death benefit (same face amount as original policy)." },
        { type: "heading", text: "Nonforfeiture Options & Dividends" },
        { type: "table", rows: [
          { label: "Cash Surrender", value: "Take cash value", description: "Policy is surrendered; insurer pays cash value minus loans/fees. Coverage terminates." },
          { label: "Reduced Paid-Up", value: "Paid-up policy to age 100", description: "Cash value buys a smaller face amount permanent policy. No further premiums ever due." },
          { label: "Extended Term", value: "Same face amount, level term", description: "Cash value buys a level term policy equal to original face amount for as long a term as cash permits." },
          { label: "Dividend Options (CRAPO)", value: "Cash, Reduce premium, Accumulate, Paid-up, One-year term", description: "Dividends are tax-free return of excess premium. Options: Cash, Reduce premium, Accumulate at interest (interest is taxable), Paid-up additions, One-year term." },
        ]},
        { type: "heading", text: "Settlement Options & Exclusions (2.3)" },
        { type: "table", rows: [
          { label: "Settlement Options", value: "Lump sum, Interest, Fixed period, Fixed amount, Life income", description: "Lump sum (default, tax-free); Interest only; Fixed Period; Fixed Amount; Life Income (guaranteed lifetime payout)." },
          { label: "Policy Exclusions", value: "Suicide, War, Aviation", description: "Suicide clause (2-year limit in NJ; refund of premiums if within 2 years); War / Military service; Aviation (non-commercial pilots)." },
        ]}
      ]
    },

    completing_the_application_underwriting_and_delivering_the_policy: {
      title: "APPLICATION, UNDERWRITING & POLICY DELIVERY",
      subtitle: "Field underwriting · FCRA · HIPAA & HIV consent · policy delivery mechanics",
      blocks: [
        { type: "heading", text: "Completing the Application (3.1)" },
        { type: "table", rows: [
          { label: "Required Signatures", value: "Agent, Insured, Owner", description: "Application must be signed by producer, proposed insured, and policyowner (if different from insured)." },
          { label: "Changes on Application", value: "Must be initialed", description: "Corrections must be initialed by applicant. Erasing or using correction fluid is prohibited." },
          { label: "Incomplete Applications", value: "Return or waive", description: "Insurer waives right to info if policy is issued with unanswered questions." },
          { label: "Warranties vs Representations", value: "Representations = belief", description: "Application responses are representations (believed true to best of knowledge). Warranties are guaranteed true facts." },
          { label: "Conditional Receipt", value: "Coverage timing", description: "Coverage effective on application date or medical exam date (whichever is later), IF applicant is an acceptable risk." },
          { label: "Disclosures at Point of Sale", value: "HIPAA & HIV Consent", description: "Must provide written HIPAA privacy notice and obtain written consent before conducting HIV testing." },
        ]},
        { type: "heading", text: "Underwriting & Consumer Reports (3.2)" },
        { type: "table", rows: [
          { label: "Insurable Interest", value: "At time of application", description: "Applicant must face financial loss upon insured's death. Must exist AT APPLICATION (not required at time of death)." },
          { label: "Fair Credit Reporting Act (FCRA)", value: "Written notice required", description: "Insurer must notify applicant in writing if credit or investigative consumer report is ordered." },
          { label: "Medical Information Bureau (MIB)", value: "Central health bank", description: "Non-profit MIB collects medical data. MIB report CANNOT be the sole basis for declining an applicant." },
          { label: "Risk Classifications", value: "Preferred, Standard, Substandard, Declined", description: "Preferred (lowest rate), Standard (average), Substandard/Rated (higher premium), Declined (uninsurable)." },
        ]},
        { type: "heading", text: "Delivering the Policy & Telemarketing (3.3 & 3.4)" },
        { type: "table", rows: [
          { label: "When Coverage Begins", value: "Premium + App / Delivery", description: "If premium paid with app + conditional receipt → app/exam date. If premium paid at delivery → delivery date + Statement of Good Health." },
          { label: "Statement of Good Health", value: "Required if no premium with app", description: "Insured signs statement upon delivery verifying health has not deteriorated since application date." },
          { label: "Do Not Call Registry", value: "8 AM to 9 PM local time", description: "Telemarketing calls permitted only between 8:00 AM and 9:00 PM. Established business relationships valid up to 18 months." },
        ]}
      ]
    },

    taxes_retirement_and_other_insurance_concepts: {
      title: "TAXES, RETIREMENT & OTHER INSURANCE CONCEPTS",
      subtitle: "Tax treatment of proceeds & premiums · MEC rules · qualified plans · business insurance",
      blocks: [
        { type: "heading", text: "Tax Treatment of Life Insurance (4.6)" },
        { type: "table", rows: [
          { label: "Death Benefit Proceeds", value: "100% Income Tax-Free", description: "Lump-sum death benefit proceeds paid to a named beneficiary are received income tax-free." },
          { label: "Cash Value Growth", value: "Tax-deferred", description: "Cash value accumulation grows tax-deferred while inside the policy." },
          { label: "Policy Loans", value: "Not taxable", description: "Loans taken against cash value are non-taxable as long as policy remains in force." },
          { label: "Surrender of Policy", value: "Taxed on gain above basis", description: "Amount received over total premiums paid (cost basis) is taxable as ordinary income." },
          { label: "Dividends", value: "Tax-free return of premium", description: "Policy dividends are non-taxable excess premium refunds. Interest earned on accumulated dividends IS taxable." },
        ]},
        { type: "heading", text: "Modified Endowment Contracts (MECs)" },
        { type: "table", rows: [
          { label: "7-Pay Test", value: "Overfunded policy check", description: "If cumulative premiums paid in first 7 years exceed 7-pay net level premiums, policy becomes a MEC." },
          { label: "Tax Consequences", value: "LIFO taxation", description: "Withdrawals and policy loans taxed on Earnings First (LIFO). 10% IRS penalty applies for withdrawals before age 59½." },
          { label: "Permanent Status", value: "Once a MEC, always a MEC", description: "MEC classification can NEVER be reversed or undone." },
        ]},
        { type: "heading", text: "Retirement Plans & Group Life (4.2 & 4.3)" },
        { type: "table", rows: [
          { label: "Qualified vs Nonqualified Plans", value: "Tax-deductible vs After-tax", description: "Qualified: IRS approved, tax-deductible contributions, tax-deferred growth, 100% taxable withdrawals (IRA, 401k, 403b). Nonqualified: after-tax funding, no IRS approval required." },
          { label: "Group Life Conversion", value: "31-day conversion window", description: "Terminated employee can convert group term to individual permanent policy within 31 days without proof of insurability." },
          { label: "Contributory vs Noncontributory", value: "75% vs 100% participation", description: "Contributory: employee pays part of premium (requires 75% participation). Noncontributory: employer pays 100% (requires 100% participation)." },
          { label: "Business Insurance (4.4)", value: "Key Person & Buy-Sell", description: "Key Person: business owns/pays/receives death benefit on key employee (premiums non-deductible, benefit tax-free). Buy-Sell: funds business transfer upon death." },
          { label: "Accelerated Living Benefits (4.7)", value: "Tax-free living payout", description: "Allows terminally ill insured to receive portion of death benefit prior to death tax-free." },
        ]}
      ]
    },

    new_jersey_laws_rules_and_regulations_common_to_life_health_property_and_casualty: {
      title: "NEW JERSEY LAWS & REGULATIONS — COMMON RULES",
      subtitle: "DOBI jurisdiction · Commissioner powers · producer licensing rules · trade practices · fraud",
      blocks: [
        { type: "heading", text: "State Regulatory Jurisdiction & Federal Foundation (5.1)" },
        { type: "table", rows: [
          { label: "Department of Banking & Insurance", value: "NJ DOBI", description: "Headed by Commissioner of Banking and Insurance. Regulates insurance industry, enforces Title 17, 17B, and Title 11 regulations." },
          { label: "Broad Powers of Commissioner", value: "N.J.S.A. 17:1-8.1, 17:22A-45", description: "Conduct investigations, issue subpoenas, administer oaths, issue Cease and Desist orders, levy administrative fines." },
          { label: "Notice and Hearing", value: "10 days minimum notice", description: "Commissioner must give at least 10 days written notice prior to conducting a formal disciplinary hearing (N.J.S.A. 17:22A-45)." },
          { label: "Penalties", value: "Up to $5,000 / $10,000", description: "First offense up to $5,000; subsequent offenses up to $10,000 per violation under N.J.S.A. 17:22A-45." },
          { label: "Paul v. Virginia (1869)", value: "State regulation", description: "US Supreme Court held that insurance is NOT interstate commerce; affirmed state regulation power." },
          { label: "US v. SEUA (1944)", value: "Interstate commerce", description: "Overturned Paul v. Virginia; ruled insurance IS interstate commerce subject to federal antitrust laws." },
          { label: "McCarran-Ferguson Act (1945)", value: "Public Law 15", description: "Congress declared that state regulation of insurance is in public interest. Federal law applies only to extent state law does not." },
        ]},
        { type: "heading", text: "Definitions & Producer Roles (5.2)" },
        { type: "table", rows: [
          { label: "Insurance-Related Conduct", value: "N.J.A.C. 11:17-1.2", description: "Selling, soliciting, negotiating, taking applications, collecting premiums, binding coverage, explaining policy terms." },
          { label: "Domestic, Foreign, Alien", value: "N.J.S.A. 17B:17-7", description: "Domestic = incorporated in NJ. Foreign = incorporated in another US state. Alien = incorporated outside the USA." },
          { label: "Stock vs Mutual Company", value: "N.J.S.A. 17B:18-2,3", description: "Stock = owned by stockholders (non-participating). Mutual = owned by policyholders (participating dividends)." },
          { label: "Certificate of Authority", value: "Authorized / Admitted", description: "License issued by DOBI allowing an insurer to transact business in New Jersey." },
          { label: "Insurance Agent", value: "Represents Insurer", description: "Acts under written appointment by insurer. Insurer is responsible for agent acts (N.J.S.A. 17:22A-28, 11:17B-1.3)." },
          { label: "Insurance Broker", value: "Represents Client", description: "Acts on behalf of insured/buyer. Owes fiduciary duty to client." },
          { label: "Insurance Consultant", value: "Fee-for-service advisor", description: "Advises clients under written fee agreement (N.J.S.A. 17:22A-28)." },
          { label: "Sell, Solicit, Negotiate", value: "Core producer acts", description: "Sell = exchange contract for money. Solicit = urge person to apply. Negotiate = confer directly with buyer regarding policy terms." },
        ]},
        { type: "heading", text: "Licensing Requirements & Rules (5.3)" },
        { type: "table", rows: [
          { label: "Prelicensing Education", value: "20 hours per line", description: "Must complete 20 hours of DOBI-approved prelicensing education per line of authority (N.J.A.C. 11:17-3)." },
          { label: "Temporary Work Authority (TWA)", value: "Valid up to 60 days", description: "Issued upon passing exam and fingerprinting to allow applicant to work while formal license is issued (N.J.A.C. 11:17-2.1)." },
          { label: "Producer License Duration", value: "2 years", description: "License renews biennially. Requires 24 hours of Continuing Education (CE), including 3 hours of Ethics (N.J.A.C. 11:17-2.5)." },
          { label: "Change of Address / Name", value: "30 days notice", description: "Licensee must notify DOBI within 30 days of any change of business, residence, or email address (N.J.A.C. 11:17-2.7)." },
          { label: "Branch Offices", value: "30 days prior notice", description: "Must notify DOBI at least 30 days BEFORE opening or closing a branch office (N.J.A.C. 11:17-2.8)." },
          { label: "Disabled/Deceased Producer", value: "Temporary license (180 days)", description: "DOBI may issue temporary license up to 180 days to surviving spouse/executor to service business (N.J.S.A. 17:22A-37)." },
        ]},
        { type: "heading", text: "Trade Practices, Fraud & Guaranty Association (5.4 - 5.6)" },
        { type: "table", rows: [
          { label: "Unfair Trade Practices", value: "N.J.S.A. 17:29B", description: "Prohibits Misrepresentation, Twisting, Churning, Rebating, Defamation, Boycott/Coercion, and Unfair Discrimination." },
          { label: "Insurance Fraud Prevention Act", value: "N.J.S.A. 17:33A", description: "Civil fines up to $5,000 1st violation, $10,000 2nd, $15,000 subsequent. Producers must report suspected fraud to Bureau of Fraud Deterrence." },
          { label: "Information Privacy", value: "N.J.S.A. 17:23A / HIPAA", description: "Mandates written privacy notices and customer opt-out rights for disclosure of personal medical/financial information." },
          { label: "Guaranty Association", value: "Title 17 Chapter 30A", description: "Protects policyholders against insolvent insurance companies. Mentioning Guaranty Association in sales is STRICTLY PROHIBITED!" },
        ]}
      ]
    },

    new_jersey_laws_rules_and_regulations_pertinent_to_life_and_annuities: {
      title: "NJ LAWS & RULES — LIFE & ANNUITIES",
      subtitle: "Replacement rules (11:4-2) · Bulletin 09-06 suitability · title rules · credit & group life",
      blocks: [
        { type: "heading", text: "New Jersey Life Replacement Regulation (6.0 & N.J.A.C. 11:4-2)" },
        { type: "table", rows: [
          { label: "Replacement Definition", value: "N.J.A.C. 11:4-2.1", description: "Any transaction in which new life insurance or annuity is purchased, and existing policy will be lapsed, surrendered, borrowed against, or converted." },
          { label: "Notice Regarding Replacement", value: "Signed at application", description: "Producer must deliver signed Notice Regarding Replacement to applicant BEFORE taking application. Copy retained by producer for 5 years." },
          { label: "Replacing Insurer Duties", value: "5 business days notice", description: "Replacing insurer must notify existing insurer within 5 business days and provide policy comparison summary upon request." },
          { label: "Free Look Extension", value: "30-Day Free Look", description: "Replacement policies in New Jersey MUST provide a 30-day unconditional free-look period (compared to standard 10 days)." },
        ]},
        { type: "heading", text: "Suitability of Annuities & Life Products (Bulletin 09-06 & N.J.S.A. 17B:25-34)" },
        { type: "table", rows: [
          { label: "NAIC Best Interest Standard", value: "Bulletin 09-06", description: "Producers must act in the BEST INTEREST of the consumer without placing producer financial gain above client interest." },
          { label: "4-Hour One-Time Training", value: "Mandatory for Annuities", description: "Producers MUST complete a 4-credit DOBI-approved Annuity Best Interest course BEFORE soliciting annuities in New Jersey." },
          { label: "Suitability Information", value: "Gather prior to recommendation", description: "Must collect consumer financial status, tax status, investment objectives, liquidity needs, age, time horizon, and risk tolerance." },
          { label: "Record Retention", value: "5 years minimum", description: "Insurers and producers must retain annuity suitability compliance records for at least 5 years." },
        ]},
        { type: "heading", text: "Professional Designations & Business Titles (Bulletin 09-06 & N.J.S.A. 17B:25-36)" },
        { type: "table", rows: [
          { label: "Prohibited Business Titles", value: "Misleading senior titles", description: "Producers CANNOT use unearned, self-created, or misleading senior professional designations (e.g. 'Senior Financial Advisor') to deceive elders." },
          { label: "Advertising & Disclosure Rules", value: "N.J.A.C. 11:2-23", description: "All life and annuity ads must clearly state insurance nature, reveal insurer name, and avoid false government affiliations." },
        ]},
        { type: "heading", text: "Group Life, Credit Life & Contracts (6.0)" },
        { type: "table", rows: [
          { label: "Group Life Insurance", value: "N.J.S.A. 17B:27", description: "Employer group rules; employee 31-day conversion privilege to individual permanent policy upon termination without evidence of insurability." },
          { label: "Credit Life Insurance", value: "N.J.A.C. 11:2-3", description: "Coverage issued on debtor; face amount cannot exceed initial debt balance; term cannot exceed loan period." },
          { label: "Twisting Prohibition", value: "N.J.S.A. 17B:30-6", description: "Making misleading statements or incomplete comparisons to induce lapse or surrender of an existing policy is illegal." },
        ]}
      ]
    },

    master_numbers_drill: {
      title: "NEW JERSEY MASTER NUMBERS DRILL",
      subtitle: "All key numbers, timeframes, penalties, and limits for the NJ Life & Annuities exam",
      blocks: [
        { type: "heading", text: "Time Periods & Deadlines to Memorize" },
        { type: "table", rows: [
          { label: "Standard Free Look Period", value: "10 days", description: "Unconditional right to review and return policy for 100% refund." },
          { label: "Replacement Policy Free Look", value: "30 days", description: "Extended free-look window required for replacement policies in NJ." },
          { label: "Grace Period", value: "31 days", description: "Time to pay late premium while policy stays in force." },
          { label: "Group Life Conversion Window", value: "31 days", description: "Time allowed for terminated employee to convert group term to permanent policy." },
          { label: "Incontestability Clause", value: "2 years", description: "Insurer cannot contest statements on application after 2 years." },
          { label: "Suicide Exclusion Clause", value: "2 years", description: "If suicide occurs within 2 years, insurer refunds premiums paid only." },
          { label: "Notice of Hearing (DOBI)", value: "10 days minimum", description: "Written notice required before Commissioner conducts disciplinary hearing." },
          { label: "Address / Email Change Notice", value: "30 days", description: "Time limit to notify DOBI of change in residence, business, or email address." },
          { label: "Branch Office Notice", value: "30 days prior", description: "Time limit to notify DOBI BEFORE opening or closing a branch office." },
          { label: "Replacing Insurer Notice to Existing Insurer", value: "5 business days", description: "Notice window for replacing insurer to inform existing insurer of replacement." },
          { label: "Temporary Work Authority (TWA)", value: "60 days max", description: "Validity of temporary work authority issued while license is processed." },
          { label: "Temporary License (Disabled/Deceased)", value: "180 days max", description: "Validity of temporary license issued to surviving spouse/executor." },
        ]},
        { type: "heading", text: "Hours, Fees, Scores & Penalties" },
        { type: "table", rows: [
          { label: "Prelicensing Education Hours", value: "20 hours per line", description: "20 hours required for Life; 20 hours required for Health." },
          { label: "Continuing Education (CE) Hours", value: "24 hours / 2 years", description: "Total CE required per biennial renewal cycle." },
          { label: "CE Ethics Requirement", value: "3 hours", description: "Mandatory ethics CE hours required per cycle in NJ." },
          { label: "NAIC Annuity Training", value: "4 hours (one-time)", description: "Mandatory Annuity Best Interest training required before selling annuities." },
          { label: "Life Producer Exam Items (PSI)", value: "83 items", description: "Total scored questions on the PSI NJ Life Producer Exam." },
          { label: "Exam Time Allowed", value: "3.5 hours (210 mins)", description: "Time allowed for the PSI NJ Life Producer Exam." },
          { label: "Passing Score (Producer)", value: "70%", description: "Minimum score required to pass producer exam (59/83 correct)." },
          { label: "Passing Score (Instructor)", value: "85%", description: "Minimum score required to pass instructor exam." },
          { label: "First Offense Penalty (17:22A-45)", value: "Up to $5,000", description: "Maximum administrative fine for first insurance law violation." },
          { label: "Subsequent Offense Penalty", value: "Up to $10,000", description: "Maximum administrative fine per subsequent violation." },
          { label: "NJ Insurance Fraud Fines (17:33A)", value: "$5k / $10k / $15k", description: "1st offense up to $5,000; 2nd up to $10,000; 3rd+ up to $15,000." },
        ]}
      ]
    }
  },

  /* ══════════════════════════════════════════════════════════
     LIFE LINE
     ══════════════════════════════════════════════════════════ */
  life: {
    insurance_regulation: {
      title: "INSURANCE REGULATION",
      subtitle: "State DOI authority · licensing law · unfair trade practices · penalties",
      blocks: [
        { type: "heading", text: "State Department of Insurance (DOI)" },
        { type: "table", rows: [
          { label: "Commissioner/Director", value: null, description: "Elected or appointed official who heads the state DOI; enforces insurance laws." },
          { label: "DOI authority", value: null, description: "Regulate insurers, agents, rates, forms, and market conduct within the state." },
          { label: "Market conduct exam", value: null, description: "DOI examines insurer business practices; can result in fines or license suspension." },
          { label: "Cease and desist", value: null, description: "DOI order requiring an insurer or agent to stop an illegal practice immediately." },
        ]},
        { type: "heading", text: "Producer Licensing" },
        { type: "table", rows: [
          { label: "License types", value: null, description: "Producer (agent), adjuster, broker — must hold a license for each line of authority." },
          { label: "Appointment", value: null, description: "Insurer must file an appointment for the producer before the agent can sell that company's products." },
          { label: "License renewal", value: "Every 2 years", description: "Requires continuing education (CE) hours (typically 24 hours including ethics)." },
        ]},
        { type: "heading", text: "Unfair Trade Practices (NAIC UTPA Model)" },
        { type: "table", rows: [
          { label: "Misrepresentation", value: null, description: "False or misleading statements about policy benefits, terms, or insurer condition." },
          { label: "Twisting", value: null, description: "Inducing a policyholder to lapse or surrender a policy in favor of another through misrepresentation." },
          { label: "Churning", value: null, description: "Using a policy's own values to buy another policy with the same insurer unnecessarily." },
          { label: "Rebating", value: null, description: "Giving anything of value not specified in the policy as an inducement to purchase." },
        ]}
      ]
    },
    general_insurance_concepts: {
      title: "GENERAL INSURANCE CONCEPTS",
      subtitle: "Contract law · risk principles · insurable interest · underwriting",
      blocks: [
        { type: "heading", text: "Basics of Risk" },
        { type: "table", rows: [
          { label: "Pure risk", value: "Only chance of loss", description: "Insurable risk (death, accident, fire). No chance of gain." },
          { label: "Speculative risk", value: "Loss or gain", description: "Not insurable (gambling, stock investments)." },
          { label: "Risk transfer", value: "Core purpose", description: "Shifting financial risk from individual to insurer via insurance contract." },
        ]},
        { type: "heading", text: "Contract Characteristics" },
        { type: "table", rows: [
          { label: "Aleatory", value: "Unequal exchange", description: "Premium paid is small compared to potential payout." },
          { label: "Adhesion", value: "Take it or leave it", description: "Insurer writes contract; any ambiguity favors the insured." },
          { label: "Unilateral", value: "One promise", description: "Only insurer makes legally enforceable promise to pay." },
          { label: "Conditional", value: "Requires conditions met", description: "Payment conditioned on premium payment and proof of loss." },
        ]}
      ]
    },
    life_insurance_basics: {
      title: "LIFE INSURANCE BASICS",
      subtitle: "Types of insurers · policy elements · insurable interest",
      blocks: [
        { type: "heading", text: "Types of Insurers & Insurable Interest" },
        { type: "table", rows: [
          { label: "Stock Insurer", value: "Owned by stockholders", description: "Issues non-participating policies; profits paid as dividends to shareholders." },
          { label: "Mutual Insurer", value: "Owned by policyholders", description: "Issues participating policies; excess premiums returned as policy dividends." },
          { label: "Insurable Interest", value: "At time of application", description: "Must exist when policy is applied for. Self, spouse, key business partners, financial dependents." },
        ]}
      ]
    },
    life_insurance_policies: {
      title: "LIFE INSURANCE POLICIES",
      subtitle: "Term life · whole life · universal life · variable products",
      blocks: [
        { type: "heading", text: "Permanent vs Temporary Policies" },
        { type: "table", rows: [
          { label: "Term Life", value: "Temporary protection", description: "Level, decreasing, or increasing term. No cash value build-up." },
          { label: "Whole Life", value: "Permanent to age 100", description: "Guaranteed cash value, fixed premium, level death benefit." },
          { label: "Universal Life", value: "Flexible premiums", description: "Adjustable face amount, unbundled interest rate accumulation." },
          { label: "Variable Products", value: "Separate account", description: "Requires Series 6/7; cash value depends on subaccount investment performance." },
        ]}
      ]
    },
    policy_provisions_and_riders: {
      title: "POLICY PROVISIONS & RIDERS",
      subtitle: "Standard clauses · rider mechanics · nonforfeiture · settlement options",
      blocks: [
        { type: "heading", text: "Standard Provisions" },
        { type: "table", rows: [
          { label: "Entire Contract", value: "Policy + App", description: "No outside documents apply." },
          { label: "Free Look", value: "10 days", description: "100% refund window." },
          { label: "Grace Period", value: "31 days", description: "Coverage continues during late premium window." },
          { label: "Incontestability", value: "2 years", description: "Cannot contest after 2 years." },
        ]},
        { type: "heading", text: "Nonforfeiture Options" },
        { type: "table", rows: [
          { label: "Cash Surrender", value: "Take cash", description: "Policy terminates." },
          { label: "Reduced Paid-Up", value: "Paid-up policy to age 100", description: "Smaller face amount, no more premiums." },
          { label: "Extended Term", value: "Default option", description: "Same face amount for level term period." },
        ]}
      ]
    },
    annuities: {
      title: "ANNUITIES",
      subtitle: "Fixed vs variable · immediate vs deferred · payout options",
      blocks: [
        { type: "heading", text: "Annuity Fundamentals" },
        { type: "table", rows: [
          { label: "Accumulation Phase", value: "Pay-in period", description: "Interest grows tax-deferred." },
          { label: "Annuitization Phase", value: "Payout period", description: "Converted to income stream for life or set period." },
          { label: "Fixed Annuity", value: "Guaranteed rate", description: "Insurer bears investment risk." },
          { label: "Variable Annuity", value: "Subaccounts", description: "Annuitant bears investment risk." },
        ]}
      ]
    },
    federal_tax_considerations: {
      title: "FEDERAL TAX CONSIDERATIONS",
      subtitle: "Taxation of benefits & cash value · MEC rules · 1035 exchanges",
      blocks: [
        { type: "heading", text: "Taxation Rules" },
        { type: "table", rows: [
          { label: "Death Benefit", value: "100% Income Tax-Free", description: "Lump sum death proceeds non-taxable." },
          { label: "Cash Value Growth", value: "Tax-deferred", description: "Grows tax-free until surrendered." },
          { label: "MEC 7-Pay Test", value: "Overfunded check", description: "Overfunded policy triggers LIFO tax + 10% pre-59½ penalty." },
          { label: "1035 Exchange", value: "Tax-free rollover", description: "Life to Life, Life to Annuity, Annuity to Annuity." },
        ]}
      ]
    },
    qualified_plans: {
      title: "QUALIFIED RETIREMENT PLANS",
      subtitle: "IRA · Roth IRA · 401(k) · 403(b) · SEP · SIMPLE",
      blocks: [
        { type: "heading", text: "Retirement Plan Varieties" },
        { type: "table", rows: [
          { label: "Traditional IRA", value: "Pre-tax dollars", description: "Contributions deductible; withdrawals taxed as ordinary income." },
          { label: "Roth IRA", value: "After-tax dollars", description: "100% tax-free qualified withdrawals after 5 years & age 59½." },
          { label: "401(k) / 403(b)", value: "Employer sponsored", description: "Pre-tax salary deferrals; 403(b) for non-profits and schools." },
        ]}
      ]
    },
    master_numbers_drill: {
      title: "MASTER NUMBERS DRILL (LIFE)",
      subtitle: "Every testable number for the Life exam",
      blocks: [
        { type: "heading", text: "Life Numbers" },
        { type: "table", rows: [
          { label: "Free look", value: "10 days", description: "Standard free look period." },
          { label: "Grace period", value: "31 days", description: "Standard grace period." },
          { label: "Incontestability", value: "2 years", description: "Incontestable after 2 years." },
          { label: "Group conversion", value: "31 days", description: "Group term conversion window." },
          { label: "Pre-59½ penalty", value: "10%", description: "IRS penalty for early MEC / annuity withdrawals." },
        ]}
      ]
    }
  },

  /* ══════════════════════════════════════════════════════════
     HEALTH LINE
     ══════════════════════════════════════════════════════════ */
  health: {
    insurance_regulation: {
      title: "INSURANCE REGULATION (HEALTH)",
      subtitle: "State DOI rules · licensing law · ACA compliance · trade practices",
      blocks: [
        { type: "heading", text: "Health Insurance Regulation" },
        { type: "table", rows: [
          { label: "DOI Authority", value: "State Insurance Dept", description: "Enforces health insurance mandates, rate filings, and unfair trade practices." },
          { label: "Affordable Care Act (ACA)", value: "Federal mandate", description: "Prohibits pre-existing condition exclusions; requires essential health benefits." },
        ]}
      ]
    },
    general_insurance_concepts: {
      title: "GENERAL INSURANCE CONCEPTS (HEALTH)",
      subtitle: "Risk principles · contract characteristics · underwriting",
      blocks: [
        { type: "heading", text: "Health Risk Fundamentals" },
        { type: "table", rows: [
          { label: "Perils Covered", value: "Accident & Sickness", description: "Accident = unintentional injury. Sickness = illness or disease." },
          { label: "Indemnity Principle", value: "Reimbursement", description: "Pays benefits up to actual medical loss incurred." },
        ]}
      ]
    },
    health_insurance_basics: {
      title: "HEALTH INSURANCE BASICS",
      subtitle: "HMO · PPO · POS · Fee-for-service · Group vs Individual",
      blocks: [
        { type: "heading", text: "Plan Architectures" },
        { type: "table", rows: [
          { label: "HMO", value: "Primary Care Physician gatekeeper", description: "In-network care only; capitation payment model." },
          { label: "PPO", value: "In-network & Out-of-network", description: "No gatekeeper; higher coverage for in-network providers." },
          { label: "POS", value: "Point of Service", description: "Combines HMO gatekeeper with out-of-network benefits." },
        ]}
      ]
    },
    health_policy_provisions: {
      title: "HEALTH POLICY PROVISIONS",
      subtitle: "Mandatory uniform provisions · optional provisions · renewability",
      blocks: [
        { type: "heading", text: "Mandatory Uniform Provisions" },
        { type: "table", rows: [
          { label: "Entire Contract", value: "Policy + App", description: "No external changes valid." },
          { label: "Grace Period", value: "7 / 10 / 31 days", description: "7 days weekly, 10 days monthly, 31 days all other modes." },
          { label: "Notice of Claim", value: "20 days", description: "Insured must notify insurer within 20 days of loss." },
          { label: "Proof of Loss", value: "90 days", description: "Must submit written proof within 90 days of loss." },
        ]}
      ]
    },
    medicare_and_medicaid: {
      title: "MEDICARE & MEDICAID",
      subtitle: "Parts A/B/C/D · Medigap · Medicaid eligibility",
      blocks: [
        { type: "heading", text: "Medicare Structure" },
        { type: "table", rows: [
          { label: "Part A", value: "Hospital Insurance", description: "Inpatient hospital care, skilled nursing, hospice." },
          { label: "Part B", value: "Medical Insurance", description: "Outpatient care, doctor visits, preventive services (requires premium)." },
          { label: "Part C", value: "Medicare Advantage", description: "Private insurer MAPD plans combining A, B, and usually D." },
          { label: "Part D", value: "Prescription Drugs", description: "Stand-alone prescription drug plans." },
          { label: "Medigap", value: "Medicare Supplement", description: "Standardized Plans A-N covering Parts A/B deductibles & copays." },
        ]}
      ]
    },
    disability_income: {
      title: "DISABILITY INCOME INSURANCE",
      subtitle: "Own-occ vs Any-occ · elimination period · benefit period",
      blocks: [
        { type: "heading", text: "Disability Policy Terms" },
        { type: "table", rows: [
          { label: "Own Occupation", value: "Broad coverage", description: "Total disability = unable to perform duties of own specific occupation." },
          { label: "Any Occupation", value: "Stricter coverage", description: "Total disability = unable to perform duties of any occupation suited by education/training." },
          { label: "Elimination Period", value: "Waiting period", description: "Time between disability onset and benefit payout (e.g. 30, 60, 90 days)." },
          { label: "Presumptive Disability", value: "Automatic total", description: "Loss of sight, speech, hearing, or use of 2 limbs." },
        ]}
      ]
    },
    long_term_care: {
      title: "LONG TERM CARE (LTC)",
      subtitle: "Activities of Daily Living (ADLs) · levels of care · tax qualification",
      blocks: [
        { type: "heading", text: "LTC Triggers & Care Levels" },
        { type: "table", rows: [
          { label: "ADL Triggers", value: "2 of 6 ADLs required", description: "Bathing, dressing, eating, toileting, transferring, continence." },
          { label: "Cognitive Impairment", value: "Stand-alone trigger", description: "Alzheimers or dementia triggers benefits without ADLs." },
          { label: "Care Levels", value: "Skilled, Intermediate, Custodial", description: "Skilled = 24/7 medical; Intermediate = intermittent medical; Custodial = non-medical personal help." },
        ]}
      ]
    },
    federal_tax_and_aca: {
      title: "FEDERAL TAX & ACA PROVISIONS",
      subtitle: "Taxation of benefits · HSA / HDHP · ACA marketplace",
      blocks: [
        { type: "heading", text: "Tax & HSA Rules" },
        { type: "table", rows: [
          { label: "Individual Premiums", value: "Non-deductible (with exception)", description: "Medical expenses deductible if exceeding 7.5% AGI threshold." },
          { label: "HSA + HDHP", value: "Triple tax advantage", description: "Tax-deductible contributions, tax-free growth, tax-free qualified medical withdrawals." },
        ]}
      ]
    },
    group_and_senior_markets: {
      title: "GROUP & SENIOR MARKETS",
      subtitle: "COBRA · HIPAA · employer group rules",
      blocks: [
        { type: "heading", text: "Group Continuation & Senior Rules" },
        { type: "table", rows: [
          { label: "COBRA", value: "18 to 36 months", description: "Allows terminated employees to continue group coverage at 102% premium cost (20+ employees)." },
          { label: "Senior Disclosures", value: "Buyer's guide required", description: "Must provide Medicare Supplement Buyer's Guide and outline of coverage at point of sale." },
        ]}
      ]
    },
    master_numbers_drill: {
      title: "MASTER NUMBERS DRILL (HEALTH)",
      subtitle: "Key numbers for Health exam",
      blocks: [
        { type: "heading", text: "Health Numbers" },
        { type: "table", rows: [
          { label: "Notice of Claim", value: "20 days", description: "Time to notify insurer of health claim." },
          { label: "Claim Forms", value: "15 days", description: "Insurer must provide claim forms within 15 days of notice." },
          { label: "Proof of Loss", value: "90 days", description: "Must submit proof of loss within 90 days." },
          { label: "COBRA Qualifying Event", value: "18 months", description: "Standard continuation for employment termination." },
          { label: "COBRA Dependent Death/Divorce", value: "36 months", description: "Continuation for spouse/dependents." },
        ]}
      ]
    }
  },

  /* ══════════════════════════════════════════════════════════
     ANNUITY LINE
     ══════════════════════════════════════════════════════════ */
  annuity: {
    insurance_regulation: {
      title: "INSURANCE REGULATION (ANNUITY)",
      subtitle: "NAIC Model 275 Best Interest · suitability training · disclosure mandates",
      blocks: [
        { type: "heading", text: "NAIC Model 275 Best Interest Standard" },
        { type: "table", rows: [
          { label: "Care Duty", value: "Consumer best interest", description: "Producers must evaluate consumer profile and recommend suitable annuity without prioritizing producer compensation." },
          { label: "4-Hour One-Time Training", value: "Mandatory", description: "All producers selling annuities must complete a 4-credit NAIC Best Interest course." },
          { label: "Conflict of Interest Duty", value: "Full disclosure", description: "Producer must disclose commission structures and ownership affiliations." },
        ]}
      ]
    },
    annuity_basics: {
      title: "ANNUITY BASICS",
      subtitle: "Accumulation vs annuitization · fixed vs variable vs indexed",
      blocks: [
        { type: "heading", text: "Annuity Mechanics" },
        { type: "table", rows: [
          { label: "Accumulation Period", value: "Growth phase", description: "Premiums earn interest tax-deferred." },
          { label: "Annuitization Period", value: "Payout phase", description: "Capital converted into guaranteed periodic income stream." },
          { label: "Fixed Annuity", value: "Guaranteed minimum rate", description: "General account backed; insurer bears market risk." },
          { label: "Equity-Indexed Annuity", value: "Index participation", description: "Returns tied to stock index (e.g. S&P 500) with guaranteed principal floor (0%-1%)." },
        ]}
      ]
    },
    annuity_contract_provisions: {
      title: "ANNUITY CONTRACT PROVISIONS",
      subtitle: "Surrender charges · free look · death benefit · contract owner rights",
      blocks: [
        { type: "heading", text: "Key Annuity Provisions" },
        { type: "table", rows: [
          { label: "Surrender Charge", value: "Declining penalty", description: "Fee assessed for early withdrawal during initial 5-10 year period (e.g., 7%, 6%, 5%...)." },
          { label: "Free Withdrawal Allowance", value: "10% annually", description: "Most contracts allow withdrawal of up to 10% cash value annually without surrender charge." },
          { label: "Free Look Period", value: "10-30 days", description: "Unconditional return window for 100% refund of premium." },
          { label: "Guaranteed Minimum Death Benefit", value: "Cash value / Premium", description: "Pays beneficiary cumulative premiums paid minus withdrawals if owner dies during accumulation." },
        ]}
      ]
    },
    payout_and_settlement_options: {
      title: "PAYOUT & SETTLEMENT OPTIONS",
      subtitle: "Life only · period certain · joint & survivor · systematic withdrawals",
      blocks: [
        { type: "heading", text: "Annuitization Payout Choices" },
        { type: "table", rows: [
          { label: "Life Only (Straight Life)", value: "Highest monthly payout", description: "Guaranteed income for life. Payout stops immediately upon annuitant's death (no beneficiary payout)." },
          { label: "Life with Period Certain", value: "Guaranteed minimum years", description: "Pays for life, but if annuitant dies during period certain (e.g. 10/20 yrs), beneficiary receives balance." },
          { label: "Joint & Survivor", value: "Covers 2 lives", description: "Pays for the lifetime of 2 annuitants (e.g. 100%, 75%, or 50% continuation to survivor)." },
        ]}
      ]
    },
    tax_treatment: {
      title: "TAX TREATMENT (ANNUITIES)",
      subtitle: "Exclusion ratio · LIFO withdrawals · pre-59½ penalty · 1035 exchange",
      blocks: [
        { type: "heading", text: "Annuity Taxation Rules" },
        { type: "table", rows: [
          { label: "Tax-Deferred Growth", value: "No tax while accumulating", description: "Interest accumulates tax-free until withdrawal." },
          { label: "LIFO Taxation", value: "Interest out first", description: "Non-annuitized withdrawals taxed on Earnings First as ordinary income." },
          { label: "Exclusion Ratio", value: "Annuitized payouts", description: "Determines non-taxable return of principal portion vs taxable earnings portion in monthly income payouts." },
          { label: "Pre-59½ IRS Penalty", value: "10% penalty", description: "10% tax penalty on taxable portion of withdrawals taken prior to age 59½." },
        ]}
      ]
    },
    suitability_and_best_interest: {
      title: "SUITABILITY & BEST INTEREST",
      subtitle: "Consumer profile · liquidity needs · replacement scrutiny · senior protections",
      blocks: [
        { type: "heading", text: "Suitability Profile Evaluation" },
        { type: "table", rows: [
          { label: "Consumer Profile Factors", value: "Required disclosures", description: "Age, income, financial situation, tax status, investment objectives, liquidity needs, risk tolerance." },
          { label: "Senior Protections", value: "Heightened scrutiny", description: "Prohibits surrendering existing annuity with surrender fee unless clear financial benefit is demonstrated." },
        ]}
      ]
    },
    variable_annuity_and_securities: {
      title: "VARIABLE ANNUITIES & SECURITIES",
      subtitle: "Separate accounts · subaccount valuation · Series 6/7 requirement",
      blocks: [
        { type: "heading", text: "Variable Annuity Mechanics" },
        { type: "table", rows: [
          { label: "Separate Account", value: "Equity investments", description: "Assets held separate from insurer general account; divided into subaccounts." },
          { label: "Accumulation Units", value: "Daily NAV pricing", description: "Premiums purchase accumulation units whose value fluctuates daily with market." },
          { label: "Licensing Needed", value: "Life Producer + Series 6/7", description: "Must hold state Life Producer license AND FINRA Series 6 or Series 7 registration." },
        ]}
      ]
    },
    master_numbers_drill: {
      title: "MASTER NUMBERS DRILL (ANNUITY)",
      subtitle: "Key numbers for Annuity exam",
      blocks: [
        { type: "heading", text: "Annuity Numbers" },
        { type: "table", rows: [
          { label: "NAIC Best Interest Course", value: "4 hours", description: "One-time mandatory training requirement." },
          { label: "Early withdrawal penalty age", value: "59½", description: "IRS 10% penalty age threshold." },
          { label: "Annual free withdrawal", value: "10%", description: "Standard annual surrender-free withdrawal allowance." },
          { label: "Record retention", value: "5 years", description: "Required retention period for annuity suitability records." },
        ]}
      ]
    }
  },

  /* ══════════════════════════════════════════════════════════
     MORTGAGE PROTECTION LINE
     ══════════════════════════════════════════════════════════ */
  mortgage_protection: {
    mortgage_protection_concept: {
      title: "MORTGAGE PROTECTION CONCEPT",
      subtitle: "Sold under Life LoA · term-life mechanics · mortgage payoff strategies",
      blocks: [
        { type: "heading", text: "Mortgage Protection Fundamentals" },
        { type: "table", rows: [
          { label: "Line of Authority", value: "Life Insurance LoA", description: "Mortgage Protection is sold using a standard Life Producer license." },
          { label: "Decreasing Term", value: "Matches mortgage balance", description: "Face amount declines over time alongside home mortgage amortization." },
        ]}
      ]
    },
    marketing_and_advertising_rules: {
      title: "MARKETING & ADVERTISING RULES (MP)",
      subtitle: "NAIC Model 880 UTPA · no false lender affiliation · clear insurer disclosures",
      blocks: [
        { type: "heading", text: "Direct Mail & Advertising Rules" },
        { type: "table", rows: [
          { label: "No False Lender Affiliation", value: "Strict prohibition", description: "Mailers CANNOT imply offer comes from homeowner's mortgage lender or bank." },
          { label: "No Fictitious Government Look", value: "Strict prohibition", description: "Cannot use official-looking seals, paper, or envelopes to deceive consumers." },
        ]}
      ]
    },
    unfair_trade_practices: {
      title: "UNFAIR TRADE PRACTICES (MP)",
      subtitle: "Twisting · churning · sliding · rebating",
      blocks: [
        { type: "heading", text: "Core UTPA Violations in MP Sales" },
        { type: "table", rows: [
          { label: "Twisting", value: "Misleading replacement", description: "Inducing homeowner to lapse existing policy through false comparison." },
          { label: "Sliding", value: "Unapproved rider addition", description: "Adding riders (e.g. AD&D) without homeowner's informed consent." },
        ]}
      ]
    },
    policy_form_and_form_numbers: {
      title: "POLICY FORM & FORM NUMBERS",
      subtitle: "State-approved policy forms · filing requirements",
      blocks: [
        { type: "heading", text: "Policy Form Compliance" },
        { type: "table", rows: [
          { label: "Approved Forms", value: "DOBI Filed", description: "All policy forms and applications must be filed with and approved by state DOI." },
        ]}
      ]
    },
    state_statute: {
      title: "STATE STATUTE & UTPA CHAPTER",
      subtitle: "State-specific trade practice acts · DOI bulletin compliance",
      blocks: [
        { type: "heading", text: "State Unfair Trade Practice Act" },
        { type: "table", rows: [
          { label: "DOI Enforcement", value: "Fines & license revocation", description: "DOIs heavily monitor direct mail MP leads for UTPA compliance." },
        ]}
      ]
    },
    replacement: {
      title: "REPLACEMENT RULES (MORTGAGE PROTECTION)",
      subtitle: "Notice regarding replacement · 21-day notice · free look extensions",
      blocks: [
        { type: "heading", text: "MP Replacement Rules" },
        { type: "table", rows: [
          { label: "Notice Regarding Replacement", value: "Signed at application", description: "Must deliver completed replacement disclosure before taking application." },
          { label: "Existing Insurer Notice", value: "21 days", description: "Existing insurer notified of replacement within 21 days." },
        ]}
      ]
    },
    master_numbers_drill: {
      title: "MASTER NUMBERS DRILL (MORTGAGE PROTECTION)",
      subtitle: "Key numbers for MP exam",
      blocks: [
        { type: "heading", text: "MP Exam Numbers" },
        { type: "table", rows: [
          { label: "Free look period", value: "10-30 days", description: "Free look review window." },
          { label: "Replacement notice", value: "At application", description: "Must deliver before application." },
          { label: "Existing insurer notice", value: "21 days", description: "Notice to existing insurer." },
        ]}
      ]
    }
  }
};

GUIDES.nj = GUIDES.nj_life_producer;

// Lookup a hardcoded guide section by line + domain + optional stateCode / varietyId
function getStaticGuideSection(lineId, domainName, stateCode, varietyId) {
  if (!domainName) return null;
  const key = domainKey(domainName);
  const isMasterDrill = key.includes("master_number") || domainName.toLowerCase().includes("master number");

  // 1. Try variety-specific bank (e.g. GUIDES["nj_life_producer"][key])
  if (varietyId && GUIDES[varietyId]) {
    const vBank = GUIDES[varietyId];
    if (vBank[key]) return vBank[key];
    const pKey = Object.keys(vBank).find(k => k.startsWith(key.slice(0, 12)) || key.startsWith(k.slice(0, 12)));
    if (pKey) return vBank[pKey];
  }

  // 2. Try state-specific bank (e.g. GUIDES["nj"][key])
  const stKey = stateCode ? stateCode.toLowerCase() : null;
  if (stKey && GUIDES[stKey]) {
    const sBank = GUIDES[stKey];
    if (sBank[key]) return sBank[key];
    const pKey = Object.keys(sBank).find(k => k.startsWith(key.slice(0, 12)) || key.startsWith(k.slice(0, 12)));
    if (pKey) return sBank[pKey];
  }

  // 3. Line guides bank
  const lineGuides = GUIDES[lineId] || GUIDES["life"];
  if (lineGuides) {
    if (lineGuides[key]) return lineGuides[key];
    const pKey = Object.keys(lineGuides).find(k => k.startsWith(key.slice(0, 12)) || key.startsWith(k.slice(0, 12)));
    if (pKey) return lineGuides[pKey];
  }

  // 4. Cross-line fallback for common sections
  for (const lineKey of ["life", "health", "annuity", "mortgage_protection"]) {
    if (GUIDES[lineKey] && GUIDES[lineKey][key]) return GUIDES[lineKey][key];
  }

  // 5. If explicitly looking for Master Numbers Drill
  if (isMasterDrill) {
    return (lineGuides && lineGuides["master_numbers_drill"]) || (GUIDES["life"] && GUIDES["life"]["master_numbers_drill"]) || null;
  }

  // 6. SAFE FALLBACK: Never return master_numbers_drill for a non-master section!
  // Generate a clean, structured section doc dynamically so the UI stays unique and relevant.
  return {
    title: domainName.toUpperCase(),
    subtitle: `Exam domain guide for ${stateCode || ""} ${lineId.toUpperCase()}`,
    blocks: [
      { type: "heading", text: `${domainName} — Key Concepts` },
      { type: "table", rows: [
        { label: "Core Focus", value: "Exam Weight", description: `Review state DOI guidelines and pre-licensing notes for ${domainName}.` },
        { label: "Regulatory Standard", value: "NAIC / State Code", description: `Understand statutory definitions, licensing mandates, and consumer protection rules for this domain.` },
      ]},
      { type: "callout", kind: "info", text: `Study Tip: Focus on key definitions, mandatory provisions, time periods, and penalties associated with ${domainName}.` }
    ]
  };
}

// Expose as global
window.LicensingStudyGuides = { GUIDES, domainKey, getStaticGuideSection };

})();
