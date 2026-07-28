import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Users, Wallet, Target, Crown, Sparkles, TrendingUp } from "lucide-react";
import { StatusFlag } from "../components/StatusFlag";
import { DealStatusIndicators } from "../components/DealStatusIndicators";

import { Avatar } from "../components/Avatar";
import type { QuotaData, LeaderDashboardRecord } from "../types";
import { formatCr, formatPct, attainmentColor } from "../utils/format";
import { getAvatarUrl } from "../utils/avatars";
import { ui } from "../theme";

const DIVISION_GRADIENT: Record<string, string> = {
  S1: "from-galaxy-navy to-indigo-700",
  S2: "from-sky-600 to-blue-800",
  CB: "from-violet-600 to-purple-800",
  GB: "from-emerald-600 to-teal-800",
  South: "from-amber-500 to-orange-600",
  DCG: "from-slate-700 to-galaxy-navy",
  GeoX: "from-orange-500 to-amber-700",
  Cloud: "from-cyan-500 to-sky-700",
  CSN: "from-galaxy-primary to-rose-700",
};

interface LeadersViewProps {
  data: QuotaData;
}

export function LeadersView({ data }: LeadersViewProps) {
  const leaders = data.leaders_dashboard ?? [];
  const [selected, setSelected] = useState<string | null>(leaders[0]?.name ?? null);

  const active = useMemo(
    () => leaders.find((l) => l.name === selected) ?? leaders[0],
    [leaders, selected]
  );

  const totals = useMemo(() => {
    return leaders.reduce(
      (acc, l) => ({
        h1Actuals: acc.h1Actuals + (l.h1.actuals || 0),
        bottomline: acc.bottomline + (l.pipeline.bottomline_cr || 0),
        topline: acc.topline + (l.pipeline.topline_cr || 0),
        deals: acc.deals + l.pipeline.deal_count,
      }),
      { h1Actuals: 0, bottomline: 0, topline: 0, deals: 0 }
    );
  }, [leaders]);

  if (!leaders.length) {
    return (
      <div className={`${ui.card} p-12 text-center`}>
        <p className="text-galaxy-muted">No leader data available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-galaxy-navy via-indigo-900 to-slate-900 p-6 text-white shadow-xl sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/5 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 left-1/3 h-48 w-48 rounded-full bg-galaxy-primary/20 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-indigo-200">
              <Crown className="h-4 w-4" />
              <span className="text-xs font-bold uppercase tracking-[0.2em]">Leadership</span>
            </div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
              Leaders Dashboard – Bottomline
            </h2>
            <p className="mt-2 max-w-xl text-sm text-indigo-100/90">
              Cumulative team bottomline, quota & attainment across {leaders.length} business leaders.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <HeroStat label="Leaders" value={String(leaders.length)} />
            <HeroStat label="H1 Actuals" value={formatCr(data.kpis.header_pipeline_cr ?? totals.h1Actuals)} />
            <HeroStat label="Topline" value={formatCr(totals.topline)} />
            <HeroStat label="Team Bottomline" value={formatCr(totals.bottomline)} accent />
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {leaders.map((leader) => (
          <LeaderCard
            key={leader.name}
            leader={leader}
            isActive={active?.name === leader.name}
            onSelect={() => setSelected(leader.name)}
          />
        ))}
      </div>

      {active && <LeaderDetail leader={active} />}
    </div>
  );
}

function HeroStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/10 backdrop-blur-sm">
      <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-200">{label}</p>
      <p className={`mt-1 font-mono text-lg font-bold ${accent ? "text-emerald-300" : ""}`}>{value}</p>
    </div>
  );
}

