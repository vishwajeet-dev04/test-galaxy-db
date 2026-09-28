export interface PeriodMetrics {
  quota: number | null;
  actuals: number | null;
  attainment_pct: number | null;
  deals?: number | null;
}

export type StatusFlag =
  | "green"
  | "amber"
  | "red"
  | "grey"
  | "on_track"
  | "at_risk"
  | "critical"
  | "unknown";

export interface PeriodSnapshot {
  bu_quota: number;
  bu_actuals: number;
  bu_attainment_pct?: number | null;
  ic_quota: number;
  ic_actuals: number;
  ic_attainment_pct: number | null;
  pipeline_value_cr: number;
  closed_deals: number;
  show_attainment: boolean;
  stly_actuals_cr: number | null;
  stly_attainment_pct: number | null;
}

export interface RTMDivision {
  division: string;
  q1: PeriodMetrics;
  q2: PeriodMetrics;
  q3: PeriodMetrics;
  q4: PeriodMetrics;
  h1: PeriodMetrics;
  h2: PeriodMetrics;
  annual: PeriodMetrics;
  employee_count: number;
  status: StatusFlag;
  closed_deals: number;
}

export interface LeaderTeamMember {
  name: string;
  division: string | null;
  persona: string | null;
  h1_actuals: number | null;
  h1_quota: number | null;
  h1_attainment_pct: number | null;
  pipeline_topline_cr: number;
  pipeline_bottomline_cr: number;
  deal_count: number;
}

export interface LeaderDealSummary {
  opportunity_number: string | null;
  account: string | null;
  opportunity_name: string | null;
  employee: string;
  topline_cr: number;
  bottomline_cr: number;
  gp_pct: number;
  bu: string;
  close_date: string | null;
  crm: CrmStatus;
}

export interface LeaderDashboardRecord {
  initial: string;
  name: string;
  dept: string;
  division: string;
  bu: string;
  role: string | null;
  reports_to: string;
  team_size: number;
  status: StatusFlag;
  q1: { quota: number; actuals: number; attainment_pct: number };
  q2: { quota: number; actuals: number; attainment_pct: number };
  h1: { quota: number; actuals: number; attainment_pct: number };
  pipeline: {
    deal_count: number;
    topline_cr: number;
    bottomline_cr: number;
    quota_credit_cr: number;
    gp_pct: number;
  };
  team_members: LeaderTeamMember[];
  top_deals: LeaderDealSummary[];
}

export interface AtRiskIC {
  name: string;
  division: string | null;
  h1_actuals: number | null;
  h1_quota: number | null;
  h1_attainment_pct: number;
}

export interface TopAttainer {
  name: string;
  division: string | null;
  h1_actuals: number | null;
  h1_quota: number | null;
  h1_attainment_pct: number | null;
}

export interface CrmStatus {
  booked: boolean;
  billed: "none" | "partial" | "full";
  received: "none" | "partial" | "full";
}

export interface PipelineDeal {
  opportunity_number: string | null;
  account: string | null;
  opportunity_name: string | null;
  topline_inr: number;
  topline_cr: number;
  amount_inr: number;
  amount_cr: number;
  bottomline_inr: number;
  bottomline_cr: number;
  gp_pct: number;
  multiplier: number;
  multiplier_reason: string;
  quota_credit_inr: number;
  quota_credit_cr: number;
  excluded_from_achievement: boolean;
  exclusion_reason: string | null;
  crm: CrmStatus;
  category: string;
  bu: string;
  sub_category: string | null;
  brand: string | null;
  close_date: string | null;
  deal_category: string | null;
  assigned_to: string | null;
  supported_by: string | null;
  employee: string;
  pipeline_led_by: string | null;
  rtm_division?: string | null;
  opf_no?: string | null;
  deal_status_raw?: string | null;
}

export interface ClosedAccount {
  account: string;
  deal_count: number;
  revenue_inr: number;
  revenue_cr: number;
  bottomline_inr?: number;
  bottomline_cr?: number;
  quota_credit_inr?: number;
  quota_credit_cr?: number;
  deals: PipelineDeal[];
}

