import json

with open('lib/licensing-data.json', 'r') as f:
    data = json.load(f)

az = data['states']['AZ']

# 1. Update AZ Meta
if 'exam_meta' not in az:
    az['exam_meta'] = {}
az['exam_meta']['exam_vendor_primary'] = 'Prometric'
az['exam_meta']['state_content_outline_url'] = 'https://www.prometric.com/files/2019-12/13-31_0.pdf'
az['exam_meta']['state_doi_handbook_url'] = 'https://www.prometric.com/files/2019-12/13-31_0.pdf'

# 2. Update AZ Lines
if 'life' in az['lines']:
    az['lines']['life'].update({
        'exam_vendor': 'Prometric',
        'exam_fee_usd': 74,
        'exam_passing_score_pct': 70,
        'exam_question_count': 100,
        'exam_time_minutes': 120,
        'candidate_handbook_url': 'https://www.prometric.com/files/2019-12/13-31_0.pdf',
        'source_url': 'https://www.prometric.com/files/2019-12/13-31_0.pdf',
        'source_quote': 'Prometric Arizona Life Insurance Producer Examination Outline (Series 13-31, Effective Jan 22, 2020). 100 scored items, 2-hour time limit, 70% passing score. 7 Domains: Insurance Regulation (5%), General Insurance (10%), Life Insurance Basics (24%), Life Insurance Policies (23%), Policy Provisions/Options/Riders (23%), Annuities (10%), Federal Tax Considerations (5%).',
        'captured_at': '2026-07-03T00:00:00Z'
    })

if 'annuity' in az['lines']:
    az['lines']['annuity'].update({
        'exam_vendor': 'Prometric',
        'exam_fee_usd': 74,
        'exam_passing_score_pct': 70,
        'exam_question_count': 100,
        'exam_time_minutes': 120,
        'license_type_note': 'Fixed annuities are tested and sold under the Life Producer line of authority in Arizona (100-item Prometric Series 13-31 Exam). Producers must also complete the state-mandated 4-hour NAIC Model 275 Best Interest annuity training (A.R.S. 20-1243).',
        'candidate_handbook_url': 'https://www.prometric.com/files/2019-12/13-31_0.pdf',
        'source_url': 'https://www.prometric.com/files/2019-12/13-31_0.pdf',
        'source_quote': 'Prometric Series 13-31 covers Annuities (10% of exam) including A.R.S. 20-1243 Suitability rules.',
        'captured_at': '2026-07-03T00:00:00Z'
    })

if 'health' in az['lines']:
    az['lines']['health'].update({
        'exam_vendor': 'Prometric',
        'exam_fee_usd': 74,
        'exam_passing_score_pct': 70,
        'exam_question_count': 150,
        'exam_time_minutes': 150,
        'candidate_handbook_url': 'https://www.prometric.com/files/2019-12/13-33_4.pdf',
        'source_url': 'https://www.prometric.com/files/2019-12/13-33_4.pdf',
        'source_quote': 'Prometric Arizona Life, Accident & Health Producer Combo Exam Outline (Series 13-33, Effective Jan 22, 2020). 150 scored items, 2.5-hour time limit, 70% passing score.',
        'captured_at': '2026-07-03T00:00:00Z'
    })

