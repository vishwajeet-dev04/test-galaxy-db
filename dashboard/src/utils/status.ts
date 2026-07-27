import { BURecord, RTMDivision } from "../types";

/**
 * Build attainment-based status maps for RTM divisions and BU records.
 *
 * @param bu_level - BU records from quota_data.json
 * @param rtm_divisions - RTM division records from quota_data.json
 * @param selectedChartPeriod - Period used to size the donut slices (drives data display)
 * @param statusPeriod - Period used for the STATUS COLOR underline (defaults to selectedChartPeriod).
 *   Pass "h1" explicitly to always colour by H1 attainment regardless of which period the chart shows.
 */
export function getStatusMaps(
  bu_level: BURecord[],
  rtm_divisions: RTMDivision[],
  selectedChartPeriod: string,
  statusPeriod?: string
) {
  // Resolve the period key that drives the coloured underline.
  // Falls back to the chart period if no explicit statusPeriod is given.
  const resolveKey = (period: string) =>
    period === "q3" || period === "q4" ? "h2" : period;

  const colorKey = resolveKey(statusPeriod ?? selectedChartPeriod);

  const rtmStatusMap = Object.fromEntries(
    (rtm_divisions ?? []).map((d) => {
      const periodData = (d as any)[colorKey];
      let pct = periodData?.attainment_pct;
      if (pct == null && periodData?.actuals != null && d.annual?.quota) {
        const fraction =
          colorKey === "q1" || colorKey === "q2" || colorKey === "q3" || colorKey === "q4"
            ? 0.25
            : colorKey === "h1" || colorKey === "h2"
            ? 0.5
            : 1;
        pct = (periodData.actuals / (d.annual.quota * fraction)) * 100;
      }
      return [d.division, pct ?? null];
    })
  );

  const buStatusMap = Object.fromEntries(
    (bu_level ?? []).map((b) => {
      const periodData = (b as any)[colorKey];
      let pct = periodData?.attainment_pct;
      if (pct == null && periodData?.actuals != null && b.annual?.quota) {
        const fraction =
          colorKey === "q1" || colorKey === "q2" || colorKey === "q3" || colorKey === "q4"
            ? 0.25
            : colorKey === "h1" || colorKey === "h2"
            ? 0.5
            : 1;
        pct = (periodData.actuals / (b.annual.quota * fraction)) * 100;
      }
      return [b.bu, pct ?? null];
    })
  );

  return { rtmStatusMap, buStatusMap };
}
