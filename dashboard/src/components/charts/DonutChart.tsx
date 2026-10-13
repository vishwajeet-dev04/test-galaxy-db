import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { CHART_COLORS, formatCr } from "../../utils/format";
import { LegendPill } from "../LegendPill";

interface DonutChartProps {
  data: { name: string; value: number }[];
  height?: number;
  onSliceClick?: (name: string) => void;
  centerLabel?: string;
}

export function DonutChart({
  data,
  height = 280,
  onSliceClick,
  centerLabel,
}: DonutChartProps) {
  const filtered = data.filter((d) => d.value > 0);
  const total = filtered.reduce((s, d) => s + d.value, 0);

  if (filtered.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50"
        style={{ height }}
      >
        <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          No data yet
        </span>
        <p className="mt-2 text-sm text-slate-400">No closed deals for this period</p>
      </div>
    );
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={filtered}
            cx="50%"
            cy="50%"
            innerRadius="58%"
            outerRadius="82%"
            paddingAngle={3}
            dataKey="value"
            strokeWidth={0}
            cursor={onSliceClick ? "pointer" : undefined}
            onClick={(_, i) => onSliceClick?.(filtered[i].name)}
          >
            {filtered.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as { name: string; value: number };
              const pct = total ? ((d.value / total) * 100).toFixed(1) : "0";
              return (
                <div className="rounded-xl border border-galaxy-border/80 bg-white/95 px-4 py-3 text-xs shadow-xl backdrop-blur-sm">
                  <p className="font-semibold text-galaxy-navy">{d.name}</p>
                  <p className="mt-1 font-mono text-slate-600">
                    {formatCr(d.value)} <span className="text-slate-400">({pct}%)</span>
                  </p>
                </div>
              );
            }}
          />
          <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle" fill="#3c3f8e" style={{ fontSize: 17, fontWeight: 700 }}>
            {centerLabel ?? formatCr(total)}
          </text>
          <text x="50%" y="58%" textAnchor="middle" dominantBaseline="middle" fill="#94a3b8" style={{ fontSize: 10, fontWeight: 500 }}>
            total
          </text>
        </PieChart>
      </ResponsiveContainer>

      {/* Custom legend pills */}
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {filtered.map((d, i) => (
          <LegendPill
            key={d.name}
            color={CHART_COLORS[i % CHART_COLORS.length]}
            label={d.name}
            value={`${total ? ((d.value / total) * 100).toFixed(0) : "0"}%`}
            onClick={onSliceClick ? () => onSliceClick(d.name) : undefined}
          />
        ))}
      </div>
    </div>
  );
}
