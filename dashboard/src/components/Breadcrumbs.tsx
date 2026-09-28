import { ChevronRight, Home } from "lucide-react";
import type { DrillState } from "../types";
import { ui } from "../theme";

interface BreadcrumbsProps {
  drill: DrillState;
  onNavigate: (drill: Partial<DrillState>) => void;
}

const VIEW_LABELS: Record<string, string> = {
  overview: "Overview",
  divisions: "RTMs",
  bu: "Business Units",
  personas: "Personas",
  employees: "Employees",
  leaders: "Leaders",
  leaderboard: "Leaderboard",
  accounts: "Accounts",
  brands: "Brands",
  help: "Help",
};

export function Breadcrumbs({ drill, onNavigate }: BreadcrumbsProps) {
  const crumbs: { label: string; action?: () => void }[] = [
    { label: VIEW_LABELS[drill.view] || drill.view, action: () => onNavigate({ view: drill.view }) },
  ];

  if (drill.division) crumbs.push({ label: drill.division, action: () => onNavigate({ division: drill.division }) });
  if (drill.bu) crumbs.push({ label: drill.bu });
  if (drill.persona) crumbs.push({ label: drill.persona });
  if (drill.employee) crumbs.push({ label: drill.employee });
  if (drill.account) crumbs.push({ label: drill.account });
  if (drill.brand) crumbs.push({ label: drill.brand });

  return (
    <nav className="flex items-center gap-1">
      <button
        onClick={() => onNavigate({ view: "overview" })}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-galaxy-navy"
        aria-label="Home"
      >
        <Home className="h-4 w-4" />
      </button>
      {crumbs.map((crumb, i) => (
        <span key={i} className="flex items-center gap-1">
          <ChevronRight className="h-4 w-4 text-slate-300" />
          {crumb.action && i < crumbs.length - 1 ? (
            <button onClick={crumb.action} className={ui.btnGhost}>
              {crumb.label}
            </button>
          ) : (
            <span className="px-1 text-lg font-semibold tracking-tight text-galaxy-navy">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
