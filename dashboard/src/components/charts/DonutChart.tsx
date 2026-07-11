import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { CHART_COLORS, formatCr } from "../../utils/format";

interface DonutChartProps {
  data: { name: string; value: number }[];
  height?: number;
  onSliceClick?: (name: string) => void;
  centerLabel?: string;
}

export function DonutChart({ data, height = 280, onSliceClick, centerLabel }: DonutChartProps) {
  const filtered = data.filter((d) => d.value > 0);
  const total = filtered.reduce((s, d) => s + d.value, 0);

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
        {filtered.map((d, i) => {
          const pct = total ? ((d.value / total) * 100).toFixed(0) : "0";
          return (
            <button
              key={d.name}
              onClick={() => onSliceClick?.(d.name)}
              className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-100 transition hover:bg-white hover:ring-galaxy-navy/20"
            >
              <span className="h-2 w-2 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
              {d.name}
              <span className="text-slate-400">{pct}%</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
