import { useMemo, useState, useEffect, Fragment } from "react";
import { ChevronDown } from "lucide-react";
import { FilterBar } from "../components/FilterBar";
import { StatusFlag } from "../components/StatusFlag";
import { PerformanceCard } from "../components/PerformanceCard";
import { Avatar } from "../components/Avatar";
import { getPeriodElapsedLabel } from "../utils/fiscal";
import type { QuotaData, DrillState } from "../types";
import { formatCr, formatPct, attainmentColor } from "../utils/format";
import { ui } from "../theme";

const RTM_ORDER = ["S1", "S2", "CB", "GB", "South"];

interface DivisionsViewProps {
  data: QuotaData;
  drill: DrillState;
  onDrill: (drill: Partial<DrillState>) => void;
}

export function DivisionsView({ data, drill, onDrill }: DivisionsViewProps) {
  const rtmDivisions = useMemo(() => {
    const list = data.rtm_divisions ?? [];
    return [...list].sort((a, b) => {
      const ai = RTM_ORDER.indexOf(a.division);
      const bi = RTM_ORDER.indexOf(b.division);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [data.rtm_divisions]);

  const { individuals } = data;
  const [expandedRtms, setExpandedRtms] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [minAttainment, setMinAttainment] = useState("");
  const [rtmPeriod, setRtmPeriod] = useState<"h1" | "h2">("h1");

  useEffect(() => {
    if (drill.division) {
      if (!expandedRtms.includes(drill.division)) {
        setExpandedRtms((prev) => [...prev, drill.division!]);
      }
      onDrill({ division: undefined });
    }
  }, [drill.division, onDrill, expandedRtms]);

  const toggleRtm = (val: string) => {
    setExpandedRtms((prev) =>
      prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val]
    );
  };

  const filteredRtms = useMemo(() => {
    return rtmDivisions.filter((d) => {
      if (search && !d.division.toLowerCase().includes(search.toLowerCase())) return false;
      const att = d[rtmPeriod].attainment_pct ?? 0;
      if (minAttainment === "low" && att >= 30) return false;
      if (minAttainment === "mid" && (att < 30 || att >= 50)) return false;
      if (minAttainment === "high" && att < 50) return false;
      return true;
    });
  }, [rtmDivisions, search, minAttainment, rtmPeriod]);

  return (
    <div className="space-y-6">

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Period</span>
        {(["h1", "h2"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setRtmPeriod(p)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase transition ${
              rtmPeriod === p
                ? "bg-galaxy-navy text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {rtmDivisions.map((d) => {
          const att = d[rtmPeriod].attainment_pct ?? 0;
          const hasActuals = (d[rtmPeriod].actuals ?? 0) > 0;
          return (
            <button
              key={d.division}
              onClick={() => toggleRtm(d.division)}
              className={`text-left transition ${
                expandedRtms.includes(d.division) ? "ring-2 ring-galaxy-navy/30 rounded-xl" : ""
              }`}
            >
              <PerformanceCard
                period={rtmPeriod.toUpperCase() as "H1" | "H2"}
                title={`${d.division} Actual/ Quota`}
                actuals={hasActuals ? (d[rtmPeriod].actuals ?? 0) : null}
                quota={d[rtmPeriod].quota ?? 0}
                attainmentPct={att}
                periodElapsedLabel={getPeriodElapsedLabel(rtmPeriod.toUpperCase() as "H1" | "H2")}
                quotaOnly={!hasActuals}
                closedDeals={d.closed_deals}
              />
            </button>
          );
        })}
      </div>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search RTMs..."
        filters={[
          {
            key: "attainment",
            label: "Attainment",
            value: minAttainment,
            onChange: setMinAttainment,
            options: [
              { label: "All Attainment", value: "" },
              { label: "Critical (0–30%)", value: "low" },
              { label: "At Risk (30–50%)", value: "mid" },
              { label: "On Track (≥50%)", value: "high" },
            ],
          },
        ]}
      />

      <div className={`${ui.tableWrap} overflow-x-auto`}>
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className={ui.tableHead}>
              <th className="px-4 py-3">RTM</th>
              <th className="px-4 py-3 text-right">Employees</th>
              <th className="px-4 py-3 text-right">{rtmPeriod.toUpperCase()} Quota</th>
              <th className="px-4 py-3 text-right">{rtmPeriod.toUpperCase()} Actuals</th>
              <th className="px-4 py-3 text-right">Attainment</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Annual Quota</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {filteredRtms.map((d) => {
              const isExpanded = expandedRtms.includes(d.division);
              return (
                <Fragment key={d.division}>
                  <tr onClick={() => toggleRtm(d.division)} className={`${ui.tableRow} cursor-pointer hover:bg-galaxy-surface/50`}>
                    <td className="px-4 py-3 font-medium text-galaxy-navy">{d.division}</td>
                    <td className="px-4 py-3 text-right font-mono text-galaxy-muted">{d.employee_count}</td>
                    <td className="px-4 py-3 text-right font-mono text-galaxy-muted">{formatCr(d[rtmPeriod].quota)}</td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-galaxy-navy">
                      {formatCr(d[rtmPeriod].actuals)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-mono font-medium ${attainmentColor(d[rtmPeriod].attainment_pct)}`}
                    >
                      {formatPct(d[rtmPeriod].attainment_pct)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusFlag status={d.status} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-galaxy-muted">{formatCr(d.annual.quota)}</td>
                    <td className="px-4 py-3 text-center">
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-galaxy-muted transition-transform ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                      />
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={8} className="p-0 border-b border-galaxy-border bg-slate-50/80">
                        <div className="p-5 shadow-inner">
                          <h3 className="mb-4 font-medium text-galaxy-navy">{d.division} — Employee Breakdown</h3>
                          <div className="space-y-2 max-w-4xl">
                            {individuals
                              .filter((e) => e.division === d.division && e.name !== "Total")
                              .map((emp) => {
                                const att = emp[rtmPeriod]?.attainment_pct ?? 0;
                                return (
                                  <button
                                    key={emp.name}
                                    onClick={() => onDrill({ view: "employees", employee: emp.name })}
                                    className="flex w-full items-center gap-4 rounded-xl border border-galaxy-border bg-white p-3 text-left transition hover:border-galaxy-navy/30 hover:shadow-sm"
                                  >
                                    <Avatar name={emp.name} size="sm" />
                                    <div className="min-w-0 flex-1">
                                      <p className="font-medium text-galaxy-navy">{emp.name}</p>
                                      <p className="text-xs text-galaxy-muted">
                                        {emp.persona}
                                        {emp.counts_for_rtm === false && (
                                          <span className="text-slate-400"> · Not counted in RTM total</span>
                                        )}
                                      </p>
                                    </div>
                                    <p className="font-mono text-sm text-galaxy-muted">{formatCr(emp[rtmPeriod]?.actuals)}</p>
                                    <p className={`font-mono text-sm ${attainmentColor(att)}`}>{formatPct(att)}</p>
                                  </button>
                                );
                              })}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
