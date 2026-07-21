import { useState } from "react";
import { ChartCard } from "../components/ChartCard";
import { SectionHeader } from "../components/SectionHeader";
import { PerformerList } from "../components/PerformerList";
import { PerformanceCard } from "../components/PerformanceCard";
import { InfoTooltip } from "../components/InfoTooltip";
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
    // Fix 1: Annual now uses getPeriodElapsedLabel which returns "X% of year complete"
    periodElapsedLabel: getPeriodElapsedLabel(label),
    quotaOnly,
    stlyActuals: snapshot.stly_actuals_cr,
  };
}

/** Returns red/amber/green status colour for a given H1 attainment pct — mirrors RTM table thresholds */
function rtmStatusColor(attainmentPct: number | null | undefined): string {
  if (attainmentPct == null) return "#94a3b8"; // slate-400
  if (attainmentPct >= 50) return "#10b981";   // emerald-500
  if (attainmentPct >= 30) return "#f59e0b";   // amber-500
  return "#e4143b";                            // galaxy-primary (red)
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

  // Fix 4: Build a map of division → H1 attainment % for colour indicators on the RTM donut
  const rtmStatusMap = Object.fromEntries(
    (rtm_divisions ?? []).map((d) => [d.division, d.h1?.attainment_pct ?? null])
  );

  const topByPct = top_attainers?.by_attainment_pct ?? [];
  const topByValue = top_attainers?.by_value_closed ?? [];

  // Fix 2: Bottom performers — same data source as at_risk_ics but sorted ascending by attainment
  const bottomPerformers = [...(at_risk_ics ?? [])].sort(
    (a, b) => (a.h1_attainment_pct ?? 0) - (b.h1_attainment_pct ?? 0)
  ).slice(0, 5);

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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 2xl:grid-rows-2 2xl:[grid-template-columns:repeat(3,minmax(0,1fr))_minmax(0,250px)]">
          {/* Row 1 — Q1, Q2, H1 */}
          <div className="2xl:col-start-1 2xl:row-start-1">
            {q1Props && <PerformanceCard {...q1Props} closedDeals={261} />}
          </div>
          <div className="2xl:col-start-2 2xl:row-start-1">
            {q2Props && <PerformanceCard {...q2Props} closedDeals={42} />}
          </div>
          <div className="2xl:col-start-3 2xl:row-start-1">
            {h1Props && <PerformanceCard {...h1Props} closedDeals={303} />}
          </div>

          {/* Row 2 — Q3, Q4, H2 */}
          <div className="2xl:col-start-1 2xl:row-start-2">
            {q3Props && <PerformanceCard {...q3Props} />}
          </div>
          <div className="2xl:col-start-2 2xl:row-start-2">
            {q4Props && <PerformanceCard {...q4Props} />}
          </div>
          <div className="2xl:col-start-3 2xl:row-start-2">
            {h2Props && <PerformanceCard {...h2Props} showTargetOnNoData={true} />}
          </div>

          {/* Annual — full-width below on small screens; narrow col 4 spanning rows 1–2 on 2xl */}
          <div className="col-span-full 2xl:col-span-1 2xl:col-start-4 2xl:row-start-1 2xl:row-span-2 2xl:flex 2xl:items-center">
            {annualProps && (
              <PerformanceCard
                {...annualProps}
                compact={true}
                className="2xl:w-full border-l-[3px] border-l-galaxy-navy bg-slate-50/60"
              />
            )}
          </div>
        </div>
      </section>

      {/* Fix 2: Replace "Needs Attention" card grid with "Bottom Performance" table */}
      {bottomPerformers.length > 0 && (
        <section className="space-y-4">
          <SectionHeader
            label="Bottom Performance"
            description="Lowest H1 attainment among RTM ICs"
            action={{ label: "View employees", onClick: () => onDrill({ view: "employees" }) }}
          />
          <div className="grid gap-5 lg:grid-cols-2">
            <ChartCard
              title="Bottom 5 by Attainment %"
              subtitle="Lowest quota attainment among RTM ICs"
              action={{ label: "Leaderboard", onClick: () => onDrill({ view: "leaderboard" }) }}
              noPadding
            >
              <div className="px-6 pb-5">
                <PerformerList
                  items={bottomPerformers.map((emp, i) => ({
                    id: emp.name,
                    rank: i + 1,
                    name: emp.name,
                    meta: emp.division ?? "",
                    value: formatPct(emp.h1_attainment_pct),
                    subValue: formatCr(emp.h1_actuals),
                    attainment: emp.h1_attainment_pct,
                    rankStyle: "navy" as const,
                  }))}
                  onSelect={(name) => onDrill({ view: "employees", employee: name })}
                />
              </div>
            </ChartCard>

            <ChartCard
              title="Bottom 5 by Value Closed"
              subtitle="Lowest H1 actuals among RTM ICs"
              action={{ label: "Leaderboard", onClick: () => onDrill({ view: "leaderboard" }) }}
              noPadding
            >
              <div className="px-6 pb-5">
                <PerformerList
                  items={[...(at_risk_ics ?? [])]
                    .sort((a, b) => (a.h1_actuals ?? 0) - (b.h1_actuals ?? 0))
                    .slice(0, 5)
                    .map((emp, i) => ({
                      id: emp.name,
                      rank: i + 1,
                      name: emp.name,
                      meta: emp.division ?? "",
                      value: formatCr(emp.h1_actuals),
                      subValue: formatPct(emp.h1_attainment_pct),
                      attainment: emp.h1_attainment_pct,
                      rankStyle: "navy" as const,
                    }))}
                  onSelect={(name) => onDrill({ view: "employees", employee: name })}
                />
              </div>
            </ChartCard>
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
          {/* Fix 4: RTM donut chart with colour-coded status indicators in legend */}
          <ChartCard
            title={
              <span className="inline-flex items-center gap-1.5">
                Closed Opportunities by RTM
                <InfoTooltip text="Closed-won revenue grouped by RTM (S1, S2, CB, GB, South). Status dot = H1 attainment (green ≥50%, amber 30–50%, red <30%)" />
              </span>
            }
            subtitle="Revenue share by RTM"
            action={{ label: "RTMs", onClick: () => onDrill({ view: "divisions" }) }}
          >
            <DonutChart
              data={pipelineByRtm}
              height={260}
              onSliceClick={(div) => onDrill({ view: "divisions", division: div })}
              legendStatusMap={rtmStatusMap}
              legendStatusColorFn={rtmStatusColor}
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