export interface AccountBuBreakdown {
  bu: string;
  deal_count: number;
  revenue_inr: number;
  revenue_cr: number;
  bottomline_inr: number;
  bottomline_cr: number;
}

/** Org-wide account rollup (Accounts tab) */
export interface AccountRecord {
  account: string;
  deal_count: number;
  revenue_inr: number;
  revenue_cr: number;
  bottomline_inr: number;
  bottomline_cr: number;
  quota_credit_inr: number;
  quota_credit_cr: number;
  gp_pct: number;
  pct_of_ic_h1_quota: number | null;
  pct_of_pipeline_topline: number | null;
  pct_of_pipeline_bottomline: number | null;
  employees: string[];
  employee_count: number;
  rtm_divisions: string[];
  primary_bu: string | null;
  by_bu: AccountBuBreakdown[];
  deals: PipelineDeal[];
}

export interface BrandTopAccount {
  account: string;
  revenue_cr: number;
}

/** Org-wide brand rollup (Brands tab) */
export interface BrandRecord {
  brand: string;
  deal_count: number;
  revenue_inr: number;
  revenue_cr: number;
  bottomline_inr: number;
  bottomline_cr: number;
  quota_credit_inr: number;
  quota_credit_cr: number;
  gp_pct: number;
  pct_of_ic_h1_quota: number | null;
  pct_of_pipeline_topline: number | null;
  pct_of_pipeline_bottomline: number | null;
  employees: string[];
  employee_count: number;
  account_count: number;
  rtm_divisions: string[];
  primary_bu: string | null;
  by_bu: AccountBuBreakdown[];
  top_accounts: BrandTopAccount[];
  deals: PipelineDeal[];
}

export interface EmployeePipeline {
  deal_count: number;
  deal_count_total?: number;
  account_count: number;
  total_revenue_inr: number;
  total_revenue_cr: number;
  total_bottomline_inr?: number;
  total_bottomline_cr?: number;
  total_quota_credit_inr?: number;
  total_quota_credit_cr?: number;
  closed_accounts: ClosedAccount[];
  closed_deals: PipelineDeal[];
}

export interface Individual {
  id: string | null;
  name: string;
  division: string | null;
  fy: string | null;
  persona: string;
  q1: PeriodMetrics;
  q2: PeriodMetrics;
  q3: PeriodMetrics;
  q4: PeriodMetrics;
  h1: PeriodMetrics;
  h2: PeriodMetrics;
  annual: PeriodMetrics;
  deals: {
    total: number | null;
    led_by_count: number | null;
    led_by_rev: number | null;
    contributed_count: number | null;
    contributed_rev: number | null;
  };
  closed_deals?: number;
  rank_division: string | null;
  pipeline: EmployeePipeline;
  bu?: string | null;
  team_lead?: string | null;
  active?: boolean;
  reference_only?: boolean;
  exclude_from_pipeline_totals?: boolean;
  assignments?: AssignmentHistoryRow[];
  /** False for BU Heads/AVPs: their own deals and quota are left out of RTM, BU and header IC totals. */
  counts_for_rtm?: boolean;
}

export interface AssignmentHistoryRow {
  division: string;
  start_date: string | null;
  end_date: string | null;
}

export interface DivisionAggregate {
  division: string;
  employee_count: number;
  h1_quota: number;
  h1_actuals: number;
  h1_attainment_pct: number;
  annual_quota: number;
  annual_actuals: number;
  annual_attainment_pct: number;
  personas: Record<string, { count: number; h1_actuals: number; h1_quota: number }>;
}

export interface PersonaAggregate {
  persona: string;
  count: number;
  h1_quota: number;
  h1_actuals: number;
  h1_attainment_pct: number;
  annual_quota: number;
  annual_actuals: number;
}

export interface BURecord {
  service: string;
  bu: string;
  q1: PeriodMetrics;
  q2: PeriodMetrics;
  q3: PeriodMetrics;
  q4: PeriodMetrics;
  h1: PeriodMetrics;
  h2: PeriodMetrics;
  annual: PeriodMetrics;
  pipeline?: {
    deal_count: number;
    revenue_cr: number;
    account_count: number;
  };
}

