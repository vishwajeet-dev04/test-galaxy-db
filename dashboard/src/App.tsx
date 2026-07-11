import { useState, useCallback, useMemo } from "react";
import { RefreshCw, Menu } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { Breadcrumbs } from "./components/Breadcrumbs";
import { DashboardControls } from "./components/DashboardControls";
import { DashboardProvider } from "./context/DashboardContext";
import { useQuotaData } from "./hooks/useQuotaData";
import { OverviewView } from "./views/OverviewView";
import { DivisionsView } from "./views/DivisionsView";
import { BUView } from "./views/BUView";
import { EmployeesView } from "./views/EmployeesView";
import { LeaderboardView } from "./views/LeaderboardView";
import { LeadersView } from "./views/LeadersView";
import { AccountsView } from "./views/AccountsView";
import { BrandsView } from "./views/BrandsView";
import type { DrillState, ViewId } from "./types";
import { VIEW_META } from "./theme";
import { formatCr, formatPct } from "./utils/format";

const DEFAULT_DRILL: DrillState = { view: "overview" };

export default function App() {
  const { data, loading, error } = useQuotaData();
  const [drill, setDrill] = useState<DrillState>(DEFAULT_DRILL);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const navigate = useCallback((view: ViewId) => {
    setDrill({ view });
  }, []);

  const onDrill = useCallback((update: Partial<DrillState>) => {
    setDrill((prev) => {
      if (update.view) {
        return { view: update.view, ...update };
      }
      return { ...prev, ...update };
    });
  }, []);

  const viewMeta = useMemo(() => VIEW_META[drill.view] ?? VIEW_META.overview, [drill.view]);

  const hasBreadcrumbs =
    drill.view !== "overview" ||
    drill.division ||
    drill.bu ||
    drill.persona ||
    drill.employee ||
    drill.account ||
    drill.brand;

  if (loading) {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center">
        <div className="text-center">
          <img src="/galaxy-logo.webp" alt="Galaxy" className="mx-auto h-14 object-contain opacity-90" />
          <RefreshCw className="mx-auto mt-6 h-6 w-6 animate-spin text-galaxy-navy" />
          <p className="mt-4 text-sm font-semibold text-galaxy-navy">Loading Performance Tracker</p>
          <p className="mt-1 text-xs text-slate-500">Syncing quota & pipeline data…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-galaxy-primary/20 bg-white p-8 text-center shadow-lg">
          <p className="font-semibold text-galaxy-primary">Unable to load dashboard</p>
          <p className="mt-2 text-sm text-slate-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <DashboardProvider fy={data.meta.fy} timelineWeek={data.meta.timeline_week ?? 3}>
      <div className="app-shell flex min-h-screen">
        <Sidebar
          active={drill.view}
          onChange={navigate}
          fy={data.meta.fy}
          mobileOpen={mobileNavOpen}
          onMobileClose={() => setMobileNavOpen(false)}
        />

        <main className="flex min-w-0 flex-1 flex-col lg:ml-0">
          <header className="sticky top-0 z-10 border-b border-galaxy-border/50 bg-white/70 px-4 py-3 backdrop-blur-2xl sm:px-6 lg:px-8 lg:py-4">
            <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-6">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <button
                  type="button"
                  className="rounded-lg p-2 text-galaxy-navy hover:bg-slate-100 lg:hidden"
                  onClick={() => setMobileNavOpen(true)}
                  aria-label="Open menu"
                >
                  <Menu className="h-5 w-5" />
                </button>
                <div className="min-w-0 flex-1">
                  {hasBreadcrumbs ? (
                    <Breadcrumbs drill={drill} onNavigate={onDrill} />
                  ) : (
                    <div>
                      <h2 className="text-lg font-semibold tracking-tight text-galaxy-navy sm:text-xl">
                        {viewMeta.title}
                      </h2>
                      <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">{viewMeta.subtitle}</p>
                    </div>
                  )}
                </div>
              </div>

              <DashboardControls />

              <div className="hidden items-center gap-2 xl:flex">
                <div className="rounded-xl bg-slate-50 px-3 py-2 text-center ring-1 ring-slate-100">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">H1 Attainment</p>
                  <p className="font-mono text-sm font-bold text-galaxy-navy">{formatPct(data.kpis.h1_attainment_pct)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-2 text-center ring-1 ring-slate-100">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">IC Actuals</p>
                  <p className="font-mono text-sm font-bold text-galaxy-navy">{formatCr(data.kpis.ic_h1_actuals_cr)}</p>
                </div>
                {data.pipeline && (
                  <div className="rounded-xl bg-emerald-50/80 px-3 py-2 text-center ring-1 ring-emerald-100">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Pipeline</p>
                    <p className="font-mono text-sm font-bold text-emerald-700">
                      {formatCr(data.pipeline.total_revenue_cr)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </header>

          <div className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {drill.view === "overview" && <OverviewView data={data} onDrill={onDrill} />}
            {drill.view === "divisions" && <DivisionsView data={data} drill={drill} onDrill={onDrill} />}
            {drill.view === "bu" && <BUView data={data} drill={drill} onDrill={onDrill} />}
            {drill.view === "accounts" && <AccountsView data={data} drill={drill} onDrill={onDrill} />}
            {drill.view === "brands" && <BrandsView data={data} drill={drill} onDrill={onDrill} />}
            {drill.view === "leaders" && <LeadersView data={data} />}
            {drill.view === "employees" && <EmployeesView data={data} drill={drill} onDrill={onDrill} />}
            {drill.view === "leaderboard" && <LeaderboardView data={data} onDrill={onDrill} />}
          </div>
        </main>
      </div>
    </DashboardProvider>
  );
}
