import { Deal, PipelineLead, RecruitingCandidate, LeadVendor } from "./types";
import { initials } from "./format";

const deal = (
  id: string,
  agent: string,
  client: string,
  lead_source: string,
  carrier: Deal["carrier"],
  product: Deal["product"],
  ap: number,
  status: Deal["status"],
  policy: string | null,
  submitted: string | null,
  draft: string | null,
  deposits = 0,
  outstanding = 0
): Deal => {
  // Default commission rate: 75% AP for life, varies — close enough for demo
  const rate = product === "Final Expense" ? 0.85 : product === "Term" ? 0.55 : 0.75;
  const est_comm = Math.round(ap * rate);
  return {
    id,
    agent,
    agent_initials: initials(agent),
    client,
    lead_source,
    carrier,
    product,
    ap_cents: ap,
    est_comm_cents: est_comm,
    status,
    policy_number: policy,
    submitted_at: submitted,
    draft_date: draft,
    deposits_cents: deposits,
    outstanding_cents: outstanding,
  };
};

export const MOCK_DEALS: Deal[] = [
  deal("d1", "Marcus Chen", "Rebecca Holloway", "Goat Aged FEX 181+ Days Old", "Transamerica", "Whole Life", 184800, "Issued", "TA-94821", "2026-04-21", "2026-04-22", 184800, 0),
  deal("d2", "Jasmine Carter", "Daniel Whittaker", "Life Jacket Vet", "ETHOS", "Term", 96000, "Approved", "ET-55102", "2026-04-23", "2026-04-25", 0, 52800),
  deal("d3", "Marcus Chen", "Patricia Olabode", "Referral", "F&G", "IUL", 312000, "Underwriting", null, "2026-04-24", null, 0, 234000),
  deal("d4", "Tyrell Banks", "Joseph Brennan", "Goat Aged FEX 181+ Days Old", "Transamerica", "Final Expense", 88200, "Issued", "TA-94855", "2026-04-19", "2026-04-20", 88200, 0),
  deal("d5", "Jasmine Carter", "Linh Tran", "Life Jacket Vet", "ETHOS", "Term Super 10", 144000, "Underwriting", null, "2026-04-25", null, 0, 108000),
  deal("d6", "Devon Park", "Aaron Goldfarb", "Referral", "F&G", "Whole Life", 240000, "Approved", "FG-77821", "2026-04-22", "2026-04-26", 60000, 120000),
  deal("d7", "Tyrell Banks", "Maria Castillo", "Goat Aged FEX 181+ Days Old", "Transamerica", "Final Expense", 72000, "Issued", "TA-94912", "2026-04-18", "2026-04-19", 72000, 0),
  deal("d8", "Marcus Chen", "Kenji Yamamoto", "Referral", "F&G", "IUL", 480000, "Pending", null, "2026-04-26", null, 0, 360000),
  deal("d9", "Devon Park", "Sarah Linwood", "Life Jacket Vet", "ETHOS", "Term", 60000, "Declined", null, "2026-04-15", null, 0, 0),
  deal("d10", "Jasmine Carter", "Rashid Mwangi", "Goat Aged FEX 181+ Days Old", "Transamerica", "Whole Life", 168000, "Underwriting", null, "2026-04-24", null, 0, 126000),
  deal("d11", "Tyrell Banks", "Eloise Park", "Referral", "Mutual of Omaha", "Final Expense", 102000, "Issued", "MOO-31204", "2026-04-17", "2026-04-18", 102000, 0),
  deal("d12", "Marcus Chen", "Jonah Whitfield", "Life Jacket Vet", "Foresters", "Term", 84000, "Approved", "FOR-45221", "2026-04-23", "2026-04-25", 0, 46200),
  deal("d13", "Devon Park", "Adaeze Okonkwo", "Goat Aged FEX 181+ Days Old", "Americo", "Final Expense", 96000, "Issued", "AM-88412", "2026-04-20", "2026-04-21", 96000, 0),
  deal("d14", "Jasmine Carter", "Lukas Brennan", "Referral", "F&G", "IUL", 360000, "Submitted", null, "2026-04-26", null, 0, 270000),
  deal("d15", "Tyrell Banks", "Helena Vasquez", "Goat Aged FEX 181+ Days Old", "Transamerica", "Whole Life", 192000, "Underwriting", null, "2026-04-25", null, 0, 144000),
];