function LeaderCard({
  leader,
  isActive,
  onSelect,
}: {
  leader: LeaderDashboardRecord;
  isActive: boolean;
  onSelect: () => void;
}) {
  const grad = DIVISION_GRADIENT[leader.division] ?? DIVISION_GRADIENT.S1;
  const hasPhoto = Boolean(getAvatarUrl(leader.name));

  return (
    <button
      onClick={onSelect}
      className={`group relative overflow-hidden rounded-2xl border text-left transition-all duration-200 ${
        isActive
          ? "border-galaxy-navy/30 shadow-lg ring-2 ring-galaxy-navy/20"
          : "border-galaxy-border/70 shadow-sm hover:border-galaxy-navy/20 hover:shadow-md"
      }`}
    >
      <div className={`bg-gradient-to-br ${grad} px-5 py-4 text-white`}>
        <div className="flex items-start justify-between gap-2">
          {hasPhoto ? (
            <Avatar name={leader.name} size="lg" ring />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 text-sm font-bold ring-1 ring-white/30">
              {leader.initial}
            </div>
          )}
          <StatusFlag status={leader.status} />
        </div>
        <h3 className="mt-3 font-semibold leading-tight">{leader.name}</h3>
        <p className="mt-0.5 text-xs text-white/75">{leader.dept}</p>
      </div>
      <div className="bg-white px-5 py-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Topline</p>
            <p className="font-mono text-lg font-bold text-slate-700">
              {formatCr(leader.pipeline.topline_cr)}
            </p>
          </div>
          <div className="flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600/80">Bottomline</p>
            <p className="font-mono text-lg font-bold text-emerald-700">
              {formatCr(leader.pipeline.bottomline_cr)}
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
          <span className="flex items-center gap-1 text-slate-500">
            <Users className="h-3.5 w-3.5" /> {leader.team_size} team
          </span>
          <span className="font-mono text-slate-500">GP {formatPct(leader.pipeline.gp_pct)}</span>
        </div>
      </div>
    </button>
  );
}

