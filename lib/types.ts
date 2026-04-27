// Core domain types — mirror what the Supabase schema expects.

export type Role = "OWNER" | "MANAGER" | "AGENT";

export type DealStatus =
  | "Draft"
  | "Submitted"
  | "Underwriting"
  | "Approved"
  | "Issued"
  | "Pending"
  | "Declined"
  | "Lapsed"
  | "Chargeback";

export type Product =
  | "Whole Life"
  | "Term"
  | "Term Super 10"
  | "IUL"
  | "Child IUL"
  | "Everlast"
  | "Final Expense";

export type Carrier = "Transamerica" | "ETHOS" | "F&G" | "Mutual of Omaha" | "Foresters" | "Americo";

export interface Deal {
  id: string;
  agent: string;
  agent_initials: string;
  client: string;
  lead_source: string;
  carrier: Carrier;
  product: Product;
  ap_cents: number;          // annualized premium
  est_comm_cents: number;
  status: DealStatus;
  policy_number: string | null;
  submitted_at: string | null; // ISO date
  draft_date: string | null;   // ISO date
  deposits_cents: number;
  outstanding_cents: number;
}

export interface PipelineLead {
  id: string;
  name: string;
  source: string;
  stage: "New" | "Contacted" | "Qualified" | "Quoted" | "App Started" | "Submitted";
  agent: string;
  attempts: number;
  last_touch: string;
  est_ap_cents: number;
}

export interface RecruitingCandidate {
  id: string;
  name: string;
  stage: "Invited" | "Onboarding" | "Contracted" | "Licensed" | "Appointed" | "Active" | "Dropped";
  source: string;
  state: string;
  recruiter: string;
  invited_at: string;
  next_step: string;
}

export interface LeadVendor {
  id: string;
  name: string;
  type: "Aged" | "Live Transfer" | "Referral" | "Direct Mail" | "Web Form" | "Other";
  cost_per_lead_cents: number;
  leads_30d: number;
  closed_30d: number;
  ap_30d_cents: number;
  active: boolean;
}
