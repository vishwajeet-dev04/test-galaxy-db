import type {
  BURecord,
  ClosedAccount,
  EmployeePipeline,
  Individual,
  PeriodKey,
  PipelineDeal,
  RTMDivision,
  StatusFlag,
} from "../types";

export const RTM_DIVISION_ORDER = ["S1", "S2", "CB", "GB", "South", "GeoX"] as const;
const RTM_SET = new Set<string>(RTM_DIVISION_ORDER);

export const PERIOD_QUARTERS: Record<PeriodKey, ReadonlySet<string>> = {
  q1: new Set(["q1"]),
  q2: new Set(["q2"]),
  q3: new Set(["q3"]),
  q4: new Set(["q4"]),
  h1: new Set(["q1", "q2"]),
  h2: new Set(["q3", "q4"]),
  annual: new Set(["q1", "q2", "q3", "q4"]),
};

export type PeriodLabel = "Q1" | "Q2" | "H1" | "Q3" | "Q4" | "H2" | "Annual";

export const PERIOD_LABELS: Record<PeriodKey, PeriodLabel> = {
  q1: "Q1",
  q2: "Q2",
  h1: "H1",
  q3: "Q3",
  q4: "Q4",
  h2: "H2",
  annual: "Annual",
};

/** Same rule as scoping._deal_quarter: stored quarter, else the FY quarter of close_date (Apr = Q1). */
export function dealQuarter(deal: PipelineDeal): string {
  const stored = String(deal.quarter ?? "").toLowerCase();
  if (stored === "q1" || stored === "q2" || stored === "q3" || stored === "q4") return stored;
  const month = closeMonth(deal.close_date);
  if (month == null) return "";
  if (month >= 4 && month <= 6) return "q1";
  if (month >= 7 && month <= 9) return "q2";
  if (month >= 10) return "q3";
  return "q4";
}

function closeMonth(value: string | null | undefined): number | null {
  const text = (value ?? "").trim().slice(0, 10);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) return Number(iso[2]);
  const dmy = /^(\d{2})[-/](\d{2})[-/](\d{2,4})$/.exec(text);
  if (dmy) return Number(dmy[2]);
  return null;
}

/** Sortable YYYY-MM-DD for close_date in either ISO or DD-MM-YYYY form; "" when unknown. */
export function closeDateKey(value: string | null | undefined): string {
  const text = (value ?? "").trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const dmy = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(text);
  return dmy ? `${dmy[3]}-${dmy[2]}-${dmy[1]}` : "";
}

export function dealsInPeriod(deals: PipelineDeal[], period: PeriodKey): PipelineDeal[] {
  const quarters = PERIOD_QUARTERS[period];
  return deals.filter((deal) => quarters.has(dealQuarter(deal)));
}

/** Counts toward RTM, BU and header IC actuals (scoping._is_rtm_deal). */
export function isRtmTeamDeal(deal: PipelineDeal): boolean {
  return RTM_SET.has(deal.rtm_division ?? "") && deal.counts_for_rtm !== false;
}

/** Led by a BU Head/AVP inside an RTM: added on RTM/BU cards, left out of header IC Actuals. */
export function isBuHeadDeal(deal: PipelineDeal): boolean {
  return RTM_SET.has(deal.rtm_division ?? "") && deal.counts_for_rtm === false;
}

/** Exact Cr from INR, matching the backend; summing rounded amount_cr drifts. */
export function dealCr(deal: PipelineDeal): number {
  const inr = deal.amount_inr ?? deal.topline_inr;
  if (inr != null) return inr / 1e7;
  return deal.amount_cr ?? deal.topline_cr ?? 0;
}

export function closedAccountsFrom(deals: PipelineDeal[]): ClosedAccount[] {
  const byAccount = new Map<string, ClosedAccount>();
  for (const deal of deals) {
    const name = deal.account || "Unknown";
    const row = byAccount.get(name) ?? {
      account: name,
      deal_count: 0,
      revenue_inr: 0,
      revenue_cr: 0,
      bottomline_inr: 0,
      bottomline_cr: 0,
      deals: [],
    };
    row.deal_count += 1;
    row.revenue_inr += deal.topline_inr ?? deal.amount_inr ?? 0;
    row.bottomline_inr = (row.bottomline_inr ?? 0) + (deal.bottomline_inr ?? 0);
    row.deals.push(deal);
    byAccount.set(name, row);
  }
  return [...byAccount.values()]
    .map((row) => ({
      ...row,
      revenue_cr: row.revenue_inr / 1e7,
      bottomline_cr: (row.bottomline_inr ?? 0) / 1e7,
      deals: [...row.deals].sort((a, b) => (b.amount_inr ?? 0) - (a.amount_inr ?? 0)),
    }))
    .sort((a, b) => b.revenue_inr - a.revenue_inr);
}

