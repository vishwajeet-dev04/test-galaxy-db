import { useMemo, useState } from "react";
import { QuotaVsActualChart } from "../components/charts/QuotaVsActualChart";
import { DonutChart } from "../components/charts/DonutChart";
import { ChartCard } from "../components/ChartCard";
import { ProgressRing } from "../components/ProgressRing";
import { FilterBar } from "../components/FilterBar";
import type { QuotaData, DrillState } from "../types";
import { formatCr, attainmentBarColor, BU_COLORS } from "../utils/format";
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

  const filteredBUs = useMemo(() => {
    if (!search) return bu_level;
    const q = search.toLowerCase();
    return bu_level.filter(
      (b) => b.bu.toLowerCase().includes(q) || b.service.toLowerCase().includes(q)
    );
  }, [bu_level, search]);

  const buChart = filteredBUs.map((b) => ({
    name: b.bu,
    quota: b.h1.quota ?? 0,
    actuals: b.h1.actuals ?? 0,
    attainment: b.h1.attainment_pct ?? 0,
  }));

  const rtmData = selected ? rtm_by_bu[selected]?.filter((r) => !r.name.includes("Grand")) ?? [] : [];

  return (
    <div className="space-y-6">
      {selected && (
        <p className="text-sm text-slate-500">
          RTM breakdown for <span className="font-semibold text-galaxy-navy">{selected}</span>
        </p>
      )}

      <FilterBar search={search} onSearchChange={setSearch} searchPlaceholder="Search BU or service..." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredBUs.map((b) => {
          const att = b.h1.attainment_pct ?? 0;
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
                  <p className="mt-3 font-mono text-2xl font-bold tracking-tight text-galaxy-navy">{formatCr(b.h1.actuals)}</p>
                  <p className="text-xs text-slate-400">of {formatCr(b.h1.quota)} quota</p>
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
                  {b.pipeline.deal_count} pipeline deals · {formatCr(b.pipeline.revenue_cr)}
                </p>
              )}
            </button>
          );
        })}
      </div>

      {!selected && filteredBUs.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-2">
          <ChartCard title="Quota vs Actuals" subtitle="H1 performance by business unit">
            <QuotaVsActualChart data={buChart} onBarClick={(bu) => onDrill({ bu })} />
          </ChartCard>
          <ChartCard title="Revenue Share" subtitle="H1 actuals distribution">
            <DonutChart
              data={filteredBUs.map((b) => ({ name: b.bu, value: b.h1.actuals ?? 0 }))}
              onSliceClick={(bu) => onDrill({ bu })}
            />
          </ChartCard>
        </div>
      )}

      {selected && rtmData.length > 0 && (
        <ChartCard title={`${selected} — RTM by Division`} subtitle="Revenue contribution breakdown">
          <QuotaVsActualChart
            data={rtmData
              .filter((r) => !r.name.includes("Total"))
              .map((r) => ({
                name: r.division ?? r.name.replace(" Division Total", ""),
                quota: r.h1.quota ?? r.annual.quota ?? 0,
                actuals: r.h1.actuals ?? r.q1.actuals ?? 0,
                attainment:
                  r.h1.attainment_pct ?? (r.h1.quota ? ((r.h1.actuals ?? 0) / r.h1.quota) * 100 : 0),
              }))}
            onBarClick={(div) => onDrill({ view: "divisions", division: div, bu: selected })}
          />
          <div className="mt-4 overflow-hidden rounded-xl border border-galaxy-border">
            <table className="w-full text-sm">
              <thead>
                <tr className={ui.tableHead}>
                  <th className="px-4 py-2">Division</th>
                  <th className="px-4 py-2 text-right">Q1 Actuals</th>
                  <th className="px-4 py-2 text-right">H1 Actuals</th>
                  <th className="px-4 py-2 text-right">Annual Quota</th>
                  <th className="px-4 py-2 text-right">Annual Actuals</th>
                </tr>
              </thead>
              <tbody>
                {rtmData.map((r) => (
                  <tr key={r.name} className="border-b border-galaxy-border/70">
                    <td className="px-4 py-2 text-galaxy-navy">{r.name}</td>
                    <td className="px-4 py-2 text-right font-mono text-galaxy-muted">{formatCr(r.q1.actuals)}</td>
                    <td className="px-4 py-2 text-right font-mono font-medium text-galaxy-navy">{formatCr(r.h1.actuals)}</td>
                    <td className="px-4 py-2 text-right font-mono text-galaxy-muted">{formatCr(r.annual.quota)}</td>
                    <td className="px-4 py-2 text-right font-mono text-galaxy-muted">{formatCr(r.annual.actuals)}</td>
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
