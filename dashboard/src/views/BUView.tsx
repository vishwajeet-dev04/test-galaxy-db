import { useMemo, useState } from "react";
import { DonutChart } from "../components/charts/DonutChart";
import { ChartCard } from "../components/ChartCard";

import { ProgressRing } from "../components/ProgressRing";
import { FilterBar } from "../components/FilterBar";
import type { QuotaData, DrillState } from "../types";
import { formatCr, BU_COLORS, attainmentBarColor } from "../utils/format";
import { ui } from "../theme";

interface BUViewProps {
  data: QuotaData;
  drill: DrillState;
  onDrill: (drill: Partial<DrillState>) => void;
}

export function BUView({ data, drill, onDrill }: BUViewProps) {
  const { bu_level, rtm_by_bu } = data;
  const selected = drill.bu;
  const [search, setSearch] = useState("");
  const [buPeriod, setBuPeriod] = useState<"h1" | "h2">("h1");

  const filteredBUs = useMemo(() => {
    if (!search) return bu_level;
    const q = search.toLowerCase();
    return bu_level.filter(
      (b) => b.bu.toLowerCase().includes(q) || b.service.toLowerCase().includes(q)
    );
  }, [bu_level, search]);

  const rtmData = selected ? rtm_by_bu[selected]?.filter((r) => !r.name.includes("Grand")) ?? [] : [];

  return (
    <div className="space-y-6">
      {selected && (
        <p className="text-sm text-slate-500">
          RTM breakdown for <span className="font-semibold text-galaxy-navy">{selected}</span>
        </p>
      )}

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
          const periodData = b[buPeriod];
          const att = periodData?.attainment_pct ?? 0;
          const actuals = periodData?.actuals ?? 0;
          const quota = periodData?.quota;
          const hasActuals = actuals > 0 || quota != null;
          
          const color = BU_COLORS[b.bu] ?? "#3c3f8e";
          return (
            <button
              key={b.bu}
              onClick={() => onDrill({ bu: b.bu })}
              className={`group rounded-2xl border bg-white p-5 text-left shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(15,23,42,0.08)] ${
                selected === b.bu ? "border-galaxy-navy ring-2 ring-galaxy-navy/15" : "border-galaxy-border/70 hover:border-galaxy-navy/25"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
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
                  
                  {/* # Deals only exists for H1/annual in the tracker currently, fallback to h1 deals safely */}
                  {b.h1.deals != null && buPeriod === "h1" && (
                    <p className="mt-2 text-[11px] font-semibold text-slate-500">
                      <span className="font-bold text-galaxy-navy">{Math.round(b.h1.deals)}</span> closed deals
                    </p>
                  )}
                </div>
                <div className="relative shrink-0">
                  <ProgressRing value={att} size={48} color={attainmentBarColor(att)} />
                  <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-slate-600">
                    {Math.round(att)}%
                  </span>
                </div>
              </div>
              {b.pipeline && b.pipeline.deal_count > 0 && (
                <p className="mt-3 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-700">
                  {b.pipeline.deal_count} pipeline deals
                </p>
              )}
            </button>
          );
        })}
      </div>

      {!selected && filteredBUs.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-2">
          <ChartCard title="Revenue Share" subtitle={`${buPeriod.toUpperCase()} actuals distribution`}>
            <DonutChart
              data={filteredBUs.map((b) => ({ name: b.bu, value: b[buPeriod]?.actuals ?? 0 }))}
              onSliceClick={(bu) => onDrill({ bu })}
            />
          </ChartCard>
        </div>
      )}

      {selected && rtmData.length > 0 && (
        <ChartCard title={`${selected} — RTM by Division`} subtitle="Revenue contribution breakdown">
          <div className="overflow-x-auto rounded-xl border border-galaxy-border">
            <table className="w-full text-sm">
              <thead>
                <tr className={ui.tableHead}>
                  <th className="px-4 py-2 text-left">Division</th>
                  <th className="px-4 py-2 text-right">Q1 Actuals</th>
                  <th className="px-4 py-2 text-right">Q2 Actuals</th>
                  <th className="px-4 py-2 text-right">H1 Actuals</th>
                  <th className="px-4 py-2 text-right">Q3 Actuals</th>
                  <th className="px-4 py-2 text-right">Q4 Actuals</th>
                  <th className="px-4 py-2 text-right">H2 Actuals</th>
                  <th className="px-4 py-2 text-right">Annual Quota</th>
                  <th className="px-4 py-2 text-right">Annual Actuals</th>
                </tr>
              </thead>
              <tbody>
                {rtmData.map((r) => (
                  <tr key={r.name} className="border-b border-galaxy-border/70 hover:bg-slate-50/50 transition">
                    <td className="px-4 py-2 font-medium text-galaxy-navy whitespace-nowrap">{r.name}</td>
                    <td className="px-4 py-2 text-right font-mono text-galaxy-muted">{formatCr(r.q1?.actuals)}</td>
                    <td className="px-4 py-2 text-right font-mono text-galaxy-muted">{formatCr(r.q2?.actuals)}</td>
                    <td className="px-4 py-2 text-right font-mono font-medium text-galaxy-navy">{formatCr(r.h1?.actuals)}</td>
                    <td className="px-4 py-2 text-right font-mono text-galaxy-muted">{formatCr(r.q3?.actuals)}</td>
                    <td className="px-4 py-2 text-right font-mono text-galaxy-muted">{formatCr(r.q4?.actuals)}</td>
                    <td className="px-4 py-2 text-right font-mono font-medium text-galaxy-navy">{formatCr(r.h2?.actuals)}</td>
                    <td className="px-4 py-2 text-right font-mono text-galaxy-muted">{formatCr(r.annual?.quota)}</td>
                    <td className="px-4 py-2 text-right font-mono font-medium text-galaxy-navy">{formatCr(r.annual?.actuals)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      )}
    </div>
  );
}
