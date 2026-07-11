import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type TimelineKey = "weekly" | "monthly" | "quarterly" | "annual";
export type PeriodKey = "q1" | "q2" | "h1" | "h2" | "annual";
export type RoleKey = "ceo" | "bu_head" | "team_lead" | "ic";

interface DashboardContextValue {
  timeline: TimelineKey;
  setTimeline: (t: TimelineKey) => void;
  timelineLabel: string;
  period: PeriodKey;
  setPeriod: (p: PeriodKey) => void;
  role: RoleKey;
  setRole: (r: RoleKey) => void;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

const TIMELINE_LABELS: Record<TimelineKey, string> = {
  weekly: "Week 3",
  monthly: "June",
  quarterly: "Q1",
  annual: "FY 25-26",
};

export function DashboardProvider({
  children,
  fy,
  timelineWeek = 3,
}: {
  children: ReactNode;
  fy: string;
  timelineWeek?: number;
}) {
  const [timeline, setTimeline] = useState<TimelineKey>("weekly");
  const [period, setPeriod] = useState<PeriodKey>("h1");
  const [role, setRole] = useState<RoleKey>("ceo");

  const timelineLabel = useMemo(() => {
    if (timeline === "annual") return fy;
    if (timeline === "weekly") return `Week ${timelineWeek}`;
    return TIMELINE_LABELS[timeline];
  }, [timeline, fy, timelineWeek]);

  return (
    <DashboardContext.Provider
      value={{ timeline, setTimeline, timelineLabel, period, setPeriod, role, setRole }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be used within DashboardProvider");
  return ctx;
}
