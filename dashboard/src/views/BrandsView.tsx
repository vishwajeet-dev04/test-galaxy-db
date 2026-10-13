import { useMemo, useState } from "react";
import {
  CircleDollarSign,
  Layers,
  TrendingUp,
  Users,
  ChevronDown,
  ChevronRight,
  Sparkles,
  PieChart,
  Tag,
  Building2,
} from "lucide-react";
import { FilterBar } from "../components/FilterBar";
import { KpiCard } from "../components/KpiCard";
import { SectionHeader } from "../components/SectionHeader";

import { DealRow } from "../components/DealRow";
import { BrandLogo } from "../components/BrandLogo";
import { ChartCard } from "../components/ChartCard";
import { DonutChart } from "../components/charts/DonutChart";
import { useDealHighlight } from "../hooks/useDealHighlight";
import type { BrandRecord, DrillState, QuotaData } from "../types";
import { formatCr, formatPct, formatInr, BU_COLORS } from "../utils/format";
import { ui } from "../theme";

interface BrandsViewProps {
  data: QuotaData;
  drill: DrillState;
  onDrill: (drill: Partial<DrillState>) => void;
}

type SortKey = "revenue" | "bottomline" | "deals" | "gp" | "quota_share" | "accounts";

function BrandDetail({
  brand,
  icQuota,
  highlightDeal,
  onSelectEmployee,
  onSelectAccount,
}: {
  brand: BrandRecord;
  icQuota: number;
  highlightDeal?: string;
  onSelectEmployee: (name: string) => void;
  onSelectAccount: (account: string) => void;
}) {
  const { containerRef, isHighlighted } = useDealHighlight(highlightDeal);
  const buShare = brand.by_bu.map((b) => ({ name: b.bu, value: b.revenue_cr }));

  return (
    <div className="space-y-6 animate-[fadeIn_0.35s_ease-out]">
      <div className={`${ui.card} relative overflow-hidden`}>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-galaxy-navy/[0.04] via-transparent to-galaxy-blue/[0.06]" />
        <div className="relative flex flex-col gap-6 p-6 sm:flex-row sm:items-start sm:p-8">
          <BrandLogo brand={brand.brand} size="xl" className="shadow-md" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-galaxy-primary">Brand</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-galaxy-navy sm:text-3xl">
              {brand.brand}
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {brand.primary_bu && <span className={ui.pill}>{brand.primary_bu}</span>}
              {brand.rtm_divisions.map((d) => (
                <span
                  key={d}
                  className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600"
                >
                  {d}
                </span>
              ))}
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                {brand.deal_count} deals
              </span>
              <span className="rounded-full bg-galaxy-blue/10 px-2.5 py-0.5 text-[11px] font-semibold text-galaxy-blue">
                {brand.account_count} accounts
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:min-w-[280px]">
            <div className={`${ui.cardInner} p-3`}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Topline</p>
              <p className="mt-1 font-mono text-lg font-bold text-galaxy-navy">{formatCr(brand.revenue_cr)}</p>
            </div>
            <div className={`${ui.cardInner} p-3`}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600/80">Bottomline</p>
              <p className="mt-1 font-mono text-lg font-bold text-emerald-700">{formatCr(brand.bottomline_cr)}</p>
            </div>
            <div className={`${ui.cardInner} p-3`}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">vs H1 Quota</p>
              <p className="mt-1 font-mono text-lg font-bold text-galaxy-navy">
                {formatPct(brand.pct_of_ic_h1_quota)}
              </p>
              <p className="text-[10px] text-slate-400">of {formatCr(icQuota)}</p>
            </div>
            <div className={`${ui.cardInner} p-3`}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">GP</p>
              <p className="mt-1 font-mono text-lg font-bold text-galaxy-navy">{formatPct(brand.gp_pct)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className={`${ui.card} p-4`}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">IC Actuals Including Others share</p>
          <p className="mt-1 font-mono text-xl font-semibold text-galaxy-navy">
            {formatPct(brand.pct_of_pipeline_topline)}
          </p>
          <p className="text-xs text-slate-500">of closed topline</p>
        </div>
        <div className={`${ui.card} p-4`}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">BL share</p>
          <p className="mt-1 font-mono text-xl font-semibold text-emerald-700">
            {formatPct(brand.pct_of_pipeline_bottomline)}
          </p>
          <p className="text-xs text-slate-500">of closed bottomline</p>
        </div>
        <div className={`${ui.card} p-4`}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Quota credit</p>
          <p className="mt-1 font-mono text-xl font-semibold text-amber-700">{formatCr(brand.quota_credit_cr)}</p>
          <p className="text-xs text-slate-500">multiplier-adjusted</p>
        </div>
        <div className={`${ui.card} p-4`}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sellers</p>
          <p className="mt-1 font-mono text-xl font-semibold text-galaxy-navy">{brand.employee_count}</p>
          <p className="text-xs text-slate-500">across {brand.account_count} customers</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <ChartCard title="Value by BU" subtitle="Closed topline mix for this brand">
            {buShare.length > 0 ? (
              <DonutChart
                data={buShare}
              />
            ) : (
              <p className="py-8 text-center text-sm text-slate-400">No BU split</p>
            )}
          </ChartCard>
        </div>
        <div className={`${ui.card} p-5 lg:col-span-3`}>
          <SectionHeader label="BU breakdown" />
          <div className="mt-3 space-y-2">
            {brand.by_bu.map((b) => {
              const share = brand.revenue_cr ? (b.revenue_cr / brand.revenue_cr) * 100 : 0;
              return (
                <div
                  key={b.bu}
                  className="rounded-xl bg-slate-50/80 px-3 py-2.5 ring-1 ring-inset ring-galaxy-border/40"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: BU_COLORS[b.bu] ?? "#64748b" }}
                      />
                      <span className="text-sm font-semibold text-galaxy-navy">{b.bu}</span>
                      <span className="text-xs text-slate-400">{b.deal_count} deals</span>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm font-semibold text-galaxy-navy">{formatCr(b.revenue_cr)}</p>
                      <p className="font-mono text-[11px] text-emerald-700">{formatCr(b.bottomline_cr)} BL</p>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(share, 100)}%`, background: BU_COLORS[b.bu] ?? "#64748b" }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {brand.top_accounts.length > 0 && (
        <div className={`${ui.card} p-5`}>
          <SectionHeader label="Top accounts" description="Highest closed topline for this brand" />
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {brand.top_accounts.map((a) => (
              <button
                key={a.account}
                type="button"
                onClick={() => onSelectAccount(a.account)}
                className="flex items-center justify-between gap-3 rounded-xl border border-galaxy-border/60 bg-white px-3 py-2.5 text-left transition hover:border-galaxy-navy/25 hover:bg-slate-50"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="truncate text-sm font-medium text-galaxy-navy">{a.account}</span>
                </span>
                <span className="shrink-0 font-mono text-sm font-semibold text-galaxy-navy">
                  {formatCr(a.revenue_cr)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={`${ui.card} p-5`}>
        <SectionHeader label="Sellers on brand" />
        <div className="mt-3 flex flex-wrap gap-2">
          {brand.employees.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => onSelectEmployee(name)}
              className="rounded-full border border-galaxy-border bg-white px-3 py-1.5 text-sm font-medium text-galaxy-navy transition hover:border-galaxy-navy/30 hover:bg-galaxy-navy/5"
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <div className={`${ui.card} p-5`}>
        <SectionHeader label="Closed deals" description={`${brand.deals.length} opportunities`} />
        <div ref={containerRef} className="mt-4 space-y-2">
          {brand.deals.map((deal, i) => (
            <DealRow
              key={`${deal.opportunity_number ?? i}-${i}`}
              deal={deal}
              showBottomline
              highlighted={isHighlighted(deal.opportunity_number)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function BrandsView({ data, drill, onDrill }: BrandsViewProps) {
  const brands = data.brands ?? [];
  const [search, setSearch] = useState("");
  const [buFilter, setBuFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [expanded, setExpanded] = useState<string | null>(null);



  const selected = useMemo(
    () => (drill.brand ? brands.find((b) => b.brand === drill.brand) : undefined),
    [brands, drill.brand],
  );

  const icQuota = data.kpis.ic_h1_quota_cr;
  const pipelineTl = data.pipeline?.total_revenue_cr ?? 0;
  const pipelineBl = data.pipeline?.total_bottomline_cr ?? 0;

  const bus = useMemo(() => {
    const s = new Set<string>();
    brands.forEach((b) => b.by_bu.forEach((x) => s.add(x.bu)));
    return [...s].sort();
  }, [brands]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = brands.filter((b) => {
      if (buFilter !== "all" && !b.by_bu.some((x) => x.bu === buFilter)) return false;
      if (!q) return true;
      return (
        b.brand.toLowerCase().includes(q) ||
        b.employees.some((e) => e.toLowerCase().includes(q)) ||
        b.top_accounts.some((a) => a.account.toLowerCase().includes(q))
      );
    });
    list = [...list].sort((a, b) => {
      switch (sortKey) {
        case "bottomline":
          return b.bottomline_inr - a.bottomline_inr;
        case "deals":
          return b.deal_count - a.deal_count;
        case "gp":
          return b.gp_pct - a.gp_pct;
        case "quota_share":
          return (b.pct_of_ic_h1_quota ?? 0) - (a.pct_of_ic_h1_quota ?? 0);
        case "accounts":
          return b.account_count - a.account_count;
        default:
          return b.revenue_inr - a.revenue_inr;
      }
    });
    return list;
  }, [brands, search, buFilter, sortKey]);

  const insights = useMemo(() => {
    const totalTl = data.kpis.header_pipeline_cr ?? brands.reduce((s, b) => s + b.revenue_cr, 0);
    const totalBl = brands.reduce((s, b) => s + b.bottomline_cr, 0);
    const totalDeals = brands.reduce((s, b) => s + b.deal_count, 0);
    const top5 = brands.slice(0, 5);
    const top5Share = totalTl ? (top5.reduce((s, b) => s + b.revenue_cr, 0) / totalTl) * 100 : 0;
    const avgGp = totalTl ? (totalBl / totalTl) * 100 : 0;
    const multiBu = brands.filter((b) => b.by_bu.length > 1).length;
    const named = brands.filter((b) => !/^others?$/i.test(b.brand));
    return { totalTl, totalBl, totalDeals, top5Share, avgGp, multiBu, top5, namedCount: named.length };
  }, [brands]);

  if (selected) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => onDrill({ view: "brands", brand: undefined })}
          className="text-sm font-medium text-galaxy-blue hover:text-galaxy-navy"
        >
          ← All brands
        </button>
        <BrandDetail
          brand={selected}
          icQuota={icQuota ?? 0}
          highlightDeal={drill.deal}
          onSelectEmployee={(name) => onDrill({ view: "employees", employee: name })}
          onSelectAccount={(account) => onDrill({ view: "accounts", account })}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className={ui.pageTitle}>Brands</h2>
        <p className={ui.pageSub}>
          Closed-won value by OEM / brand · BU mix · contribution to H1 quota
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Brands"
          value={String(brands.length)}
          sub={`${insights.namedCount} named · ${insights.totalDeals} deals`}
          icon={<Tag className="h-5 w-5" />}
          accent="border-l-galaxy-navy"
        />
        <KpiCard
          label="Brand Topline"
          value={formatCr(insights.totalTl)}
          sub={`${formatPct(pipelineTl ? (insights.totalTl / pipelineTl) * 100 : null)} of pipeline`}
          icon={<CircleDollarSign className="h-5 w-5" />}
          accent="border-l-galaxy-blue"
        />
        <KpiCard
          label="Brand Bottomline"
          value={formatCr(insights.totalBl)}
          sub={`Avg GP ${formatPct(insights.avgGp)}`}
          icon={<TrendingUp className="h-5 w-5" />}
          accent="border-l-emerald-500"
        />
        <KpiCard
          label="Top 5 Concentration"
          value={formatPct(insights.top5Share)}
          sub={`${insights.multiBu} multi-BU brands`}
          icon={<PieChart className="h-5 w-5" />}
          accent="border-l-galaxy-primary"
        />
      </div>

      <section>
        <SectionHeader
          label="Leading brands"
          description="Highest closed topline — logos via Logo.dev"
        />
        <div className="mt-4 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          {insights.top5.map((b, i) => (
            <button
              key={b.brand}
              type="button"
              onClick={() => onDrill({ view: "brands", brand: b.brand })}
              className={`${ui.card} ${ui.cardHover} group relative overflow-hidden p-5 text-left`}
            >
              <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-galaxy-navy/[0.04] transition group-hover:scale-125" />
              <div className="relative flex items-start justify-between gap-3">
                <BrandLogo brand={b.brand} size="lg" />
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-galaxy-navy/8 font-mono text-xs font-bold text-galaxy-navy">
                  {i + 1}
                </span>
              </div>
              <p className="relative mt-4 truncate text-sm font-semibold text-galaxy-navy group-hover:text-galaxy-blue">
                {b.brand}
              </p>
              <p className="relative mt-3 font-mono text-lg font-bold text-galaxy-navy">{formatCr(b.revenue_cr)}</p>
              <div className="relative mt-1 flex items-center justify-between text-[11px] text-slate-500">
                <span className="font-medium text-emerald-700">{formatCr(b.bottomline_cr)} BL</span>
                <span>{formatPct(b.pct_of_ic_h1_quota)} quota</span>
              </div>
              <div className="relative mt-3 h-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-galaxy-navy to-galaxy-blue"
                  style={{
                    width: `${Math.min(
                      ((b.pct_of_pipeline_topline ?? 0) /
                        Math.max(insights.top5[0]?.pct_of_pipeline_topline ?? 1, 0.01)) *
                        100,
                      100,
                    )}%`,
                  }}
                />
              </div>
            </button>
          ))}
        </div>
      </section>

      <div className={`${ui.card} flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between`}>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-galaxy-navy text-white shadow-sm">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-galaxy-navy">Brand contribution to quota</p>
            <p className="mt-0.5 max-w-2xl text-sm leading-relaxed text-slate-500">
              Brand topline as % of IC H1 quota ({formatCr(icQuota)}). IC Actuals Including Others closed{" "}
              {formatCr(pipelineTl)} topline / {formatCr(pipelineBl)} bottomline across {brands.length}{" "}
              brands.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-6 sm:text-right">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">#1 brand</p>
            <p className="font-mono text-sm font-bold text-galaxy-navy">
              {formatPct(insights.top5[0]?.pct_of_ic_h1_quota)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Top 5 vs quota</p>
            <p className="font-mono text-sm font-bold text-galaxy-navy">
              {formatPct(insights.top5.reduce((s, b) => s + (b.pct_of_ic_h1_quota ?? 0), 0))}
            </p>
          </div>
        </div>
      </div>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search brands, sellers, or accounts…"
        filters={[
          {
            key: "bu",
            label: "BU",
            value: buFilter,
            onChange: setBuFilter,
            options: [{ label: "All BUs", value: "all" }, ...bus.map((b) => ({ label: b, value: b }))],
          },
          {
            key: "sort",
            label: "Sort",
            value: sortKey,
            onChange: (v) => setSortKey(v as SortKey),
            options: [
              { label: "Sort: Topline", value: "revenue" },
              { label: "Sort: Bottomline", value: "bottomline" },
              { label: "Sort: Deals", value: "deals" },
              { label: "Sort: Accounts", value: "accounts" },
              { label: "Sort: GP %", value: "gp" },
              { label: "Sort: Quota share", value: "quota_share" },
            ],
          },
        ]}
      />

      <div className={ui.tableWrap}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className={ui.tableHead}>
              <tr>
                <th className="px-4 py-3 font-semibold">Brand</th>
                <th className="px-4 py-3 font-semibold">BU mix</th>
                <th className="px-4 py-3 text-right font-semibold">Topline</th>
                <th className="px-4 py-3 text-right font-semibold">Bottomline</th>
                <th className="px-4 py-3 text-right font-semibold">GP</th>
                <th className="px-4 py-3 text-right font-semibold">vs H1 Quota</th>
                <th className="px-4 py-3 text-right font-semibold">IC Actuals Including Others %</th>
                <th className="px-4 py-3 text-right font-semibold">Deals</th>
                <th className="px-4 py-3 text-right font-semibold">Accts</th>
                <th className="w-10 px-2 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => {
                const isOpen = expanded === b.brand;
                return (
                  <BrandTableRows
                    key={b.brand}
                    brand={b}
                    isOpen={isOpen}
                    onToggle={() => setExpanded(isOpen ? null : b.brand)}
                    onOpen={() => onDrill({ view: "brands", brand: b.brand })}
                    onSelectEmployee={(name) => onDrill({ view: "employees", employee: name })}
                  />
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-slate-400">
                    No brands match your filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function BrandTableRows({
  brand: b,
  isOpen,
  onToggle,
  onOpen,
  onSelectEmployee,
}: {
  brand: BrandRecord;
  isOpen: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onSelectEmployee: (name: string) => void;
}) {
  return (
    <>
      <tr className={`${ui.tableRow} ${isOpen ? ui.tableRowSelected : ""}`}>
        <td className="px-4 py-3">
          <button type="button" onClick={onOpen} className="flex max-w-[240px] items-center gap-3 text-left">
            <BrandLogo brand={b.brand} size="sm" />
            <span className="min-w-0">
              <span className="block truncate font-semibold text-galaxy-navy hover:text-galaxy-blue">
                {b.brand}
              </span>
              <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400">
                <Users className="h-3 w-3" />
                {b.employee_count} sellers · {b.rtm_divisions.join(", ") || "—"}
              </span>
            </span>
          </button>
        </td>
        <td className="px-4 py-3">
          <div className="flex flex-wrap gap-1">
            {b.by_bu.slice(0, 3).map((x) => (
              <span
                key={x.bu}
                className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-100"
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: BU_COLORS[x.bu] ?? "#94a3b8" }} />
                {x.bu}
              </span>
            ))}
            {b.by_bu.length > 3 && <span className="text-[10px] text-slate-400">+{b.by_bu.length - 3}</span>}
          </div>
        </td>
        <td className="px-4 py-3 text-right font-mono font-semibold text-galaxy-navy">{formatCr(b.revenue_cr)}</td>
        <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-700">
          {formatCr(b.bottomline_cr)}
        </td>
        <td className="px-4 py-3 text-right font-mono text-slate-600">{formatPct(b.gp_pct)}</td>
        <td className="px-4 py-3 text-right font-mono font-semibold text-galaxy-navy">
          {formatPct(b.pct_of_ic_h1_quota)}
        </td>
        <td className="px-4 py-3 text-right font-mono text-slate-600">{formatPct(b.pct_of_pipeline_topline)}</td>
        <td className="px-4 py-3 text-right font-mono text-slate-600">{b.deal_count}</td>
        <td className="px-4 py-3 text-right font-mono text-slate-600">{b.account_count}</td>
        <td className="px-2 py-3">
          <button
            type="button"
            onClick={onToggle}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-galaxy-navy"
            aria-label={isOpen ? "Collapse" : "Expand deals"}
          >
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </td>
      </tr>
      {isOpen && (
        <tr className="bg-slate-50/60">
          <td colSpan={10} className="px-4 py-4">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <Layers className="h-3.5 w-3.5" />
              <span>Quick deals · {formatInr(b.revenue_inr)} topline</span>
              <span className="text-slate-300">·</span>
              {b.employees.slice(0, 4).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onSelectEmployee(n)}
                  className="font-medium text-galaxy-blue hover:underline"
                >
                  {n}
                </button>
              ))}
              {b.employees.length > 4 && <span>+{b.employees.length - 4} more</span>}
              <button type="button" onClick={onOpen} className="ml-auto font-semibold text-galaxy-navy hover:underline">
                Full brand →
              </button>
            </div>
            <div className="grid gap-2 lg:grid-cols-2">
              {b.deals.slice(0, 4).map((deal, i) => (
                <DealRow key={`${deal.opportunity_number ?? i}`} deal={deal} showBottomline />
              ))}
            </div>
            {b.deals.length > 4 && (
              <p className="mt-2 text-center text-xs text-slate-400">
                +{b.deals.length - 4} more deals on full brand view
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
