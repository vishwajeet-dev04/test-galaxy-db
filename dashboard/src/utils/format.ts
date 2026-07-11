export function formatCr(value: number | null | undefined, decimals = 2): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} Cr`;
}

/** Card display — spaced rupee symbol per design reference */
export function formatCrDisplay(value: number | null | undefined, decimals = 2): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `₹ ${value.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} Cr`;
}

export function formatPctCard(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${Math.round(value)}%`;
}

export function formatInr(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  if (value >= 1e7) return formatCr(value / 1e7);
  if (value >= 1e5) return `₹${(value / 1e5).toLocaleString("en-IN", { maximumFractionDigits: 2 })} L`;
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function formatPct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toFixed(1)}%`;
}

export function attainmentColor(pct: number | null | undefined): string {
  if (pct == null) return "text-galaxy-muted";
  if (pct >= 50) return "text-emerald-600";
  if (pct >= 30) return "text-amber-600";
  return "text-galaxy-primary";
}

export function attainmentBg(pct: number | null | undefined): string {
  if (pct == null) return "bg-gray-300";
  if (pct >= 50) return "bg-emerald-500";
  if (pct >= 30) return "bg-amber-500";
  return "bg-galaxy-primary";
}

export function attainmentBarColor(pct: number | null | undefined): string {
  if (pct == null) return "#9ca3af";
  if (pct >= 50) return "#10b981";
  if (pct >= 30) return "#f59e0b";
  return "#e4143b";
}

/** Trend line colour on performance cards — red when below 25% */
export function attainmentTrendColor(pct: number | null | undefined): string {
  if (pct == null) return "text-slate-400";
  if (pct >= 50) return "text-emerald-600";
  if (pct >= 30) return "text-amber-600";
  return "text-galaxy-primary";
}

/* Galaxy brand palette — https://www.goapl.com */
export const CHART_COLORS = [
  "#3c3f8e",
  "#e4143b",
  "#0693e3",
  "#4e35df",
  "#10b981",
  "#f59e0b",
  "#8ed1fc",
  "#cf2e2e",
  "#6b7280",
  "#7bdcb5",
];

export const BU_COLORS: Record<string, string> = {
  DCG: "#3c3f8e",
  CSN: "#0693e3",
  CSG: "#4e35df",
  PS: "#e4143b",
  Cloud: "#8ed1fc",
  AI: "#7bdcb5",
};
