/** Indian FY (Apr–Mar) quarter utilities */

export type FiscalQuarter = "Q1" | "Q2" | "Q3" | "Q4";
export type PerformancePeriodKey = "q1" | "q2" | "h1" | "q3" | "q4" | "h2" | "annual";

const QUARTER_MONTHS: Record<FiscalQuarter, [number, number]> = {
  Q1: [3, 5],
  Q2: [6, 8],
  Q3: [9, 11],
  Q4: [0, 2],
};

function fyStartYear(date: Date): number {
  return date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
}

function quarterRange(quarter: FiscalQuarter, refDate = new Date()): [Date, Date] {
  const fy = fyStartYear(refDate);
  const [startMonth, endMonth] = QUARTER_MONTHS[quarter];
  const startYear = quarter === "Q4" ? fy + 1 : fy;
  const endYear = quarter === "Q4" ? fy + 1 : fy;
  const start = new Date(startYear, startMonth, 1);
  const end = new Date(endYear, endMonth + 1, 0, 23, 59, 59);
  return [start, end];
}

export function getQuarterElapsedPct(quarter: FiscalQuarter, refDate = new Date()): number {
  const [start, end] = quarterRange(quarter, refDate);
  if (refDate < start) return 0;
  if (refDate > end) return 100;
  const total = end.getTime() - start.getTime();
  const elapsed = refDate.getTime() - start.getTime();
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
}

export function getHalfElapsedPct(half: "H1" | "H2", refDate = new Date()): number {
  if (half === "H1") {
    if (refDate < quarterRange("Q1", refDate)[0]) return 0;
    if (refDate > quarterRange("Q2", refDate)[1]) return 100;
    const [h1Start] = quarterRange("Q1", refDate);
    const [, h1End] = quarterRange("Q2", refDate);
    const total = h1End.getTime() - h1Start.getTime();
    const elapsed = refDate.getTime() - h1Start.getTime();
    return Math.round((elapsed / total) * 100);
  }

  if (refDate < quarterRange("Q3", refDate)[0]) return 0;
  if (refDate > quarterRange("Q4", refDate)[1]) return 100;
  const [h2Start] = quarterRange("Q3", refDate);
  const [, h2End] = quarterRange("Q4", refDate);
  const total = h2End.getTime() - h2Start.getTime();
  const elapsed = refDate.getTime() - h2Start.getTime();
  return Math.round((elapsed / total) * 100);
}

export function getPeriodElapsedLabel(
  period: "Q1" | "Q2" | "H1" | "H2" | "Q3" | "Q4" | "Annual",
  refDate = new Date()
): string {
  if (period === "Annual") return "FY 25-26";
  let pct: number;
  if (period === "H1") pct = getHalfElapsedPct("H1", refDate);
  else if (period === "H2") pct = getHalfElapsedPct("H2", refDate);
  else pct = getQuarterElapsedPct(period, refDate);

  const unit = period.startsWith("H") ? "half" : "quarter";
  return `${pct}% of ${unit} complete`;
}

export const PERFORMANCE_PERIOD_OPTIONS: { value: PerformancePeriodKey; label: string }[] = [
  { value: "q1", label: "Q1" },
  { value: "q2", label: "Q2" },
  { value: "h1", label: "H1" },
  { value: "q3", label: "Q3" },
  { value: "q4", label: "Q4" },
  { value: "h2", label: "H2" },
  { value: "annual", label: "Annual" },
];