/** One person's closed deals for the selected period, in the EmployeePipeline shape. */
export function pipelineForPeriod(pipeline: EmployeePipeline, period: PeriodKey): EmployeePipeline {
  const deals = dealsInPeriod(pipeline.closed_deals ?? [], period);
  const accounts = closedAccountsFrom(deals);
  const revenueInr = deals.reduce((sum, d) => sum + (d.topline_inr ?? d.amount_inr ?? 0), 0);
  const bottomlineInr = deals.reduce((sum, d) => sum + (d.bottomline_inr ?? 0), 0);
  return {
    ...pipeline,
    deal_count: deals.length,
    deal_count_total: deals.length,
    account_count: accounts.length,
    total_revenue_inr: revenueInr,
    total_revenue_cr: revenueInr / 1e7,
    total_bottomline_inr: bottomlineInr,
    total_bottomline_cr: bottomlineInr / 1e7,
    closed_accounts: accounts,
    closed_deals: deals,
  };
}

/**
 * Counted on the RTM and Business Unit pages: RTM-team deals plus BU Head deals.
 * Header IC Actuals, Overview and Employees still use isRtmTeamDeal only (client, 2026-10-12).
 */
export function isCountedOnCards(deal: PipelineDeal): boolean {
  return isRtmTeamDeal(deal) || isBuHeadDeal(deal);
}

export interface RtmQuarterRow {
  division: string;
  q1: number;
  q2: number;
  q3: number;
  q4: number;
}

/** Full-year actuals per RTM for one BU (counted deals, BU Heads included), keyed by close quarter. */
export function rtmQuarterBreakdown(deals: PipelineDeal[], bu: string): Map<string, RtmQuarterRow> {
  const rows = new Map<string, RtmQuarterRow>();
  for (const deal of deals) {
    if (deal.bu !== bu || !isCountedOnCards(deal)) continue;
    const q = dealQuarter(deal);
    if (q !== "q1" && q !== "q2" && q !== "q3" && q !== "q4") continue;
    const division = deal.rtm_division ?? "";
    const row = rows.get(division) ?? { division, q1: 0, q2: 0, q3: 0, q4: 0 };
    row[q] += dealCr(deal);
    rows.set(division, row);
  }
  return rows;
}

export interface CardTotal {
  actuals: number;
  quota: number | null;
  attainment_pct: number | null;
  deals: number;
}

/** Same as build_quota_data._att: no quota means no attainment. */
function attainment(actuals: number, quota: number | null): number | null {
  return quota ? (actuals / quota) * 100 : null;
}

/** Same thresholds as build_quota_data._status_flag. */
export function statusFor(attainmentPct: number | null): StatusFlag {
  if (attainmentPct == null) return "unknown";
  if (attainmentPct >= 50) return "on_track";
  if (attainmentPct >= 30) return "at_risk";
  return "critical";
}

function headDealsTotal(deals: PipelineDeal[], match: (deal: PipelineDeal) => boolean): { cr: number; count: number } {
  let cr = 0;
  let count = 0;
  for (const deal of deals) {
    if (!isBuHeadDeal(deal) || !match(deal)) continue;
    cr += dealCr(deal);
    count += 1;
  }
  return { cr, count };
}

/**
 * RTM card figures with the division's BU Heads added back: their deals (by rtm_division on the
 * close date) and their quota (by as-of-today division, the same rule the backend uses for team quota).
 * The API row itself excludes them because header IC Actuals must keep matching the client Excel.
 */
export function rtmTeamTotal(
  row: RTMDivision,
  period: PeriodKey,
  individuals: Individual[],
  allDeals: PipelineDeal[] | undefined,
): CardTotal {
  const periodDeals = dealsInPeriod(allDeals ?? [], period);
  const heads = headDealsTotal(periodDeals, (d) => d.rtm_division === row.division);
  const headQuota = individuals
    .filter((ic) => ic.counts_for_rtm === false && ic.division === row.division)
    .reduce((sum, ic) => sum + (ic[period]?.quota ?? 0), 0);
  const teamDeals = allDeals
    ? periodDeals.filter((d) => isRtmTeamDeal(d) && d.rtm_division === row.division).length
    : (row[period]?.deals ?? row.closed_deals ?? 0);
  const actuals = (row[period]?.actuals ?? 0) + heads.cr;
  const quota = (row[period]?.quota ?? 0) + headQuota;
  return { actuals, quota, attainment_pct: attainment(actuals, quota), deals: teamDeals + heads.count };
}

/**
 * Business Unit card figures with BU Head deals added. Quota is unchanged: BU quotas are set per
 * BU and RTM in Admin, and a BU Head has no BU quota of their own.
 */
export function buTeamTotal(record: BURecord, period: PeriodKey, allDeals: PipelineDeal[] | undefined): CardTotal {
  const heads = headDealsTotal(dealsInPeriod(allDeals ?? [], period), (d) => d.bu === record.bu);
  const actuals = (record[period]?.actuals ?? 0) + heads.cr;
  const quota = record[period]?.quota ?? null;
  return {
    actuals,
    quota,
    attainment_pct: attainment(actuals, quota),
    deals: (record[period]?.deals ?? 0) + heads.count,
  };
}
