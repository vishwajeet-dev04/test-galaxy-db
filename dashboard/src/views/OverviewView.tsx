import { useState } from "react";
import { ChartCard } from "../components/ChartCard";
import { SectionHeader } from "../components/SectionHeader";
import { PerformerList } from "../components/PerformerList";
import { PerformanceCard } from "../components/PerformanceCard";
import { InfoTooltip } from "../components/InfoTooltip";
import { Avatar } from "../components/Avatar";
import { DonutChart } from "../components/charts/DonutChart";
import type { QuotaData, DrillState, PeriodSnapshot } from "../types";
import { formatCr, formatPct } from "../utils/format";
import {
  getPeriodElapsedLabel,
  type PerformancePeriodKey,
  PERFORMANCE_PERIOD_OPTIONS,
} from "../utils/fiscal";


interface OverviewViewProps {
  data: QuotaData;
  onDrill: (drill: Partial<DrillState>) => void;
}

function periodCardProps(key: PerformancePeriodKey, snapshot: PeriodSnapshot | undefined) {
  if (!snapshot) return null;
  const labels: Record<PerformancePeriodKey, "Q1" | "Q2" | "H1" | "Q3" | "Q4" | "H2" | "Annual"> = {
    q1: "Q1",
    q2: "Q2",
    h1: "H1",
    q3: "Q3",
    q4: "Q4",
    h2: "H2",
    annual: "Annual",
  };
  const label = labels[key];
  const quotaOnly = !snapshot.show_attainment || (snapshot.ic_actuals ?? 0) <= 0;
  return {
    period: label,
    actuals: quotaOnly ? null : snapshot.ic_actuals,
    quota: snapshot.ic_quota,
    attainmentPct: snapshot.ic_attainment_pct,
    closedDeals: snapshot.closed_deals,
    periodElapsedLabel:
      label === "Annual" ? "FY 25-26" : getPeriodElapsedLabel(label as "Q1" | "Q2" | "H1" | "H2" | "Q3" | "Q4"),
    quotaOnly,
    stlyActuals: snapshot.stly_actuals_cr,
  };
}

