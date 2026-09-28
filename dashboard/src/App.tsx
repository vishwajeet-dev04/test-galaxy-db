import { useState, useCallback, useMemo, useEffect, lazy, Suspense } from "react";
import { RefreshCw, Menu } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { Breadcrumbs } from "./components/Breadcrumbs";
import { UserMenu } from "./components/UserMenu";
import { DateRangeFilter } from "./components/DateRangeFilter";
import { DashboardProvider } from "./context/DashboardContext";
import { useAuth } from "./context/AuthContext";
import { useQuotaData } from "./hooks/useQuotaData";
import { LoginView } from "./views/LoginView";
import { OverviewView } from "./views/OverviewView";
import { DivisionsView } from "./views/DivisionsView";
import { BUView } from "./views/BUView";
import { EmployeesView } from "./views/EmployeesView";
import { LeaderboardView } from "./views/LeaderboardView";
import { LeadersView } from "./views/LeadersView";
import { AccountsView } from "./views/AccountsView";
import { BrandsView } from "./views/BrandsView";
import { AdminUploadsView } from "./views/AdminUploadsView";
import type { DrillState, ViewId } from "./types";
import { VIEW_META } from "./theme";
import { formatCr, formatPctCard } from "./utils/format";
import { defaultDateRange, type DateRangeValue } from "./utils/fiscal";

const HelpView = lazy(() => import("./views/HelpView").then((m) => ({ default: m.HelpView })));

const DEFAULT_DRILL: DrillState = { view: "overview" };
const VIEW_IDS: ViewId[] = [
  "overview",
  "divisions",
  "bu",
  "employees",
  "leaderboard",
  "leaders",
  "accounts",
  "brands",
  "help",
  "admin",
];
const DRILL_VIEW_KEY = "galaxy.drill.view";

function loadSavedView(): ViewId {
  try {
    const raw = sessionStorage.getItem(DRILL_VIEW_KEY);
    if (raw && VIEW_IDS.includes(raw as ViewId)) return raw as ViewId;
  } catch {
    // sessionStorage can throw in locked-down browsers
  }
  return DEFAULT_DRILL.view;
}

