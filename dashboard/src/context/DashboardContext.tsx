import { createContext, useContext, useState, type ReactNode } from "react";

export type PeriodKey = "q1" | "q2" | "h1" | "h2" | "annual";

interface DashboardContextValue {
  period: PeriodKey;
  setPeriod: (p: PeriodKey) => void;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [period, setPeriod] = useState<PeriodKey>("h1");

  return (
    <DashboardContext.Provider value={{ period, setPeriod }}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be used within DashboardProvider");
  return ctx;
}