export const MOCK_PIPELINE: PipelineLead[] = [
  { id: "p1", name: "Cassandra Reeves", source: "Goat Aged FEX 181+ Days Old", stage: "New", agent: "Marcus Chen", attempts: 0, last_touch: "2026-04-27", est_ap_cents: 120000 },
  { id: "p2", name: "Henry Okafor", source: "Life Jacket Vet", stage: "Contacted", agent: "Jasmine Carter", attempts: 2, last_touch: "2026-04-26", est_ap_cents: 96000 },
  { id: "p3", name: "Leila Saadi", source: "Referral", stage: "Qualified", agent: "Marcus Chen", attempts: 3, last_touch: "2026-04-26", est_ap_cents: 240000 },
  { id: "p4", name: "Roy Tillman", source: "Goat Aged FEX 181+ Days Old", stage: "Quoted", agent: "Tyrell Banks", attempts: 4, last_touch: "2026-04-25", est_ap_cents: 84000 },
  { id: "p5", name: "Imani Brooks", source: "Life Jacket Vet", stage: "App Started", agent: "Devon Park", attempts: 5, last_touch: "2026-04-25", est_ap_cents: 144000 },
  { id: "p6", name: "Marcus Wenz", source: "Referral", stage: "Submitted", agent: "Jasmine Carter", attempts: 6, last_touch: "2026-04-24", est_ap_cents: 312000 },
  { id: "p7", name: "Olusegun Adeyemi", source: "Goat Aged FEX 181+ Days Old", stage: "Contacted", agent: "Marcus Chen", attempts: 1, last_touch: "2026-04-27", est_ap_cents: 108000 },
  { id: "p8", name: "Annika Sjoberg", source: "Web Form", stage: "New", agent: "—", attempts: 0, last_touch: "2026-04-27", est_ap_cents: 180000 },
  { id: "p9", name: "Devontae Marsh", source: "Goat Aged FEX 181+ Days Old", stage: "Quoted", agent: "Tyrell Banks", attempts: 4, last_touch: "2026-04-26", est_ap_cents: 72000 },
  { id: "p10", name: "Priya Venkatesh", source: "Referral", stage: "App Started", agent: "Devon Park", attempts: 3, last_touch: "2026-04-25", est_ap_cents: 360000 },
];

export const MOCK_RECRUITING: RecruitingCandidate[] = [
  { id: "r1", name: "Andre Whitlock",     stage: "Invited",     source: "Indeed",       state: "TX", recruiter: "Ian Meeks", invited_at: "2026-04-26", next_step: "Send onboarding link" },
  { id: "r2", name: "Brittany Holcomb",   stage: "Onboarding",  source: "Referral",     state: "FL", recruiter: "Ian Meeks", invited_at: "2026-04-24", next_step: "Complete e-sign contract" },
  { id: "r3", name: "Caleb Donatello",    stage: "Contracted",  source: "LinkedIn",     state: "GA", recruiter: "Marcus Chen", invited_at: "2026-04-21", next_step: "Submit license/NPN" },
  { id: "r4", name: "Daniela Ferrer",     stage: "Licensed",    source: "Referral",     state: "TX", recruiter: "Ian Meeks", invited_at: "2026-04-18", next_step: "Carrier appointment: Transamerica" },
  { id: "r5", name: "Ethan Wakefield",    stage: "Appointed",   source: "Indeed",       state: "OH", recruiter: "Jasmine Carter", invited_at: "2026-04-15", next_step: "First call shadow" },
  { id: "r6", name: "Fatima Al-Rashid",   stage: "Active",      source: "Referral",     state: "TX", recruiter: "Ian Meeks", invited_at: "2026-04-10", next_step: "Week 2 scorecard" },
  { id: "r7", name: "Garrett Pikula",     stage: "Active",      source: "Job Fair",     state: "PA", recruiter: "Marcus Chen", invited_at: "2026-04-08", next_step: "Move to dialer pod" },
  { id: "r8", name: "Hannah Liang",       stage: "Onboarding",  source: "Referral",     state: "CA", recruiter: "Ian Meeks", invited_at: "2026-04-25", next_step: "Verify CA life license" },
  { id: "r9", name: "Isaiah Kowalski",    stage: "Dropped",     source: "Indeed",       state: "MI", recruiter: "Ian Meeks", invited_at: "2026-04-12", next_step: "—" },
  { id: "r10", name: "Joelle Markham",    stage: "Contracted",  source: "LinkedIn",     state: "NC", recruiter: "Jasmine Carter", invited_at: "2026-04-22", next_step: "Schedule license exam" },
];

export const MOCK_LEAD_VENDORS: LeadVendor[] = [
  { id: "lv1", name: "Goat Aged FEX 181+ Days Old", type: "Aged",          cost_per_lead_cents: 75,    leads_30d: 412, closed_30d: 38, ap_30d_cents: 4200000, active: true },
  { id: "lv2", name: "Life Jacket Vet",             type: "Live Transfer", cost_per_lead_cents: 4500,  leads_30d: 88,  closed_30d: 19, ap_30d_cents: 2880000, active: true },
  { id: "lv3", name: "Referral",                    type: "Referral",      cost_per_lead_cents: 0,     leads_30d: 31,  closed_30d: 14, ap_30d_cents: 3360000, active: true },
  { id: "lv4", name: "Direct Mail – FEX Q2",        type: "Direct Mail",   cost_per_lead_cents: 8200,  leads_30d: 22,  closed_30d: 6,  ap_30d_cents: 540000, active: true },
  { id: "lv5", name: "KOINO Web Form",              type: "Web Form",      cost_per_lead_cents: 0,     leads_30d: 17,  closed_30d: 3,  ap_30d_cents: 384000, active: true },
  { id: "lv6", name: "FB Lead Ad — Final Expense",  type: "Web Form",      cost_per_lead_cents: 1850,  leads_30d: 64,  closed_30d: 8,  ap_30d_cents: 720000, active: false },
];

export const AGENTS = ["Marcus Chen", "Jasmine Carter", "Tyrell Banks", "Devon Park"];