export function OverviewView({ data, onDrill }: OverviewViewProps) {
  const { bu_level, period_metrics, rtm_divisions, at_risk_ics, top_attainers } = data;

  const [selectedChartPeriod, setSelectedChartPeriod] = useState<PerformancePeriodKey>("q1");

  const getChartData = () => {
    const rtmData = (rtm_divisions ?? []).map((d) => {
      let val = 0;
      if (selectedChartPeriod === "q3" || selectedChartPeriod === "q4") {
        val = (d.h2?.actuals ?? 0) / 2;
      } else {
        val = (d as any)[selectedChartPeriod]?.actuals ?? 0;
      }
      return { name: d.division, value: val };
    });
    const buData = (bu_level ?? []).map((b) => {
      let val = 0;
      if (selectedChartPeriod === "q3" || selectedChartPeriod === "q4") {
        val = ((b as any).h2?.actuals ?? 0) / 2;
      } else {
        val = (b as any)[selectedChartPeriod]?.actuals ?? 0;
      }
      return { name: b.bu, value: val };
    });
    return { rtmData, buData };
  };

  const { rtmData: pipelineByRtm, buData: pipelineByBu } = getChartData();

  const topByPct = top_attainers?.by_attainment_pct ?? [];
  const topByValue = top_attainers?.by_value_closed ?? [];

  // Pre-computed per-period card props — used by the explicit-placement grid below
  const pm = period_metrics;
  const q1Props = periodCardProps("q1", pm?.q1);
  const q2Props = periodCardProps("q2", pm?.q2);
  const h1Props = periodCardProps("h1", pm?.h1);
  const q3Props = periodCardProps("q3", pm?.q3);
  const q4Props = periodCardProps("q4", pm?.q4);
  const h2Props = periodCardProps("h2", pm?.h2);
  const annualProps = periodCardProps("annual", pm?.annual);

  return (
    <div className="space-y-8 lg:space-y-10">
      <section className="space-y-4">
        <SectionHeader
          label="Performance by Period"
          description="Fiscal performance tracking"
        />
        {/*
          Layout: 3-col × 2-row grid for Q1/Q2/H1 + Q3/Q4/H2, Annual tall card in col 4.
          On < xl: 3 cols, Annual spans full width below.
          On xl+: 4 cols, Annual at col-start-4 spanning both rows.
        */}
        <div className="grid grid-cols-3 gap-3 xl:grid-rows-2 xl:[grid-template-columns:repeat(3,minmax(0,1fr))_minmax(0,250px)]">
          {/* Row 1 — Q1, Q2, H1 */}
          <div className="xl:col-start-1 xl:row-start-1">
            {q1Props && <PerformanceCard {...q1Props} />}
          </div>
          <div className="xl:col-start-2 xl:row-start-1">
            {q2Props && <PerformanceCard {...q2Props} />}
          </div>
          <div className="xl:col-start-3 xl:row-start-1">
            {h1Props && <PerformanceCard {...h1Props} />}
          </div>

          {/* Row 2 — Q3, Q4, H2 */}
          <div className="xl:col-start-1 xl:row-start-2">
            {q3Props && <PerformanceCard {...q3Props} />}
          </div>
          <div className="xl:col-start-2 xl:row-start-2">
            {q4Props && <PerformanceCard {...q4Props} />}
          </div>
          <div className="xl:col-start-3 xl:row-start-2">
            {h2Props && <PerformanceCard {...h2Props} showTargetOnNoData={true} />}
          </div>

          {/* Annual — full-width below on small screens; narrow col 4 spanning rows 1–2 on xl */}
          <div className="col-span-3 xl:col-span-1 xl:col-start-4 xl:row-start-1 xl:row-span-2 xl:flex xl:items-center">
            {annualProps && (
              <PerformanceCard
                {...annualProps}
                compact={true}
                className="xl:w-full border-l-[3px] border-l-galaxy-navy bg-slate-50/60"
              />
            )}
          </div>
        </div>
      </section>

      {at_risk_ics && at_risk_ics.length > 0 && (
        <section className="space-y-4">
          <SectionHeader
            label="Needs attention"
            description="ICs below 25% H1 attainment"
            action={{ label: "View employees", onClick: () => onDrill({ view: "employees" }) }}
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {at_risk_ics.slice(0, 6).map((ic) => (
              <button
                key={ic.name}
                onClick={() => onDrill({ view: "employees", employee: ic.name })}
                className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50/50 p-4 text-left transition hover:border-red-200 hover:shadow-sm"
              >
                <Avatar name={ic.name} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-galaxy-navy">{ic.name}</p>
                  <p className="text-xs text-slate-500">{ic.division}</p>
                  <p className="mt-1 font-mono text-sm text-galaxy-primary">
                    {formatPct(ic.h1_attainment_pct)} · {formatCr(ic.h1_actuals)} / {formatCr(ic.h1_quota)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-4">
        <SectionHeader
          label="Closed Opportunity Analysis"
          description="Closed-won distribution by RTM & BU"
          rightContent={
            <select
              value={selectedChartPeriod}
              onChange={(e) => setSelectedChartPeriod(e.target.value as PerformancePeriodKey)}
              className="rounded-lg border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 focus:border-galaxy-blue focus:ring-1 focus:ring-galaxy-blue"
            >
              {PERFORMANCE_PERIOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          }
        />
        <div className="grid gap-5 lg:grid-cols-2">
          <ChartCard
            title={
              <span className="inline-flex items-center gap-1.5">
                Closed Opportunities by RTM
                <InfoTooltip text="Closed-won revenue grouped by RTM (S1, S2, CB, GB, South)" />
              </span>
            }
            subtitle="Revenue share by RTM"
            action={{ label: "RTMs", onClick: () => onDrill({ view: "divisions" }) }}
          >
            <DonutChart
              data={pipelineByRtm}
              height={260}
              onSliceClick={(div) => onDrill({ view: "divisions", division: div })}
            />
          </ChartCard>

          <ChartCard
            title={
              <span className="inline-flex items-center gap-1.5">
                Closed Opportunities by BU
                <InfoTooltip text="Closed-won revenue grouped by business unit category" />
              </span>
            }
            subtitle="Revenue share by business unit"
            action={{ label: "Business Units", onClick: () => onDrill({ view: "bu" }) }}
          >
            <DonutChart
              data={pipelineByBu}
              height={260}
              onSliceClick={(bu) => onDrill({ view: "bu", bu })}
            />
          </ChartCard>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader label="Top performers" description="H1 attainment leaders" />
        <div className="grid gap-5 lg:grid-cols-2">
          <ChartCard
            title="Top 5 by Attainment %"
            subtitle="Highest quota attainment among RTM ICs"
            action={{ label: "Leaderboard", onClick: () => onDrill({ view: "leaderboard" }) }}
            noPadding
          >
            <div className="px-6 pb-5">
              <PerformerList
                items={topByPct.map((emp, i) => ({
                  id: emp.name,
                  rank: i + 1,
                  name: emp.name,
                  meta: emp.division ?? "",
                  value: formatPct(emp.h1_attainment_pct),
                  subValue: formatCr(emp.h1_actuals),
                  attainment: emp.h1_attainment_pct,
                }))}
                onSelect={(name) => onDrill({ view: "employees", employee: name })}
              />
            </div>
          </ChartCard>

          <ChartCard
            title="Top 5 by Value Closed"
            subtitle="Highest H1 actuals among RTM ICs"
            action={{ label: "Leaderboard", onClick: () => onDrill({ view: "leaderboard" }) }}
            noPadding
          >
            <div className="px-6 pb-5">
              <PerformerList
                items={topByValue.map((emp, i) => ({
                  id: emp.name,
                  rank: i + 1,
                  name: emp.name,
                  meta: emp.division ?? "",
                  value: formatCr(emp.h1_actuals),
                  subValue: formatPct(emp.h1_attainment_pct),
                  attainment: emp.h1_attainment_pct,
                  rankStyle: "emerald" as const,
                }))}
                onSelect={(name) => onDrill({ view: "employees", employee: name })}
              />
            </div>
          </ChartCard>
        </div>
      </section>


    </div>
  );
}
