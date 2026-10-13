import type { ReactNode } from "react";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { formatCrDisplay, formatPctCard, attainmentTrendColor, attainmentBg } from "../utils/format";

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
  /** Show "Target ₹X Cr" below the No-data badge (e.g. H2 shows its target; Q3/Q4 do not) */
  showTargetOnNoData?: boolean;
  /** Extra line under the card. */
  footnote?: ReactNode;
  /** Full-width card: from @2xl the body lays out in three columns with an attainment progress bar. */
  wide?: boolean;
}

export function PerformanceCard({
  period,
  actuals,
  quota,
  attainmentPct,
  closedDeals = 0,
  periodElapsedLabel,
  quotaOnly = false,
  title,
  className,
  compact = false,
  showTargetOnNoData = false,
  footnote,
  wide = false,
}: PerformanceCardProps) {
  const showAttainment = !quotaOnly && attainmentPct != null && (actuals ?? 0) > 0;
  const TrendIcon =
    showAttainment && attainmentPct! >= 50
      ? TrendingUp
      : showAttainment && attainmentPct! >= 30
        ? Minus
        : TrendingDown;
  const trendColor = showAttainment ? attainmentTrendColor(attainmentPct) : "text-slate-400";

  // Empty (future) cards get no min height: a row of them stays short, and next to a full card
  // the grid still stretches them to match (h-full).
  const minHeight = quotaOnly ? "" : compact ? " min-h-[140px]" : " min-h-[176px]";
  const att = attainmentPct ?? 0;

  // @container sizes the amount by the card's own width, so it never spills out of a narrow grid cell.
  return (
    <div className={`@container flex h-full w-full flex-col rounded-xl border border-galaxy-border bg-white text-left shadow-[0_2px_8px_rgba(15,23,42,0.06)] ${compact ? "p-4" : "p-5"}${minHeight}${className ? ` ${className}` : ""}`}>
      {/* Header row: period label + elapsed label */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-medium text-galaxy-text">{title ?? `${period} Actual/ Quota`}</p>
        <p className="text-xs font-medium text-slate-500 sm:text-sm">{periodElapsedLabel}</p>
      </div>

      {quotaOnly ? (
        /* Future period — no actuals recorded yet */
        <div className={compact ? "mt-3" : "mt-5"}>
          <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            No data yet
          </span>
          {showTargetOnNoData && (
            <p className={`${compact ? "mt-2" : "mt-3"} font-mono text-base text-slate-400`}>
              Target{" "}
              <span className="font-semibold text-galaxy-navy">{formatCrDisplay(quota)}</span>
            </p>
          )}
        </div>
      ) : (
        <div
          className={`${compact ? "mt-3" : "mt-5"}${
            wide ? " @2xl:grid @2xl:grid-cols-[auto_auto_minmax(0,1fr)] @2xl:items-center @2xl:gap-8" : ""
          }`}
        >
          {/* Actuals + quota */}
          <div>
            <p className="whitespace-nowrap font-mono text-2xl font-bold leading-none tracking-tight text-galaxy-navy @3xs:text-3xl @2xs:text-4xl">
              {formatCrDisplay(actuals ?? 0)}
            </p>
            <p className="mt-1.5 font-mono text-base text-slate-400">/ {formatCrDisplay(quota)}</p>
          </div>

          {/* Attainment trend + closed deals */}
          <div className={`${compact ? "mt-3" : "mt-4"}${wide ? " @2xl:mt-0" : ""}`}>
            {showAttainment && (
              <div className="flex items-center gap-2">
                <TrendIcon className={`h-4 w-4 shrink-0 ${trendColor}`} strokeWidth={2.5} />
                <span className={`text-sm font-medium ${trendColor}`}>
                  {formatPctCard(attainmentPct!)} of the Target Quota
                </span>
              </div>
            )}
            {closedDeals > 0 && (
              <p className={`${showAttainment ? (compact ? "mt-2" : "mt-3") : ""} text-xs text-slate-500`}>
                {closedDeals} closed deal{closedDeals !== 1 ? "s" : ""}
              </p>
            )}
          </div>

          {wide && (
            <div className="mt-4 min-w-0 @2xl:mt-0">
              <div
                className="h-2.5 overflow-hidden rounded-full bg-slate-100"
                role="progressbar"
                aria-label="Attainment against the target quota"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(Math.min(att, 100))}
              >
                <div
                  className={`h-full rounded-full ${attainmentBg(showAttainment ? att : null)} transition-[width] duration-500 motion-reduce:transition-none`}
                  style={{ width: `${Math.min(Math.max(att, 0), 100)}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {formatPctCard(showAttainment ? att : 0)} achieved · {periodElapsedLabel}
              </p>
            </div>
          )}
        </div>
      )}
      {footnote && <div className={`mt-auto ${compact ? "pt-2" : "pt-3"}`}>{footnote}</div>}
    </div>
  );
}