function DashboardApp() {
  const { isAdmin, canSeeLeaders } = useAuth();
  const [dateRange, setDateRange] = useState<DateRangeValue>(defaultDateRange);
  const { data, loading, error, refresh, refreshing } = useQuotaData(dateRange);
  const [drill, setDrill] = useState<DrillState>({ view: loadSavedView() });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if ((drill.view === "admin" && !isAdmin) || (drill.view === "leaders" && !canSeeLeaders)) {
      setDrill(DEFAULT_DRILL);
    }
  }, [drill.view, isAdmin, canSeeLeaders]);

  useEffect(() => {
    try {
      sessionStorage.setItem(DRILL_VIEW_KEY, drill.view);
    } catch {
      // ignore
    }
  }, [drill.view]);

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

  if (loading && !data) {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center">
        <div className="text-center">
          <img src="/galaxy-logo.webp" alt="Galaxy" className="mx-auto h-14 object-contain opacity-90" />
          <RefreshCw className="mx-auto mt-6 h-6 w-6 animate-spin text-galaxy-navy" />
          <p className="mt-4 text-sm font-semibold text-galaxy-navy">Loading Galaxy Sales Performance Tracker</p>
          <p className="mt-1 text-xs text-slate-500">Syncing quota &amp; pipeline data…</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-galaxy-primary/20 bg-white p-8 text-center shadow-lg">
          <p className="font-semibold text-galaxy-primary">Unable to load dashboard</p>
          <p className="mt-2 text-sm text-slate-500">{error}</p>
          <button
            type="button"
            onClick={refresh}
            className="mt-4 rounded-xl bg-galaxy-navy px-4 py-2 text-sm font-semibold text-white"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <DashboardProvider>
      <div className="app-shell flex min-h-screen">
        <Sidebar
          active={drill.view}
          onChange={navigate}
          fy={data.meta.fy}
          mobileOpen={mobileNavOpen}
          onMobileClose={() => setMobileNavOpen(false)}
        />

        <main className="flex min-w-0 flex-1 flex-col lg:ml-0">
          <header className="sticky top-0 z-30 overflow-visible border-b border-galaxy-border/50 bg-white/70 px-4 py-3 backdrop-blur-2xl sm:px-6 lg:px-8 lg:py-4">
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

              <DateRangeFilter value={dateRange} onApply={setDateRange} />
              <UserMenu />

              <div className="hidden flex-wrap items-center gap-2 xl:flex">
                <div className="rounded-xl bg-slate-50 px-3 py-2 text-center ring-1 ring-slate-100">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">H1 Attainment</p>
                  <p className="font-mono text-sm font-bold text-galaxy-navy">{formatPctCard(data.kpis.header_h1_attainment_pct ?? data.kpis.h1_attainment_pct)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-2 text-center ring-1 ring-slate-100">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">IC Actuals</p>
                  <p className="font-mono text-sm font-bold text-galaxy-navy">{formatCr(data.kpis.header_ic_actuals)}</p>
                </div>
                {canSeeLeaders && data.kpis.header_pipeline_cr != null && (
                  <div className="rounded-xl bg-emerald-50/80 px-3 py-2 text-center ring-1 ring-emerald-100">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">IC Actuals Including Others</p>
                    <p className="font-mono text-sm font-bold text-emerald-700">
                      {formatCr(data.kpis.header_pipeline_cr)}
                    </p>
                  </div>
                )}
                <div className="rounded-xl bg-slate-50 px-3 py-2 text-center ring-1 ring-slate-100">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Employees</p>
                  <p className="font-mono text-sm font-bold text-galaxy-navy">{data.kpis.total_employees}</p>
                  <p className="text-[9px] text-slate-400">{data.kpis.total_divisions} RTMs · {data.kpis.total_bus} BUs</p>
                </div>
                <div className="group relative rounded-xl bg-emerald-50/80 px-3 py-2 text-center ring-1 ring-emerald-100 cursor-default">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Closed Opps</p>
                  <p className="font-mono text-sm font-bold text-emerald-700">{data.kpis.header_closed_opps ?? 0}</p>

                  {/* Hover Tooltip (positioned below to avoid top-edge clipping) */}
                  <div className="pointer-events-none absolute top-full right-0 z-20 mt-2 hidden w-max rounded-lg bg-galaxy-navy px-3 py-1.5 text-[11px] font-medium leading-relaxed text-white shadow-lg group-hover:block">
                    All Closed Won: {data.kpis.header_closed_opps ?? 0}
                    {data.kpis.total_deals_h1 != null ? ` · RTM IC: ${data.kpis.total_deals_h1}` : ""}
                    {/* Arrow pointing up */}
                    <div className="absolute right-8 bottom-full border-4 border-transparent border-b-galaxy-navy" />
                  </div>
                </div>
              </div>
            </div>
          </header>

          {error && data && (
            <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-800 sm:px-6 lg:px-8">
              Could not refresh numbers: {error}. Showing the last loaded data.
              <button type="button" onClick={refresh} className="ml-2 font-semibold underline hover:no-underline">
                Retry
              </button>
            </div>
          )}
          {refreshing && !error && (
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-center text-xs font-medium text-slate-500 sm:px-6 lg:px-8">
              Updating for the selected dates…
            </div>
          )}
          {data._scope?.mode === "filtered" && (
            <div className="border-b border-sky-100 bg-sky-50 px-4 py-2 text-center text-xs font-medium text-sky-800 sm:px-6 lg:px-8">
              Showing your login data only
              {data._scope.visible_people?.length ? ` · ${data._scope.visible_people.join(", ")}` : ""}
            </div>
          )}

          <div className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {drill.view === "overview" && <OverviewView data={data} onDrill={onDrill} />}
            {drill.view === "divisions" && <DivisionsView data={data} drill={drill} onDrill={onDrill} />}
            {drill.view === "bu" && <BUView data={data} drill={drill} onDrill={onDrill} />}
            {drill.view === "accounts" && <AccountsView data={data} drill={drill} onDrill={onDrill} />}
            {drill.view === "brands" && <BrandsView data={data} drill={drill} onDrill={onDrill} />}
            {drill.view === "leaders" && canSeeLeaders && <LeadersView data={data} />}
            {drill.view === "employees" && <EmployeesView data={data} drill={drill} onDrill={onDrill} />}
            {drill.view === "leaderboard" && <LeaderboardView data={data} onDrill={onDrill} />}
            {drill.view === "help" && (
              <Suspense fallback={<p className="text-sm text-galaxy-muted">Loading Help…</p>}>
                <HelpView />
              </Suspense>
            )}
            {drill.view === "admin" && isAdmin && <AdminUploadsView onDataRefresh={refresh} />}
          </div>
        </main>
      </div>
    </DashboardProvider>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-galaxy-navy" />
      </div>
    );
  }

  if (!user) return <LoginView />;
  return <DashboardApp />;
}
