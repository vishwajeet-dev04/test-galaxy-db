import { BURecord, RTMDivision } from "../types";

export function getStatusMaps(
  bu_level: BURecord[],
  rtm_divisions: RTMDivision[],
  selectedChartPeriod: string
) {
  const periodKey =
    selectedChartPeriod === "q3" || selectedChartPeriod === "q4"
      ? "h2"
      : selectedChartPeriod;

  const rtmStatusMap = Object.fromEntries(
    (rtm_divisions ?? []).map((d) => {
      const periodData = (d as any)[periodKey];
      let pct = periodData?.attainment_pct;
      if (pct == null && periodData?.actuals != null && d.annual?.quota) {
        const fraction =
          periodKey === "q1" || periodKey === "q2" || periodKey === "q3" || periodKey === "q4"
            ? 0.25
            : periodKey === "h1" || periodKey === "h2"
            ? 0.5
            : 1;
        pct = (periodData.actuals / (d.annual.quota * fraction)) * 100;
      }
      return [d.division, pct ?? null];
    })
  );

  const buStatusMap = Object.fromEntries(
    (bu_level ?? []).map((b) => {
      const periodData = (b as any)[periodKey];
      let pct = periodData?.attainment_pct;
      if (pct == null && periodData?.actuals != null && b.annual?.quota) {
        const fraction =
          periodKey === "q1" || periodKey === "q2" || periodKey === "q3" || periodKey === "q4"
            ? 0.25
            : periodKey === "h1" || periodKey === "h2"
            ? 0.5
            : 1;
        pct = (periodData.actuals / (b.annual.quota * fraction)) * 100;
      }
      return [b.bu, pct ?? null];
    })
  );

  return { rtmStatusMap, buStatusMap };
}
