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
  /** Optional extra classes applied to the root card div (e.g. for tall/full-height variants) */
  className?: string;
  /** Optional compact mode to reduce vertical spacing */
  compact?: boolean;
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
  className,
  compact = false,
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
    <div className={`flex flex-col rounded-xl border border-galaxy-border bg-white shadow-[0_2px_8px_rgba(15,23,42,0.06)] ${compact ? "p-4 min-h-[140px]" : "p-5 min-h-[176px]"}${className ? ` ${className}` : ""}`}>
      {/* Header row: period label + elapsed label */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-medium text-galaxy-text whitespace-nowrap">{title ?? `${period} Actual/ Quota`}</p>
        <p className="text-right text-xs font-medium text-slate-500 sm:text-sm whitespace-nowrap">{periodElapsedLabel}</p>
      </div>

      {quotaOnly ? (
        /* Future period — no actuals recorded yet */
        <>
          <div className={`${compact ? "mt-3" : "mt-5"} flex-1`}>
            <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              No data yet
            </span>
            <p className={`${compact ? "mt-2" : "mt-3"} font-mono text-base text-slate-400`}>
              Target{" "}
              <span className="font-semibold text-galaxy-navy">{formatCrDisplay(quota)}</span>
            </p>
          </div>
          {/* Fixed-height spacer so card stays same height as active cards */}
          <div className={`${compact ? "mt-2 h-[1rem]" : "mt-3 h-[1.25rem]"}`} />
        </>
      ) : (
        <>
          {/* Actuals + quota */}
          <div className={`${compact ? "mt-3" : "mt-5"} flex-1`}>
            <p className="font-mono text-[2rem] font-bold leading-none tracking-tight text-galaxy-navy sm:text-[2.25rem] whitespace-nowrap">
              {formatCrDisplay(actuals ?? 0)}
            </p>
            <p className="mt-1.5 font-mono text-base text-slate-400">/ {formatCrDisplay(quota)}</p>
          </div>

          {/* Attainment trend */}
          {showAttainment && (
            <div className={`${compact ? "mt-3" : "mt-4"} flex items-center gap-2 whitespace-nowrap`}>
              <TrendIcon className={`h-4 w-4 shrink-0 ${trendColor}`} strokeWidth={2.5} />
              <span className={`text-sm font-medium ${trendColor}`}>
                {formatPctCard(attainmentPct!)} of the Target Quota
              </span>
            </div>
          )}

          {/* Footer: closed deals + STLY */}
          <div className={`${compact ? "mt-2" : "mt-3"} flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500`}>
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
        </>
      )}
    </div>
  );
}
