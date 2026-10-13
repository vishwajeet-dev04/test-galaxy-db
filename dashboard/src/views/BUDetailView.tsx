import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { PerformanceCard } from "../components/PerformanceCard";
import { FilterBar } from "../components/FilterBar";
import { DealStatusIndicators } from "../components/DealStatusIndicators";
import { LegendPill } from "../components/LegendPill";
import { useDashboard } from "../context/DashboardContext";
import type { DrillState, PeriodKey, PipelineDeal, QuotaData } from "../types";
import { CHART_COLORS, formatCr, formatInr, formatPct } from "../utils/format";
import { formatDisplayDate, getPeriodElapsedLabel } from "../utils/fiscal";
import {
  PERIOD_LABELS,
  RTM_DIVISION_ORDER,
  buTeamTotal,
  closeDateKey,
  dealCr,
  dealsInPeriod,
  isCountedOnCards,
  rtmQuarterBreakdown,
} from "../utils/deals";
import { ui } from "../theme";

const PAGE_SIZE = 25;
const PERIODS = Object.keys(PERIOD_LABELS) as PeriodKey[];

type DealSortKey = "value_desc" | "value_asc" | "date_desc" | "date_asc";

const DEAL_SORT_OPTIONS: { label: string; value: DealSortKey }[] = [
  { label: "Value: high to low", value: "value_desc" },
  { label: "Value: low to high", value: "value_asc" },
  { label: "Close date: newest", value: "date_desc" },
  { label: "Close date: oldest", value: "date_asc" },
];

interface BUDetailViewProps {
  data: QuotaData;
  bu: string;
  onBack: () => void;
  onDrill: (drill: Partial<DrillState>) => void;
}

const linkButton = `${ui.link} rounded text-left focus:outline-none focus:ring-4 focus:ring-galaxy-navy/10`;

function formatCloseDate(value: string | null | undefined): string {
  const key = closeDateKey(value);
  return key ? formatDisplayDate(key) : value || "—";
}

