import { useMemo, useState } from "react";
import { Trophy, Medal, Award } from "lucide-react";
import { FilterBar } from "../components/FilterBar";
import { Avatar } from "../components/Avatar";
import type { QuotaData, DrillState, Individual } from "../types";
import { formatCr, formatPct, attainmentColor, attainmentBg } from "../utils/format";
import { ui } from "../theme";

interface LeaderboardViewProps {
  data: QuotaData;
  onDrill: (drill: Partial<DrillState>) => void;
}

type SortKey =
  | "q1_attainment"
  | "q2_attainment"
  | "h1_attainment"
  | "q3_attainment"
  | "q4_attainment"
  | "h2_attainment"
  | "annual_attainment";

const SORT_OPTIONS: { label: string; value: SortKey }[] = [
  { label: "Q1 Attainment %", value: "q1_attainment" },
  { label: "Q2 Attainment %", value: "q2_attainment" },
  { label: "H1 Attainment %", value: "h1_attainment" },
  { label: "Q3 Attainment %", value: "q3_attainment" },
  { label: "Q4 Attainment %", value: "q4_attainment" },
  { label: "H2 Attainment %", value: "h2_attainment" },
  { label: "Annual Attainment %", value: "annual_attainment" },
];

const RANK_ICONS = [Trophy, Medal, Award];
const rankColors = ["text-amber-500", "text-gray-400", "text-amber-700"];

const RTM_DIVISIONS = new Set(["S1", "S2", "CB", "GB", "South"]);

function getPeriodMetrics(emp: Individual, sortBy: SortKey) {
  switch (sortBy) {
    case "q1_attainment":
      return { actuals: emp.q1.actuals, quota: emp.q1.quota, attainment: emp.q1.attainment_pct, label: "Q1" };
    case "q2_attainment":
      return { actuals: emp.q2.actuals, quota: emp.q2.quota, attainment: emp.q2.attainment_pct, label: "Q2" };
    case "h1_attainment":
      return { actuals: emp.h1.actuals, quota: emp.h1.quota, attainment: emp.h1.attainment_pct, label: "H1" };
    case "q3_attainment":
      return { actuals: emp.q3.actuals, quota: emp.q3.quota, attainment: emp.q3.attainment_pct, label: "Q3" };
    case "q4_attainment":
      return { actuals: emp.q4.actuals, quota: emp.q4.quota, attainment: emp.q4.attainment_pct, label: "Q4" };
    case "h2_attainment":
      return { actuals: emp.h2.actuals, quota: emp.h2.quota, attainment: emp.h2.attainment_pct, label: "H2" };
    default:
      return {
        actuals: emp.annual.actuals,
        quota: emp.annual.quota,
        attainment: emp.annual.attainment_pct,
        label: "Annual",
      };
  }
}

export function LeaderboardView({ data, onDrill }: LeaderboardViewProps) {
  const [sortBy, setSortBy] = useState<SortKey>("h1_attainment");
  const [divisionFilter, setDivisionFilter] = useState("");
  const [search, setSearch] = useState("");

  const divisions = useMemo(
    () =>
      [...new Set(data.individuals.map((e) => e.division).filter((d) => d && RTM_DIVISIONS.has(d)))].sort() as string[],
    [data]
  );

  const ranked = useMemo(() => {
    return [...data.individuals]
      .filter((e) => e.division && RTM_DIVISIONS.has(e.division))
      .filter((e) => !divisionFilter || e.division === divisionFilter)
      .filter((e) => !search || e.name.toLowerCase().includes(search.toLowerCase()))
      .filter((e) => {
        const m = getPeriodMetrics(e, sortBy);
        return (m.quota ?? 0) > 0;
      })
      .sort((a, b) => {
        const ma = getPeriodMetrics(a, sortBy);
        const mb = getPeriodMetrics(b, sortBy);
        return (mb.attainment ?? 0) - (ma.attainment ?? 0);
      });
  }, [data.individuals, divisionFilter, search, sortBy]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className={ui.pageTitle}>Leaderboard</h2>
        <p className={ui.pageSub}>Ranked RTM performance — Q3/Q4 use proxy until separate columns available</p>
      </div>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search employees..."
        filters={[
          {
            key: "sort",
            label: "Sort by",
            value: sortBy,
            onChange: (v) => setSortBy(v as SortKey),
            options: SORT_OPTIONS,
          },
          {
            key: "division",
            label: "Division",
            value: divisionFilter,
            onChange: setDivisionFilter,
            options: [{ label: "All Divisions", value: "" }, ...divisions.map((d) => ({ label: d, value: d }))],
          },
        ]}
      />

      <p className="text-sm text-galaxy-muted">{ranked.length} employees ranked</p>

      <div className="space-y-2">
        {ranked.map((emp, i) => {
          const m = getPeriodMetrics(emp, sortBy);
          const att = m.attainment ?? 0;
          const RankIcon = i < 3 ? RANK_ICONS[i] : null;

          return (
            <button
              key={emp.name}
              onClick={() => onDrill({ view: "employees", employee: emp.name })}
              className="flex w-full flex-wrap items-center gap-3 rounded-2xl border border-galaxy-border bg-white p-4 text-left shadow-sm transition hover:border-galaxy-navy/30 hover:shadow-md sm:gap-4"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center">
                {RankIcon ? (
                  <RankIcon className={`h-6 w-6 ${rankColors[i]}`} />
                ) : (
                  <span className="font-mono text-lg text-galaxy-muted">#{i + 1}</span>
                )}
              </div>
              <Avatar name={emp.name} size="md" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-galaxy-navy">{emp.name}</p>
                <p className="text-xs text-galaxy-muted">{emp.division}</p>
              </div>
              <div className="text-right">
                <p className="font-mono text-lg font-semibold text-galaxy-navy">{formatCr(m.actuals)}</p>
                <p className="text-xs text-galaxy-muted">{m.label} actuals</p>
              </div>
              <div className="w-full sm:w-32">
                <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                  <div className={`h-full rounded-full ${attainmentBg(att)}`} style={{ width: `${Math.min(att, 100)}%` }} />
                </div>
                <p className={`mt-1 text-right font-mono text-sm font-medium ${attainmentColor(att)}`}>
                  {formatPct(att)}
                </p>
              </div>
            </button>
          );
        })}

        {ranked.length === 0 && (
          <div className={`${ui.card} p-8 text-center`}>
            <p className="text-galaxy-muted">No employees match your filters.</p>
          </div>
        )}
      </div>
    </div>
  );
}
