export type ClientStage =
  | "new"
  | "underwriting"
  | "approved"
  | "policy_delivered"
  | "lapsed";

export type DealStatus =
  | "submitted"
  | "underwriting"
  | "approved"
  | "issued"
  | "declined"
  | "withdrawn";

export type PipelineTab = "working" | "active" | "closed";

export type AgentRole = "owner" | "manager" | "agent" | "recruit";

export interface Agent {
  id: string;
  email: string;
  full_name: string;
  phone?: string | null;
  role: AgentRole;
  upline_id?: string | null;
  status: "active" | "inactive" | "recruit";
  hire_date?: string | null;
  joined_at: string;
}

export interface Client {
  id: string;
  full_name: string;
  phone?: string | null;
  email?: string | null;
  stage: ClientStage;
  source?: string | null;
  lead_vendor_id?: string | null;
  agent_id?: string | null;
  received_at?: string | null;
  follow_up_at?: string | null;
  ai_score?: number | null;
  ai_reasoning?: string | null;
  ai_close_probability?: number | null;
  ai_updated_at?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Deal {
  id: string;
  client_id: string;
  agent_id: string;
  carrier_id?: string | null;
  product_id?: string | null;
  annual_premium?: number | null;
  expected_commission?: number | null;
  deposits?: number | null;
  outstanding?: number | null;
  submitted_at?: string | null;
  draft_date?: string | null;
  issued_at?: string | null;
  status: DealStatus;
  pipeline_tab: PipelineTab;
  policy_number?: string | null;
  ai_close_probability?: number | null;
  ai_next_action?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: string;
  agent_id?: string | null;
  client_id?: string | null;
  deal_id?: string | null;
  kind: string;
  body?: string | null;
  outcome?: string | null;
  duration_seconds?: number | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

export interface Followup {
  id: string;
  agent_id: string;
  client_id?: string | null;
  deal_id?: string | null;
  due_at: string;
  title: string;
  body?: string | null;
  status: "pending" | "completed" | "snoozed" | "cancelled";
  ai_drafted: boolean;
  completed_at?: string | null;
  created_at: string;
}

export interface LeaderboardRow {
  agent_id: string;
  full_name: string;
  deals_won: number;
  deals_total: number;
  total_ap: number;
  total_commission: number;
  deposits: number;
  outstanding: number;
}
