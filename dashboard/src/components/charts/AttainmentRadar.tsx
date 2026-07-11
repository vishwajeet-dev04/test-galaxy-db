import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

interface RadarChartProps {
  data: { subject: string; quota: number; actuals: number }[];
  height?: number;
}

export function AttainmentRadar({ data, height = 280 }: RadarChartProps) {
  const chartData = data.map((d) => ({
    subject: d.subject,
    Attainment: d.quota ? Math.round((d.actuals / d.quota) * 100) : 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={chartData} cx="50%" cy="50%" outerRadius="72%">
        <PolarGrid stroke="#e8ecf4" />
        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: "#64748b", fontWeight: 500 }} />
        <PolarRadiusAxis tick={{ fontSize: 9, fill: "#cbd5e1" }} axisLine={false} />
        <Radar
          name="Attainment"
          dataKey="Attainment"
          stroke="#3c3f8e"
          fill="url(#radarGradient)"
          fillOpacity={1}
          strokeWidth={2}
        />
        <defs>
          <linearGradient id="radarGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3c3f8e" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#0693e3" stopOpacity={0.08} />
          </linearGradient>
        </defs>
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as { subject: string; Attainment: number };
            return (
              <div className="rounded-xl border border-galaxy-border/80 bg-white/95 px-4 py-3 text-xs shadow-xl">
                <p className="font-semibold text-galaxy-navy">{d.subject}</p>
                <p className="mt-1 font-mono text-galaxy-blue">{d.Attainment}% attainment</p>
              </div>
            );
          }}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
