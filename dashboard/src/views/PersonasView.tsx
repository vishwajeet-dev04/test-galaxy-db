import { useMemo, useState } from "react";
import { QuotaVsActualChart } from "../components/charts/QuotaVsActualChart";
import { DonutChart } from "../components/charts/DonutChart";
import { FilterBar } from "../components/FilterBar";
import type { QuotaData, DrillState } from "../types";
import { formatCr, formatPct, attainmentColor, attainmentBg, attainmentBarColor } from "../utils/format";
import { ui } from "../theme";

interface PersonasViewProps {
  data: QuotaData;
  drill: DrillState;
  onDrill: (drill: Partial<DrillState>) => void;
}

export function PersonasView({ data, drill, onDrill }: PersonasViewProps) {
  const { persona_aggregates, individuals } = data;
  const selected = drill.persona;
  const [search, setSearch] = useState("");
  const [divisionFilter, setDivisionFilter] = useState("");

  const divisions = useMemo(
    () => [...new Set(individuals.map((e) => e.division).filter(Boolean))].sort() as string[],
    [individuals]
  );

  const filteredPersonas = useMemo(() => {
    return persona_aggregates.filter((p) => {
      if (search && !p.persona.toLowerCase().includes(search.toLowerCase())) return false;
      if (selected && p.persona !== selected) return false;
      return true;
    });
  }, [persona_aggregates, search, selected]);

  const personaEmployees = useMemo(() => {
    if (!selected) return [];
    return individuals.filter((e) => {
      if (e.persona !== selected) return false;
      if (divisionFilter && e.division !== divisionFilter) return false;
      return true;
    });
  }, [individuals, selected, divisionFilter]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className={ui.pageTitle}>Sales Personas</h2>
        <p className={ui.pageSub}>Performance by role type — IC, TL, Specialist, Generalist, and more</p>
      </div>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search personas..."
        filters={
          selected
            ? [
                {
                  key: "division",
                  label: "Division",
                  value: divisionFilter,
                  onChange: setDivisionFilter,
                  options: [
                    { label: "All Divisions", value: "" },
                    ...divisions.map((d) => ({ label: d, value: d })),
                  ],
                },
              ]
            : []
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className={`${ui.card} p-5`}>
          <h3 className="mb-4 font-medium text-galaxy-navy">H1 Actuals by Persona</h3>
          <DonutChart
            data={filteredPersonas.map((p) => ({ name: p.persona, value: p.h1_actuals }))}
            onSliceClick={(persona) => onDrill({ persona })}
            statusMap={Object.fromEntries(
              filteredPersonas.map((p) => [p.persona, p.h1_attainment_pct ?? null])
            )}
            legendStatusColorFn={attainmentBarColor}
          />
        </div>
        <div className={`${ui.card} p-5`}>
          <h3 className="mb-4 font-medium text-galaxy-navy">Quota vs Actuals</h3>
          <QuotaVsActualChart
            data={filteredPersonas.map((p) => ({
              name: p.persona.length > 10 ? p.persona.slice(0, 8) + "…" : p.persona,
              quota: p.h1_quota,
              actuals: p.h1_actuals,
              attainment: p.h1_attainment_pct,
            }))}
            height={280}
            onBarClick={(name) => {
              const match = persona_aggregates.find((p) => p.persona.startsWith(name.replace("…", "")));
              if (match) onDrill({ persona: match.persona });
            }}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {filteredPersonas.map((p) => (
          <button
            key={p.persona}
            onClick={() => onDrill({ persona: p.persona })}
            className={`rounded-2xl border p-4 text-left shadow-sm transition hover:shadow-md ${
              selected === p.persona
                ? "border-galaxy-navy bg-galaxy-navy/5"
                : "border-galaxy-border bg-white hover:border-galaxy-navy/40"
            }`}
          >
            <p className="text-sm font-medium text-galaxy-navy">{p.persona}</p>
            <p className="mt-1 text-xs text-galaxy-muted">{p.count} people</p>
            <p className="mt-3 font-mono text-xl font-semibold text-galaxy-navy">{formatCr(p.h1_actuals)}</p>
            <p className={`mt-1 font-mono text-sm ${attainmentColor(p.h1_attainment_pct)}`}>
              {formatPct(p.h1_attainment_pct)}
            </p>
          </button>
        ))}
      </div>

      {selected && personaEmployees.length > 0 && (
        <div className={`${ui.card} p-5`}>
          <h3 className="mb-4 font-medium text-galaxy-navy">{selected} — Individuals</h3>
          <div className="space-y-2">
            {personaEmployees.map((emp) => {
              const att = emp.h1.attainment_pct ?? 0;
              return (
                <button
                  key={emp.name}
                  onClick={() => onDrill({ view: "employees", employee: emp.name })}
                  className="flex w-full items-center gap-4 rounded-xl bg-galaxy-surface/60 p-3 text-left transition hover:bg-galaxy-surface"
                >
                  <div className="flex-1">
                    <p className="font-medium text-galaxy-navy">{emp.name}</p>
                    <p className="text-xs text-galaxy-muted">{emp.division}</p>
                  </div>
                  <p className="font-mono text-sm text-galaxy-muted">{formatCr(emp.h1.actuals)}</p>
                  <div className="w-24">
                    <div className="h-1.5 rounded-full bg-gray-200">
                      <div className={`h-full rounded-full ${attainmentBg(att)}`} style={{ width: `${Math.min(att, 100)}%` }} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
