import { useMemo, useState } from "react";
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
  const selected = drill.division;
  const [search, setSearch] = useState("");
  const [minAttainment, setMinAttainment] = useState("");

  const filteredRtms = useMemo(() => {
    return rtmDivisions.filter((d) => {
      if (search && !d.division.toLowerCase().includes(search.toLowerCase())) return false;
      const att = d.h1.attainment_pct ?? 0;
      if (minAttainment === "low" && att >= 30) return false;
      if (minAttainment === "mid" && (att < 30 || att >= 50)) return false;
      if (minAttainment === "high" && att < 50) return false;
      if (selected && d.division !== selected) return false;
      return true;
    });
  }, [rtmDivisions, search, minAttainment, selected]);

  const rtmEmployees = selected
    ? individuals.filter((e) => e.division === selected && e.name !== "Total")
    : [];

  return (
    <div className="space-y-6">
      {selected && (
        <p className="text-sm text-slate-500">
          Showing drill-down for <span className="font-semibold text-galaxy-navy">{selected}</span>
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {rtmDivisions.map((d) => {
          const att = d.h1.attainment_pct ?? 0;
          const hasActuals = (d.h1.actuals ?? 0) > 0;
          return (
            <button
              key={d.division}
              onClick={() => onDrill({ division: d.division })}
              className={`text-left transition ${
                selected === d.division ? "ring-2 ring-galaxy-navy/30 rounded-xl" : ""
              }`}
            >
              <PerformanceCard
                period="H1"
                title={`${d.division} Actual/ Quota`}
                actuals={hasActuals ? (d.h1.actuals ?? 0) : null}
                quota={d.h1.quota ?? 0}
                attainmentPct={att}
                periodElapsedLabel={getPeriodElapsedLabel("H1")}
                quotaOnly={!hasActuals}
                closedDeals={0}
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
              <th className="px-4 py-3 text-right">H1 Quota</th>
              <th className="px-4 py-3 text-right">H1 Actuals</th>
              <th className="px-4 py-3 text-right">Attainment</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Annual Quota</th>
            </tr>
          </thead>
          <tbody>
            {filteredRtms.map((d) => (
              <tr key={d.division} onClick={() => onDrill({ division: d.division })} className={ui.tableRow}>
                <td className="px-4 py-3 font-medium text-galaxy-navy">{d.division}</td>
                <td className="px-4 py-3 text-right font-mono text-galaxy-muted">{d.employee_count}</td>
                <td className="px-4 py-3 text-right font-mono text-galaxy-muted">{formatCr(d.h1.quota)}</td>
                <td className="px-4 py-3 text-right font-mono font-medium text-galaxy-navy">
                  {formatCr(d.h1.actuals)}
                </td>
                <td
                  className={`px-4 py-3 text-right font-mono font-medium ${attainmentColor(d.h1.attainment_pct)}`}
                >
                  {formatPct(d.h1.attainment_pct)}
                </td>
                <td className="px-4 py-3">
                  <StatusFlag status={d.status} />
                </td>
                <td className="px-4 py-3 text-right font-mono text-galaxy-muted">{formatCr(d.annual.quota)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && rtmEmployees.length > 0 && (
        <div className={`${ui.card} p-5`}>
          <h3 className="mb-4 font-medium text-galaxy-navy">{selected} — Employee Breakdown</h3>
          <div className="space-y-2">
            {rtmEmployees.map((emp) => {
              const att = emp.h1.attainment_pct ?? 0;
              return (
                <button
                  key={emp.name}
                  onClick={() => onDrill({ view: "employees", employee: emp.name })}
                  className="flex w-full items-center gap-4 rounded-xl bg-galaxy-surface/60 p-3 text-left transition hover:bg-galaxy-surface"
                >
                  <Avatar name={emp.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-galaxy-navy">{emp.name}</p>
                    <p className="text-xs text-galaxy-muted">{emp.persona}</p>
                  </div>
                  <p className="font-mono text-sm text-galaxy-muted">{formatCr(emp.h1.actuals)}</p>
                  <p className={`font-mono text-sm ${attainmentColor(att)}`}>{formatPct(att)}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