# 3. Build AZ Varieties
az_life_variety = {
    'id': 'az_life_producer',
    'name': 'Arizona Life Insurance Producer (Series 13-31)',
    'series_code': 'Series 13-31',
    'exam_vendor': 'Prometric',
    'question_count': 100,
    'time_minutes': 120,
    'passing_score_pct': 70,
    'candidate_handbook_url': 'https://www.prometric.com/files/2019-12/13-31_0.pdf',
    'source_url': 'https://www.prometric.com/files/2019-12/13-31_0.pdf',
    'applies_to_lines': ['life', 'annuity'],
    'source_quote': 'Prometric Arizona Life Insurance Producer Examination Outline (Series 13-31, Effective Jan 22, 2020). 100 questions, 2 Hours, 70% passing score. 7 Domains.',
    'captured_at': '2026-07-03T00:00:00Z',
    'content_outline': [
        {
            'domain': 'Insurance Regulation',
            'weight_pct': 5,
            'item_count': 5,
            'topics': [
                'Licensing Requirements (A.R.S. 20-285, 20-284H exam attempts, 41-1080 lawful presence)',
                'Types of Licensees (Producers 20-281(5)/286, Nonresidents 20-281(11), Adjusters 20-321, Life Settlement Brokers 20-3202, Business entities 20-285, Surplus lines 20-407/411, Temporary 20-294)',
                'Fingerprinting & Background Checks (A.R.S. 20-142(E), 285(E), 286(C), 289(D))',
                'Maintenance & Duration (Expiration & renewal 20-289, Military inactive 20-289.01, Contact info change 20-286(C), Report of actions 20-301, Continuing education 20-2902/2903)',
                'Disciplinary Actions & Fines (Denial, suspension, revocation 20-295/296, Cease & desist 20-292)',
                'State Insurance Regulation (Transaction definition 20-106/282/401.01, Solicit/Sell/Negotiate 20-281, Certificate of Authority 20-217A, Commission sharing 20-298, Records 20-157/290)',
                'Unfair Trade Practices & Fraud (UTPA 20-442, Misrepresentation 20-443/Rule R20-6-801, False ads 20-444, Defamation 20-445, Coercion 20-446, Rebating 20-449, Inducements 20-452, Fees 20-465, Unfair claims 20-461, Fraud 20-463/466, Privacy 20-2101)',
                'Federal Regulation (Violent Crime Control Act 20-489/18 USC 1033, FCRA 15 USC 1681, Telemarketing 16 CFR 310, CAN-SPAM 15 USC 7701, GLBA 20-2121, Terrorism Risk Act)'
            ]
        },
        {
            'domain': 'General Insurance',
            'weight_pct': 10,
            'item_count': 10,
            'topics': [
                'Definition of Insurance (A.R.S. 20-103)',
                'Risk Management Concepts (Risk, exposure, hazard, peril, loss; Avoidance, retention, sharing, reduction, transfer)',
                'Elements of Insurable Risk (Adverse selection, law of large numbers, reinsurance)',
                'Types of Insurers (Stock, mutual, fraternal 20-702/703, Captives 20-1098, Reciprocals 20-761, Risk retention groups 20-2401, Domestic/foreign/alien 20-201)',
                'Producers & Agency Law (Insurer as principal, Express/implied/apparent authority)',
                'Contract Law (Offer & acceptance, consideration, competent parties, legal purpose; Adhesion, personal, aleatory, unilateral, conditional; Utmost good faith, representations vs warranties, concealment, fraud, waiver & estoppel)'
            ]
        },
        {
            'domain': 'Life Insurance Basics',
            'weight_pct': 24,
            'item_count': 24,
            'topics': [
                'Insurable Interest (A.R.S. 20-443.02, 20-1104, 1106, 1107)',
                'Personal & Business Uses (Survivor protection, estate creation/conservation, liquidity, viatical settlements, buy-sell funding, key person, exec bonus)',
                'Determining Coverage Amount (Human life value vs needs approach)',
                'Classes of Policies (Group vs individual, ordinary vs industrial, permanent vs term, part vs nonpart, fixed vs variable A.R.S. 20-2604/2606/2662)',
                'Premiums (Mortality, interest, expense; Net single vs gross annual)',
                'Producer Responsibilities (Advertising Rule R20-6-202, policy summary Rule R20-6-209, buyer guide 20-1242.02, Life & Disability Guaranty Fund A.R.S. 20-443(6)/683, Replacement 20-1241-1241.09, Rule R20-6-212, field underwriting, delivery, effective date)',
                'Underwriting & Risk Selection (Producer report, APS, inspection report 20-2107, MIB, HIV testing A.R.S. 20-448.01/Rule R20-6-1203, blindness discrimination Rule R20-6-211, genetic testing 20-448D/E, risk classes, Certificate of Authority 20-206A)'
            ]
        },
        {
            'domain': 'Life Insurance Policies',
            'weight_pct': 23,
            'item_count': 23,
            'topics': [
                'Term Life (Level term, ART, level premium term, decreasing term)',
                'Whole Life (Straight life, limited payment, single premium)',
                'Flexible Premium Policies (Adjustable life, universal life, variable universal, index whole life)',
                'Specialized Policies (Joint life first-to-die, juvenile life, survivorship second-to-die)',
                'Group Life Insurance (Certificates A.R.S. 20-1265, group eligibility 20-1251, conversion right 20-1266-1269)',
                'Credit Life Insurance'
            ]
        },
        {
            'domain': 'Life Insurance Policy Provisions, Options and Riders',
            'weight_pct': 23,
            'item_count': 23,
            'topics': [
                'Standard Provisions (Ownership, assignment A.R.S. 20-1122/1277, limitation of liability 20-1226, entire contract 20-1205, free look Rule R20-6-209, grace period 20-1203/1259, reinstatement 20-1213, incontestability 20-1204/1217, misstatement of age 20-1206, policy title 20-1216, claims payment 20-1215)',
                'Beneficiaries (Designations, primary vs contingent, revocable vs irrevocable, common disaster clause)',
                'Settlement Options (Cash, interest only, fixed period, fixed amount, life income)',
                'Nonforfeiture Options (A.R.S. 20-1231 — Cash surrender, extended term, reduced paid-up)',
                'Policy Loans & Withdrawals (A.R.S. 20-1209, APL)',
                'Dividend Options (Cash, reduce premium, accumulate interest, 1-year term, paid-up additions)',
                'Disability & Living Benefit Riders (Waiver of premium, disability income, payor benefit, accelerated living benefits A.R.S. 20-1136, LTC riders)',
                'Additional Insured & Death Benefit Riders (Spouse/child term A.R.S. 20-1257, AD&D, guaranteed insurability, COLA, return of premium)'
            ]
        },
        {
            'domain': 'Annuities',
            'weight_pct': 10,
            'item_count': 10,
            'topics': [
                'Standard Provisions (Grace period A.R.S. 20-1219, incontestability 20-1220, entire contract 20-1221, misstatement of age 20-1222, reinstatement 20-1224, free look 20-1233, disclosures 20-1242)',
                'Annuity Principles (Accumulation vs annuity period, owner/annuitant/beneficiary)',
                'Immediate vs Deferred Annuities (SPIAs, deferred, nonforfeiture A.R.S. 20-1232, surrender charges, death benefits)',
                'Benefit Payment Options (Life contingency, pure life vs period certain, joint & survivor)',
                'Fixed & Equity Indexed Annuities (General account, interest rate guarantees, index participation)',
                'Uses & Suitability (Market value adjusted, qualified plans, annuity suitability A.R.S. 20-1243-1243.06)'
            ]
        },
        {
            'domain': 'Federal Tax Considerations for Life Insurance and Annuities',
            'weight_pct': 5,
            'item_count': 5,
            'topics': [
                'Taxation of Personal Life Insurance (Cash value growth, dividends, loans, surrenders, death benefit proceeds, estate tax values)',
                'Modified Endowment Contracts (MECs) (7-pay test, LIFO taxation, 10% IRS penalty)',
                'Taxation of Non-Qualified Annuities (Accumulation withdrawals, exclusion ratio, death distributions)',
                'Section 1035 Tax-Free Exchanges'
            ]
        }
    ]
}

az_combo_variety = {
    'id': 'az_life_accident_health',
    'name': 'Arizona Life, Accident & Health Producer (Series 13-33)',
    'series_code': 'Series 13-33',
    'exam_vendor': 'Prometric',
    'question_count': 150,
    'time_minutes': 150,
    'passing_score_pct': 70,
    'candidate_handbook_url': 'https://www.prometric.com/files/2019-12/13-33_4.pdf',
    'source_url': 'https://www.prometric.com/files/2019-12/13-33_4.pdf',
    'applies_to_lines': ['life', 'annuity', 'health'],
    'source_quote': 'Prometric Arizona Life, Accident & Health Producer Combo Exam Outline (Series 13-33, Effective Jan 22, 2020). 150 questions, 2.5 Hours, 70% passing score.',
    'captured_at': '2026-07-03T00:00:00Z',
    'content_outline': az_life_variety['content_outline']
}

az['exam_varieties'] = [az_life_variety, az_combo_variety]

with open('lib/licensing-data.json', 'w') as f:
    json.dump(data, f, indent=2)

print('Updated Arizona database in lib/licensing-data.json successfully!')
