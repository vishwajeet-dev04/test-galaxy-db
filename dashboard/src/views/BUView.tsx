import { lazy, Suspense, useMemo, useState } from "react";
import { DonutChart } from "../components/charts/DonutChart";
import { ChartCard } from "../components/ChartCard";

import { ProgressRing } from "../components/ProgressRing";
import { FilterBar } from "../components/FilterBar";
import type { QuotaData, DrillState } from "../types";
import { formatCr, BU_COLORS, attainmentBarColor } from "../utils/format";
import { buTeamTotal } from "../utils/deals";

const BUDetailView = lazy(() => import("./BUDetailView").then((m) => ({ default: m.BUDetailView })));

interface BUViewProps {
  data: QuotaData;
  drill: DrillState;
  onDrill: (drill: Partial<DrillState>) => void;
}

export function BUView({ data, drill, onDrill }: BUViewProps) {
  const { bu_level } = data;
  const selected = drill.bu;
  const [search, setSearch] = useState("");
  const [buPeriod, setBuPeriod] = useState<"h1" | "h2">("h1");
  const allDeals = data.pipeline?.all_deals;

  const filteredBUs = useMemo(() => {
    const order = ["DCG", "CSN", "PS", "CSG", "Cloud"];
    const q = search.toLowerCase();
    const rows = !search
      ? [...bu_level]
      : bu_level.filter(
          (b) => b.bu.toLowerCase().includes(q) || b.service.toLowerCase().includes(q)
        );
    return rows.sort((a, b) => {
      const ia = order.indexOf(a.bu);
      const ib = order.indexOf(b.bu);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }, [bu_level, search]);

  const totals = useMemo(
    () => new Map(filteredBUs.map((b) => [b.bu, buTeamTotal(b, buPeriod, allDeals)])),
    [filteredBUs, buPeriod, allDeals]
  );

  if (selected) {
    return (
      <Suspense fallback={<p className="text-sm text-galaxy-muted">Loading {selected}…</p>}>
        <BUDetailView data={data} bu={selected} onBack={() => onDrill({ bu: undefined })} onDrill={onDrill} />
      </Suspense>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <FilterBar search={search} onSearchChange={setSearch} searchPlaceholder="Search BU or service..." />
        
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Period</span>
          {(["h1", "h2"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setBuPeriod(p)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase transition ${
                buPeriod === p
                  ? "bg-galaxy-navy text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {filteredBUs.map((b) => {
          const total = totals.get(b.bu);
          const att = total?.attainment_pct ?? 0;
          const actuals = total?.actuals ?? 0;
          const quota = total?.quota;
          const hasActuals = actuals > 0 || quota != null;
          const dealCount = total?.deals;

          const color = BU_COLORS[b.bu] ?? "#3c3f8e";
          return (
            <button
              key={b.bu}
              onClick={() => onDrill({ bu: b.bu })}
              className="group flex h-full flex-col rounded-2xl border border-galaxy-border/70 bg-white p-5 text-left shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition duration-200 hover:-translate-y-0.5 hover:border-galaxy-navy/25 hover:shadow-[0_8px_24px_rgba(15,23,42,0.08)] focus:outline-none focus:ring-4 focus:ring-galaxy-navy/10 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <div className="flex w-full items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{b.bu}</span>
                  </div>
                  <p className="mt-1.5 truncate text-sm font-medium text-galaxy-navy">{b.service}</p>
                  
                  {hasActuals ? (
                    <>
                      <p className="mt-3 font-mono text-2xl font-bold tracking-tight text-galaxy-navy">{formatCr(actuals)}</p>
                      <p className="text-xs text-slate-400">of {formatCr(quota)} quota</p>
                    </>
                  ) : (
                    <p className="mt-3 text-sm font-medium italic text-slate-400">No data yet</p>
                  )}
                  
                  {dealCount != null && dealCount > 0 && (
                    <div className="mt-3">
                      <p className="inline-block rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-700">
                        {Math.round(dealCount)} closed deals
                      </p>
                    </div>
                  )}
                </div>
                <div className="relative shrink-0">
                  <ProgressRing value={att} size={48} color={attainmentBarColor(att)} />
                  <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-slate-600">
                    {Math.round(att)}%
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {filteredBUs.length === 0 && (
        <div className="rounded-2xl border border-dashed border-galaxy-border bg-white p-8 text-center">
          <p className="text-sm text-galaxy-muted">No Business Units match “{search}”.</p>
        </div>
      )}

      {filteredBUs.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-2">
          <ChartCard title="Revenue Share" subtitle={`${buPeriod.toUpperCase()} actuals distribution`}>
            <DonutChart
              data={filteredBUs.map((b) => ({ name: b.bu, value: totals.get(b.bu)?.actuals ?? 0 }))}
              onSliceClick={(bu) => onDrill({ bu })}
            />
          </ChartCard>
        </div>
      )}
    </div>
  );
}