function LeaderDetail({ leader }: { leader: LeaderDashboardRecord }) {
  const grad = DIVISION_GRADIENT[leader.division] ?? DIVISION_GRADIENT.S1;

  return (
    <div className="space-y-6">
      <div className={`overflow-hidden rounded-2xl bg-gradient-to-r ${grad} p-6 text-white shadow-lg`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar name={leader.name} size="xl" ring />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-white/70">{leader.role}</p>
              <h3 className="text-2xl font-bold">{leader.name}</h3>
              <p className="text-sm text-white/80">
                {leader.dept} · Reports to {leader.reports_to}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-medium ring-1 ring-white/20">
            <Sparkles className="h-4 w-4" />
            {leader.team_size} cumulative team members
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile
          icon={<Target className="h-5 w-5" />}
          label="H1 Quota"
          value={formatCr(leader.h1.quota)}
          sub={`Q1 ${formatCr(leader.q1.actuals)} / ${formatCr(leader.q1.quota)}`}
          color="navy"
        />
        <MetricTile
          icon={<TrendingUp className="h-5 w-5" />}
          label="H1 Actuals"
          value={formatCr(leader.h1.actuals)}
          sub={formatPct(leader.h1.attainment_pct) + " attainment"}
          color="blue"
          trend={leader.h1.attainment_pct}
        />
        <MetricTile
          icon={<TrendingUp className="h-5 w-5" />}
          label="Topline"
          value={formatCr(leader.pipeline.topline_cr)}
          sub={`${leader.pipeline.deal_count} deals`}
          color="slate"
        />
        <MetricTile
          icon={<Wallet className="h-5 w-5" />}
          label="Bottomline"
          value={formatCr(leader.pipeline.bottomline_cr)}
          sub={`GP ${formatPct(leader.pipeline.gp_pct)}`}
          color="emerald"
          highlight
        />
      </div>

      <div className={ui.card}>
        <div className="border-b border-galaxy-border/50 px-6 py-4">
          <h4 className="font-semibold text-galaxy-navy">Top Team Deals</h4>
          <p className="text-xs text-slate-500">Bottomline visibility for leaders</p>
        </div>
        <div className="max-h-[420px] space-y-2 overflow-y-auto px-4 py-4 sm:grid sm:grid-cols-2 sm:gap-3 sm:space-y-0">
          {leader.top_deals.map((deal) => (
            <div
              key={deal.opportunity_number}
              className="rounded-xl border border-galaxy-border/60 bg-slate-50/50 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-galaxy-navy">{deal.account}</p>
                  <p className="truncate text-xs text-slate-500">
                    {deal.employee} · {deal.bu}
                  </p>
                </div>
                <DealStatusIndicators crm={deal.crm} compact />
              </div>
              <div className="mt-2 flex gap-4">
                <div>
                  <p className="text-[9px] font-bold uppercase text-emerald-600/70">Bottomline</p>
                  <p className="font-mono text-sm font-semibold text-emerald-700">
                    {formatCr(deal.bottomline_cr)}
                  </p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-[9px] text-slate-400">GP</p>
                  <p className={`font-mono text-xs font-semibold ${attainmentColor(deal.gp_pct)}`}>
                    {formatPct(deal.gp_pct)}
                  </p>
                </div>
              </div>
            </div>
          ))}
          {leader.top_deals.length === 0 && (
            <p className="col-span-2 py-6 text-center text-sm text-slate-400">No pipeline deals for this team.</p>
          )}
        </div>
      </div>

      <div className={ui.tableWrap}>
        <div className="border-b border-galaxy-border/50 px-6 py-4">
          <h4 className="font-semibold text-galaxy-navy">Team Roster</h4>
          <p className="text-xs text-slate-500">Cumulative quota & bottomline metrics</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className={ui.tableHead}>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Persona</th>
                <th className="px-4 py-3 text-right">H1 Actuals</th>
                <th className="px-4 py-3 text-right">H1 Quota</th>
                <th className="px-4 py-3 text-right">Attainment</th>
                <th className="px-4 py-3 text-right text-slate-700">Topline</th>
                <th className="px-4 py-3 text-right text-emerald-700">Bottomline</th>
                <th className="px-4 py-3 text-right">Deals</th>
              </tr>
            </thead>
            <tbody>
              {leader.team_members.map((m) => {
                const att = m.h1_attainment_pct ?? 0;
                return (
                  <tr key={m.name} className="border-b border-galaxy-border/40 hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-medium text-galaxy-navy">
                      <span className="inline-flex items-center gap-2.5">
                        <Avatar name={m.name} size="sm" />
                        {m.name}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={ui.badge}>{m.persona}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{formatCr(m.h1_actuals)}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-500">{formatCr(m.h1_quota)}</td>
                    <td className={`px-4 py-3 text-right font-mono font-medium ${attainmentColor(att)}`}>
                      {formatPct(att)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-slate-700">
                      {formatCr(m.pipeline_topline_cr)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-emerald-700">
                      {formatCr(m.pipeline_bottomline_cr)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-500">{m.deal_count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MetricTile({
  icon,
  label,
  value,
  sub,
  color,
  trend,
  highlight,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub: string;
  color: string;
  trend?: number;
  highlight?: boolean;
}) {
  const iconBg = {
    navy: "bg-galaxy-navy/10 text-galaxy-navy",
    blue: "bg-sky-100 text-sky-700",
    slate: "bg-slate-100 text-slate-600",
    emerald: "bg-emerald-100 text-emerald-700",
  }[color];

  return (
    <div
      className={`rounded-2xl border p-5 ${
        highlight ? "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white" : "border-galaxy-border/70 bg-white"
      } shadow-sm`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconBg}`}>{icon}</div>
        {trend != null && (
          <span className={`font-mono text-sm font-bold ${attainmentColor(trend)}`}>{formatPct(trend)}</span>
        )}
      </div>
      <p className="mt-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1 font-mono text-2xl font-bold ${highlight ? "text-emerald-700" : "text-galaxy-navy"}`}>
        {value}
      </p>
      <p className="mt-1 text-xs text-slate-500">{sub}</p>
    </div>
  );
}
