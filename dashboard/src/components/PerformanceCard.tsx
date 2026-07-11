import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { formatCrDisplay, formatPctCard, attainmentTrendColor } from "../utils/format";

interface PerformanceCardProps {
  period: "Q1" | "Q2" | "H1" | "H2" | "Q3" | "Q4" | "Annual";
  actuals: number | null;
  quota: number;
  attainmentPct?: number | null;
  closedDeals?: number;
  periodElapsedLabel: string;
  quotaOnly?: boolean;
  stlyActuals?: number | null;
  /** Optional override for title left side (e.g. "S1 Actual/ Quota") */
  title?: string;
}

export function PerformanceCard({
  period,
  actuals,
  quota,
  attainmentPct,
  closedDeals = 0,
  periodElapsedLabel,
  quotaOnly = false,
  stlyActuals,
  title,
}: PerformanceCardProps) {
  const showAttainment = !quotaOnly && attainmentPct != null && (actuals ?? 0) > 0;
  const TrendIcon =
    showAttainment && attainmentPct! >= 50
      ? TrendingUp
      : showAttainment && attainmentPct! >= 30
        ? Minus
        : TrendingDown;
  const trendColor = showAttainment ? attainmentTrendColor(attainmentPct) : "text-slate-400";

  return (
    <div className="rounded-xl border border-galaxy-border bg-white p-5 shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-galaxy-text">{title ?? `${period} Actual/ Quota`}</p>
        <p className="text-right text-xs font-medium text-slate-500 sm:text-sm">{periodElapsedLabel}</p>
      </div>

      <div className="mt-5">
        {quotaOnly ? (
          <>
            <p className="font-mono text-[2rem] font-bold leading-none tracking-tight text-slate-400 sm:text-[2.25rem]">
              —
            </p>
            <p className="mt-1.5 font-mono text-base text-slate-400">
              / <span className="font-semibold text-galaxy-navy">{formatCrDisplay(quota)}</span>
            </p>
            <p className="mt-2 text-xs text-slate-500">Quota target · attainment not yet available</p>
          </>
        ) : (
          <>
            <p className="font-mono text-[2rem] font-bold leading-none tracking-tight text-galaxy-navy sm:text-[2.25rem]">
              {formatCrDisplay(actuals ?? 0)}
            </p>
            <p className="mt-1.5 font-mono text-base text-slate-400">/ {formatCrDisplay(quota)}</p>
          </>
        )}
      </div>

      {showAttainment && (
        <div className="mt-5 flex items-center gap-2">
          <TrendIcon className={`h-4 w-4 shrink-0 ${trendColor}`} strokeWidth={2.5} />
          <span className={`text-sm font-medium ${trendColor}`}>
            {formatPctCard(attainmentPct!)} of the Target Quota
          </span>
        </div>
      )}

      {!quotaOnly && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          {closedDeals > 0 && (
            <span>
              {closedDeals} closed deal{closedDeals !== 1 ? "s" : ""}
            </span>
          )}
          {stlyActuals != null ? (
            <span>STLY {formatCrDisplay(stlyActuals)}</span>
          ) : (
            <span className="text-slate-400">STLY pending</span>
          )}
        </div>
      )}
    </div>
  );
}
