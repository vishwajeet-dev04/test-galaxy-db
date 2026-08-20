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

export function getYearElapsedPct(refDate = new Date()): number {
  const fy = fyStartYear(refDate);
  const fyStart = new Date(fy, 3, 1); // 1 Apr
  const fyEnd = new Date(fy + 1, 2, 31, 23, 59, 59); // 31 Mar next year
  if (refDate < fyStart) return 0;
  if (refDate > fyEnd) return 100;
  const total = fyEnd.getTime() - fyStart.getTime();
  const elapsed = refDate.getTime() - fyStart.getTime();
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
}

export function getPeriodElapsedLabel(
  period: "Q1" | "Q2" | "H1" | "H2" | "Q3" | "Q4" | "Annual",
  refDate = new Date()
): string {
  if (period === "Annual") {
    const pct = getYearElapsedPct(refDate);
    return `${pct}% of year complete`;
  }
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

export type DateRangeValue = {
  start: string;
  end: string;
  label: string;
  preset: string;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function formatDisplayDate(iso: string): string {
  const d = parseISODate(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function fyBounds(refDate = new Date()): { start: Date; end: Date } {
  const fy = fyStartYear(refDate);
  return {
    start: new Date(fy, 3, 1),
    end: new Date(fy + 1, 2, 31),
  };
}

function startOfWeek(d: Date): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = copy.getDay(); // 0 Sun
  const diff = day === 0 ? 6 : day - 1; // Monday start
  copy.setDate(copy.getDate() - diff);
  return copy;
}

function endOfWeek(d: Date): Date {
  const start = startOfWeek(d);
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function defaultDateRange(refDate = new Date()): DateRangeValue {
  const { start, end } = fyBounds(refDate);
  return {
    start: toISODate(start),
    end: toISODate(end),
    label: "This Year",
    preset: "this_year",
  };
}

export function dateRangePresets(refDate = new Date()): DateRangeValue[] {
  const today = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());
  const [thisQStart, thisQEnd] = (() => {
    const m = today.getMonth();
    const q: FiscalQuarter = m >= 3 && m <= 5 ? "Q1" : m >= 6 && m <= 8 ? "Q2" : m >= 9 && m <= 11 ? "Q3" : "Q4";
    return quarterRange(q, today);
  })();
  const lastQRef = addDays(thisQStart, -1);
  const lastQ: FiscalQuarter =
    lastQRef.getMonth() >= 3 && lastQRef.getMonth() <= 5
      ? "Q1"
      : lastQRef.getMonth() >= 6 && lastQRef.getMonth() <= 8
        ? "Q2"
        : lastQRef.getMonth() >= 9 && lastQRef.getMonth() <= 11
          ? "Q3"
          : "Q4";
  const [lastQStart, lastQEnd] = quarterRange(lastQ, lastQRef);
  const fy = fyBounds(today);
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
  const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const thisMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const thisWeekStart = startOfWeek(today);
  const thisWeekEnd = endOfWeek(today);
  const lastWeekEnd = addDays(thisWeekStart, -1);
  const lastWeekStart = startOfWeek(lastWeekEnd);

  const pack = (preset: string, label: string, start: Date, end: Date): DateRangeValue => ({
    preset,
    label,
    start: toISODate(start),
    end: toISODate(end),
  });

  return [
    pack("last_60", "Last 60 Days", addDays(today, -59), today),
    pack("last_90", "Last 90 Days", addDays(today, -89), today),
    pack("this_week", "This Week", thisWeekStart, thisWeekEnd),
    pack("last_week", "Last Week", lastWeekStart, lastWeekEnd),
    pack("this_month", "This Month", thisMonthStart, thisMonthEnd),
    pack("last_month", "Last Month", lastMonthStart, lastMonthEnd),
    pack("this_quarter", "This Quarter", thisQStart, thisQEnd),
    pack("last_quarter", "Last Quarter", lastQStart, lastQEnd),
    pack("this_year", "This Year", fy.start, fy.end),
    pack("specific", "Specific date...", today, today),
    pack("custom", "Custom...", fy.start, fy.end),
  ];
}