export function BUDetailView({ data, bu, onBack, onDrill }: BUDetailViewProps) {
  const { period, setPeriod } = useDashboard();
  const [search, setSearch] = useState("");
  const [rtmFilter, setRtmFilter] = useState("");
  const [dealSort, setDealSort] = useState<DealSortKey>("value_desc");
  const [page, setPage] = useState(0);
  const record = data.bu_level.find((b) => b.bu === bu);
  const allDeals = data.pipeline?.all_deals;
  const label = PERIOD_LABELS[period];

  // Same deals as the BU card: RTM teams plus their BU Heads.
  const buDeals = useMemo(
    () => dealsInPeriod(allDeals ?? [], period).filter((d) => d.bu === bu && isCountedOnCards(d)),
    [allDeals, period, bu]
  );

  // Deal count per RTM for the Total Deals chips. buDeals is already scoped by the API
  // (admin: everyone; employees: their own team), so non-admins only get their RTM here.
  const rtmChips = useMemo(
    () =>
      RTM_DIVISION_ORDER.map((division, i) => ({
        division,
        color: CHART_COLORS[i % CHART_COLORS.length],
        deals: buDeals.filter((d) => d.rtm_division === division).length,
      })).filter((chip) => chip.deals > 0),
    [buDeals]
  );

  // Full-year split per RTM; ignores the period buttons, like the old "RTM by Division" table.
  const distribution = useMemo(() => {
    const quotaRows = data.rtm_by_bu?.[bu] ?? [];
    const byDivision = rtmQuarterBreakdown(allDeals ?? [], bu);
    const rows = RTM_DIVISION_ORDER.filter(
      (div) => byDivision.has(div) || quotaRows.some((r) => (r.division ?? r.name) === div)
    ).map((division) => {
      const q = byDivision.get(division) ?? { division, q1: 0, q2: 0, q3: 0, q4: 0 };
      const quotaRow = quotaRows.find((r) => (r.division ?? r.name) === division);
      return {
        ...q,
        h1: q.q1 + q.q2,
        h2: q.q3 + q.q4,
        annual: q.q1 + q.q2 + q.q3 + q.q4,
        annualQuota: quotaRow?.annual?.quota ?? null,
      };
    });
    const sum = (key: "q1" | "q2" | "q3" | "q4" | "h1" | "h2" | "annual") => rows.reduce((s, r) => s + r[key], 0);
    const quotas = rows.map((r) => r.annualQuota).filter((v): v is number => v != null);
    return {
      rows,
      total: {
        q1: sum("q1"),
        q2: sum("q2"),
        q3: sum("q3"),
        q4: sum("q4"),
        h1: sum("h1"),
        h2: sum("h2"),
        annual: sum("annual"),
        annualQuota: quotas.length ? quotas.reduce((s, v) => s + v, 0) : null,
      },
    };
  }, [data.rtm_by_bu, bu, allDeals]);

  const filteredDeals = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = buDeals.filter((d) => {
      if (rtmFilter && d.rtm_division !== rtmFilter) return false;
      if (!q) return true;
      return [d.opportunity_name, d.opportunity_number, d.account, d.employee, d.brand, d.sub_category]
        .some((field) => (field ?? "").toLowerCase().includes(q));
    });
    return list.sort((a, b) => {
      switch (dealSort) {
        case "value_asc":
          return dealCr(a) - dealCr(b);
        case "date_desc":
          return closeDateKey(b.close_date).localeCompare(closeDateKey(a.close_date));
        case "date_asc":
          return closeDateKey(a.close_date).localeCompare(closeDateKey(b.close_date));
        default:
          return dealCr(b) - dealCr(a);
      }
    });
  }, [buDeals, search, rtmFilter, dealSort]);

  useEffect(() => {
    setPage(0);
  }, [search, rtmFilter, dealSort, period, bu]);

  const pageCount = Math.max(1, Math.ceil(filteredDeals.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageDeals = filteredDeals.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const filtersActive = !!search || !!rtmFilter;

  const clearFilters = () => {
    setSearch("");
    setRtmFilter("");
  };

  const backButton = (
    <button type="button" onClick={onBack} className={ui.btnGhost}>
      <ArrowLeft className="h-4 w-4" />
      All Business Units
    </button>
  );

  if (!record) {
    return (
      <div className="space-y-4">
        {backButton}
        <div className={`${ui.card} p-8 text-center`}>
          <p className="font-medium text-galaxy-navy">{bu} is not a Business Unit on this dashboard.</p>
          <p className="mt-1 text-sm text-galaxy-muted">Go back and pick one of the Business Unit cards.</p>
        </div>
      </div>
    );
  }

  if (!allDeals) {
    return (
      <div className="space-y-4">
        {backButton}
        <div className={`${ui.card} p-8 text-center`} role="alert">
          <p className="font-medium text-galaxy-primary">The deal list for {bu} could not be loaded.</p>
          <p className="mt-1 text-sm text-galaxy-muted">
            Refresh the page. If it stays empty, an admin should run Rebuild dashboard.
          </p>
        </div>
      </div>
    );
  }

  const total = buTeamTotal(record, period, allDeals);
  const teamValue = total.actuals;
  const teamAccounts = new Set(buDeals.map((d) => d.account || "Unknown")).size;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {backButton}
          <h2 className={`${ui.pageTitle} mt-2`}>
            {record.bu} · {record.service}
          </h2>
          <p className={ui.pageSub}>
            Closed Won deals by the RTM teams and their BU Heads that make up this Business Unit.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Period</span>
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            aria-pressed={period === p}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition focus:outline-none focus:ring-4 focus:ring-galaxy-navy/10 ${
              period === p ? "bg-galaxy-navy text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <PerformanceCard
          period={label}
          title={`${record.bu} Total Value`}
          actuals={teamValue > 0 ? teamValue : null}
          quota={total.quota ?? 0}
          attainmentPct={total.attainment_pct}
          periodElapsedLabel={getPeriodElapsedLabel(label)}
          quotaOnly={teamValue <= 0}
          showTargetOnNoData
          closedDeals={total.deals}
        />
        <div className={`${ui.card} flex h-full flex-col p-5`}>
          <p className="text-sm font-medium text-galaxy-text">{record.bu} Total Deals</p>
          <p className="mt-5 font-mono text-3xl font-bold leading-none tracking-tight text-galaxy-navy sm:text-4xl">
            {total.deals}
          </p>
          <p className="mt-1.5 text-sm text-galaxy-muted">
            {teamAccounts} account{teamAccounts !== 1 ? "s" : ""} · avg{" "}
            {formatCr(total.deals ? teamValue / total.deals : null)} per deal
          </p>
          <div className="mt-auto pt-4">
            {rtmChips.length === 0 ? (
              <p className="text-xs text-galaxy-muted">No deals in {label}</p>
            ) : (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Deals by RTM — click to filter the deals below">
                {rtmChips.map((chip) => (
                  <LegendPill
                    key={chip.division}
                    color={chip.color}
                    label={chip.division}
                    value={chip.deals}
                    active={rtmFilter === chip.division}
                    onClick={() => setRtmFilter((prev) => (prev === chip.division ? "" : chip.division))}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <section className={ui.tableWrap} aria-labelledby="bu-distribution-heading">
        <div className="border-b border-galaxy-border px-5 py-4">
          <h3 id="bu-distribution-heading" className="font-semibold text-galaxy-navy">
            {record.bu} — RTM by Division
          </h3>
          <p className="text-xs text-galaxy-muted">Revenue contribution breakdown · full year</p>
        </div>
        {distribution.rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-galaxy-muted">No RTM has {record.bu} deals or quota this year.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className={ui.tableHead}>
                  <th className="px-4 py-3">Division</th>
                  <th className="px-4 py-3 text-right">Q1 Actuals</th>
                  <th className="px-4 py-3 text-right">Q2 Actuals</th>
                  <th className="px-4 py-3 text-right">H1 Actuals</th>
                  <th className="px-4 py-3 text-right">Q3 Actuals</th>
                  <th className="px-4 py-3 text-right">Q4 Actuals</th>
                  <th className="px-4 py-3 text-right">H2 Actuals</th>
                  <th className="px-4 py-3 text-right">Annual Quota</th>
                  <th className="px-4 py-3 text-right">Annual Actuals</th>
                </tr>
              </thead>
              <tbody>
                {distribution.rows.map((r) => (
                  <tr key={r.division} className="border-b border-galaxy-border/60">
                    <td className="px-4 py-3 font-medium text-galaxy-navy">{r.division}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-galaxy-muted">{formatCr(r.q1)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-galaxy-muted">{formatCr(r.q2)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-semibold text-galaxy-navy">{formatCr(r.h1)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-galaxy-muted">{formatCr(r.q3)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-galaxy-muted">{formatCr(r.q4)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-semibold text-galaxy-navy">{formatCr(r.h2)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-galaxy-muted">{formatCr(r.annualQuota)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-semibold text-galaxy-navy">{formatCr(r.annual)}</td>
                  </tr>
                ))}
                <tr className="bg-slate-50/90 font-semibold">
                  <td className="px-4 py-3 text-galaxy-navy">Total</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-galaxy-navy">{formatCr(distribution.total.q1)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-galaxy-navy">{formatCr(distribution.total.q2)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-galaxy-navy">{formatCr(distribution.total.h1)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-galaxy-navy">{formatCr(distribution.total.q3)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-galaxy-navy">{formatCr(distribution.total.q4)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-galaxy-navy">{formatCr(distribution.total.h2)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-galaxy-navy">{formatCr(distribution.total.annualQuota)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-galaxy-navy">{formatCr(distribution.total.annual)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="bu-deals-heading">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 id="bu-deals-heading" className="font-semibold text-galaxy-navy">
              {record.bu} deals · {label}
            </h3>
            <p className="text-xs text-galaxy-muted">
              {filteredDeals.length} of {buDeals.length} deals
            </p>
          </div>
        </div>

        <FilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search opportunity, account, person or brand..."
          filters={[
            {
              key: "rtm",
              label: "RTM",
              value: rtmFilter,
              onChange: setRtmFilter,
              options: [
                { label: "All RTMs", value: "" },
                ...RTM_DIVISION_ORDER.map((d) => ({ label: d, value: d })),
              ],
            },
            {
              key: "sort",
              label: "Sort deals",
              value: dealSort,
              onChange: (v) => setDealSort(v as DealSortKey),
              options: DEAL_SORT_OPTIONS,
            },
          ]}
        />

        {filteredDeals.length === 0 ? (
          <div className={`${ui.card} p-8 text-center`}>
            <p className="text-sm text-galaxy-muted">
              {buDeals.length === 0
                ? `No closed ${record.bu} deals in ${label}.`
                : "No deals match these filters."}
            </p>
            {filtersActive && buDeals.length > 0 && (
              <button type="button" onClick={clearFilters} className={`${ui.btnGhost} mt-3`}>
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className={ui.tableWrap}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-sm">
                <thead>
                  <tr className={ui.tableHead}>
                    <th className="px-4 py-3">Close date</th>
                    <th className="px-4 py-3">Opportunity</th>
                    <th className="px-4 py-3">Account</th>
                    <th className="px-4 py-3">Led by</th>
                    <th className="px-4 py-3">RTM</th>
                    <th className="px-4 py-3">Brand</th>
                    <th className="px-4 py-3">Sub-category</th>
                    <th className="px-4 py-3 text-right">Topline</th>
                    <th className="px-4 py-3 text-right">Bottomline</th>
                    <th className="px-4 py-3 text-right">GP %</th>
                    <th className="px-4 py-3">CRM</th>
                  </tr>
                </thead>
                <tbody>
                  {pageDeals.map((d: PipelineDeal, i) => {
                    return (
                      <tr key={`${d.opportunity_number ?? "deal"}-${i}`} className="border-b border-galaxy-border/60">
                        <td className="whitespace-nowrap px-4 py-3 text-galaxy-muted">{formatCloseDate(d.close_date)}</td>
                        <td className="px-4 py-3">
                          {/* "Unknown" / "Other" match the fallbacks in build_accounts / build_brands. */}
                          <button
                            type="button"
                            onClick={() =>
                              onDrill({
                                view: "accounts",
                                account: d.account || "Unknown",
                                deal: d.opportunity_number || undefined,
                              })
                            }
                            className={linkButton}
                            title={`Open ${d.account || "this account"}`}
                          >
                            {d.opportunity_name || "Untitled opportunity"}
                          </button>
                          <p className="text-xs text-galaxy-muted">{d.opportunity_number}</p>
                        </td>
                        <td className="px-4 py-3 text-galaxy-text">{d.account || "—"}</td>
                        <td className="px-4 py-3 text-galaxy-text">{d.employee || "—"}</td>
                        <td className="px-4 py-3 text-galaxy-text">{d.rtm_division || "—"}</td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() =>
                              onDrill({
                                view: "brands",
                                brand: d.brand || "Other",
                                deal: d.opportunity_number || undefined,
                              })
                            }
                            className={linkButton}
                            title={`Open ${d.brand || "Other"}`}
                          >
                            {d.brand || "Other"}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-galaxy-muted">{d.sub_category || "—"}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-medium text-galaxy-navy">
                          {formatInr(d.topline_inr ?? d.amount_inr)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-emerald-700">{formatInr(d.bottomline_inr)}</td>
                        <td className="px-4 py-3 text-right font-mono text-galaxy-muted">{formatPct(d.gp_pct)}</td>
                        <td className="px-4 py-3">
                          {d.crm ? <DealStatusIndicators crm={d.crm} compact /> : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-2 border-t border-galaxy-border px-4 py-3 text-xs text-galaxy-muted sm:flex-row sm:items-center sm:justify-between">
              <span>
                {currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, filteredDeals.length)} of{" "}
                {filteredDeals.length} · page {currentPage + 1} of {pageCount}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage(currentPage - 1)}
                  disabled={currentPage === 0}
                  className={`${ui.btnGhost} flex-1 sm:flex-none`}
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage(currentPage + 1)}
                  disabled={currentPage >= pageCount - 1}
                  className={`${ui.btnGhost} flex-1 sm:flex-none`}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
