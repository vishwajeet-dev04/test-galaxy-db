import {
  LayoutDashboard,
  Building2,
  Layers,
  Users,
  Trophy,
  Crown,
  Briefcase,
  X,
} from "lucide-react";
import type { ViewId } from "../types";

interface SidebarProps {
  active: ViewId;
  onChange: (view: ViewId) => void;
  fy: string;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

const NAV: { id: ViewId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "divisions", label: "RTMs", icon: Building2 },
  { id: "bu", label: "Business Units", icon: Layers },
  { id: "accounts", label: "Accounts", icon: Briefcase },
  { id: "leaders", label: "Leaders", icon: Crown },
  { id: "employees", label: "Employees", icon: Users },
  { id: "leaderboard", label: "Leaderboard", icon: Trophy },
];

export function Sidebar({ active, onChange, fy, mobileOpen, onMobileClose }: SidebarProps) {
  const handleNav = (view: ViewId) => {
    onChange(view);
    onMobileClose?.();
  };

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={onMobileClose}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[272px] shrink-0 flex-col border-r border-galaxy-border/80 bg-white transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex items-center justify-between px-5 pt-5 lg:hidden">
          <span className="text-sm font-semibold text-galaxy-navy">Menu</span>
          <button
            type="button"
            onClick={onMobileClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 pt-4 pb-5 lg:pt-6">
          <div className="overflow-hidden rounded-2xl border border-galaxy-border/70 bg-gradient-to-b from-white to-slate-50/80 p-4 shadow-sm">
            <img
              src="/galaxy-logo.webp"
              alt="Galaxy Office Automation"
              className="mx-auto h-12 w-full max-w-[200px] object-contain"
            />
            <div className="mt-4 border-t border-galaxy-border/60 pt-4 text-center">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-galaxy-primary">
                Sales Intelligence
              </p>
              <h1 className="mt-1.5 text-[17px] font-semibold leading-tight tracking-tight text-galaxy-navy">
                Performance Tracker
              </h1>
              <span className="mt-2.5 inline-flex items-center rounded-full border border-galaxy-navy/15 bg-galaxy-navy/5 px-3 py-1 text-[11px] font-semibold text-galaxy-navy">
                {fy}
              </span>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
          <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
            Navigate
          </p>
          {NAV.map(({ id, label, icon: Icon }) => {
            const isActive = active === id;
            return (
              <button
                key={id}
                onClick={() => handleNav(id)}
                className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] transition-all duration-150 ${
                  isActive
                    ? "bg-galaxy-navy/[0.06] font-semibold text-galaxy-navy shadow-sm"
                    : "font-medium text-slate-500 hover:bg-slate-50 hover:text-galaxy-navy"
                }`}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-galaxy-primary" />
                )}
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                    isActive
                      ? "bg-galaxy-navy text-white shadow-sm"
                      : "bg-slate-100 text-slate-500 group-hover:bg-galaxy-navy/10 group-hover:text-galaxy-navy"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                {label}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-galaxy-border/60 p-5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
            Galaxy Office Automation
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">Quota · Pipeline · Attainment</p>
        </div>
      </aside>
    </>
  );
}
