/* lib/licensing-study-guides.js
   Hardcoded, curated study guide sections for the major licensing exam lines.
   These load instantly — no LLM call required.

   Key: `${lineId}:${domainKey}` where domainKey is the lowercased, slug-ified
   domain name (spaces → underscores, & → and, / → _).

   Each entry matches the BlocksRenderer schema used in page-licensing.jsx:
   { title, subtitle, blocks: [ heading | intro | table | bullets | callout ] }

   Exposed as window.LicensingStudyGuides = { GUIDES, domainKey, getStaticGuideSection }
   so it can be loaded as a plain <script> tag (no bundler required).
*/
(function () {

// Helper to slugify domain names to lookup keys
function domainKey(domain) {
  return domain.toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

// The master hardcoded study guide bank.
// Structure: GUIDES[lineId][domainKey] = section_doc
const GUIDES = {

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
          { label: "License renewal", value: null, description: "Typically every 2 years; continuing education (CE) hours required for renewal." },
          { label: "CE hours", value: null, description: "Varies by state (commonly 24 hrs/2 years); state-specific — check your DOI." },
          { label: "Non-resident license", value: null, description: "Issued by NIPR reciprocity; most states honor home-state license via NAIC compact." },
          { label: "Termination of appointment", value: null, description: "Insurer must notify DOI within 30 days of terminating an agent's appointment." },
        ]},
        { type: "callout", kind: "test_trick", text: "Appointment = the insurer authorizes the agent to sell for them. License = state grants permission to act as a producer. You need BOTH." },
        { type: "heading", text: "Unfair Trade Practices (NAIC UTPA Model)" },
        { type: "table", rows: [
          { label: "Misrepresentation", value: null, description: "False or misleading statements about policy benefits, terms, or insurer condition." },
          { label: "Twisting", value: null, description: "Inducing a policyholder to lapse or surrender a policy in favor of another through misrepresentation." },
          { label: "Churning", value: null, description: "Using a policy's own values to buy another policy with the same insurer, causing unnecessary lapse." },
          { label: "Rebating", value: null, description: "Giving the applicant anything of value not specified in the policy as an inducement to purchase. Illegal in most states." },
          { label: "Sliding", value: null, description: "Adding coverages to a policy without the client's informed consent." },
          { label: "Defamation", value: null, description: "False statements about a competitor's financial condition or business practices." },
          { label: "Boycott / coercion / intimidation", value: null, description: "Competitors conspiring to drive out rivals; forcing clients to use specific providers." },
        ]},
        { type: "callout", kind: "warning", text: "Rebating is ILLEGAL in most states — giving cash, gifts, or other inducements. Exception: some states allow controlled rebating under disclosure rules (e.g., CA, FL)." },
        { type: "heading", text: "Penalties & Enforcement" },
        { type: "table", rows: [
          { label: "Civil fine", value: "up to $1,000", description: "Per violation for non-willful unfair trade practices (NAIC model)." },
          { label: "Civil fine (willful)", value: "up to $25,000", description: "Per willful violation of unfair trade practice laws." },
          { label: "License suspension", value: null, description: "DOI may suspend or revoke license for fraud, misrepresentation, or felony conviction." },
          { label: "Felony conviction", value: null, description: "Automatic disqualification; background check required for initial license." },
        ]},
        { type: "callout", kind: "info", text: "Most states have adopted variations of the NAIC Unfair Trade Practices Act. Know your state's specific fine schedule — amounts vary." },
      ]
    },

    general_insurance_concepts: {
      title: "GENERAL INSURANCE CONCEPTS",
      subtitle: "Contract law · risk principles · insurable interest · underwriting",
      blocks: [
        { type: "heading", text: "Basics of Risk" },
        { type: "table", rows: [
          { label: "Pure risk", value: null, description: "Only a chance of loss, no gain — insurable (death, fire, accident)." },
          { label: "Speculative risk", value: null, description: "Chance of loss OR gain — not insurable (gambling, stock market)." },
          { label: "Risk avoidance", value: null, description: "Eliminating the risk entirely (e.g., don't skydive)." },
          { label: "Risk reduction", value: null, description: "Reducing likelihood or severity (seatbelts, sprinklers)." },
          { label: "Risk retention", value: null, description: "Self-insuring; accepting the financial risk (deductibles, self-funded plans)." },
          { label: "Risk transfer", value: null, description: "Shifting risk to an insurer via an insurance contract — core purpose of insurance." },
        ]},
        { type: "heading", text: "Insurance Contract Characteristics" },
        { type: "table", rows: [
          { label: "Aleatory", value: null, description: "Unequal exchange of value — insured pays premiums; insurer may pay a much larger claim (or nothing)." },
          { label: "Adhesion", value: null, description: "Contract written entirely by insurer; any ambiguity interpreted in favor of the insured." },
          { label: "Unilateral", value: null, description: "Only the insurer makes a legally enforceable promise; insured can stop paying at any time." },
          { label: "Conditional", value: null, description: "Insurer's promise to pay is conditioned on the insured meeting certain conditions (paying premiums, submitting proof of loss)." },
          { label: "Personal", value: null, description: "Policy is a personal contract between insurer and specific insured; generally not assignable without consent." },
        ]},
        { type: "callout", kind: "test_trick", text: "Adhesion → Ambiguity always favors the INSURED. The insurer wrote it, so they bear the cost of unclear language." },
        { type: "heading", text: "Requirements for a Valid Insurance Contract" },
        { type: "bullets", items: [
          { bold: "Offer and acceptance:", text: "Applicant makes offer (application + premium); insurer accepts (issues policy)." },
          { bold: "Consideration:", text: "Applicant's premium + statements on application; insurer's promise to pay." },
          { bold: "Legal purpose:", text: "Contract must be for a lawful object — no insuring criminal enterprises." },
          { bold: "Competent parties:", text: "Both parties must be of legal age and sound mind." },
          { bold: "Insurable interest:", text: "Insured must face financial loss at the time of application." },
        ]},
        { type: "heading", text: "Insurable Interest" },
        { type: "table", rows: [
          { label: "Life insurance", value: "at application", description: "Insurable interest required when the policy is applied for — NOT necessarily at time of death." },
          { label: "Who has it?", value: null, description: "Self (unlimited), spouse, children, business partners (key person), employers (COLI — within limits)." },
          { label: "Property insurance", value: "at loss", description: "Must exist at time of loss (unlike life insurance)." },
        ]},
        { type: "heading", text: "Principles of Indemnity & Utmost Good Faith" },
        { type: "table", rows: [
          { label: "Indemnity", value: null, description: "Restore insured to pre-loss financial position — no profit from insurance (applies to P&C, NOT life)." },
          { label: "Utmost good faith (uberrimae fidei)", value: null, description: "Both parties must deal honestly and disclose all material facts." },
          { label: "Warranty", value: null, description: "Fact guaranteed to be true; breach can void policy." },
          { label: "Representation", value: null, description: "Statement believed true at the time — minor inaccuracies don't void policy unless material." },
          { label: "Concealment", value: null, description: "Intentional failure to reveal a material fact; can void policy." },
          { label: "Fraud", value: null, description: "Intentional misrepresentation for the purpose of deception." },
        ]},
        { type: "callout", kind: "warning", text: "FRAUD always voids the policy. Innocent misrepresentation (not material) may not — but concealment of a material fact can void the policy even if unintentional." },
        { type: "heading", text: "Law of Large Numbers & Underwriting" },
        { type: "table", rows: [
          { label: "Law of large numbers", value: null, description: "The larger the group insured, the more predictable the loss experience — foundation of actuarial pricing." },
          { label: "Adverse selection", value: null, description: "Higher-risk individuals disproportionately seek insurance; underwriting exists to manage this." },
          { label: "Underwriting decision", value: null, description: "Accept standard, accept substandard (rated), accept with exclusions, or decline." },
          { label: "Substandard policy", value: null, description: "Issued at a higher premium or with a rated (extra) table to account for elevated risk." },
        ]},
      ]
    },

    life_insurance_basics: {
      title: "LIFE INSURANCE BASICS",
      subtitle: "Types of insurers · policy components · ownership · beneficiaries",
      blocks: [
        { type: "heading", text: "Types of Insurers" },
        { type: "table", rows: [
          { label: "Stock company", value: null, description: "Owned by shareholders; profits distributed as dividends to shareholders. Issues NON-participating policies." },
          { label: "Mutual company", value: null, description: "Owned by policyholders; profits returned as policy dividends. Issues PARTICIPATING policies." },
          { label: "Fraternal benefit society", value: null, description: "Nonprofit membership organization; insures members only; exempt from some state regulations." },
          { label: "Lloyd's of London", value: null, description: "Not an insurer — a marketplace of syndicates. Known for hard-to-place risks." },
          { label: "Risk Retention Group (RRG)", value: null, description: "Group of similar businesses self-insuring their liability exposure; formed under Liability Risk Retention Act." },
        ]},
        { type: "callout", kind: "test_trick", text: "Mutual = policyholders own it, get dividends. Stock = shareholders own it. Policy dividends are return of overpaid premium — NOT taxable income." },
        { type: "heading", text: "Parts of a Life Insurance Policy" },
        { type: "table", rows: [
          { label: "Declarations page", value: null, description: "Who is insured, face amount, premium, policy number, effective date." },
          { label: "Insuring clause", value: null, description: "The insurer's promise to pay the death benefit when the insured dies." },
          { label: "Consideration clause", value: null, description: "States the premium and application statements as the insured's consideration." },
          { label: "Free-look period", value: "10 days", description: "Minimum days to review and return policy for full refund. Some states require 20 days for seniors or annuities." },
          { label: "Entire contract clause", value: null, description: "Policy + attached application = entire contract; insurer cannot use outside documents." },
          { label: "Incontestability clause", value: "2 years", description: "After policy has been in force 2 years, insurer cannot contest for misrepresentation (except fraud). Most states require this." },
        ]},
        { type: "heading", text: "Policy Ownership & Beneficiaries" },
        { type: "table", rows: [
          { label: "Owner (policyholder)", value: null, description: "Controls the policy — names/changes beneficiaries, takes loans, surrenders. May or may not be the insured." },
          { label: "Insured", value: null, description: "The person whose life is covered." },
          { label: "Beneficiary", value: null, description: "Person(s) who receive the death benefit." },
          { label: "Primary beneficiary", value: null, description: "First to receive proceeds upon death of insured." },
          { label: "Contingent (secondary) beneficiary", value: null, description: "Receives proceeds if all primary beneficiaries predecease the insured." },
          { label: "Tertiary beneficiary", value: null, description: "Third level — receives if both primary and contingent are deceased." },
          { label: "Irrevocable beneficiary", value: null, description: "Cannot be changed without the beneficiary's written consent; owner gives up some control." },
          { label: "Revocable beneficiary", value: null, description: "Default; owner may change at any time without consent." },
          { label: "Per stirpes", value: null, description: "By the branch — deceased beneficiary's share passes to their heirs." },
          { label: "Per capita", value: null, description: "By the head — share is divided equally among surviving beneficiaries only." },
        ]},
        { type: "callout", kind: "warning", text: "If there is NO living beneficiary, death benefit goes to the insured's ESTATE — subject to probate, creditors, and delays." },
        { type: "heading", text: "Premium Payment Modes" },
        { type: "table", rows: [
          { label: "Annual", value: null, description: "Lowest total cost; no modal loading fee." },
          { label: "Semi-annual / Quarterly / Monthly", value: null, description: "Each more frequent mode adds a modal loading factor — you pay slightly more total per year." },
        ]},
      ]
    },

    life_insurance_policies: {
      title: "LIFE INSURANCE POLICIES",
      subtitle: "Term · whole life · universal life · variable · indexed",
      blocks: [
        { type: "heading", text: "Term Life Insurance" },
        { type: "table", rows: [
          { label: "What it is", value: null, description: "Pure death protection for a specified period (10, 20, 30 years). No cash value." },
          { label: "Level term", value: null, description: "Death benefit and premium stay constant throughout the term." },
          { label: "Decreasing term", value: null, description: "Death benefit decreases over time; premium stays level. Used for mortgage protection." },
          { label: "Increasing term", value: null, description: "Death benefit increases over time (often used as a rider)." },
          { label: "Renewable", value: null, description: "Can renew at end of term WITHOUT evidence of insurability, at higher premium (age-based)." },
          { label: "Convertible", value: null, description: "Can convert to permanent policy without evidence of insurability, up to a specified age." },
          { label: "Return of premium (ROP)", value: null, description: "Premiums returned if insured survives the term. Higher premium than standard term." },
        ]},
        { type: "callout", kind: "test_trick", text: "TERM = temporary, cheapest, no cash value. Renewable = no medical exam to renew (but higher premium). Convertible = switch to permanent without medical exam." },
        { type: "heading", text: "Whole Life Insurance" },
        { type: "table", rows: [
          { label: "What it is", value: null, description: "Permanent coverage for life; fixed premium; builds guaranteed cash value." },
          { label: "Cash value", value: null, description: "Tax-deferred savings component; grows at a guaranteed minimum interest rate." },
          { label: "Policy loans", value: null, description: "Owner can borrow against cash value. Outstanding loans + interest reduce death benefit if not repaid." },
          { label: "Limited pay whole life", value: null, description: "Premiums paid over shorter period (10-pay, 20-pay, paid-up at 65). Fully paid-up but coverage continues for life." },
          { label: "Single premium whole life (SPWL)", value: null, description: "One lump-sum payment; immediately creates cash value. May trigger MEC status." },
          { label: "Participating vs. non-participating", value: null, description: "Participating (mutual co.): may earn policy dividends. Non-participating (stock co.): no dividends." },
        ]},
        { type: "heading", text: "Policy Dividends (Participating Policies)" },
        { type: "table", rows: [
          { label: "Cash", value: null, description: "Paid directly to policyholder. Non-taxable (return of premium)." },
          { label: "Reduce premium", value: null, description: "Applied toward next premium payment." },
          { label: "Accumulate at interest", value: null, description: "Left with insurer; interest IS taxable each year." },
          { label: "Paid-up additions (PUAs)", value: null, description: "Buy additional paid-up whole life — most powerful option; grows cash value and death benefit." },
          { label: "One-year term (5th dividend)", value: null, description: "Buys additional term insurance equal to cash value amount." },
        ]},
        { type: "callout", kind: "test_trick", text: "Dividends on life policies = NOT taxable (return of overpaid premium). Interest EARNED on dividends left with the insurer = IS taxable." },
        { type: "heading", text: "Universal Life Insurance (UL)" },
        { type: "table", rows: [
          { label: "What it is", value: null, description: "Flexible permanent coverage. Adjustable death benefit and premium within limits." },
          { label: "Option A (Level death benefit)", value: null, description: "Death benefit stays level as cash value grows → net amount at risk decreases." },
          { label: "Option B (Increasing death benefit)", value: null, description: "Death benefit = face amount + cash value. Premium costs more; net amount at risk stays level." },
          { label: "Interest rate", value: null, description: "Current rate credited to cash value; guaranteed minimum (often 2–3%)." },
          { label: "Target premium", value: null, description: "Recommended amount to keep policy in force; underpaying may cause lapse." },
          { label: "Corridor requirement", value: null, description: "IRS requires minimum gap between death benefit and cash value to maintain life insurance status (IRC §7702)." },
        ]},
        { type: "heading", text: "Variable & Indexed Universal Life" },
        { type: "table", rows: [
          { label: "Variable Life (VL)", value: null, description: "Fixed premium; death benefit and cash value tied to separate account (sub-accounts / mutual-fund-like). Not guaranteed. Requires Series 6 or 7 + life license." },
          { label: "Variable Universal Life (VUL)", value: null, description: "Flexible premium + sub-accounts. Maximum flexibility, maximum risk to cash value. Requires securities registration." },
          { label: "Indexed UL (IUL)", value: null, description: "Cash value growth tied to stock index (e.g., S&P 500) with a FLOOR (0%) and a CAP. NOT a securities product — no securities license needed." },
          { label: "Fixed UL", value: null, description: "Credited at current interest rate; minimum guaranteed. Most conservative UL." },
        ]},
        { type: "callout", kind: "warning", text: "Variable products (VL, VUL) require a SECURITIES license (Series 6 or 7) PLUS a life insurance license. IUL does NOT require a securities license." },
      ]
    },

    policy_provisions_and_riders: {
      title: "POLICY PROVISIONS & RIDERS",
      subtitle: "Mandatory provisions · optional provisions · common riders · settlement options",
      blocks: [
        { type: "heading", text: "Mandatory Policy Provisions (Life)" },
        { type: "table", rows: [
          { label: "Free-look period", value: "10 days", description: "Return policy for full refund; some states 20 days for seniors or replacement purchases." },
          { label: "Grace period", value: "31 days", description: "Policy stays in force 31 days after premium due date; death benefit still paid during grace if death occurs." },
          { label: "Incontestability clause", value: "2 years", description: "After 2 years in force, insurer cannot contest policy for misrepresentation (except fraud)." },
          { label: "Reinstatement", value: "3–5 years", description: "Lapsed policy may be reinstated; requires evidence of insurability and back premiums with interest." },
          { label: "Misstatement of age/sex", value: null, description: "Benefit adjusted to what premium would have purchased at correct age — policy NOT voided." },
          { label: "Entire contract clause", value: null, description: "Policy + application = entire contract; insurer cannot alter post-issue." },
          { label: "Suicide clause", value: "2 years", description: "If insured commits suicide within 2 years, insurer returns premiums paid, not the death benefit." },
        ]},
        { type: "callout", kind: "test_trick", text: "Grace = 31 days. Free look = 10 days (return for refund). Incontestability = 2 years. Suicide = 2 years. Reinstatement = 3–5 years. MEMORIZE these numbers." },
        { type: "heading", text: "Nonforfeiture Options (Cash Value Policies)" },
        { type: "table", rows: [
          { label: "Cash surrender value (CSV)", value: null, description: "Take the cash and surrender the policy; coverage ends." },
          { label: "Extended term", value: null, description: "Use CSV to purchase term insurance at same face amount for as long as the CSV lasts; DEFAULT if owner doesn't choose." },
          { label: "Reduced paid-up (RPU)", value: null, description: "Use CSV to purchase a paid-up whole life policy at a smaller face amount; no more premiums due." },
        ]},
        { type: "callout", kind: "test_trick", text: "Default nonforfeiture = Extended Term. 'Reduced paid-up' = still permanent, no more premiums, smaller face amount." },
        { type: "heading", text: "Settlement Options (How Death Benefit is Paid)" },
        { type: "table", rows: [
          { label: "Lump sum", value: null, description: "Entire proceeds paid at once; most common. Not taxable." },
          { label: "Interest only", value: null, description: "Insurer holds proceeds and pays interest; principal later. Interest IS taxable." },
          { label: "Fixed amount", value: null, description: "Fixed dollar amount paid periodically until funds exhausted." },
          { label: "Fixed period", value: null, description: "Proceeds paid over fixed number of years." },
          { label: "Life income (life annuity)", value: null, description: "Income for the rest of the beneficiary's life; insurer assumes longevity risk." },
          { label: "Life income with period certain", value: null, description: "Guaranteed income for life; if beneficiary dies early, payments continue to contingent for the period certain." },
          { label: "Joint and survivor", value: null, description: "Income for two lives; payments continue (often at reduced amount) after first death." },
        ]},
        { type: "heading", text: "Common Riders" },
        { type: "table", rows: [
          { label: "Waiver of premium", value: null, description: "If insured is totally disabled (6-month waiting period typical), premiums are waived. Coverage continues." },
          { label: "Accidental death benefit (ADB)", value: "2x–3x face", description: "Pays additional death benefit if death is accidental. Often called 'double indemnity'." },
          { label: "Guaranteed insurability (GIO)", value: null, description: "Option to purchase additional coverage at specified future dates without evidence of insurability." },
          { label: "Term rider", value: null, description: "Adds temporary term coverage; often used for children or spouse." },
          { label: "Payor rider", value: null, description: "If the premium payor (parent) dies or is disabled, premiums waived on juvenile policy." },
          { label: "Accelerated death benefit (ADB)", value: null, description: "Pays portion of death benefit early if insured is terminally ill (generally 24-month life expectancy). Reduces death benefit." },
          { label: "Long-term care rider", value: null, description: "Access death benefit early to pay LTC costs; reduces death benefit." },
          { label: "Cost of living (COLA)", value: null, description: "Automatically increases coverage to keep pace with inflation; tied to CPI." },
        ]},
        { type: "callout", kind: "warning", text: "Accidental Death Benefit (ADB) pays ONLY for accidental death. Aviation exclusions are common — read the policy. The 'accidental' must be the SOLE cause." },
      ]
    },

    annuities: {
      title: "ANNUITIES",
      subtitle: "Types · phases · payout options · tax treatment · suitability",
      blocks: [
        { type: "heading", text: "Annuity Basics" },
        { type: "table", rows: [
          { label: "What it is", value: null, description: "A contract between a person (annuitant) and an insurer to provide periodic income payments, typically in retirement." },
          { label: "Annuity vs. life insurance", value: null, description: "Life insurance pays upon death (protects against dying too soon). Annuity pays for living (protects against outliving money)." },
          { label: "Accumulation phase", value: null, description: "Money grows tax-deferred inside the annuity." },
          { label: "Annuitization phase", value: null, description: "Annuity is converted to a stream of income payments." },
          { label: "Annuitant", value: null, description: "Person whose life expectancy determines payout. May or may not be the owner." },
        ]},
        { type: "heading", text: "Types of Annuities" },
        { type: "table", rows: [
          { label: "Fixed annuity", value: null, description: "Guaranteed minimum interest rate; insurer bears investment risk. Conservative. Does NOT require securities license." },
          { label: "Variable annuity", value: null, description: "Cash value in separate account sub-funds. Performance not guaranteed. Requires Series 6 or 7 + life license." },
          { label: "Indexed annuity (FIA/EIA)", value: null, description: "Returns linked to stock index (floor = 0%, cap = varies). NOT a security. No guaranteed earnings above floor." },
          { label: "Immediate annuity (SPIA)", value: null, description: "Payments start within 1 period of purchase (monthly = within 1 month). Purchased with lump sum." },
          { label: "Deferred annuity", value: null, description: "Accumulates value; payouts begin at a future date. Can be funded with single or periodic premiums." },
        ]},
        { type: "callout", kind: "warning", text: "Variable annuities = SECURITIES product. Requires Series 6 or 7 registration PLUS a state life insurance license." },
        { type: "heading", text: "Annuity Payout Options" },
        { type: "table", rows: [
          { label: "Life only (straight life)", value: null, description: "Highest monthly payment; stops at annuitant's death. Insurer keeps remaining value." },
          { label: "Life with period certain", value: null, description: "Income for life; guaranteed minimum period (e.g., 10 years). If annuitant dies early, payments continue to beneficiary for remainder of period." },
          { label: "Life with refund (installment/cash)", value: null, description: "If annuitant dies before total premiums are returned, remainder paid to beneficiary." },
          { label: "Joint and survivor (J&S)", value: null, description: "Income continues after first death; survivor receives 100%, 75%, or 50% of original payment." },
          { label: "Period certain (no life)", value: null, description: "Payments for fixed period regardless of survival." },
        ]},
        { type: "heading", text: "Tax Treatment of Annuities" },
        { type: "table", rows: [
          { label: "Non-qualified annuity", value: null, description: "Funded with after-tax dollars. Growth is tax-deferred. Only the GAIN portion of each payment is taxable." },
          { label: "Exclusion ratio", value: null, description: "Portion of each payment that is tax-free (return of cost basis). Exclusion ratio = investment / expected return." },
          { label: "Qualified annuity (IRA, 403b)", value: null, description: "Funded with pre-tax dollars. ENTIRE payment is taxable as ordinary income." },
          { label: "Pre-59½ withdrawal penalty", value: "10%", description: "10% early withdrawal penalty on taxable gains in addition to ordinary income tax. Exceptions: death, disability, SEPP." },
          { label: "1035 exchange", value: null, description: "Tax-free exchange of one annuity for another (or life policy to annuity). Cannot exchange annuity to life insurance." },
          { label: "LIFO taxation", value: null, description: "Non-qualified deferred annuity withdrawals: Last In, First Out — gains come out FIRST and are taxed first." },
        ]},
        { type: "callout", kind: "test_trick", text: "1035 exchange: Life → Life ✓ | Life → Annuity ✓ | Annuity → Annuity ✓ | Annuity → Life ✗ (not allowed — can't go backwards)." },
        { type: "heading", text: "Suitability & Best Interest (NAIC Model 275)" },
        { type: "table", rows: [
          { label: "NAIC Model 275", value: null, description: "Suitability in Annuity Transactions Model Regulation. Requires agents to act in best interest of consumer." },
          { label: "Best interest standard", value: null, description: "Agent must recommend annuity that is in the client's best interest, considering all factors — not just suitable." },
          { label: "Surrender charges", value: "5–15 years", description: "Early withdrawal penalty from the insurance company, typically declining over 5–15 years." },
          { label: "Free withdrawal provision", value: "10% / yr", description: "Most annuities allow 10% penalty-free withdrawal per year." },
          { label: "Senior suitability training", value: "4–8 hrs", description: "State-specific CE required before selling annuities to seniors (varies by state)." },
        ]},
      ]
    },

    federal_tax_considerations: {
      title: "FEDERAL TAX CONSIDERATIONS",
      subtitle: "Modified endowment contracts · 1035 exchanges · business insurance · group life",
      blocks: [
        { type: "heading", text: "Modified Endowment Contract (MEC)" },
        { type: "table", rows: [
          { label: "What triggers MEC", value: null, description: "Policy fails the 7-pay test — premiums exceed what's needed to pay policy up in 7 years." },
          { label: "7-pay test", value: null, description: "IRS limit on how much premium can be paid into a life policy in the first 7 years without becoming a MEC." },
          { label: "Tax impact of MEC", value: null, description: "LIFO: withdrawals and loans from a MEC are taxed as income first, then return of basis. Same as annuity treatment." },
          { label: "Pre-59½ penalty", value: "10%", description: "10% penalty on taxable distributions from a MEC before age 59½." },
          { label: "Once a MEC...", value: null, description: "MEC status is PERMANENT — cannot be changed. Even if premiums stop." },
          { label: "Death benefit", value: null, description: "Death benefit from a MEC is STILL income-tax-free to beneficiary." },
        ]},
        { type: "callout", kind: "warning", text: "Once a MEC, ALWAYS a MEC. The MEC label follows the policy — it cannot be cured by reducing premiums. The death benefit remains tax-free even from a MEC." },
        { type: "heading", text: "1035 Exchange (Tax-Free Replacement)" },
        { type: "table", rows: [
          { label: "Life → Life", value: "✓ allowed", description: "Replace one life policy with another; no tax on gain if done correctly." },
          { label: "Life → Annuity", value: "✓ allowed", description: "Convert life insurance to an annuity tax-free under IRC §1035." },
          { label: "Annuity → Annuity", value: "✓ allowed", description: "Replace one annuity with another." },
          { label: "Annuity → Life", value: "✗ NOT allowed", description: "Cannot exchange an annuity for a life insurance policy tax-free." },
          { label: "Basis carries over", value: null, description: "The cost basis transfers to the new policy; gain deferred, not eliminated." },
          { label: "Surrender charges", value: null, description: "Carrier surrender charges still apply to 1035 — the tax exemption doesn't waive the insurer's fees." },
        ]},
        { type: "heading", text: "Business Life Insurance" },
        { type: "table", rows: [
          { label: "Key person insurance", value: null, description: "Business buys policy on key employee; business is owner and beneficiary. Premium NOT deductible; death benefit IS tax-free." },
          { label: "Buy-sell agreement", value: null, description: "Partners/shareholders fund buyout with life insurance. Cross-purchase (each buys on others) vs. entity purchase (company buys)." },
          { label: "COLI (Corporate-Owned Life Insurance)", value: null, description: "Employer buys group policies on employees. Must comply with IRC §101(j) — requires employee notice and consent." },
          { label: "Section 162 bonus plan", value: null, description: "Employer pays policy premium as a bonus to executive. Bonus is deductible to employer, taxable income to employee." },
          { label: "Split-dollar plan", value: null, description: "Employer and employee share premium costs and policy benefits. Complex — seek tax counsel." },
        ]},
        { type: "callout", kind: "test_trick", text: "Key person: premium NOT deductible, death benefit IS tax-free. Opposite of most business expenses. Know this cold." },
        { type: "heading", text: "Group Life Insurance" },
        { type: "table", rows: [
          { label: "Group term life — tax exclusion", value: "$50,000", description: "Employer-provided group term life up to $50,000 face amount: tax-free benefit to employee." },
          { label: "Above $50k", value: null, description: "Employer-paid premiums on coverage above $50k = imputed income (taxed to employee) per IRS Table I rates." },
          { label: "Conversion right", value: "31 days", description: "Terminated employee has 31 days to convert group term to individual permanent policy without evidence of insurability." },
          { label: "Minimum participation", value: "75%", description: "Non-contributory group plan requires 100% participation; contributory plan typically requires 75%." },
        ]},
        { type: "heading", text: "Life Insurance Death Benefit Taxation" },
        { type: "table", rows: [
          { label: "Death benefit (normal)", value: "Tax-free", description: "IRC §101(a): life insurance proceeds paid by reason of death are excluded from gross income." },
          { label: "Interest on installment settlement", value: "Taxable", description: "If insurer holds proceeds and pays interest, the interest portion is taxable ordinary income." },
          { label: "Transfer for value rule", value: null, description: "If policy is sold (transferred) for value, death benefit becomes taxable EXCEPT in specific exceptions (insured, partner, corporation, etc.)." },
        ]},
      ]
    },

    federal_tax_considerations_f__: {
      title: "FEDERAL TAX CONSIDERATIONS",
      subtitle: "Modified endowment contracts · 1035 exchanges · business insurance · group life",
      blocks: [
        { type: "heading", text: "See federal_tax_considerations above" },
      ]
    },

    master_numbers_drill: {
      title: "MASTER NUMBERS DRILL",
      subtitle: "Every testable number — time periods, fees, percentages, claims windows",
      blocks: [
        { type: "heading", text: "Time Periods" },
        { type: "table", rows: [
          { label: "Free-look period", value: "10 days", description: "Return policy for full refund. (20 days in some states for seniors or replacement policies.)" },
          { label: "Grace period", value: "31 days", description: "Policy stays in force; premiums still due." },
          { label: "Incontestability clause", value: "2 years", description: "Insurer cannot contest after 2 years in force (except fraud)." },
          { label: "Suicide clause", value: "2 years", description: "Premium refund (not DB) if suicide within 2 years." },
          { label: "Reinstatement window", value: "3–5 years", description: "Varies by state; requires evidence of insurability and back premiums." },
          { label: "MEC 7-pay test", value: "7 years", description: "Corridor test for life insurance to avoid MEC classification." },
          { label: "Group conversion right", value: "31 days", description: "Convert group term to individual permanent without evidence of insurability after employment termination." },
          { label: "Disability waiting period (WP rider)", value: "6 months", description: "Waiver of premium kicks in after total disability lasts 6 months. Premiums retroactively refunded." },
          { label: "Annuity surrender charge period", value: "5–15 years", description: "Typical range for insurance company surrender charges on deferred annuities." },
          { label: "Early withdrawal penalty age", value: "59½", description: "Before age 59½, withdrawals from MECs, annuities, and qualified plans trigger 10% penalty." },
          { label: "Required Minimum Distribution (RMD)", value: "73", description: "Must begin RMDs from qualified plans at age 73 (SECURE 2.0 Act)." },
        ]},
        { type: "heading", text: "Money & Percentages" },
        { type: "table", rows: [
          { label: "Group life tax exclusion", value: "$50,000", description: "Employer-paid group term life face amount excluded from employee's income." },
          { label: "MEC pre-59½ penalty", value: "10%", description: "Added to ordinary income tax on taxable MEC distributions." },
          { label: "Early distribution penalty (IRAs/annuities)", value: "10%", description: "Same 10% penalty applies to IRA, 403b, and non-qualified annuity gains before 59½." },
          { label: "Free withdrawal on annuity", value: "10%/yr", description: "Most deferred annuities allow 10% of account value without surrender charge annually." },
          { label: "Group plan participation (contributory)", value: "75%", description: "Minimum employee participation required when employees share premium cost." },
          { label: "Group plan participation (non-contributory)", value: "100%", description: "Employer pays all premium — all eligible employees must be covered." },
          { label: "NAIC UTPA fine (non-willful)", value: "$1,000", description: "Per violation under NAIC model unfair trade practices act." },
          { label: "NAIC UTPA fine (willful)", value: "$25,000", description: "Per willful violation." },
          { label: "Participating plan dividend", value: "Not taxable", description: "Policy dividends on life insurance = return of overpaid premium, NOT income." },
          { label: "Illustration guaranteed rate (minimum)", value: "2–3%", description: "Minimum guaranteed interest rate credited on fixed universal life and whole life policies." },
        ]},
        { type: "heading", text: "Key Concept Numbers" },
        { type: "table", rows: [
          { label: "Standard fire policy (dwelling) co-insurance", value: "80%", description: "Property insured to at least 80% of replacement value to collect full loss (property concept, for context)." },
          { label: "ADB (accidental death benefit)", value: "2× face", description: "Typically double indemnity; some riders pay 3×." },
          { label: "Loss of income replacement (disability)", value: "60–80%", description: "Typical individual disability policy replaces 60–80% of pre-disability income." },
          { label: "Illustration non-guaranteed projection", value: "2 rates", description: "Illustrations must show guaranteed and current (non-guaranteed) scales per NAIC model." },
          { label: "Replacement NAIC model form", value: "21 days", description: "Replacing insurer must provide Notice Regarding Replacement; existing insurer has 21 days to respond." },
          { label: "HIPAA pre-existing condition exclusion limit", value: "12 months", description: "Group health plan pre-existing condition exclusion cannot exceed 12 months (18 for late enrollees)." },
        ]},
      ]
    },
  }, // end life

  /* ══════════════════════════════════════════════════════════
     HEALTH LINE
     ══════════════════════════════════════════════════════════ */
  health: {
    insurance_regulation: {
      title: "INSURANCE REGULATION (HEALTH)",
      subtitle: "State DOI · producer licensing · unfair trade practices · market conduct",
      blocks: [
        { type: "heading", text: "State DOI Authority" },
        { type: "table", rows: [
          { label: "Commissioner authority", value: null, description: "Regulate health insurers, HMOs, rates, forms, and agent conduct." },
          { label: "Market conduct exam", value: null, description: "Reviews insurer claims handling, marketing practices, and underwriting procedures." },
          { label: "Form filing", value: null, description: "Most states require health policy forms to be approved before sale (prior approval) or filed before use (file and use)." },
        ]},
        { type: "heading", text: "Producer Licensing — Health Line" },
        { type: "table", rows: [
          { label: "Health license", value: null, description: "Separate line of authority from life; must be licensed for each line sold." },
          { label: "CE requirements", value: null, description: "State-specific; commonly 24 hours per 2-year cycle; often includes ethics hours." },
          { label: "Medicare/Medicaid marketing rules", value: null, description: "CMS rules apply in addition to state DOI rules; no unsolicited door-to-door sales, no gifts over $15." },
          { label: "ACA marketplace (Exchange) certification", value: null, description: "Agents selling on Exchange must complete annual CMS training and certification." },
        ]},
        { type: "heading", text: "Unfair Trade Practices (Health-Specific)" },
        { type: "table", rows: [
          { label: "Misrepresentation of benefits", value: null, description: "Overstating covered benefits or understating exclusions." },
          { label: "Cherry picking / redlining", value: null, description: "Refusing to market or sell to certain zip codes or demographic groups. Illegal." },
          { label: "Illegal inducements", value: null, description: "Gifts, free services, or other inducements beyond policy benefits. Medicare rules: ≤$15 per item, ≤$75/yr." },
          { label: "Churning (health)", value: null, description: "Repeatedly replacing policies with similar products for commissions." },
        ]},
        { type: "callout", kind: "warning", text: "Medicare marketing rules are federal (CMS), not just state. Violations can result in exclusion from Medicare/Medicaid programs — a career-ending consequence." },
      ]
    },

    health_insurance_basics: {
      title: "HEALTH INSURANCE BASICS",
      subtitle: "Plan types · HMO/PPO/POS/HDHP · insuring concepts · group vs. individual",
      blocks: [
        { type: "heading", text: "Types of Health Plans" },
        { type: "table", rows: [
          { label: "HMO (Health Maintenance Organization)", value: null, description: "Network-only care; requires PCP (primary care physician) gatekeeper; referrals needed for specialists. Lowest out-of-pocket." },
          { label: "PPO (Preferred Provider Organization)", value: null, description: "In-network (preferred) and out-of-network options. No referrals needed. More flexibility, higher cost." },
          { label: "EPO (Exclusive Provider Organization)", value: null, description: "Network-only like HMO but no PCP or referral requirement. No out-of-network except emergency." },
          { label: "POS (Point of Service)", value: null, description: "HMO-PPO hybrid. PCP and referrals required for in-network (HMO-like); can go out-of-network at higher cost (PPO-like)." },
          { label: "HDHP (High Deductible Health Plan)", value: null, description: "Higher deductible than traditional plans; qualifies for HSA contributions. Lower premiums." },
        ]},
        { type: "callout", kind: "test_trick", text: "HMO = gatekeeper (PCP) + referrals + network only. PPO = no gatekeeper + no referrals + can go out of network (pay more). POS = hybrid." },
        { type: "heading", text: "Cost-Sharing Concepts" },
        { type: "table", rows: [
          { label: "Premium", value: null, description: "Monthly payment to maintain coverage; does NOT count toward deductible." },
          { label: "Deductible", value: null, description: "Amount insured pays out-of-pocket before insurance pays (except preventive care under ACA)." },
          { label: "Copay", value: null, description: "Fixed dollar amount per visit/service. Does not typically apply toward deductible." },
          { label: "Coinsurance", value: null, description: "Percentage split after deductible (e.g., 80/20 — insurer pays 80%, insured pays 20%)." },
          { label: "Out-of-pocket maximum", value: null, description: "Once reached, insurer pays 100%. ACA plans must have an annual OOP max." },
          { label: "Stop-loss", value: null, description: "Group plan feature — specific (per person) and aggregate (plan total) stop-loss limits." },
        ]},
        { type: "heading", text: "Group vs. Individual Health Insurance" },
        { type: "table", rows: [
          { label: "Group plan", value: null, description: "Issued to employer or association; employees are certificate holders. Underwriting based on the GROUP." },
          { label: "Individual plan", value: null, description: "Issued directly to the individual; ACA marketplace or off-exchange. Underwriting limited under ACA (no medical underwriting for essential benefits)." },
          { label: "ERISA", value: null, description: "Federal law governing employer-sponsored plans. Preempts most state insurance law for self-funded plans." },
          { label: "COBRA", value: null, description: "Continuation coverage for up to 18 months (36 months certain events) after job loss. Employee pays full premium + 2% admin." },
          { label: "HIPAA portability", value: null, description: "Limits pre-existing condition exclusions when moving from group to group plan. Creditable coverage reduces exclusion period." },
        ]},
        { type: "callout", kind: "warning", text: "SELF-FUNDED employer plans are governed by ERISA — state insurance regulations generally do NOT apply to them (benefit mandates, state reserve requirements, etc.)." },
      ]
    },

    medicare_and_medicaid: {
      title: "MEDICARE & MEDICAID",
      subtitle: "Parts A/B/C/D · Medicare Supplement · MAPD · Medicaid eligibility",
      blocks: [
        { type: "heading", text: "Medicare Parts Overview" },
        { type: "table", rows: [
          { label: "Part A — Hospital", value: "Mostly free", description: "Hospital stays, skilled nursing facility (SNF), hospice, limited home health. Most pay $0 premium (40 quarters of work)." },
          { label: "Part B — Medical", value: "$174.70/mo (2024)", description: "Doctor visits, outpatient services, durable medical equipment, preventive care. Premium income-adjusted (IRMAA)." },
          { label: "Part C — Medicare Advantage (MA/MAPD)", value: null, description: "Private insurer packages A+B (and usually D). Must cover all original Medicare benefits. May include extras (dental, vision, fitness)." },
          { label: "Part D — Prescription Drugs", value: "Varies", description: "Prescription drug coverage via private plan. Voluntary. Late enrollment penalty if not enrolled when first eligible." },
        ]},
        { type: "callout", kind: "test_trick", text: "Part A = Hospital (think: A for Admit). Part B = Basic medical (think: B for Bills/Doctors). Part C = Choice (private MA plans). Part D = Drugs." },
        { type: "heading", text: "Medicare Part A Cost-Sharing (2024 approximate)" },
        { type: "table", rows: [
          { label: "Inpatient deductible", value: "$1,632", description: "Per benefit period (not per year). Patient pays this before Part A covers inpatient." },
          { label: "Days 1–60", value: "$0/day", description: "Part A covers 100% after deductible." },
          { label: "Days 61–90", value: "$408/day", description: "Coinsurance per day in a benefit period." },
          { label: "Days 91–150 (lifetime reserve)", value: "$816/day", description: "60 lifetime reserve days; each used once." },
          { label: "SNF days 1–20", value: "$0/day", description: "Part A covers fully after qualifying hospital stay (3+ days)." },
          { label: "SNF days 21–100", value: "$204/day", description: "Coinsurance; patient pays daily." },
          { label: "SNF days 101+", value: "Full cost", description: "Part A stops; no coverage. Medigap or self-pay." },
        ]},
        { type: "heading", text: "Medicare Supplement (Medigap)" },
        { type: "table", rows: [
          { label: "What it is", value: null, description: "Private policy that pays Medicare's cost-sharing gaps (deductibles, coinsurance, copays)." },
          { label: "Standardized plans", value: "A–N", description: "Plans A, B, C, D, F, G, K, L, M, N (C and F not available to post-2020 enrollees)." },
          { label: "Open enrollment", value: "6 months", description: "6-month window starting when Part B effective; guaranteed issue, no health questions. After: underwriting applies in most states." },
          { label: "Best-selling plans", value: "G and N", description: "Plan G: covers most gaps except Part B deductible. Plan N: lower premium; $20/$50 copays at some visits." },
          { label: "Foreign travel emergency", value: "Plans C,D,F,G,M,N", description: "80% of covered costs after $250 deductible; up to $50,000 lifetime." },
        ]},
        { type: "heading", text: "Medicaid" },
        { type: "table", rows: [
          { label: "What it is", value: null, description: "Joint federal-state program for low-income individuals and families. Eligibility varies by state." },
          { label: "Dual eligibles", value: null, description: "Enrolled in both Medicare AND Medicaid. Medicaid pays Medicare premiums and cost-sharing." },
          { label: "Long-term care (LTC) in Medicaid", value: null, description: "Medicaid pays nursing home costs for those who meet income/asset limits. Look-back period: 5 years." },
        ]},
        { type: "callout", kind: "warning", text: "Medigap plans sold to enrollees in Medicare Advantage are generally NOT allowed (can't use both simultaneously). Agents must ensure clients are on Original Medicare before selling Medigap." },
      ]
    },

    master_numbers_drill: {
      title: "MASTER NUMBERS DRILL (HEALTH)",
      subtitle: "Every testable number for the health line exam",
      blocks: [
        { type: "heading", text: "Time Periods — Health" },
        { type: "table", rows: [
          { label: "Free-look period", value: "10 days", description: "Standard; 30 days for Medicare supplement policies in some states." },
          { label: "Grace period (individual)", value: "31 days", description: "After premium due date; policy stays in force." },
          { label: "COBRA continuation", value: "18 months", description: "Standard after job loss or hours reduction. 29 months if disabled; 36 months for other qualifying events (death, divorce, Medicare)." },
          { label: "HIPAA pre-existing condition exclusion max", value: "12 months", description: "Group plan limit (18 months for late enrollees). Creditable coverage offsets exclusion period." },
          { label: "Open enrollment (Medigap)", value: "6 months", description: "Guaranteed issue window after Part B effective date." },
          { label: "ACA marketplace OEP", value: "Nov 1 – Jan 15", description: "Annual Open Enrollment Period for ACA Exchange plans (federal; state dates may vary)." },
          { label: "Special enrollment period (SEP)", value: "60 days", description: "Window after qualifying life event (job loss, marriage, birth) to enroll/change ACA plan." },
          { label: "Medicare OEP (Part D)", value: "Oct 15 – Dec 7", description: "Annual Election Period; changes effective Jan 1." },
          { label: "Late enrollment penalty — Part B", value: "10%/yr", description: "10% added to Part B premium for each 12-month period eligible but not enrolled." },
          { label: "Late enrollment penalty — Part D", value: "1%/mo", description: "1% per month without creditable drug coverage." },
        ]},
        { type: "heading", text: "Money & Percentages — Health" },
        { type: "table", rows: [
          { label: "Medicare Part A deductible (2024)", value: "$1,632", description: "Per benefit period." },
          { label: "Part B deductible (2024)", value: "$240", description: "Annual; after this Part B pays 80%." },
          { label: "Part B standard premium (2024)", value: "$174.70/mo", description: "Income-adjusted (IRMAA) for higher earners." },
          { label: "Medigap foreign travel benefit cap", value: "$50,000", description: "Lifetime maximum for emergency foreign travel under Plans C, D, F, G, M, N." },
          { label: "Medicare gift limit", value: "$15/$75", description: "Marketing gifts ≤ $15 per item; ≤ $75 aggregate per person per year." },
          { label: "HDHP minimum deductible (2024)", value: "$1,600 self / $3,200 family", description: "Required to qualify for HSA contributions." },
          { label: "HSA contribution limit (2024)", value: "$4,150 self / $8,300 family", description: "Annual HSA contribution limit for HDHP enrollees." },
          { label: "ACA income threshold — Medicaid expansion", value: "138% FPL", description: "States that expanded Medicaid cover adults up to 138% of Federal Poverty Level." },
          { label: "ACA subsidies (premium tax credits)", value: "100–400% FPL", description: "Traditional range; ARP/IRA extended subsidies beyond 400% FPL through 2025." },
        ]},
      ]
    },
  }, // end health

  /* ══════════════════════════════════════════════════════════
     ANNUITY LINE (focused study guide)
     ══════════════════════════════════════════════════════════ */
  annuity: {
    insurance_regulation: {
      title: "INSURANCE REGULATION (ANNUITY)",
      subtitle: "NAIC Model 275 · suitability · best interest · producer requirements",
      blocks: [
        { type: "heading", text: "NAIC Suitability in Annuity Transactions (Model 275)" },
        { type: "table", rows: [
          { label: "Best interest standard", value: null, description: "Agent must recommend annuity in the consumer's best interest — not merely suitable." },
          { label: "Care obligation", value: null, description: "Know the consumer; only recommend annuities that are in their best interest given financial situation, needs, and objectives." },
          { label: "Disclosure obligation", value: null, description: "Disclose agent's role, compensation structure, and any conflicts of interest." },
          { label: "Conflict of interest", value: null, description: "Agent must identify, avoid where possible, and otherwise disclose conflicts of interest." },
          { label: "Documentation obligation", value: null, description: "Document the basis for each recommendation." },
        ]},
        { type: "heading", text: "Producer Training Requirements" },
        { type: "table", rows: [
          { label: "Initial annuity training", value: "4 hours", description: "Required before selling annuities in most states; product-specific training from carrier or CE provider." },
          { label: "Senior suitability training", value: "4–8 hours", description: "State-specific requirement before selling annuities to seniors (check your state)." },
          { label: "CE for annuity specialty", value: "Varies", description: "Some states require dedicated annuity CE hours as part of license renewal." },
        ]},
        { type: "callout", kind: "warning", text: "Selling an annuity that is NOT in the consumer's best interest — even if it passes the older 'suitability' test — is a violation under Model 275 states. Know the difference." },
      ]
    },

    annuity_basics: {
      title: "ANNUITY BASICS",
      subtitle: "Fixed · variable · indexed · immediate · deferred",
      blocks: [
        { type: "heading", text: "Annuity Types" },
        { type: "table", rows: [
          { label: "Fixed annuity", value: null, description: "Guaranteed minimum interest rate; insurer bears all investment risk. General account. No securities license needed." },
          { label: "Variable annuity", value: null, description: "Sub-accounts (like mutual funds); not guaranteed. Separate account. Requires Series 6 or 7 + life license." },
          { label: "Fixed Indexed Annuity (FIA/EIA)", value: null, description: "Returns linked to index (floor = 0%, cap varies). NOT a security. No guaranteed positive return above 0%." },
          { label: "Immediate annuity (SPIA)", value: null, description: "Payments begin within one period of purchase (usually 30 days/1 month). Single lump sum premium." },
          { label: "Deferred annuity", value: null, description: "Accumulation phase now; annuitization later. Can be fixed, variable, or indexed." },
          { label: "MYGA (Multi-Year Guaranteed Annuity)", value: null, description: "Fixed annuity with guaranteed rate for specified period (e.g., 3, 5, 7 years). Like a CD but inside an annuity." },
        ]},
        { type: "heading", text: "Key Contract Features" },
        { type: "table", rows: [
          { label: "Free withdrawal provision", value: "10%/yr", description: "Most deferred annuities allow 10% of account value to be withdrawn annually without surrender charges." },
          { label: "Surrender charge schedule", value: "5–15 yrs", description: "Typically 7–10 years declining; e.g., 7%, 6%, 5%... then 0%." },
          { label: "Participation rate", value: null, description: "FIA: % of index gain credited. E.g., 80% participation rate on 10% S&P gain = 8% credited." },
          { label: "Cap rate", value: null, description: "FIA: maximum return credited in a period regardless of index gain." },
          { label: "Spread/margin", value: null, description: "FIA: insurer subtracts a percentage from index gain before crediting (e.g., index +10%, spread 2% = 8% credited)." },
          { label: "Guaranteed minimum accumulation benefit (GMAB)", value: null, description: "Variable annuity rider: guarantees account won't drop below a certain value after a specified period." },
          { label: "Guaranteed lifetime withdrawal benefit (GLWB)", value: null, description: "Rider that guarantees a minimum annual withdrawal amount for life, regardless of account performance." },
        ]},
        { type: "callout", kind: "test_trick", text: "FIA floor = 0% — worst case is you earn nothing, not lose money (from index). But fees, spreads, and caps can still reduce effective return." },
      ]
    },

    tax_treatment: {
      title: "TAX TREATMENT (ANNUITIES)",
      subtitle: "Non-qualified · qualified · 1035 exchange · LIFO · penalties",
      blocks: [
        { type: "heading", text: "Non-Qualified Annuity Taxation" },
        { type: "table", rows: [
          { label: "Funding", value: "After-tax dollars", description: "Premiums paid with money already taxed; no deduction." },
          { label: "Accumulation", value: "Tax-deferred", description: "Growth inside annuity not taxed until distributed." },
          { label: "LIFO distribution rule", value: null, description: "Last In, First Out — gains come out FIRST. All withdrawals taxed as ordinary income until basis is reached." },
          { label: "Exclusion ratio (annuitized)", value: null, description: "Once annuitized, each payment = (investment / expected return) × tax-free + remainder taxable." },
          { label: "Pre-59½ penalty", value: "10%", description: "10% penalty on taxable distributions before age 59½ in addition to income tax." },
          { label: "Death of owner (non-spouse)", value: null, description: "Beneficiary must begin distributions within 5 years OR over their life expectancy. Gains are taxable." },
        ]},
        { type: "heading", text: "Qualified Annuity Taxation" },
        { type: "table", rows: [
          { label: "Funding", value: "Pre-tax dollars", description: "IRA, 403b, SEP — contributions may be deductible." },
          { label: "Distribution", value: "100% taxable", description: "Entire payment taxed as ordinary income (no exclusion ratio — no basis)." },
          { label: "RMD requirement", value: "Age 73", description: "Required Minimum Distributions must begin by April 1 of the year following the year owner turns 73 (SECURE 2.0)." },
          { label: "Roth IRA annuity", value: "Tax-free distribution", description: "Qualified Roth distributions (account >5 years, age 59½+) are tax-free including growth." },
        ]},
        { type: "heading", text: "1035 Exchange" },
        { type: "table", rows: [
          { label: "Annuity → Annuity", value: "✓ tax-free", description: "Tax-free exchange under IRC §1035; basis carries over." },
          { label: "Life → Annuity", value: "✓ tax-free", description: "Allowed; basis carries over." },
          { label: "Annuity → Life", value: "✗ NOT allowed", description: "Cannot exchange annuity for life policy tax-free." },
          { label: "Partial 1035 exchange", value: "Allowed", description: "Can exchange part of an annuity to another annuity; must track basis carefully." },
          { label: "Surrender charges", value: "Still apply", description: "1035 exchange doesn't eliminate the existing carrier's surrender charges." },
        ]},
        { type: "callout", kind: "warning", text: "1035 exchange from an annuity to a life insurance policy is NOT allowed. Many clients ask for this — you must decline and explain why." },
      ]
    },

    master_numbers_drill: {
      title: "MASTER NUMBERS DRILL (ANNUITY)",
      subtitle: "Critical numbers for the annuity licensing exam",
      blocks: [
        { type: "heading", text: "Time Periods" },
        { type: "table", rows: [
          { label: "Free-look period (annuity)", value: "10–30 days", description: "State varies; many states require 20–30 days for annuity free-look. Know your state." },
          { label: "Surrender charge period", value: "5–15 years", description: "Typical range; most common is 7–10 years declining." },
          { label: "Pre-59½ early withdrawal penalty", value: "10%", description: "Plus ordinary income tax on taxable portion." },
          { label: "RMD start age (SECURE 2.0)", value: "Age 73", description: "Required Minimum Distributions from qualified annuities/IRAs." },
          { label: "5-year non-spouse death distribution", value: "5 years", description: "Non-spouse beneficiary must distribute non-qualified annuity within 5 years OR take life-expectancy payments." },
        ]},
        { type: "heading", text: "Money & Percentages" },
        { type: "table", rows: [
          { label: "Free withdrawal provision", value: "10%/yr", description: "Standard; without incurring surrender charge from insurer." },
          { label: "FIA floor", value: "0%", description: "Worst-case return in an indexed crediting period — you don't participate in index losses." },
          { label: "Suitability training (initial)", value: "4 hours", description: "Before selling first annuity in most states." },
          { label: "Senior suitability training", value: "4–8 hrs", description: "State-specific; required before selling annuities to seniors." },
          { label: "IRA contribution limit (2024)", value: "$7,000", description: "$8,000 if age 50+ (catch-up)." },
          { label: "401(k) contribution limit (2024)", value: "$23,000", description: "$30,500 if age 50+ (catch-up)." },
        ]},
      ]
    },
  }, // end annuity

  /* ══════════════════════════════════════════════════════════
     MORTGAGE PROTECTION LINE
     ══════════════════════════════════════════════════════════ */
  mortgage_protection: {
    mortgage_protection_concept: {
      title: "MORTGAGE PROTECTION CONCEPT",
      subtitle: "Sold under Life LoA · term-life mechanics · target market",
      blocks: [
        { type: "heading", text: "What Mortgage Protection Is" },
        { type: "intro", text: "Mortgage protection insurance is term life insurance designed to pay off or reduce a mortgage balance if the insured dies. It is sold under the Life Line of Authority — NOT a separate license." },
        { type: "table", rows: [
          { label: "License required", value: "Life LoA", description: "Mortgage protection is a life insurance product. Must hold a state Life producer license." },
          { label: "Decreasing term", value: null, description: "Most classic MP policies are decreasing term — death benefit decreases as mortgage balance decreases." },
          { label: "Level term", value: null, description: "Level-benefit version: pays the original mortgage amount regardless of remaining balance. More consumer-friendly." },
          { label: "Return of premium (ROP)", value: null, description: "Premiums returned if insured survives the term. Common up-sell in MP market." },
          { label: "Living benefits", value: null, description: "Many MP products include critical illness, chronic illness, or terminal illness accelerated death benefit riders." },
        ]},
        { type: "callout", kind: "test_trick", text: "Mortgage Protection IS life insurance. It is sold and regulated as a life product. The only thing that makes it 'MP' is the marketing angle." },
      ]
    },

    marketing_and_advertising_rules: {
      title: "MARKETING & ADVERTISING RULES",
      subtitle: "NAIC Model 880 · no misrepresentation · no false bank affiliation",
      blocks: [
        { type: "heading", text: "NAIC Model 880 — Life Insurance Advertising" },
        { type: "table", rows: [
          { label: "Coverage", value: null, description: "Applies to all life insurance advertising including direct mail, digital, TV, radio, and in-person presentations." },
          { label: "Identify the product clearly", value: null, description: "Ads must clearly identify that the product being offered is life insurance." },
          { label: "No misleading format", value: null, description: "Cannot use formats that imply a government agency or bank affiliation." },
          { label: "No fictitious names", value: null, description: "Cannot imply coverage is offered by a government entity (Social Security, FHA, etc.)." },
        ]},
        { type: "heading", text: "Mortgage Protection — Specific Rules" },
        { type: "table", rows: [
          { label: "No false bank affiliation", value: null, description: "Cannot imply that the mailer or offer comes from the homeowner's lender/mortgage servicer." },
          { label: "No official government look", value: null, description: "Mailers cannot be designed to look like government documents or notices." },
          { label: "Disclosure of insurer name", value: null, description: "All marketing materials must disclose the actual insurance company's name." },
          { label: "No false urgency", value: null, description: "Cannot create false deadlines or claim coverage will expire unless the consumer acts now." },
        ]},
        { type: "callout", kind: "warning", text: "Using a mailer that LOOKS like it came from the homeowner's bank or a government agency is a serious UTPA violation — misrepresentation and affiliation fraud." },
        { type: "heading", text: "Direct Mail Compliance" },
        { type: "bullets", items: [
          { bold: "Must include:", text: "Insurer name, producer name and license number, clear statement that it is an advertisement for life insurance." },
          { bold: "Cannot include:", text: "Government seals, bank logos, or any design element that implies official government or lender correspondence." },
          { bold: "Return address:", text: "Must be the producer's or insurer's actual address — not a fictitious entity." },
          { bold: "opt-out:", text: "Must include instructions for opting out of future mailings." },
        ]},
      ]
    },

    unfair_trade_practices: {
      title: "UNFAIR TRADE PRACTICES (MORTGAGE PROTECTION)",
      subtitle: "Twisting · churning · sliding · rebating — heightened scrutiny",
      blocks: [
        { type: "heading", text: "Core UTPA Violations in the MP Market" },
        { type: "table", rows: [
          { label: "Twisting", value: null, description: "Persuading a homeowner to replace their existing life/MP policy with a new one through misrepresentation of benefits, terms, or insurer strength." },
          { label: "Churning", value: null, description: "Using a policy's own cash values to fund a new replacement — generating commissions at the client's expense." },
          { label: "Sliding", value: null, description: "Adding riders or coverages without informed consent; e.g., adding an accidental death rider without the homeowner's agreement." },
          { label: "Rebating", value: null, description: "Offering the client cash, gifts, or other inducements not specified in the policy as incentive to buy." },
          { label: "Misrepresentation", value: null, description: "Falsely representing the mortgage company as the sender, or misrepresenting policy benefits, premium, or term." },
        ]},
        { type: "callout", kind: "warning", text: "The MP market has HIGH scrutiny from DOIs because of aggressive direct mail. Every step of the sales process must be transparent. Violations can result in license revocation." },
        { type: "heading", text: "Replacement Rules" },
        { type: "table", rows: [
          { label: "Replacement definition", value: null, description: "Replacing an existing life/annuity policy with a new one; triggers special disclosure requirements." },
          { label: "Notice of replacement", value: null, description: "Agent must give consumer a completed Notice Regarding Replacement form BEFORE delivering the new policy application." },
          { label: "Comparison disclosure", value: null, description: "Agent must provide a detailed comparison of old vs. new policy features, costs, and benefits." },
          { label: "Existing insurer notification", value: "21 days", description: "Existing insurer must be notified of replacement; has 21 days to contact the policyholder with information." },
        ]},
      ]
    },

    master_numbers_drill: {
      title: "MASTER NUMBERS DRILL (MORTGAGE PROTECTION)",
      subtitle: "Key numbers for the MP / Life exam",
      blocks: [
        { type: "heading", text: "Numbers to Know" },
        { type: "table", rows: [
          { label: "Free-look period", value: "10 days", description: "Minimum; some states 20–30 days for life/annuity." },
          { label: "Grace period", value: "31 days", description: "After missed premium; policy stays in force." },
          { label: "Incontestability", value: "2 years", description: "Cannot contest after 2 years in force (except fraud)." },
          { label: "Existing insurer notification (replacement)", value: "21 days", description: "Existing insurer has 21 days to contact policyholder after replacement notification." },
          { label: "Notice Regarding Replacement", value: "Before application", description: "Must be provided to consumer BEFORE taking a replacement application." },
          { label: "UTPA fine (non-willful)", value: "up to $1,000", description: "Per violation under NAIC model." },
          { label: "UTPA fine (willful)", value: "up to $25,000", description: "Per willful violation." },
        ]},
      ]
    },
  }, // end mortgage_protection
};

// Lookup a hardcoded guide section by line + domain
function getStaticGuideSection(lineId, domainName) {
  const key = domainKey(domainName);
  const lineGuides = GUIDES[lineId] || GUIDES["life"];
  // Direct hit
  if (lineGuides[key]) return lineGuides[key];
  // Try partial match (e.g. "Federal Tax Considerations f..." → "federal_tax_considerations")
  const partialKey = Object.keys(lineGuides).find(k => k.startsWith(key.slice(0, 12)));
  if (partialKey) return lineGuides[partialKey];
  // Cross-line fallback for common sections
  if (GUIDES["life"][key]) return GUIDES["life"][key];
  // Final fallback: master numbers drill for the line
  return lineGuides["master_numbers_drill"] || null;
}

// Expose as global
window.LicensingStudyGuides = { GUIDES, domainKey, getStaticGuideSection };
})();
