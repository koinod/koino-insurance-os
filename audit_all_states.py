import json

with open('lib/licensing-data.json', 'r') as f:
    data = json.load(f)

states = data.get('states', {})

audit_results = {
    "fully_built": [],
    "partially_built": [],
    "pending": []
}

state_details = []

for code, s in sorted(states.items()):
    name = s.get('name', code)
    varieties = s.get('exam_varieties', [])
    lines = s.get('lines', {})
    exam_meta = s.get('exam_meta', {})
    
    # Check lines info
    life_line = lines.get('life', {})
    annuity_line = lines.get('annuity', {})
    health_line = lines.get('health', {})
    
    vendor = life_line.get('exam_vendor') or exam_meta.get('exam_vendor_primary') or "Unknown"
    bulletin_url = (life_line.get('candidate_handbook_url') or 
                    life_line.get('source_url') or 
                    exam_meta.get('state_content_outline_url') or 
                    exam_meta.get('state_doi_handbook_url'))
    
    # Analyze varieties
    has_curated_varieties = len(varieties) > 0 and not any(v.get('synthesized') for v in varieties)
    
    total_items = life_line.get('exam_question_count') or (varieties[0].get('question_count') if varieties else None)
    passing_score = life_line.get('exam_passing_score_pct') or (varieties[0].get('passing_score_pct') if varieties else None)
    time_mins = life_line.get('exam_time_minutes') or (varieties[0].get('time_minutes') if varieties else None)
    
    # Check content outline depth
    has_custom_outline = False
    state_law_topics_count = 0
    if varieties:
        v0 = varieties[0]
        outline = v0.get('content_outline') or []
        for d in outline:
            domain_name = d.get('domain', '')
            if 'Laws' in domain_name or 'Statutes' in domain_name or 'Rules' in domain_name or 'Regulations' in domain_name:
                state_law_topics_count += len(d.get('topics', []))
        if state_law_topics_count >= 5:
            has_custom_outline = True

    # Approved providers
    providers = s.get('approved_courses', [])
    provider_count = len(providers) if isinstance(providers, list) else 0

    # Determine status tier
    if has_curated_varieties and bulletin_url and total_items and passing_score and has_custom_outline:
        tier = "fully_built"
    elif has_curated_varieties or (bulletin_url and total_items):
        tier = "partially_built"
    else:
        tier = "pending"

    audit_results[tier].append(code)
    
    state_details.append({
        "code": code,
        "name": name,
        "tier": tier,
        "vendor": vendor,
        "bulletin_url": bulletin_url,
        "items": total_items,
        "passing_score": passing_score,
        "time_mins": time_mins,
        "varieties_count": len(varieties),
        "state_law_topics": state_law_topics_count,
        "providers_count": provider_count
    })

print(f"Audit Summary:")
print(f"  Fully Built Out: {len(audit_results['fully_built'])}")
print(f"  Partially Built / Solid Foundation: {len(audit_results['partially_built'])}")
print(f"  Pending Vendor Bulletin: {len(audit_results['pending'])}")

# Output markdown table
print("\nState Breakdown Table:")
print("| Code | State Name | Tier Status | Primary Vendor | Exam Qs | Pass % | Time (min) | Handbook / Bulletin Link |")
print("|---|---|---|---|---|---|---|---|")
for d in state_details:
    tier_label = "✅ Fully Built" if d['tier'] == "fully_built" else ("🟡 Partial" if d['tier'] == "partially_built" else "🔴 Pending")
    bulletin_link = f"[Bulletin]({d['bulletin_url']})" if d['bulletin_url'] else "Missing"
    print(f"| {d['code']} | {d['name']} | {tier_label} | {d['vendor']} | {d['items'] or '—'} | {d['passing_score'] or '—'}% | {d['time_mins'] or '—'} | {bulletin_link} |")