export interface RTMRecord {
  name: string;
  division: string | null;
  bu: string;
  fy: string | null;
  q1: PeriodMetrics;
  q2: PeriodMetrics;
  h1: PeriodMetrics;
  q3: PeriodMetrics;
  q4: PeriodMetrics;
  h2: PeriodMetrics;
  annual: PeriodMetrics;
}

export interface TeamRecord {
  team_lead: string;
  division: string | null;
  h1: {
    quota: number | null;
    actuals: number | null;
    vs_company_target: number | null;
    flag: string | null;
  };
  annual: {
    quota: number | null;
    actuals: number | null;
    vs_company_target: number | null;
    flag: string | null;
  };
  deals: number | null;
  notes: string | null;
}

export interface PipelineSummary {
  source: string;
  period: string;
  total_deals: number;
  total_revenue_inr: number;
  total_revenue_cr: number;
  total_bottomline_inr?: number;
  total_bottomline_cr?: number;
  total_quota_credit_inr?: number;
  total_quota_credit_cr?: number;
  unique_accounts: number;
  unique_employees: number;
  by_bu: { bu: string; deal_count: number; revenue_inr: number; revenue_cr: number; account_count: number }[];
  by_category: { category: string; deal_count: number; revenue_inr: number; revenue_cr: number }[];
  by_rtm?: { division: string; deal_count: number; revenue_inr: number; revenue_cr: number; account_count: number }[];
}

export interface QuotaData {
  meta: {
    source: string;
    generated_at: string;
    fy: string;
    currency: string;
    pipeline_period?: string;
    timeline_week?: number;
  };
  kpis: {
    h1_quota_cr: number;
    h1_actuals_cr: number;
    h1_attainment_pct: number;
    annual_quota_cr: number;
    ic_h1_quota_cr: number;
    ic_h1_actuals_cr: number;
    ic_h1_attainment_pct: number;
    ic_q1_quota_cr?: number;
    ic_q1_actuals_cr?: number;
    ic_q1_attainment_pct?: number;
    total_employees: number;
    total_divisions: number;
    total_bus: number;
    total_deals_h1: number;
    pipeline_deals?: number;
    pipeline_revenue_cr?: number;
    pipeline_accounts?: number;
    header_pipeline_cr?: number | null;
    header_closed_opps?: number;
    header_ic_actuals?: number | null;
    header_h1_attainment_pct?: number | null;
  };
  period_metrics?: Record<"q1" | "q2" | "h1" | "q3" | "q4" | "h2" | "annual", PeriodSnapshot>;
  rtm_divisions?: RTMDivision[];
  at_risk_ics?: AtRiskIC[];
  top_attainers?: {
    by_attainment_pct: TopAttainer[];
    by_value_closed: TopAttainer[];
  };
  leaders_dashboard?: LeaderDashboardRecord[];
  individuals: Individual[];
  leaders: unknown[];
  teams: TeamRecord[];
  bu_level: BURecord[];
  division_aggregates: DivisionAggregate[];
  persona_aggregates: PersonaAggregate[];
  division_summary: unknown[];
  rtm_by_bu: Record<string, RTMRecord[]>;
  pipeline: PipelineSummary | null;
  accounts?: AccountRecord[];
  brands?: BrandRecord[];
  target_quota?: Record<string, unknown>;
  employee_mapping_count?: number;
  _scope?: {
    mode: "all" | "filtered";
    role?: string;
    employee_name?: string | null;
    allowed_count?: number;
    visible_people?: string[];
  };
}

// "admin" added back from login_feature — required for AdminUploadsView route
export type ViewId =
  | "overview"
  | "divisions"
  | "bu"
  | "employees"
  | "leaderboard"
  | "leaders"
  | "accounts"
  | "brands"
  | "help"
  | "admin";

export type PeriodKey = "q1" | "q2" | "h1" | "q3" | "q4" | "h2" | "annual";

export interface DrillState {
  view: ViewId;
  division?: string;
  bu?: string;
  persona?: string;
  employee?: string;
  account?: string;
  brand?: string;
}
