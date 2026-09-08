import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Users, Building2 } from "lucide-react";
import { FilterBar } from "../components/FilterBar";
import { DealRow } from "../components/DealRow";
import { Avatar } from "../components/Avatar";
import { useDashboard } from "../context/DashboardContext";
import type { QuotaData, DrillState, Individual, ClosedAccount, PeriodKey, PeriodMetrics } from "../types";
import { formatCr, formatPct, attainmentColor, attainmentBg } from "../utils/format";
import { formatDisplayDate } from "../utils/fiscal";
import { ui } from "../theme";

interface EmployeesViewProps {
  data: QuotaData;
  drill: DrillState;
  onDrill: (drill: Partial<DrillState>) => void;
}

function ClosedAccountsSection({ pipeline }: { pipeline: Individual["pipeline"] }) {
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);

  if (!pipeline.deal_count) {
    return (
      <div className="mt-6">
        <h4 className="mb-4 flex items-center gap-2 font-medium text-galaxy-navy">
          <Building2 className="h-4 w-4" />
          Closed Accounts
        </h4>
        <div className="flex items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-8">
          <p className="text-sm text-slate-400">No closed accounts yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-2 font-medium text-galaxy-navy">
            <Building2 className="h-4 w-4" />
            Closed Accounts
          </h4>
          <p className="text-xs text-galaxy-muted">
            {pipeline.account_count} accounts · {pipeline.deal_count} deals counted
            {pipeline.deal_count_total && pipeline.deal_count_total !== pipeline.deal_count && (
              <span> ({pipeline.deal_count_total} total)</span>
            )}
            {" · "}
            <span className="text-galaxy-navy">Topline {formatCr(pipeline.total_revenue_cr)}</span>
            {" · "}
            <span className="text-emerald-700">BL {formatCr(pipeline.total_bottomline_cr ?? 0)}</span>
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {pipeline.closed_accounts.map((acct: ClosedAccount) => (
          <div key={acct.account} className="overflow-hidden rounded-xl border border-galaxy-border bg-white">
            <button
              onClick={() => setExpandedAccount(expandedAccount === acct.account ? null : acct.account)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-galaxy-surface/50"
            >
              {expandedAccount === acct.account ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-galaxy-navy" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-galaxy-muted" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium text-galaxy-navy">{acct.account}</p>
                <p className="text-xs text-galaxy-muted">
                  {acct.deal_count} deal{acct.deal_count !== 1 ? "s" : ""}
                </p>
              </div>
              <p className="font-mono text-sm font-medium text-galaxy-navy">{formatCr(acct.revenue_cr)}</p>
            </button>

            {expandedAccount === acct.account && (
              <div className="border-t border-galaxy-border bg-galaxy-surface/30 px-4 py-3">
                <div className="space-y-2">
                  {acct.deals.map((deal) => (
                    <DealRow key={deal.opportunity_number} deal={deal} />
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatAssignmentDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return formatDisplayDate(value.slice(0, 10));
  } catch {
    return value;
  }
}

function EmployeeDetail({ emp }: { emp: Individual }) {
  const periods: { label: string; data?: PeriodMetrics }[] = [
    { label: "Q1", data: emp.q1 },
    { label: "Q2", data: emp.q2 },
    { label: "H1", data: emp.h1 },
    { label: "Q3" },
    { label: "Q4" },
    { label: "H2", data: emp.h2 },
    { label: "Annual", data: emp.annual },
  ];

  return (
    <div className="rounded-2xl border border-galaxy-navy/20 bg-galaxy-navy/5 p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={emp.name} size="xl" ring />
          <div>
            <h3 className="text-lg font-semibold text-galaxy-navy">{emp.name}</h3>
            <p className="text-sm text-galaxy-muted">
              Current RTM: {emp.division || "—"} · {emp.persona} · {emp.fy}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {emp.rank_division && emp.rank_division !== "-" && (
            <span className="rounded-lg bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700">
              Rank #{emp.rank_division}
            </span>
          )}
          {emp.pipeline.deal_count > 0 && (
            <span className="rounded-lg bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
              {emp.pipeline.account_count} closed accounts
            </span>
          )}
        </div>
      </div>

      <div className="mt-6">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Assignment history
        </p>
        <div className="overflow-hidden rounded-xl border border-galaxy-border bg-white">
          <table className="min-w-full text-sm">
            <thead className={ui.tableHead}>
              <tr>
                <th className="px-4 py-2 text-left">RTM</th>
                <th className="px-4 py-2 text-left">Start Date</th>
                <th className="px-4 py-2 text-left">End Date</th>
              </tr>
            </thead>
            <tbody>
              {(emp.assignments && emp.assignments.length
                ? emp.assignments
                : [{ division: emp.division || "—", start_date: null, end_date: null }]
              ).map((a, i) => (
                <tr key={`${a.division}-${a.start_date}-${i}`} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-galaxy-navy">{a.division}</td>
                  <td className="px-4 py-2 text-slate-600">{formatAssignmentDate(a.start_date)}</td>
                  <td className="px-4 py-2 text-slate-600">{a.end_date ? formatAssignmentDate(a.end_date) : "Ongoing"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {periods.map(({ label, data }) => (
          <div key={label} className={`${ui.cardInner} p-3`}>
            <p className="text-xs uppercase text-galaxy-muted">{label}</p>
            {data ? (
              <>
                <p className="mt-1 font-mono text-lg font-semibold text-galaxy-navy">{formatCr(data.actuals)}</p>
                {data.quota != null ? (
                  <p className="text-xs text-galaxy-muted">/ {formatCr(data.quota)}</p>
                ) : (
                  <div className="mt-1 mb-1 inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                    Quota not available
                  </div>
                )}
                <p className={`mt-1 font-mono text-sm ${attainmentColor(data.attainment_pct)}`}>
                  {formatPct(data.attainment_pct)}
                </p>
              </>
            ) : (
              <div className="mt-3">
                <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  No data yet
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      {(emp.deals.total || emp.deals.led_by_count || emp.deals.contributed_count) && (
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          {emp.deals.total != null && (
            <div className={`${ui.cardInner} p-3`}>
              <p className="text-xs text-galaxy-muted">Total Deals</p>
              <p className="font-mono text-xl text-galaxy-navy">{emp.deals.total}</p>
            </div>
          )}
          {emp.deals.led_by_count != null && (
            <div className={`${ui.cardInner} p-3`}>
              <p className="text-xs text-galaxy-muted">Led-By Deals</p>
              <p className="font-mono text-xl text-galaxy-navy">{emp.deals.led_by_count}</p>
              <p className="text-xs text-galaxy-muted">{formatCr(emp.deals.led_by_rev)}</p>
            </div>
          )}
          {emp.deals.contributed_count != null && (
            <div className={`${ui.cardInner} p-3`}>
              <p className="text-xs text-galaxy-muted">Contributed Deals</p>
              <p className="font-mono text-xl text-galaxy-navy">{emp.deals.contributed_count}</p>
              <p className="text-xs text-galaxy-muted">{formatCr(emp.deals.contributed_rev)}</p>
            </div>
          )}
        </div>
      )}

      <ClosedAccountsSection pipeline={emp.pipeline} />
    </div>
  );
}

interface DivisionGroup {
  division: string;
  employees: Individual[];
  periodQuota: number;
  periodActuals: number;
  periodAttainment: number;
  pipelineDeals: number;
  pipelineAccounts: number;
}

const RTM_DIVISIONS = new Set(["S1", "S2", "CB", "GB", "South"]);
const EMPLOYEE_DIVISIONS = new Set(["S1", "S2", "CB", "GB", "South", "GeoX", "Geo X"]);
const HIDDEN_EMPLOYEE_PERSONAS = new Set(["TL", "AVP", "BU Head", "BU Head / TL", "Topline", "Bottomline", "Other"]);

const RTM_ORDER = ["S1", "S2", "CB", "GB", "South", "GeoX", "Geo X"];
const sortDivisions = (a: string | null | undefined, b: string | null | undefined) => {
  const strA = a || "";
  const strB = b || "";
  const idxA = RTM_ORDER.indexOf(strA);
  const idxB = RTM_ORDER.indexOf(strB);
  if (idxA !== -1 && idxB !== -1) return idxA - idxB;
  if (idxA !== -1) return -1;
  if (idxB !== -1) return 1;
  return strA.localeCompare(strB);
};

function periodData(emp: Individual, period: PeriodKey): PeriodMetrics {
  return emp[period];
}

function periodLabel(period: PeriodKey): string {
  const labels: Record<PeriodKey, string> = {
    q1: "Q1",
    q2: "Q2",
    h1: "H1",
    h2: "H2",
    annual: "Annual",
  };
  return labels[period];
}

export function EmployeesView({ data, drill, onDrill }: EmployeesViewProps) {
  const { period, setPeriod } = useDashboard();
  const [search, setSearch] = useState("");
  const [divisionFilter, setDivisionFilter] = useState(drill.division ?? "");
  const [personaFilter, setPersonaFilter] = useState(drill.persona ?? "");
  const [hasDealsOnly, setHasDealsOnly] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const selected = drill.employee;
  const selectedEmp = selected ? data.individuals.find((e) => e.name === selected) : null;

  const divisions = useMemo(
    () =>
      [
        ...new Set(
          data.individuals
            .map((e) => e.division)
            .filter((d) => d && (EMPLOYEE_DIVISIONS.has(d) || RTM_DIVISIONS.has(d)))
        ),
      ].sort(sortDivisions) as string[],
    [data]
  );
  const personas = useMemo(() => [...new Set(data.individuals.map((e) => e.persona))].sort(), [data]);

  const filtered = useMemo(() => {
    return data.individuals.filter((e) => {
      if (["Total", "Total Opportunity"].includes(e.name)) return false;
      if (/sanjeev\s+kohli/i.test(e.name)) return false;
      if (HIDDEN_EMPLOYEE_PERSONAS.has(e.persona)) return false;
      const isHrushikesh = /hrushikesh/i.test(e.name);
      if (!e.division || (!EMPLOYEE_DIVISIONS.has(e.division) && !isHrushikesh)) return false;
      const q = search.toLowerCase();
      if (q) {
        const nameMatch = e.name.toLowerCase().includes(q);
        const accountMatch = e.pipeline.closed_accounts.some((a) => a.account.toLowerCase().includes(q));
        if (!nameMatch && !accountMatch) return false;
      }
      if (divisionFilter && e.division !== divisionFilter) return false;
      if (personaFilter && e.persona !== personaFilter) return false;
      if (hasDealsOnly && e.pipeline.deal_count === 0) return false;
      return true;
    });
  }, [data.individuals, search, divisionFilter, personaFilter, hasDealsOnly]);

  const groupedByDivision = useMemo((): DivisionGroup[] => {
    const map = new Map<string, Individual[]>();
    for (const emp of filtered) {
      const div = emp.division ?? "Unknown";
      if (!map.has(div)) map.set(div, []);
      map.get(div)!.push(emp);
    }

    return [...map.entries()]
      .map(([division, employees]) => {
        const sumEmployees = employees.filter(e => {
          if (e.persona !== 'IC') return false;
          if (division === 'S1' && /ishwari kadam/i.test(e.name)) return false;
          return true;
        });

        let periodQuota = sumEmployees.reduce((s, e) => s + (e[period].quota ?? 0), 0);
        let periodActuals = sumEmployees.reduce((s, e) => s + (e[period].actuals ?? 0), 0);

        if (division === 'GeoX') {
          const hbMax = employees
            .filter((e) => /hrushikesh bagade/i.test(e.name))
            .sort((a, b) => (b[period].actuals ?? 0) - (a[period].actuals ?? 0))[0];
          periodActuals = hbMax ? (hbMax[period].actuals ?? 0) : 0;
          periodQuota = 0;
        }
        return {
          division,
          // Sort employees by selected period's actuals descending
          employees: employees.sort((a, b) => (b[period].actuals ?? 0) - (a[period].actuals ?? 0)),
          periodQuota,
          periodActuals,
          periodAttainment: periodQuota ? (periodActuals / periodQuota) * 100 : 0,
          pipelineDeals: employees.reduce((s, e) => s + e.pipeline.deal_count, 0),
          pipelineAccounts: employees.reduce((s, e) => s + e.pipeline.account_count, 0),
        };
      })
      .sort((a, b) => sortDivisions(a.division, b.division));
  }, [filtered, period]);

  const toggleDivision = (div: string) => {
    setCollapsed((prev) => ({ ...prev, [div]: !prev[div] }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className={ui.pageTitle}>Employees</h2>
        <p className={ui.pageSub}>
          Grouped by RTM division · period selector drives actuals column · closed-won accounts from pipeline
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
          <span className="font-semibold text-slate-600">CRM indicators:</span>
          <span><span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> A Booked</span>
          <span><span className="inline-block h-2 w-2 rounded-full bg-sky-500" /> B Billed</span>
          <span><span className="inline-block h-2 w-2 rounded-full bg-violet-500" /> C Received</span>
          <span className="text-slate-400">· Grey = pending CRM update</span>
        </div>
      </div>

      {selectedEmp && <EmployeeDetail emp={selectedEmp} />}

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name or account..."
        filters={[
          {
            key: "division",
            label: "Division",
            value: divisionFilter,
            onChange: setDivisionFilter,
            options: [{ label: "All Divisions", value: "" }, ...divisions.map((d) => ({ label: d, value: d }))],
          },
          {
            key: "persona",
            label: "Persona",
            value: personaFilter,
            onChange: setPersonaFilter,
            options: [{ label: "All Personas", value: "" }, ...personas.map((p) => ({ label: p, value: p }))],
          },
          {
            key: "deals",
            label: "IC Actuals Including Others",
            value: hasDealsOnly ? "yes" : "",
            onChange: (v) => setHasDealsOnly(v === "yes"),
            options: [
              { label: "All Employees", value: "" },
              { label: "With Closed Deals", value: "yes" },
            ],
          },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Period</span>
        {(["q1", "q2", "h1", "h2", "annual"] as PeriodKey[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              period === p
                ? "bg-galaxy-navy text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {periodLabel(p)}
          </button>
        ))}
      </div>

      <p className="text-sm text-galaxy-muted">
        Showing {filtered.length} employees across {groupedByDivision.length} division
        {groupedByDivision.length !== 1 ? "s" : ""}
        {data.pipeline && (
          <span className="ml-2 text-galaxy-blue">
            · IC Actuals Including Others: {data.pipeline.total_deals} deals · {formatCr(data.pipeline.total_revenue_cr)}
          </span>
        )}
      </p>

      <div className="space-y-4">
        {groupedByDivision.map((group) => {
          const isCollapsed = collapsed[group.division] ?? false;

          return (
            <div key={group.division} className={ui.tableWrap}>
              <button
                onClick={() => toggleDivision(group.division)}
                className="flex w-full items-center gap-4 border-b border-galaxy-border bg-galaxy-surface/50 px-5 py-4 text-left transition hover:bg-galaxy-surface"
              >
                {isCollapsed ? (
                  <ChevronRight className="h-5 w-5 shrink-0 text-galaxy-navy" />
                ) : (
                  <ChevronDown className="h-5 w-5 shrink-0 text-galaxy-navy" />
                )}
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-galaxy-navy/10">
                    <Users className="h-4 w-4 text-galaxy-navy" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-galaxy-navy">{group.division}</h3>
                    <p className="text-xs text-galaxy-muted">
                      {group.employees.length} employees
                      {group.pipelineDeals > 0 && (
                        <span className="ml-2 text-emerald-600">
                          · {group.pipelineAccounts} accounts · {group.pipelineDeals} closed deals
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="hidden text-right sm:block">
                  <p className="font-mono text-sm font-medium text-galaxy-navy">{formatCr(group.periodActuals)}</p>
                  {group.periodQuota > 0
                    ? <p className="text-xs text-galaxy-muted">of {formatCr(group.periodQuota)}</p>
                    : <p className="text-xs text-galaxy-muted">{periodLabel(period)} quota n/a</p>
                  }
                </div>
                <div className="w-28">
                  <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                    <div
                      className={`h-full rounded-full ${attainmentBg(group.periodQuota > 0 ? group.periodAttainment : null)}`}
                      style={{ width: `${Math.min(group.periodAttainment, 100)}%` }}
                    />
                  </div>
                  <p className={`mt-1 text-right font-mono text-xs ${attainmentColor(group.periodQuota > 0 ? group.periodAttainment : null)}`}>
                    {group.periodQuota > 0 ? formatPct(group.periodAttainment) : "—"}
                  </p>
                </div>
              </button>

              {!isCollapsed && (
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className={ui.tableHead}>
                      <th className="px-4 py-3">Employee</th>
                      <th className="px-4 py-3">Persona</th>
                      <th className="px-4 py-3">Closed Accounts</th>
                      <th className="px-4 py-3 text-right">{periodLabel(period)} Actuals</th>
                      <th className="px-4 py-3 text-right">{periodLabel(period)} Quota</th>
                      <th className="px-4 py-3 text-right">{periodLabel(period)} Att%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.employees.map((emp) => {
                      const pd = periodData(emp, period);
                      const att = pd.attainment_pct ?? 0;
                      const isSelected = emp.name === selected;

                      return (
                        <tr
                          key={emp.name}
                          onClick={() => onDrill({ employee: emp.name })}
                          className={`${ui.tableRow} ${isSelected ? ui.tableRowSelected : ""}`}
                        >
                          <td className="px-4 py-3 font-medium text-galaxy-navy">
                            <span className="inline-flex flex-wrap items-center gap-2.5">
                              <Avatar name={emp.name} size="sm" />
                              <span>{emp.name}</span>
                              {(emp.reference_only && pd.quota && pd.quota > 0) && (
                                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
                                  Reference only
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={ui.badge}>{emp.persona}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {emp.pipeline?.closed_accounts?.length > 0 ? (
                              <div className="flex flex-col items-center justify-center">
                                <span className="font-medium text-galaxy-navy text-xs">
                                  {emp.pipeline.closed_accounts[0].account} &times;{emp.pipeline.closed_accounts[0].deal_count}
                                </span>
                                {emp.pipeline.closed_accounts.length > 1 && (
                                  <span className="mt-0.5 text-[10px] text-galaxy-muted">
                                    +{emp.pipeline.closed_accounts.length - 1} more account{emp.pipeline.closed_accounts.length > 2 ? "s" : ""}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-galaxy-muted">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-medium text-galaxy-navy">
                            {formatCr(pd.actuals)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-galaxy-muted">
                            {pd.quota != null ? formatCr(pd.quota) : <span className="text-xs text-galaxy-muted">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {pd.quota != null ? (
                              <div className="flex items-center justify-end gap-2">
                                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-200">
                                  <div
                                    className={`h-full ${attainmentBg(att)}`}
                                    style={{ width: `${Math.min(att, 100)}%` }}
                                  />
                                </div>
                                <span className={`font-mono text-xs ${attainmentColor(att)}`}>{formatPct(att)}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-galaxy-muted">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}

        {groupedByDivision.length === 0 && (
          <div className={`${ui.card} p-8 text-center`}>
            <p className="text-galaxy-muted">No employees match your filters.</p>
          </div>
        )}
      </div>
    </div>
  );
}
