import { useDashboard, type TimelineKey, type RoleKey } from "../context/DashboardContext";
import { ui } from "../theme";

const TIMELINES: { value: TimelineKey; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
];

const ROLES: { value: RoleKey; label: string }[] = [
  { value: "ceo", label: "CEO" },
  { value: "bu_head", label: "BU Head" },
  { value: "team_lead", label: "Team Lead" },
  { value: "ic", label: "IC" },
];

export function DashboardControls() {
  const { timeline, setTimeline, role, setRole } = useDashboard();

  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
      <select
        value={timeline}
        onChange={(e) => setTimeline(e.target.value as TimelineKey)}
        className={`${ui.select} py-2 text-xs sm:text-sm`}
        aria-label="Timeline"
      >
        {TIMELINES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>

      <select
        value={role}
        onChange={(e) => setRole(e.target.value as RoleKey)}
        className={`${ui.select} py-2 text-xs sm:text-sm`}
        aria-label="View as role"
        title="Demo role selector — full RBAC requires on-prem auth"
      >
        {ROLES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
    </div>
  );
}
