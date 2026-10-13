import { DealStatusIndicators } from "./DealStatusIndicators";
import type { PipelineDeal } from "../types";
import { formatInr, formatPct } from "../utils/format";

interface DealRowProps {
  deal: PipelineDeal;
  showBottomline?: boolean;
  /** The deal the user arrived for from another page (see useDealHighlight). */
  highlighted?: boolean;
}

export function DealRow({ deal, showBottomline = false, highlighted = false }: DealRowProps) {
  const excluded = deal.excluded_from_achievement;
  const tone = highlighted
    ? "border-galaxy-blue/40 bg-galaxy-blue/5 ring-2 ring-galaxy-blue/40"
    : excluded
      ? "border-red-100 bg-red-50/40 opacity-75"
      : "border-galaxy-border/60 bg-white";

  return (
    <div
      data-deal={deal.opportunity_number ?? undefined}
      className={`rounded-lg border px-3 py-2.5 text-sm transition-colors duration-500 motion-reduce:transition-none ${tone}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-galaxy-text">{deal.opportunity_name}</p>
          <p className="text-xs text-galaxy-muted">
            {deal.opportunity_number} · {deal.bu}
            {deal.sub_category ? ` · ${deal.sub_category}` : ""} · {deal.close_date}
          </p>
        </div>
        <DealStatusIndicators crm={deal.crm} />
      </div>

      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-galaxy-navy/60">Topline</p>
            <p className="font-mono text-sm font-semibold text-galaxy-navy">{formatInr(deal.topline_inr ?? deal.amount_inr)}</p>
          </div>
          {showBottomline && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600/80">Bottomline</p>
              <p className="font-mono text-sm font-semibold text-emerald-700">{formatInr(deal.bottomline_inr)}</p>
            </div>
          )}
          {deal.multiplier && deal.multiplier !== 1 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600/80">Quota Credit</p>
              <p className="font-mono text-sm font-semibold text-amber-700">
                {formatInr(deal.quota_credit_inr)} <span className="text-xs">({deal.multiplier}×)</span>
              </p>
            </div>
          )}
        </div>
        <div className="text-right text-xs text-slate-500">
          <span>GP {formatPct(deal.gp_pct)}</span>
          {deal.multiplier_reason && (
            <p className="mt-0.5 max-w-[200px] text-[10px] leading-tight">{deal.multiplier_reason}</p>
          )}
        </div>
      </div>

      {excluded && deal.exclusion_reason && (
        <p className="mt-2 text-xs font-medium text-galaxy-primary">Excluded: {deal.exclusion_reason}</p>
      )}
    </div>
  );
}
