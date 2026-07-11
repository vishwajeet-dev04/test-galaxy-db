import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";
import { attainmentBarColor, formatPct } from "../../utils/format";

interface QuotaVsActualChartProps {
  data: { name: string; quota: number; actuals: number; attainment: number }[];
  height?: number;
  onBarClick?: (name: string) => void;
  layout?: "vertical" | "horizontal";
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string; dataKey: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const actuals = payload.find((p) => p.dataKey === "actuals")?.value;
  const quota = payload.find((p) => p.dataKey === "quota")?.value;
  const att = quota ? ((actuals ?? 0) / quota) * 100 : 0;

  return (
    <div className="rounded-xl border border-galaxy-border/80 bg-white/95 px-4 py-3 shadow-xl backdrop-blur-sm">
      <p className="mb-2 text-sm font-semibold text-galaxy-navy">{label}</p>
      <div className="space-y-1">
        {payload.map((p) => (
          <div key={p.dataKey} className="flex items-center justify-between gap-6 text-xs">
            <span className="flex items-center gap-2 text-slate-500">
              <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
              {p.name}
            </span>
            <span className="font-mono font-medium text-galaxy-navy">₹{p.value?.toFixed(2)} Cr</span>
          </div>
        ))}
      </div>
      {quota != null && (
        <div className="mt-2 border-t border-galaxy-border/50 pt-2 text-xs font-semibold" style={{ color: attainmentBarColor(att) }}>
          {formatPct(att)} attainment
        </div>
      )}
    </div>
  );
}

export function QuotaVsActualChart({
  data,
  height = 300,
  onBarClick,
  layout = "horizontal",
}: QuotaVsActualChartProps) {
  const isVertical = layout === "vertical";

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout={isVertical ? "vertical" : "horizontal"}
        margin={{ top: 4, right: 12, left: isVertical ? 4 : 0, bottom: 4 }}
        barGap={isVertical ? 6 : 4}
        barCategoryGap="22%"
      >
        <CartesianGrid strokeDasharray="4 4" stroke="#eef1f6" vertical={!isVertical} horizontal={isVertical} />
        {isVertical ? (
          <>
            <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => `₹${v}`} axisLine={false} tickLine={false} />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 12, fill: "#475569", fontWeight: 500 }}
              width={72}
              axisLine={false}
              tickLine={false}
            />
          </>
        ) : (
          <>
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: "#64748b", fontWeight: 500 }}
              interval={0}
              angle={data.length > 5 ? -30 : 0}
              textAnchor={data.length > 5 ? "end" : "middle"}
              height={data.length > 5 ? 56 : 28}
              axisLine={false}
              tickLine={false}
            />
            <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => `₹${v}`} axisLine={false} tickLine={false} />
          </>
        )}
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(60,63,142,0.04)" }} />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, paddingTop: 12, color: "#64748b" }}
        />
        <Bar
          dataKey="quota"
          name="Quota"
          fill="#e2e8f0"
          radius={isVertical ? [0, 6, 6, 0] : [6, 6, 0, 0]}
          maxBarSize={isVertical ? 18 : 36}
          cursor={onBarClick ? "pointer" : undefined}
          onClick={(d) => onBarClick?.(d.name)}
        />
        <Bar
          dataKey="actuals"
          name="Actuals"
          radius={isVertical ? [0, 6, 6, 0] : [6, 6, 0, 0]}
          maxBarSize={isVertical ? 18 : 36}
          cursor={onBarClick ? "pointer" : undefined}
          onClick={(d) => onBarClick?.(d.name)}
        >
          {data.map((entry, i) => (
            <Cell key={i} fill={attainmentBarColor(entry.attainment)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
