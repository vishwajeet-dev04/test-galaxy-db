import { useMemo, useState } from "react";
import { Briefcase, CircleDollarSign, Users } from "lucide-react";
import { KpiCard } from "../components/KpiCard";
import { ChartCard } from "../components/ChartCard";
import { SectionHeader } from "../components/SectionHeader";
import { PerformerList } from "../components/PerformerList";
import { PerformanceCard } from "../components/PerformanceCard";
import { InfoTooltip } from "../components/InfoTooltip";
import { Avatar } from "../components/Avatar";
import { QuotaVsActualChart } from "../components/charts/QuotaVsActualChart";
import { DonutChart } from "../components/charts/DonutChart";
import type { QuotaData, DrillState, PeriodSnapshot } from "../types";
import { formatCr, formatPct } from "../utils/format";
import {
  PERFORMANCE_PERIOD_OPTIONS,
  getPeriodElapsedLabel,
  type PerformancePeriodKey,
} from "../utils/fiscal";
import { ui } from "../theme";

interface OverviewViewProps {
  data: QuotaData;
  onDrill: (drill: Partial<DrillState>) => void;
}

function periodCardProps(key: PerformancePeriodKey, snapshot: PeriodSnapshot | undefined) {
  if (!snapshot) return null;
  const labels: Record<PerformancePeriodKey, "Q1" | "Q2" | "H1" | "H2" | "Q3" | "Q4" | "Annual"> = {
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
  const [periodFilter, setPeriodFilter] = useState<PerformancePeriodKey>("h1");
  const { kpis, bu_level, pipeline, period_metrics, rtm_divisions, at_risk_ics, top_attainers } = data;

  const selectedSnapshot = period_metrics?.[periodFilter];
  const cardProps = useMemo(
    () => periodCardProps(periodFilter, selectedSnapshot),
    [periodFilter, selectedSnapshot]
  );

  const pipelineByRtm =
    pipeline?.by_rtm?.map((d) => ({ name: d.division, value: d.revenue_cr })) ??
    (rtm_divisions ?? []).map((d) => ({ name: d.division, value: d.h1.actuals ?? 0 }));

  const pipelineByBu = pipeline?.by_bu.map((b) => ({ name: b.bu, value: b.revenue_cr })) ?? [];

  const topByPct = top_attainers?.by_attainment_pct ?? [];
  const topByValue = top_attainers?.by_value_closed ?? [];

  const buChart = bu_level.map((b) => ({
    name: b.bu,
    quota: b.h1.quota ?? 0,
    actuals: b.h1.actuals ?? 0,
    attainment: b.h1.attainment_pct ?? 0,
  }));

  return (
    <div className="space-y-8 lg:space-y-10">
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeader
            label="Performance"
            description="Actual vs quota · select period filter · % of quarter/half elapsed on cards"
          />
          <select
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value as PerformancePeriodKey)}
            className={`${ui.select} py-2 text-sm`}
            aria-label="Period filter"
          >
            {PERFORMANCE_PERIOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <KpiCard
            variant="hero"
            label="Total Employees"
            value={String(kpis.total_employees)}
            sub={`${kpis.total_divisions} RTMs · ${kpis.total_bus} BUs`}
            icon={<Users className="h-5 w-5" />}
            accent="border-l-galaxy-blue"
          />
          {cardProps && <PerformanceCard {...cardProps} />}
          {pipeline && (
            <KpiCard
              variant="hero"
              label="Closed Opportunities"
              value={String(pipeline.total_deals)}
              sub={`${formatCr(pipeline.total_revenue_cr)} · ${pipeline.period}`}
              icon={<CircleDollarSign className="h-5 w-5" />}
              accent="border-l-emerald-500"
            />
          )}
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
        <SectionHeader label="Closed Opportunity Analysis" description="Closed-won distribution by RTM & BU" />
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

      <section className="space-y-4">
        <SectionHeader label="Business units" description="H1 quota vs actuals" />
        <ChartCard
          title="BU Performance"
          subtitle="Click a bar to drill down"
          action={{ label: "Explore BUs", onClick: () => onDrill({ view: "bu" }) }}
        >
          <QuotaVsActualChart data={buChart} onBarClick={(bu) => onDrill({ view: "bu", bu })} height={280} />
        </ChartCard>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard
            label="Sales Force"
            value={String(kpis.total_employees)}
            sub={`${kpis.total_divisions} RTMs · ${kpis.total_bus} BUs`}
            icon={<Users className="h-5 w-5" />}
            accent="border-l-galaxy-blue"
          />
          <KpiCard
            label="H1 BU Quota"
            value={formatCr(kpis.h1_quota_cr)}
            sub="Service-level target"
            icon={<Briefcase className="h-5 w-5" />}
            accent="border-l-galaxy-navy"
          />
          {pipeline && (
            <KpiCard
              label="Closed Accounts"
              value={String(pipeline.unique_accounts)}
              sub={`${pipeline.unique_employees} reps contributing`}
              icon={<CircleDollarSign className="h-5 w-5" />}
              accent="border-l-emerald-500"
            />
          )}
        </div>
      </section>
    </div>
  );
}
