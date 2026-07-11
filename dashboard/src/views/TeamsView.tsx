import { useMemo, useState } from "react";
import { FilterBar } from "../components/FilterBar";
import type { QuotaData } from "../types";
import { formatCr, formatPct } from "../utils/format";
import { ui } from "../theme";

interface TeamsViewProps {
  data: QuotaData;
}

export function TeamsView({ data }: TeamsViewProps) {
  const { teams } = data;
  const [search, setSearch] = useState("");
  const [divisionFilter, setDivisionFilter] = useState("");

  const divisions = useMemo(
    () => [...new Set(teams.map((t) => t.division).filter(Boolean))].sort() as string[],
    [teams]
  );

  const filtered = useMemo(() => {
    return teams.filter((t) => {
      if (search && !t.team_lead.toLowerCase().includes(search.toLowerCase())) return false;
      if (divisionFilter && t.division !== divisionFilter) return false;
      return true;
    });
  }, [teams, search, divisionFilter]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className={ui.pageTitle}>Team Performance</h2>
        <p className={ui.pageSub}>
          Team lead aggregates vs company targets
        </p>
      </div>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search team lead..."
        filters={[
          {
            key: "division",
            label: "Division",
            value: divisionFilter,
            onChange: setDivisionFilter,
            options: [{ label: "All Divisions", value: "" }, ...divisions.map((d) => ({ label: d, value: d }))],
          },
        ]}
      />

      <div className="grid gap-4">
        {filtered.map((team) => (
          <div key={team.team_lead} className={`${ui.card} p-5`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="font-medium text-galaxy-navy">{team.team_lead}</h3>
                <p className="text-sm text-galaxy-muted">{team.division}</p>
                {team.notes && <p className="mt-2 text-xs italic text-galaxy-muted">{team.notes}</p>}
              </div>
              {team.deals != null && (
                <span className="rounded-lg bg-galaxy-surface px-3 py-1 text-sm text-galaxy-muted">
                  {team.deals} team deals
                </span>
              )}
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className={`${ui.cardInner} p-4`}>
                <p className="text-xs uppercase tracking-wider text-galaxy-muted">H1 Team Quota</p>
                <p className="mt-2 font-mono text-2xl font-semibold text-galaxy-navy">{formatCr(team.h1.quota)}</p>
                <p className="mt-1 text-sm text-galaxy-muted">
                  Actuals: {formatCr(team.h1.actuals)} · vs Co. Target: {formatPct(team.h1.vs_company_target)}
                </p>
                {team.h1.flag && team.h1.flag !== "—" && (
                  <span className="mt-2 inline-block rounded-md bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                    {team.h1.flag}
                  </span>
                )}
              </div>
              <div className={`${ui.cardInner} p-4`}>
                <p className="text-xs uppercase tracking-wider text-galaxy-muted">Annual Team Quota</p>
                <p className="mt-2 font-mono text-2xl font-semibold text-galaxy-navy">{formatCr(team.annual.quota)}</p>
                <p className="mt-1 text-sm text-galaxy-muted">
                  Actuals: {formatCr(team.annual.actuals)} · vs Co. Target: {formatPct(team.annual.vs_company_target)}
                </p>
                {team.annual.flag && team.annual.flag !== "—" && (
                  <span className="mt-2 inline-block rounded-md bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                    {team.annual.flag}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className={`${ui.card} p-8 text-center`}>
            <p className="text-galaxy-muted">No teams match your filters.</p>
          </div>
        )}
      </div>
    </div>
  );
}
