import type { StatusFlag as StatusFlagType } from "../types";

const FLAG_STYLES: Record<StatusFlagType, { bg: string; dot: string; label: string }> = {
  green: { bg: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500", label: "On Track" },
  amber: { bg: "bg-amber-50 text-amber-700 ring-amber-200", dot: "bg-amber-500", label: "At Risk" },
  red: { bg: "bg-red-50 text-red-700 ring-red-200", dot: "bg-galaxy-primary", label: "Critical" },
  grey: { bg: "bg-slate-50 text-slate-600 ring-slate-200", dot: "bg-slate-400", label: "N/A" },
};

interface StatusFlagProps {
  status: StatusFlagType;
  showLabel?: boolean;
}

export function StatusFlag({ status, showLabel = true }: StatusFlagProps) {
  const style = FLAG_STYLES[status] ?? FLAG_STYLES.grey;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${style.bg}`}
      title={`Status: ${style.label}`}
    >
      <span className={`h-2 w-2 rounded-full ${style.dot}`} />
      {showLabel && style.label}
    </span>
  );
}
